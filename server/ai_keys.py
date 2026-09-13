"""Entrega de clave Mistral/xAI por instalación (SEC-001).

La clave maestra vive solo en el servidor (env). El instalador de Telar no la
lleva. Al activar la IA, la app pide una clave y la guarda en el Mac.

Reglas de seguridad:
- Hace falta suscripción Pro activa (o bypass de dev) para el email.
- El modo shared (devolver MISTRAL_API_KEY / XAI_API_KEY) está OFF salvo
  AI_ALLOW_SHARED_KEYS=1 (solo local/dev).
- El grant queda atado al device_id de la primera emisión.
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
            issue_count INTEGER NOT NULL DEFAULT 0,
            device_hash TEXT
        )"""
    )
    try:
        conn.execute("ALTER TABLE ai_mistral_grants ADD COLUMN device_hash TEXT")
    except Exception:
        pass
    conn.execute(
        """CREATE TABLE IF NOT EXISTS ai_mistral_ip_hits (
            ip_hash TEXT NOT NULL,
            day TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ip_hash, day)
        )"""
    )
    _ = autoincrement


def provision_configured() -> bool:
    if _admin_key() and _admin_workspace() and _admin_user():
        return True
    return bool(_inference_key() and _shared_keys_allowed())


def xai_provision_configured() -> bool:
    return bool(_xai_inference_key() and _shared_keys_allowed())


