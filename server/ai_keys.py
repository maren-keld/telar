"""Entrega de clave Mistral por instalación.

La clave maestra vive solo en el servidor (env). El instalador de Telar no la
lleva. Al activar la IA, la app pide una clave y la guarda en el Mac.

Si hay Admin API de Mistral, se crea una clave distinta por correo (se puede
revocar). Si no, se entrega la clave de inferencia compartida, con tope de
pedidos por correo y por IP. El caso clínico no pasa por este endpoint.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from flask import jsonify, request

MAX_ISSUES_PER_EMAIL_DAY = 5
MAX_ISSUES_PER_IP_DAY = 30
ADMIN_KEY_DAYS = 90
DEVICE_ID_MIN = 8
DEVICE_ID_MAX = 64


def _api():
    import app as api

    return api


def ensure_schema(conn, autoincrement: str) -> None:
    conn.execute(
        f"""CREATE TABLE IF NOT EXISTS ai_mistral_grants (
            email_hash TEXT PRIMARY KEY,
            key_id TEXT,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_issued_at TEXT NOT NULL,
            issue_count INTEGER NOT NULL DEFAULT 0
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS ai_mistral_ip_hits (
            ip_hash TEXT NOT NULL,
            day TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ip_hash, day)
        )"""
    )
    # autoincrement queda por si más adelante hay filas con id; el esquema actual no lo usa.
    _ = autoincrement


def provision_configured() -> bool:
    return bool(_inference_key() or _admin_key())


def _inference_key() -> str:
    return os.environ.get("MISTRAL_API_KEY", "").strip()


def _admin_key() -> str:
    return os.environ.get("MISTRAL_ADMIN_API_KEY", "").strip()


def _admin_workspace() -> str:
    return os.environ.get("MISTRAL_WORKSPACE_UUID", "").strip()


def _admin_user() -> str:
    return os.environ.get("MISTRAL_ADMIN_USER_ID", "").strip()


def _salt() -> str:
    return os.environ.get("AI_KEY_SALT", "") or os.environ.get("WEBHOOK_SECRET", "") or "telar-ai"


def _email_hash(email: str) -> str:
    return hashlib.sha256(f"{_salt()}:mistral:{email}".encode()).hexdigest()


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{_salt()}:ip:{ip}".encode()).hexdigest()


def _parse_iso(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _email_limited(row) -> bool:
    if not row:
        return False
    last = _parse_iso(row["last_issued_at"])
    if not last:
        return False
    now = datetime.now(timezone.utc)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if now - last > timedelta(hours=24):
        return False
    return int(row["issue_count"] or 0) >= MAX_ISSUES_PER_EMAIL_DAY


def _bump_email(conn, email_hash: str, key_id: str | None, source: str) -> None:
    api = _api()
    now = api.now_iso()
    row = conn.execute(
        "SELECT issue_count, last_issued_at FROM ai_mistral_grants WHERE email_hash = ?",
        (email_hash,),
    ).fetchone()
    if not row:
        conn.execute(
            """INSERT INTO ai_mistral_grants
               (email_hash, key_id, source, created_at, last_issued_at, issue_count)
               VALUES (?, ?, ?, ?, ?, 1)""",
            (email_hash, key_id or "", source, now, now),
        )
        return
    last = _parse_iso(row["last_issued_at"])
    reset = True
    if last:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        reset = datetime.now(timezone.utc) - last > timedelta(hours=24)
    count = 1 if reset else int(row["issue_count"] or 0) + 1
    conn.execute(
        """UPDATE ai_mistral_grants
           SET key_id = ?, source = ?, last_issued_at = ?, issue_count = ?
           WHERE email_hash = ?""",
        (key_id or "", source, now, count, email_hash),
    )


def _bump_ip(conn, ip: str) -> int:
    api = _api()
    day = api.today_utc()
    iph = _ip_hash(ip or "unknown")
    conn.execute(
        """INSERT INTO ai_mistral_ip_hits (ip_hash, day, count) VALUES (?, ?, 1)
           ON CONFLICT (ip_hash, day) DO UPDATE SET count = ai_mistral_ip_hits.count + 1""",
        (iph, day),
    )
    row = conn.execute(
        "SELECT count FROM ai_mistral_ip_hits WHERE ip_hash = ? AND day = ?",
        (iph, day),
    ).fetchone()
    return int(row["count"] if row else 1)


def create_admin_workspace_key(name: str) -> tuple[str, str]:
    """Crea una clave de workspace. Devuelve (plaintext, key_id)."""
    admin = _admin_key()
    workspace = _admin_workspace()
    user_id = _admin_user()
    if not admin or not workspace or not user_id:
        raise RuntimeError("admin_incomplete")
    expires = (datetime.now(timezone.utc) + timedelta(days=ADMIN_KEY_DAYS)).strftime("%Y-%m-%d")
    payload = {
        "name": name[:80],
        "user_id": user_id,
        "workspace_uuid": workspace,
        "expiration": expires,
    }
    req = urllib.request.Request(
        "https://api.mistral.ai/v1/admin/api-keys",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": admin,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:200] if exc.fp else ""
        raise RuntimeError(f"admin_http_{exc.code}:{detail}") from exc
    key = (body.get("key") or body.get("api_key") or "").strip()
    key_id = str(body.get("key_id") or body.get("id") or "")
    if not key:
        raise RuntimeError("admin_empty_key")
    return key, key_id


def _issue_key(email_hash: str) -> tuple[str, str, str]:
    """Devuelve (api_key, key_id, source)."""
    if _admin_key() and _admin_workspace() and _admin_user():
        short = email_hash[:10]
        key, key_id = create_admin_workspace_key(f"telar-{short}")
        return key, key_id, "admin"
    shared = _inference_key()
    if shared:
        return shared, "", "shared"
    raise RuntimeError("unconfigured")


def register_routes(app) -> None:
    @app.post("/api/ai/mistral-provision")
    def mistral_provision():
        api = _api()
        if not provision_configured():
            return jsonify({
                "error": "La IA en la nube aún no está habilitada en el servidor.",
            }), 503

        data = request.get_json(silent=True) or {}
        email = api.normalize_payer_email(data.get("email") or "")
        device_id = api.clean_field(data.get("device_id"), DEVICE_ID_MAX)
        if not api.is_valid_payer_email(email):
            return jsonify({"error": "Necesitamos el correo del profesional para activar la IA."}), 400
        if len(device_id) < DEVICE_ID_MIN:
            return jsonify({"error": "Falta el identificador de esta instalación."}), 400

        email_hash = _email_hash(email)
        with api.db() as conn:
            row = conn.execute(
                "SELECT issue_count, last_issued_at FROM ai_mistral_grants WHERE email_hash = ?",
                (email_hash,),
            ).fetchone()
            if _email_limited(row):
                return jsonify({
                    "error": "Demasiados intentos de activar la IA hoy. Prueba mañana o escribe a contacto@telarapp.cl.",
                }), 429
            ip_count = _bump_ip(conn, api.client_ip())
            if ip_count > MAX_ISSUES_PER_IP_DAY:
                return jsonify({
                    "error": "Demasiados intentos desde esta red. Prueba más tarde.",
                }), 429

        try:
            api_key, key_id, source = _issue_key(email_hash)
        except RuntimeError as exc:
            if str(exc) == "unconfigured":
                return jsonify({"error": "La IA en la nube aún no está habilitada en el servidor."}), 503
            return jsonify({
                "error": "No se pudo crear la clave de Mistral. Inténtalo de nuevo en un minuto.",
            }), 502

        with api.db() as conn:
            _bump_email(conn, email_hash, key_id, source)

        return jsonify({
            "ok": True,
            "api_key": api_key,
            "provider": "mistral",
            "source": source,
        })
