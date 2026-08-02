"""
API mínima de suscripciones — Plan Profesional Telar.
Mercado Pago (Chile) · preapproval mensual en CLP.
"""
from __future__ import annotations

import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import mercadopago

load_dotenv()

APP = Flask(__name__)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:1420,http://localhost:1420,"
        "http://tauri.localhost,https://tauri.localhost,"
        "tauri://localhost,"
        "https://telarapp.cl,https://www.telarapp.cl",
    ).split(",")
    if origin.strip()
]
CORS(APP, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

MP_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5001").rstrip("/")
FRONTEND_RETURN_URL = os.environ.get("FRONTEND_RETURN_URL", f"{BACKEND_URL}/gracias")
MP_PUBLIC_BACK_URL = os.environ.get("MP_PUBLIC_BACK_URL", "").strip()
PLAN_AMOUNT = int(os.environ.get("PLAN_AMOUNT_CLP", "19990"))
PLAN_REASON = os.environ.get("MP_PLAN_REASON", "Plan Profesional — Telar")
MP_PREAPPROVAL_PLAN_ID = os.environ.get("MP_PREAPPROVAL_PLAN_ID", "").strip()
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "") or os.environ.get("MP_WEBHOOK_SECRET", "")
DEV_PRO_EMAIL = os.environ.get("DEV_PRO_EMAIL", "").strip().lower()
DB_PATH = Path(os.environ.get("SUBSCRIPTION_DB_PATH", Path(__file__).parent / "subscriptions.db"))

# Postgres si hay DATABASE_URL (producción: Neon); SQLite si no (desarrollo y
# tests). El plan free de Render tiene disco efímero, así que sin Postgres los
# contadores se pierden en cada reinicio.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

ACTIVE_STATUSES = frozenset({"authorized", "active"})
_plan_cache: dict | None = None

# --- Analítica del landing (agregada, sin cookies ni identificadores) -------
# Solo se guarda un contador por (día, nombre de evento). Nunca IP, user-agent
# ni sesión: el cliente deduplica los pasos del funnel en sessionStorage y el
# servidor jamás ve de quién viene el evento.
EVENT_NAME_RE = re.compile(r"^(view|cta|step):[a-z0-9_]{1,32}$")
# Techo de nombres distintos: evita que un tercero infle la tabla inventando
# eventos. Los nombres ya vistos siguen contando aunque se alcance el techo.
MAX_DISTINCT_EVENTS = 200
FUNNEL_STEPS = [
    ("step:visit", "Visitas"),
    ("step:explore", "Exploran el producto"),
    ("step:pricing", "Ven el precio"),
    ("step:intent", "Descargan o escriben"),
]
DEFAULT_FUNNEL_DAYS = 30
MAX_FUNNEL_DAYS = 365


def dev_bypass_enabled() -> bool:
    flag = os.environ.get("SUBSCRIPTION_DEV_BYPASS", "").strip().lower() in ("1", "true", "yes")
    if not flag:
        return False
    # Nunca en token de producción MP
    return not MP_TOKEN.startswith("APP_USR-")


def dev_bypass_allows(email: str) -> bool:
    if not dev_bypass_enabled():
        return False
    if not DEV_PRO_EMAIL:
        return True
    return normalize_payer_email(email).lower() == normalize_payer_email(DEV_PRO_EMAIL).lower()


class _Conn:
    """Conexión unificada SQLite/Postgres.

    El código de arriba escribe SQL con `?` como placeholder y lee las filas
    por nombre de columna, sin saber qué motor hay debajo. Al salir del `with`
    se hace commit (o rollback si hubo excepción) y se cierra: SQLite por sí
    solo no cierra la conexión y las iba dejando abiertas.
    """

    def __init__(self, raw, is_postgres):
        self._raw = raw
        self._is_postgres = is_postgres

    def execute(self, sql, params=()):
        if self._is_postgres:
            cur = self._raw.cursor()
            cur.execute(sql.replace("?", "%s"), params)
            return cur
        return self._raw.execute(sql, params)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self._raw.commit()
            else:
                self._raw.rollback()
        finally:
            self._raw.close()
        return False


