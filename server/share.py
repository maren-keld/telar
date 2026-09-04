"""Buzón ciego para escalas y experiencias enviadas al paciente por enlace.

El servidor guarda dos sobres cifrados y nada más: el cuestionario que el
terapeuta envía y la respuesta que devuelve el paciente. La llave viaja solo en
el fragmento (`#`) del enlace, que el navegador nunca manda al servidor, así que
acá no hay forma de leer ítems ni respuestas — ni para nosotros ni para quien
consiga acceso a la base.

Ciclo de vida: el terapeuta crea el formulario, el paciente lo responde una vez,
la app se lleva la respuesta y la fila se borra. Lo que nadie recoge caduca.
"""
from __future__ import annotations

import base64
import os
import re
from datetime import datetime, timedelta, timezone

from flask import jsonify, request

#: Tamaño máximo del sobre cifrado (base64). Un RAADS-R de 80 ítems con
#: traducción entra de sobra; el techo existe para que nadie use esto de disco.
MAX_PAYLOAD_CHARS = 512_000

#: Un enlace sin responder caduca sola. Un mes cubre "te lo mando y lo vemos
#: en la próxima sesión" sin dejar datos indefinidamente.
LINK_TTL_DAYS = 30

#: Formularios vivos por terapeuta. Frena el abuso sin molestar al uso real.
MAX_OPEN_FORMS_PER_OWNER = 200

TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
BASE64_RE = re.compile(r"^[A-Za-z0-9+/=]+$")


def _api():
    import app as api

    return api


