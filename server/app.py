"""
API mínima de suscripciones — Plan Profesional Telar.
Mercado Pago (Chile) · preapproval mensual en CLP.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
DB_PATH = Path(__file__).parent / "subscriptions.db"

ACTIVE_STATUSES = frozenset({"authorized", "active"})


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


def mp_sdk():
    if not MP_TOKEN:
        raise RuntimeError("MP_ACCESS_TOKEN no configurado")
    return mercadopago.SDK(MP_TOKEN)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def checkout_back_url() -> str | None:
    """Mercado Pago exige https en back_url; localhost no sirve al crear la suscripción."""
    url = FRONTEND_RETURN_URL
    if url.startswith("http://") and ("localhost" in url or "127.0.0.1" in url):
        return MP_PUBLIC_BACK_URL.rstrip("/") if MP_PUBLIC_BACK_URL else None
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
    return jsonify({
        "ok": True,
        "mp_configured": bool(MP_TOKEN),
        "mp_test_mode": MP_TOKEN.startswith("TEST-"),
        "return_url": FRONTEND_RETURN_URL,
    })


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
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "Email inválido"}), 400
    if not MP_TOKEN:
        return jsonify({"error": "Mercado Pago no configurado en el servidor"}), 503

    back_url = checkout_back_url()
    if not back_url:
        return jsonify({
            "error": "Falta MP_PUBLIC_BACK_URL en .env (URL https pública + /gracias, ej. Render)",
        }), 503

    sdk = mp_sdk()
    payload = {
        "reason": "Plan Profesional — Telar",
        "external_reference": f"pro-{email}",
        "payer_email": email,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": PLAN_AMOUNT,
            "currency_id": "CLP",
        },
        "back_url": back_url,
        "status": "pending",
    }
    result = sdk.preapproval().create(payload)
    body = result.get("response") or {}
    if result.get("status") not in (200, 201):
        return jsonify({"error": body.get("message", "Error Mercado Pago"), "detail": body}), 502

    preapproval_id = body.get("id")
    # Con credenciales TEST- usar sandbox; con APP_USR- producción.
    if MP_TOKEN.startswith("TEST-"):
        init_point = body.get("sandbox_init_point") or body.get("init_point")
    else:
        init_point = body.get("init_point") or body.get("sandbox_init_point")
    if not init_point:
        return jsonify({"error": "Mercado Pago no devolvió URL de pago", "detail": body}), 502

    upsert_subscription(email, preapproval_id, "pending")

    return jsonify({
        "checkout_url": init_point,
        "preapproval_id": preapproval_id,
        "amount_clp": PLAN_AMOUNT,
    })


@APP.get("/api/subscriptions/status")
def status():
    email = (request.args.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Falta email"}), 400

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
    elif MP_TOKEN and mp_status == "none":
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