def _shared_keys_allowed() -> bool:
    """Shared/env keys are opt-in only (local/dev). Never default-on in prod."""
    return (os.environ.get("AI_ALLOW_SHARED_KEYS") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _inference_key() -> str:
    return os.environ.get("MISTRAL_API_KEY", "").strip()


def _xai_inference_key() -> str:
    return os.environ.get("XAI_API_KEY", "").strip()


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


def _xai_email_hash(email: str) -> str:
    return hashlib.sha256(f"{_salt()}:xai:{email}".encode()).hexdigest()


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{_salt()}:ip:{ip}".encode()).hexdigest()


def _device_hash(device_id: str) -> str:
    return hashlib.sha256(f"{_salt()}:device:{device_id}".encode()).hexdigest()


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


def _require_active_subscription(conn, email: str):
    """Provision is a Pro entitlement: require an active subscription row."""
    api = _api()
    email_n = api.normalize_payer_email(email)
    if not email_n:
        return jsonify({"error": "Necesitamos el correo del profesional para activar la IA."}), 400
    if api.dev_bypass_allows(email_n):
        return None
    row = conn.execute(
        "SELECT status FROM subscriptions WHERE email = ? ORDER BY id DESC LIMIT 1",
        (email_n,),
    ).fetchone()
    status = ""
    if row:
        status = api.clean_field(row["status"] if hasattr(row, "keys") else row[0], 64).lower()
    if status not in api.ACTIVE_STATUSES:
        return jsonify({
            "error": "La IA en la nube requiere una suscripción Pro activa.",
        }), 403
    return None


def _enforce_device_binding(conn, email_hash: str, device_hash: str):
    """Bind grant to first device; reject later mismatches (SEC-001)."""
    row = conn.execute(
        "SELECT device_hash FROM ai_mistral_grants WHERE email_hash = ?",
        (email_hash,),
    ).fetchone()
    if not row:
        return None
    stored = ""
    try:
        stored = (row["device_hash"] if hasattr(row, "keys") else row[0]) or ""
    except Exception:
        stored = ""
    stored = str(stored).strip()
    if stored and stored != device_hash:
        return jsonify({
            "error": "Esta instalación no coincide con la que activó la IA. Escribe a contacto@telarapp.cl si cambiaste de equipo.",
        }), 403
    return None


def _bump_email(conn, email_hash: str, key_id: str | None, source: str, device_hash: str) -> None:
    api = _api()
    now = api.now_iso()
    row = conn.execute(
        "SELECT issue_count, last_issued_at, device_hash FROM ai_mistral_grants WHERE email_hash = ?",
        (email_hash,),
    ).fetchone()
    if not row:
        conn.execute(
            """INSERT INTO ai_mistral_grants
               (email_hash, key_id, source, created_at, last_issued_at, issue_count, device_hash)
               VALUES (?, ?, ?, ?, ?, 1, ?)""",
            (email_hash, key_id or "", source, now, now, device_hash),
        )
        return
    last = _parse_iso(row["last_issued_at"])
    reset = True
    if last:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        reset = datetime.now(timezone.utc) - last > timedelta(hours=24)
    count = 1 if reset else int(row["issue_count"] or 0) + 1
    stored_device = ""
    try:
        stored_device = str(row["device_hash"] or "").strip()
    except Exception:
        stored_device = ""
    bind_device = stored_device or device_hash
    conn.execute(
        """UPDATE ai_mistral_grants
           SET key_id = ?, source = ?, last_issued_at = ?, issue_count = ?, device_hash = ?
           WHERE email_hash = ?""",
        (key_id or "", source, now, count, bind_device, email_hash),
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
    """Devuelve (api_key, key_id, source). Shared path only if explicitly allowed."""
    if _admin_key() and _admin_workspace() and _admin_user():
        short = email_hash[:10]
        key, key_id = create_admin_workspace_key(f"telar-{short}")
        return key, key_id, "admin"
    shared = _inference_key()
    if shared and _shared_keys_allowed():
        return shared, "", "shared"
    if shared and not _shared_keys_allowed():
        raise RuntimeError("shared_disabled")
    raise RuntimeError("unconfigured")


def _provision_common_gate(email: str, device_id: str, *, product: str):
    """Validate input, subscription, rate limits, device bind. Returns (ctx, err_body, err_code)."""
    api = _api()
    email = api.normalize_payer_email(email or "")
    device_id = api.clean_field(device_id, DEVICE_ID_MAX)
    if not api.is_valid_payer_email(email):
        label = "la IA" if product == "mistral" else "Grok"
        return None, jsonify({"error": f"Necesitamos el correo del profesional para activar {label}."}), 400
    if len(device_id) < DEVICE_ID_MIN:
        return None, jsonify({"error": "Falta el identificador de esta instalación."}), 400

    email_hash = _email_hash(email) if product == "mistral" else _xai_email_hash(email)
    device_hash = _device_hash(device_id)

    with api.db() as conn:
        denied = _require_active_subscription(conn, email)
        if denied is not None:
            return None, denied[0], denied[1]

        row = conn.execute(
            "SELECT issue_count, last_issued_at, device_hash FROM ai_mistral_grants WHERE email_hash = ?",
            (email_hash,),
        ).fetchone()
        if _email_limited(row):
            label = "la IA" if product == "mistral" else "Grok"
            return None, jsonify({
                "error": f"Demasiados intentos de activar {label} hoy. Prueba mañana o escribe a contacto@telarapp.cl.",
            }), 429

        bound = _enforce_device_binding(conn, email_hash, device_hash)
        if bound is not None:
            return None, bound[0], bound[1]

        ip_count = _bump_ip(conn, api.client_ip())
        if ip_count > MAX_ISSUES_PER_IP_DAY:
            return None, jsonify({
                "error": "Demasiados intentos desde esta red. Prueba más tarde.",
            }), 429

    return (email, email_hash, device_hash), None, None


def register_routes(app) -> None:
    @app.post("/api/ai/mistral-provision")
    def mistral_provision():
        api = _api()
        if not provision_configured():
            return jsonify({
                "error": "La IA en la nube aún no está habilitada en el servidor.",
            }), 503

        data = request.get_json(silent=True) or {}
        ctx, err_body, err_code = _provision_common_gate(
            data.get("email") or "",
            data.get("device_id") or "",
            product="mistral",
        )
        if err_body is not None:
            return err_body, err_code
        email, email_hash, device_hash = ctx

        try:
            api_key, key_id, source = _issue_key(email_hash)
        except RuntimeError as exc:
            if str(exc) in ("unconfigured", "shared_disabled"):
                return jsonify({"error": "La IA en la nube aún no está habilitada en el servidor."}), 503
            return jsonify({
                "error": "No se pudo crear la clave de Mistral. Inténtalo de nuevo en un minuto.",
            }), 502

        with api.db() as conn:
            _bump_email(conn, email_hash, key_id, source, device_hash)

        return jsonify({
            "ok": True,
            "api_key": api_key,
            "provider": "mistral",
            "source": source,
        })

    @app.post("/api/ai/xai-provision")
    def xai_provision():
        api = _api()
        if not xai_provision_configured():
            return jsonify({
                "error": "Grok para experiencias aún no está habilitado en el servidor.",
            }), 503

        data = request.get_json(silent=True) or {}
        ctx, err_body, err_code = _provision_common_gate(
            data.get("email") or "",
            data.get("device_id") or "",
            product="xai",
        )
        if err_body is not None:
            return err_body, err_code
        email, email_hash, device_hash = ctx

        shared = _xai_inference_key()
        if not shared or not _shared_keys_allowed():
            return jsonify({"error": "Grok para experiencias aún no está habilitado en el servidor."}), 503

        with api.db() as conn:
            _bump_email(conn, email_hash, "", "shared", device_hash)

        return jsonify({
            "ok": True,
            "api_key": shared,
            "provider": "xai",
            "source": "shared",
        })