def ensure_schema(conn, autoincrement: str) -> None:
    conn.execute(
        f"""CREATE TABLE IF NOT EXISTS shared_forms (
            id {autoincrement},
            token TEXT NOT NULL UNIQUE,
            owner_hash TEXT NOT NULL,
            owner_secret TEXT NOT NULL,
            payload_ct TEXT NOT NULL,
            response_ct TEXT,
            created_at TEXT NOT NULL,
            answered_at TEXT,
            expires_at TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_token ON shared_forms(token)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_forms(owner_hash)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_expires ON shared_forms(expires_at)")


def _random_token(n_bytes: int = 24) -> str:
    return base64.urlsafe_b64encode(os.urandom(n_bytes)).decode().rstrip("=")


def _owner_hash(email: str) -> str:
    """El correo del terapeuta no se guarda en claro: solo sirve para contar."""
    import hashlib

    api = _api()
    salt = os.environ.get("SHARE_OWNER_SALT", "telar-share")
    normalized = api.normalize_payer_email(email).lower()
    return hashlib.sha256(f"{salt}:{normalized}".encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _purge_expired(conn) -> None:
    conn.execute("DELETE FROM shared_forms WHERE expires_at < ?", (_now().isoformat(),))


def _gone():
    """Token inválido, caducado o inexistente responden igual: nada que filtrar."""
    return jsonify({"error": "Este enlace ya no está disponible"}), 410


def _valid_ciphertext(value) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text or len(text) > MAX_PAYLOAD_CHARS:
        return False
    return bool(BASE64_RE.match(text))


def register_routes(app) -> None:
    @app.post("/api/share")
    def share_create():
        api = _api()
        data = request.get_json(silent=True) or {}
        email = (data.get("owner_email") or "").strip()
        payload_ct = data.get("payload_ct")

        if not api.is_valid_payer_email(email):
            return jsonify({"error": "Falta un correo válido del profesional"}), 400
        if not _valid_ciphertext(payload_ct):
            return jsonify({"error": "Contenido cifrado inválido"}), 400

        owner = _owner_hash(email)
        token = _random_token()
        secret = _random_token(18)
        now = _now()

        with api.db() as conn:
            _purge_expired(conn)
            open_forms = conn.execute(
                "SELECT COUNT(*) AS n FROM shared_forms WHERE owner_hash = ?",
                (owner,),
            ).fetchone()
            if int(open_forms["n"]) >= MAX_OPEN_FORMS_PER_OWNER:
                return jsonify({"error": "Demasiados formularios sin cerrar"}), 429
            conn.execute(
                """INSERT INTO shared_forms
                   (token, owner_hash, owner_secret, payload_ct, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    token,
                    owner,
                    secret,
                    payload_ct.strip(),
                    now.isoformat(),
                    (now + timedelta(days=LINK_TTL_DAYS)).isoformat(),
                ),
            )

        return jsonify({
            "token": token,
            "owner_secret": secret,
            "expires_at": (now + timedelta(days=LINK_TTL_DAYS)).isoformat(),
        })

    @app.get("/api/share/<token>")
    def share_read(token: str):
        """Lo que abre el paciente. Público a propósito: el enlace es la llave."""
        api = _api()
        if not TOKEN_RE.match(token or ""):
            return _gone()

        with api.db() as conn:
            _purge_expired(conn)
            row = conn.execute(
                "SELECT payload_ct, answered_at FROM shared_forms WHERE token = ?",
                (token,),
            ).fetchone()

        if not row:
            return _gone()
        if row["answered_at"]:
            return jsonify({"answered": True}), 409
        return jsonify({"payload_ct": row["payload_ct"], "answered": False})

    @app.post("/api/share/<token>/response")
    def share_answer(token: str):
        api = _api()
        if not TOKEN_RE.match(token or ""):
            return _gone()
        data = request.get_json(silent=True) or {}
        response_ct = data.get("response_ct")
        if not _valid_ciphertext(response_ct):
            return jsonify({"error": "Respuesta cifrada inválida"}), 400

        now = _now().isoformat()
        with api.db() as conn:
            _purge_expired(conn)
            row = conn.execute(
                "SELECT answered_at FROM shared_forms WHERE token = ?",
                (token,),
            ).fetchone()
            if not row:
                return _gone()
            if row["answered_at"]:
                return jsonify({"error": "Este formulario ya fue respondido"}), 409
            conn.execute(
                "UPDATE shared_forms SET response_ct = ?, answered_at = ? WHERE token = ?",
                (response_ct.strip(), now, token),
            )

        return jsonify({"ok": True, "answered_at": now})

    @app.get("/api/share/<token>/response")
    def share_collect(token: str):
        """La app recoge la respuesta con el secreto del terapeuta y la fila se borra."""
        api = _api()
        if not TOKEN_RE.match(token or ""):
            return _gone()
        secret = (request.args.get("secret") or "").strip()
        if not secret:
            return jsonify({"error": "Falta el secreto del formulario"}), 400

        with api.db() as conn:
            _purge_expired(conn)
            row = conn.execute(
                "SELECT owner_secret, response_ct, answered_at FROM shared_forms WHERE token = ?",
                (token,),
            ).fetchone()
            if not row:
                return _gone()
            import hmac

            if not hmac.compare_digest(str(row["owner_secret"]), secret):
                return jsonify({"error": "Secreto inválido"}), 403
            if not row["answered_at"]:
                return jsonify({"answered": False})
            response_ct = row["response_ct"]
            conn.execute("DELETE FROM shared_forms WHERE token = ?", (token,))

        return jsonify({
            "answered": True,
            "answered_at": row["answered_at"],
            "response_ct": response_ct,
        })

    @app.delete("/api/share/<token>")
    def share_revoke(token: str):
        """Anular un enlace enviado por error."""
        api = _api()
        if not TOKEN_RE.match(token or ""):
            return _gone()
        secret = (request.args.get("secret") or "").strip()
        if not secret:
            return jsonify({"error": "Falta el secreto del formulario"}), 400

        with api.db() as conn:
            row = conn.execute(
                "SELECT owner_secret FROM shared_forms WHERE token = ?",
                (token,),
            ).fetchone()
            if not row:
                return jsonify({"ok": True})
            import hmac

            if not hmac.compare_digest(str(row["owner_secret"]), secret):
                return jsonify({"error": "Secreto inválido"}), 403
            conn.execute("DELETE FROM shared_forms WHERE token = ?", (token,))

        return jsonify({"ok": True})

    @app.post("/api/share/notify-owner")
    def share_notify_owner():
        """Correo al clínico cuando el paciente responde. Opt-in desde Ajustes."""
        api = _api()
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        subject = str(data.get("subject") or "Telar: respondieron un formulario").strip()[:180]
        text = str(data.get("text") or "").strip()[:2000]
        if not api.is_valid_payer_email(email):
            return jsonify({"error": "Falta un correo válido del profesional"}), 400
        if not text:
            return jsonify({"error": "Falta el texto del aviso"}), 400
        sent = _send_owner_email(api.normalize_payer_email(email), subject, text)
        return jsonify({"ok": True, "sent": sent, "skipped": not sent})


def _send_owner_email(to_email: str, subject: str, text: str) -> bool:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        return False
    import json
    import urllib.error
    import urllib.request

    payload = json.dumps(
        {
            "from": os.environ.get("SHARE_NOTIFY_FROM", "Telar <noreply@telarapp.cl>"),
            "to": [to_email],
            "subject": subject,
            "text": text,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return 200 <= int(resp.status) < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
