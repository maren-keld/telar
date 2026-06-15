"""
API mínima de suscripciones — Plan Profesional Telar.
Mercado Pago (Chile) · preapproval mensual en CLP.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import mercadopago

load_dotenv()

APP = Flask(__name__)
CORS(APP, resources={r"/api/*": {"origins": "*"}})

MP_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5001").rstrip("/")
FRONTEND_RETURN_URL = os.environ.get("FRONTEND_RETURN_URL", f"{BACKEND_URL}/gracias")
MP_PUBLIC_BACK_URL = os.environ.get("MP_PUBLIC_BACK_URL", "").strip()
PLAN_AMOUNT = int(os.environ.get("PLAN_AMOUNT_CLP", "15000"))
PLAN_REASON = os.environ.get("MP_PLAN_REASON", "Plan Profesional — Telar")
MP_PREAPPROVAL_PLAN_ID = os.environ.get("MP_PREAPPROVAL_PLAN_ID", "").strip()
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
DEV_PRO_EMAIL = os.environ.get("DEV_PRO_EMAIL", "").strip().lower()
DB_PATH = Path(__file__).parent / "subscriptions.db"

ACTIVE_STATUSES = frozenset({"authorized", "active"})
_plan_cache: dict | None = None


def dev_bypass_enabled() -> bool:
    flag = os.environ.get("SUBSCRIPTION_DEV_BYPASS", "").strip().lower() in ("1", "true", "yes")
    if not flag:
        return False
    return "localhost" in BACKEND_URL or "127.0.0.1" in BACKEND_URL


def dev_bypass_allows(email: str) -> bool:
    if not dev_bypass_enabled():
        return False
    if not DEV_PRO_EMAIL:
        return True
    return normalize_payer_email(email).lower() == normalize_payer_email(DEV_PRO_EMAIL).lower()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                mp_preapproval_id TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sub_email ON subscriptions(email)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS usage_opens (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                total INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            "INSERT OR IGNORE INTO usage_opens (id, total, updated_at) VALUES (1, 0, ?)",
            (now_iso(),),
        )


def mp_sdk():
    if not MP_TOKEN:
        raise RuntimeError("MP_ACCESS_TOKEN no configurado")
    return mercadopago.SDK(MP_TOKEN)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_payer_email(raw: str) -> str:
    """Acepta email real o usuario test MP (TESTUSER… → TESTUSER…@testuser.com)."""
    email = (raw or "").strip()
    if not email:
        return ""
    if "@" not in email and email.upper().startswith("TESTUSER"):
        return f"{email}@testuser.com"
    return email.lower()


def is_valid_payer_email(raw: str) -> bool:
    email = (raw or "").strip()
    if not email:
        return False
    if "@" in email:
        return True
    return email.upper().startswith("TESTUSER")


def fetch_mp_me() -> dict:
    if not MP_TOKEN:
        return {}
    try:
        res = mp_sdk().user().get()
        if res.get("status") == 200:
            return res.get("response") or {}
    except Exception:
        pass
    return {}


def is_test_mp_account(email: str) -> bool:
    e = (email or "").strip().lower()
    return "@testuser.com" in e or e.startswith("test_user_")


def subscription_sandbox_status() -> dict:
    """Suscripciones TEST exigen vendedor test + comprador test (misma «burbuja»)."""
    me = fetch_mp_me()
    email = me.get("email") or ""
    test_mode = MP_TOKEN.startswith("TEST-")
    seller_is_test = is_test_mp_account(email)
    if not test_mode:
        return {
            "mp_sandbox_ready": True,
            "mp_seller_email": email,
            "mp_collector_id": me.get("id"),
            "mp_sandbox_hint": None,
        }
    ready = seller_is_test
    hint = None
    if not ready:
        hint = (
            "Suscripciones: el token TEST de la app usa tu cuenta real como vendedor (ID "
            f"{me.get('id')}). Con comprador test, MP puede rechazar el pago. "
            "Opciones: (1) credenciales de producción + pago real $15.000, o "
            "(2) comprador test + ventana privada e intentar igual."
        )
    return {
        "mp_sandbox_ready": ready,
        "mp_seller_email": email,
        "mp_collector_id": me.get("id"),
        "mp_sandbox_hint": hint,
    }


def plan_init_point(plan_body: dict) -> str | None:
    if MP_TOKEN.startswith("TEST-"):
        return plan_body.get("sandbox_init_point") or plan_body.get("init_point")
    return plan_body.get("init_point") or plan_body.get("sandbox_init_point")


def resolve_mp_plan(sdk, back_url: str) -> tuple[dict | None, str | None]:
    """Obtiene o crea el plan MP. Sin plan, /preapproval devuelve 500 en sandbox CL."""
    global _plan_cache  # noqa: PLW0603
    me = fetch_mp_me()
    collector_id = me.get("id")

    if _plan_cache and collector_id and _plan_cache.get("collector_id") == collector_id:
        return _plan_cache, None
    _plan_cache = None

    if MP_PREAPPROVAL_PLAN_ID:
        res = sdk.plan().get(MP_PREAPPROVAL_PLAN_ID)
        if res.get("status") == 200:
            plan = res["response"]
            if not collector_id or plan.get("collector_id") == collector_id:
                _plan_cache = plan
                return _plan_cache, None
        return None, f"No se encontró el plan {MP_PREAPPROVAL_PLAN_ID} para este vendedor"

    res = sdk.plan().search({"limit": 30})
    for item in (res.get("response") or {}).get("results") or []:
        if item.get("status") != "active":
            continue
        if collector_id and item.get("collector_id") != collector_id:
            continue
        if item.get("reason") != PLAN_REASON:
            continue
        recurring = item.get("auto_recurring") or {}
        if int(recurring.get("transaction_amount") or 0) != PLAN_AMOUNT:
            continue
        _plan_cache = item
        return _plan_cache, None

    create_res = sdk.plan().create({
        "reason": PLAN_REASON,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": PLAN_AMOUNT,
            "currency_id": "CLP",
            "billing_day": 1,
            "billing_day_proportional": True,
        },
        "back_url": back_url,
    })
    if create_res.get("status") not in (200, 201):
        body = create_res.get("response") or {}
        msg = body.get("message") or body.get("error") or "Error al crear plan en Mercado Pago"
        return None, msg

    _plan_cache = create_res["response"]
    return _plan_cache, None


def checkout_back_url() -> str | None:
    """Mercado Pago exige https en back_url; localhost no sirve al crear la suscripción."""
    url = FRONTEND_RETURN_URL
    if url.startswith("http://") and ("localhost" in url or "127.0.0.1" in url):
        if MP_PUBLIC_BACK_URL:
            return MP_PUBLIC_BACK_URL.rstrip("/")
        # Render no desplegado: MP acepta su propia URL como retorno en pruebas
        return "https://www.mercadopago.cl"
    return url


def upsert_subscription(email: str, preapproval_id: str | None, status: str):
    with db() as conn:
        if preapproval_id:
            row = conn.execute(
                "SELECT id FROM subscriptions WHERE mp_preapproval_id = ?",
                (preapproval_id,),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE subscriptions SET status = ?, updated_at = ?, email = ? WHERE mp_preapproval_id = ?",
                    (status, now_iso(), email, preapproval_id),
                )
                return
        conn.execute(
            "INSERT INTO subscriptions (email, mp_preapproval_id, status, updated_at) VALUES (?, ?, ?, ?)",
            (email, preapproval_id, status, now_iso()),
        )


def fetch_mp_preapproval(preapproval_id: str):
    sdk = mp_sdk()
    res = sdk.preapproval().get(preapproval_id)
    return (res.get("response") or {}) if res.get("status") == 200 else {}


def find_mp_preapproval_by_email(email: str):
    try:
        sdk = mp_sdk()
        res = sdk.preapproval().search({"payer_email": email, "limit": 5})
        results = (res.get("response") or {}).get("results") or []
        for item in results:
            if (item.get("payer_email") or "").lower() == email:
                return item
    except Exception:
        pass
    return None


@APP.get("/api/health")
def health():
    sandbox = subscription_sandbox_status()
    usage_total = 0
    with db() as conn:
        row = conn.execute("SELECT total FROM usage_opens WHERE id = 1").fetchone()
        if row:
            usage_total = row["total"]
    return jsonify({
        "ok": True,
        "mp_configured": bool(MP_TOKEN),
        "mp_test_mode": MP_TOKEN.startswith("TEST-"),
        "return_url": FRONTEND_RETURN_URL,
        "dev_bypass": dev_bypass_enabled(),
        "usage_opens_total": usage_total,
        **sandbox,
    })


@APP.post("/api/usage/ping")
def usage_ping():
    """Contador anónimo de aperturas. No registra IP ni identificadores de usuario."""
    data = request.get_json(silent=True) or {}
    app_version = (data.get("app_version") or "unknown").strip()[:32]
    with db() as conn:
        conn.execute(
            "UPDATE usage_opens SET total = total + 1, updated_at = ? WHERE id = 1",
            (now_iso(),),
        )
        row = conn.execute("SELECT total FROM usage_opens WHERE id = 1").fetchone()
    return jsonify({"ok": True, "total": row["total"] if row else None, "app_version": app_version})


@APP.get("/gracias")
def gracias():
    return """
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pago recibido — Telar</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 48px auto; padding: 0 20px; color: #1a2b4a; }
    h1 { font-size: 1.35rem; color: #2f6fed; }
    p { line-height: 1.5; color: #4a5568; }
    strong { color: #1a2b4a; }
  </style>
</head>
<body>
  <h1>¡Listo!</h1>
  <p>Si completaste el pago en Mercado Pago, vuelve a <strong>Telar</strong> en tu Mac.</p>
  <p>En <strong>Ajustes → Plan</strong> pulsa <strong>«Ya pagué — verificar suscripción»</strong>.</p>
  <p>Tus datos clínicos siguen solo en tu computador.</p>
</body>
</html>
""", 200, {"Content-Type": "text/html; charset=utf-8"}


@APP.post("/api/subscriptions/checkout")
def checkout():
    data = request.get_json(silent=True) or {}
    raw_email = (data.get("email") or "").strip()
    if not is_valid_payer_email(raw_email):
        return jsonify({"error": "Email inválido"}), 400
    email = normalize_payer_email(raw_email)
    if not MP_TOKEN:
        return jsonify({"error": "Mercado Pago no configurado en el servidor"}), 503

    sandbox = subscription_sandbox_status()
    # Advertencia en health; no bloqueamos checkout (MP no entrega token API del vendedor test en el panel).

    back_url = checkout_back_url()
    if not back_url:
        return jsonify({
            "error": "Falta MP_PUBLIC_BACK_URL en .env (URL https pública, ej. https://www.mercadopago.cl)",
        }), 503

    sdk = mp_sdk()
    plan_body, plan_err = resolve_mp_plan(sdk, back_url)
    if not plan_body:
        return jsonify({"error": plan_err or "No se pudo resolver el plan de suscripción"}), 502

    init_point = plan_init_point(plan_body)
    if not init_point:
        return jsonify({"error": "Mercado Pago no devolvió URL de pago", "detail": plan_body}), 502

    # En TEST no prefijamos payer_email: el comprador inicia sesión en el checkout de MP.
    checkout_url = init_point
    if not MP_TOKEN.startswith("TEST-"):
        sep = "&" if "?" in init_point else "?"
        checkout_url = f"{init_point}{sep}payer_email={quote(email)}"

    upsert_subscription(email, None, "pending")

    return jsonify({
        "checkout_url": checkout_url,
        "preapproval_plan_id": plan_body.get("id"),
        "amount_clp": PLAN_AMOUNT,
    })


@APP.post("/api/subscriptions/dev-activate")
def dev_activate():
    """Solo local: activa Pro sin Mercado Pago (SUBSCRIPTION_DEV_BYPASS=1 en .env)."""
    if not dev_bypass_enabled():
        return jsonify({"error": "No disponible"}), 404
    data = request.get_json(silent=True) or {}
    raw_email = (data.get("email") or "").strip()
    if not is_valid_payer_email(raw_email):
        return jsonify({"error": "Email inválido"}), 400
    email = normalize_payer_email(raw_email)
    if not dev_bypass_allows(email):
        return jsonify({"error": "Email no autorizado para bypass de desarrollo"}), 403
    upsert_subscription(email, "dev-bypass", "authorized")
    return jsonify({"active": True, "status": "authorized", "dev_bypass": True})


@APP.get("/api/subscriptions/status")
def status():
    raw_email = (request.args.get("email") or "").strip()
    if not raw_email:
        return jsonify({"error": "Falta email"}), 400
    email = normalize_payer_email(raw_email)

    if dev_bypass_allows(email):
        upsert_subscription(email, "dev-bypass", "authorized")
        return jsonify({
            "active": True,
            "status": "authorized",
            "updated_at": now_iso(),
            "dev_bypass": True,
        })

    mp_status = "none"
    preapproval_id = None
    updated_at = None

    with db() as conn:
        row = conn.execute(
            "SELECT status, mp_preapproval_id, updated_at FROM subscriptions WHERE email = ? ORDER BY id DESC LIMIT 1",
            (email,),
        ).fetchone()

    if row:
        mp_status = row["status"]
        preapproval_id = row["mp_preapproval_id"]
        updated_at = row["updated_at"]

    if MP_TOKEN and preapproval_id:
        try:
            remote = fetch_mp_preapproval(preapproval_id)
            remote_status = remote.get("status")
            if remote_status and remote_status != mp_status:
                mp_status = remote_status
                upsert_subscription(email, preapproval_id, mp_status)
        except Exception:
            pass
    elif MP_TOKEN and mp_status in ("none", "pending"):
        remote = find_mp_preapproval_by_email(email)
        if remote:
            preapproval_id = remote.get("id")
            mp_status = remote.get("status", "unknown")
            upsert_subscription(email, preapproval_id, mp_status)
            updated_at = now_iso()

    active = mp_status in ACTIVE_STATUSES
    return jsonify({
        "active": active,
        "status": mp_status,
        "updated_at": updated_at,
    })


def process_preapproval_webhook(resource_id: str):
    if not MP_TOKEN or not resource_id:
        return
    try:
        body = fetch_mp_preapproval(resource_id)
        if not body:
            return
        mp_status = body.get("status", "unknown")
        payer_email = (body.get("payer_email") or "").lower()
        if payer_email:
            upsert_subscription(payer_email, resource_id, mp_status)
        else:
            with db() as conn:
                conn.execute(
                    "UPDATE subscriptions SET status = ?, updated_at = ? WHERE mp_preapproval_id = ?",
                    (mp_status, now_iso(), resource_id),
                )
    except Exception:
        pass


@APP.route("/api/webhooks/mercadopago", methods=["GET", "POST"])
def webhook():
    secret = request.args.get("secret", "")
    if WEBHOOK_SECRET and secret != WEBHOOK_SECRET:
        return jsonify({"error": "No autorizado"}), 401

    resource_id = request.args.get("id") or request.args.get("data.id")
    topic = request.args.get("topic") or request.args.get("type") or ""

    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        topic = topic or payload.get("type") or payload.get("action", "")
        data = payload.get("data") or {}
        resource_id = resource_id or data.get("id")

    if resource_id and "preapproval" in str(topic).lower():
        process_preapproval_webhook(resource_id)
    elif resource_id and request.method == "GET" and request.args.get("topic") == "preapproval":
        process_preapproval_webhook(resource_id)

    return jsonify({"ok": True})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    APP.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