def db():
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        return _Conn(psycopg.connect(DATABASE_URL, row_factory=dict_row), True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return _Conn(conn, False)


def init_db(attempts: int = 3, delay: float = 2.0):
    """Crea el esquema, reintentando si la base aún no responde.

    Se llama al importar el módulo, así que una excepción acá mata al worker de
    gunicorn y el servicio entra en bucle de reinicio. Neon suspende el cómputo
    cuando no hay tráfico y la primera conexión después de dormir puede fallar,
    de modo que un reintento corto evita caídas por algo que se resuelve solo.
    """
    for attempt in range(1, attempts + 1):
        try:
            _create_schema()
            return
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(delay * attempt)


def _create_schema():
    # Único punto donde los dialectos difieren de verdad.
    autoincrement = "SERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
    with db() as conn:
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS subscriptions (
                id {autoincrement},
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
            # ON CONFLICT DO NOTHING es portable; INSERT OR IGNORE es solo SQLite.
            "INSERT INTO usage_opens (id, total, updated_at) VALUES (1, 0, ?) "
            "ON CONFLICT (id) DO NOTHING",
            (now_iso(),),
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS landing_events (
                day TEXT NOT NULL,
                name TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (day, name)
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_day ON landing_events(day)")


def mp_sdk():
    if not MP_TOKEN:
        raise RuntimeError("MP_ACCESS_TOKEN no configurado")
    return mercadopago.SDK(MP_TOKEN)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def record_event(name: str) -> bool:
    """Suma 1 al contador (día, evento). Devuelve False si el nombre no es válido
    o si se alcanzó el techo de nombres distintos."""
    if not EVENT_NAME_RE.match(name):
        return False
    day = today_utc()
    with db() as conn:
        known = conn.execute(
            "SELECT 1 FROM landing_events WHERE name = ? LIMIT 1", (name,)
        ).fetchone()
        if not known:
            distinct = conn.execute(
                "SELECT COUNT(DISTINCT name) AS n FROM landing_events"
            ).fetchone()["n"]
            if distinct >= MAX_DISTINCT_EVENTS:
                return False
        conn.execute(
            # count debe ir calificado: Postgres lo rechaza sin la tabla delante.
            """INSERT INTO landing_events (day, name, count) VALUES (?, ?, 1)
               ON CONFLICT(day, name) DO UPDATE SET count = landing_events.count + 1""",
            (day, name),
        )
    return True


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
            "Opciones: (1) credenciales de producción + pago real $19.990, o "
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
        row = conn.execute(
            "SELECT id FROM subscriptions WHERE email = ?",
            (email,),
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE subscriptions SET status = ?, updated_at = ?,
                   mp_preapproval_id = COALESCE(?, mp_preapproval_id)
                   WHERE email = ?""",
                (status, now_iso(), preapproval_id, email),
            )
            return
        # dev-bypass is shared across installs — never reassign an existing row by preapproval_id.
        if preapproval_id and preapproval_id != "dev-bypass":
            row = conn.execute(
                "SELECT id FROM subscriptions WHERE mp_preapproval_id = ? LIMIT 1",
                (preapproval_id,),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE subscriptions SET status = ?, updated_at = ?, email = ? WHERE id = ?",
                    (status, now_iso(), email, row["id"]),
                )
                return
        conn.execute(
            """INSERT INTO subscriptions (email, mp_preapproval_id, status, updated_at)
               VALUES (?, ?, ?, ?)""",
            (email, preapproval_id, status, now_iso()),
        )


def fetch_mp_preapproval(preapproval_id: str):
    sdk = mp_sdk()
    res = sdk.preapproval().get(preapproval_id)
    return (res.get("response") or {}) if res.get("status") == 200 else {}


def preapproval_matches_email(item: dict, email: str) -> bool:
    """MP dejó de exponer payer_email en preapprovals; usamos external_reference."""
    candidates = (
        (item.get("payer_email") or "").lower(),
        (item.get("external_reference") or "").lower(),
    )
    return email in candidates


def find_mp_preapproval_by_email(email: str):
    sdk = mp_sdk()
    email = email.lower()
    search_params = (
        {"external_reference": email, "limit": 20},
        {"payer_email": email, "limit": 20},
        {"limit": 50},
    )
    for params in search_params:
        try:
            res = sdk.preapproval().search(params)
            results = (res.get("response") or {}).get("results") or []
            for item in results:
                if preapproval_matches_email(item, email):
                    return item
        except Exception:
            pass
    return None


def create_user_preapproval(sdk, email: str, back_url: str):
    """Preapproval por usuario con external_reference=email — única forma fiable de
    conciliar pagos, porque MP ya no devuelve payer_email en la API."""
    try:
        res = sdk.preapproval().create({
            "reason": PLAN_REASON,
            "external_reference": email,
            "payer_email": email,
            "back_url": back_url,
            "auto_recurring": {
                "frequency": 1,
                "frequency_type": "months",
                "transaction_amount": PLAN_AMOUNT,
                "currency_id": "CLP",
            },
            "status": "pending",
        })
        if res.get("status") in (200, 201):
            body = res.get("response") or {}
            init_point = body.get("init_point")
            if init_point and body.get("id"):
                return init_point, body["id"]
    except Exception:
        pass
    return None, None


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
        row = conn.execute("SELECT total, updated_at FROM usage_opens WHERE id = 1").fetchone()
    return jsonify({"ok": True, "total": row["total"] if row else None, "app_version": app_version})


@APP.get("/api/admin/usage")
def admin_usage():
    """Estadísticas anónimas de uso (solo propietario, requiere WEBHOOK_SECRET)."""
    if not WEBHOOK_SECRET or request.args.get("secret", "") != WEBHOOK_SECRET:
        return jsonify({"error": "No autorizado"}), 401
    with db() as conn:
        row = conn.execute("SELECT total, updated_at FROM usage_opens WHERE id = 1").fetchone()
    return jsonify({
        "ok": True,
        "usage_opens_total": row["total"] if row else 0,
        "updated_at": row["updated_at"] if row else None,
        "note": "Contador acumulado de aperturas de app (1 ping/día/dispositivo si está activo). No mide usuarios simultáneos.",
    })


@APP.post("/api/events")
def collect_event():
    """Evento anónimo del landing. Sin cookies, sin IP, sin user-agent:
    solo incrementa un contador por (día, nombre)."""
    # force=True: el cliente envía text/plain a propósito para evitar el
    # preflight CORS que sendBeacon no puede negociar.
    data = request.get_json(silent=True, force=True) or {}
    name = (data.get("name") or "").strip().lower()[:64]
    record_event(name)
    # Siempre 204: el navegador no debe reintentar ni exponer si el nombre existe.
    return "", 204


def funnel_from_totals(totals: dict[str, int]) -> list[dict]:
    """Pasos del funnel con % respecto al paso 1 y caída contra el paso previo."""
    top = totals.get(FUNNEL_STEPS[0][0], 0)
    steps = []
    previous = None
    for key, label in FUNNEL_STEPS:
        count = totals.get(key, 0)
        steps.append({
            "key": key,
            "label": label,
            "count": count,
            "pct_of_top": round(count / top * 100, 1) if top else 0.0,
            "drop_from_previous": (
                round((previous - count) / previous * 100, 1)
                if previous else None
            ),
        })
        previous = count
    return steps


@APP.get("/api/admin/funnel")
def admin_funnel():
    """Funnel del landing (solo propietario, requiere WEBHOOK_SECRET)."""
    if not WEBHOOK_SECRET or request.args.get("secret", "") != WEBHOOK_SECRET:
        return jsonify({"error": "No autorizado"}), 401

    try:
        days = int(request.args.get("days", DEFAULT_FUNNEL_DAYS))
    except ValueError:
        days = DEFAULT_FUNNEL_DAYS
    days = max(1, min(days, MAX_FUNNEL_DAYS))
    since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    with db() as conn:
        rows = conn.execute(
            "SELECT day, name, count FROM landing_events WHERE day >= ? ORDER BY day",
            (since,),
        ).fetchall()
        usage = conn.execute("SELECT total, updated_at FROM usage_opens WHERE id = 1").fetchone()

    totals: dict[str, int] = {}
    by_day: dict[str, dict[str, int]] = {}
    for row in rows:
        totals[row["name"]] = totals.get(row["name"], 0) + row["count"]
        by_day.setdefault(row["day"], {})[row["name"]] = row["count"]

    # Serie diaria continua (los días sin tráfico valen 0, no se saltan).
    start = datetime.strptime(since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    series = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).strftime("%Y-%m-%d")
        counts = by_day.get(day, {})
        series.append({
            "day": day,
            "visits": counts.get("step:visit", 0),
            "intent": counts.get("step:intent", 0),
        })

    return jsonify({
        "ok": True,
        "range_days": days,
        "since": since,
        "funnel": funnel_from_totals(totals),
        "series": series,
        "events": dict(sorted(totals.items())),
        "usage_opens_total": usage["total"] if usage else 0,
        "usage_updated_at": usage["updated_at"] if usage else None,
        "note": (
            "Eventos agregados por día. Los pasos del funnel se cuentan una vez "
            "por sesión del navegador; los eventos view:/cta: cuentan cada ocurrencia."
        ),
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
  <p>Vuelve a la app en tu Mac: el plan se activará solo en unos segundos.</p>
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

    # Producción: preapproval por usuario (external_reference=email) para conciliar el pago.
    if not MP_TOKEN.startswith("TEST-"):
        init_point, preapproval_id = create_user_preapproval(sdk, email, back_url)
        if init_point and preapproval_id:
            upsert_subscription(email, preapproval_id, "pending")
            return jsonify({
                "checkout_url": init_point,
                "preapproval_id": preapproval_id,
                "amount_clp": PLAN_AMOUNT,
            })

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
    try:
        upsert_subscription(email, "dev-bypass", "authorized")
    except Exception as exc:
        return jsonify({"error": f"No se pudo activar Pro: {exc}"}), 500
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
        hint_id = (request.args.get("preapproval_id") or "").strip()
        if hint_id:
            try:
                remote = fetch_mp_preapproval(hint_id)
                if remote:
                    preapproval_id = hint_id
                    mp_status = remote.get("status", "unknown")
                    upsert_subscription(email, preapproval_id, mp_status)
                    updated_at = now_iso()
            except Exception:
                pass
        if mp_status in ("none", "pending"):
            # Sin esta guarda un fallo de MP devuelve 500. El cliente trata
            # "none" como "no sé" y conserva el plan local, pero un 500 lo deja
            # sin respuesta; degradar es mejor que romper.
            try:
                remote = find_mp_preapproval_by_email(email)
                if remote:
                    preapproval_id = remote.get("id")
                    mp_status = remote.get("status", "unknown")
                    upsert_subscription(email, preapproval_id, mp_status)
                    updated_at = now_iso()
            except Exception:
                pass

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
        # MP ya no expone payer_email; external_reference lleva el email desde el checkout.
        email = (body.get("payer_email") or body.get("external_reference") or "").lower()
        if email and "@" in email:
            upsert_subscription(email, resource_id, mp_status)
        else:
            with db() as conn:
                conn.execute(
                    "UPDATE subscriptions SET status = ?, updated_at = ? WHERE mp_preapproval_id = ?",
                    (mp_status, now_iso(), resource_id),
                )
    except Exception:
        pass


@APP.post("/api/admin/link-subscription")
def admin_link_subscription():
    """Liga manualmente email ↔ preapproval (soporte). Requiere WEBHOOK_SECRET."""
    if not WEBHOOK_SECRET or request.args.get("secret", "") != WEBHOOK_SECRET:
        return jsonify({"error": "No autorizado"}), 401
    data = request.get_json(silent=True) or {}
    raw_email = (data.get("email") or "").strip()
    preapproval_id = (data.get("preapproval_id") or "").strip()
    if not is_valid_payer_email(raw_email) or not preapproval_id:
        return jsonify({"error": "Faltan email o preapproval_id"}), 400
    email = normalize_payer_email(raw_email)
    try:
        body = fetch_mp_preapproval(preapproval_id)
    except Exception as exc:
        return jsonify({"error": f"No se pudo consultar Mercado Pago: {exc}"}), 502
    if not body:
        return jsonify({"error": "Preapproval no encontrada en Mercado Pago"}), 404
    mp_status = body.get("status", "unknown")
    try:
        upsert_subscription(email, preapproval_id, mp_status)
    except Exception as exc:
        return jsonify({"error": f"No se pudo guardar la suscripción: {exc}"}), 500
    return jsonify({"ok": True, "email": email, "status": mp_status, "active": mp_status in ACTIVE_STATUSES})


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
