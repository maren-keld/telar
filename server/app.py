"""
API mínima de suscripciones — Plan Profesional Telar.
Mercado Pago (Chile) · preapproval mensual en CLP.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import sqlite3
import time
import unicodedata
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

# Panel privado /panel — sin esta variable el panel queda apagado (falla cerrado).
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "").strip()
PANEL_COOKIE = "telar_panel"
ONLINE_WINDOW_MIN = int(os.environ.get("PANEL_ONLINE_WINDOW_MIN", "3"))

ACTIVE_STATUSES = frozenset({"authorized", "active"})
_plan_cache: dict | None = None

# --- Analítica del landing (agregada, sin cookies ni identificadores) -------
# Solo se guarda un contador por (día, nombre de evento). Nunca IP, user-agent
# ni sesión: el cliente deduplica los pasos del funnel en sessionStorage y el
# servidor jamás ve de quién viene el evento.
EVENT_NAME_RE = re.compile(r"^(view|cta|step|src|dev|os|dwell|geo):[a-z0-9_]{1,32}$")
# Techo de nombres distintos: evita que un tercero infle la tabla inventando
# eventos. Los nombres ya vistos siguen contando aunque se alcance el techo.
# Holgado a propósito: Chile tiene 346 comunas y cada una es un nombre distinto.
MAX_DISTINCT_EVENTS = 600
FUNNEL_STEPS = [
    ("step:visit", "Visitas"),
    ("step:explore", "Exploran el producto"),
    ("step:pricing", "Ven el precio"),
    ("step:intent", "Descargan o escriben"),
]
DEFAULT_FUNNEL_DAYS = 30
MAX_FUNNEL_DAYS = 365
DEFAULT_LANDING_DAYS = 14
TOP_COMUNAS = 15

# Rasgos de la sesión: categorías de lista cerrada. Un cliente cualquiera puede
# postear a /api/events, así que el valor se valida acá y no solo en el
# navegador; lo que no está en la lista se descarta sin registrar nada.
SOURCE_LABELS = {
    "google": "Google", "bing": "Bing", "duckduckgo": "DuckDuckGo",
    "otro_buscador": "Otro buscador", "facebook": "Facebook",
    "instagram": "Instagram", "tiktok": "TikTok", "reddit": "Reddit",
    "x": "X", "linkedin": "LinkedIn", "youtube": "YouTube",
    "whatsapp": "WhatsApp", "telegram": "Telegram", "ia": "Asistentes IA",
    "email": "Correo", "newsletter": "Newsletter", "qr": "Código QR",
    "flyer": "Flyer", "colega": "Colega", "evento": "Evento",
    "directo": "Directo", "otro": "Otro",
}
DEVICE_LABELS = {"movil": "Móvil", "tablet": "Tablet", "escritorio": "Escritorio"}
# El navegador manda solo esta etiqueta: nunca la cadena de user-agent, así que
# no hay versión ni build con que construir una huella del visitante.
OS_LABELS = {
    "windows": "Windows", "macos": "macOS", "ios": "iPhone / iPad",
    "android": "Android", "linux": "Linux", "chromeos": "ChromeOS",
    "otro": "Otro",
}
# (clave, etiqueta, segundos representativos del tramo) — los segundos sirven
# para estimar el tiempo típico sin haber guardado nunca una duración exacta.
DWELL_BUCKETS = [
    ("0_10", "Menos de 10 s", 5),
    ("10_30", "10–30 s", 20),
    ("30_60", "30 s–1 min", 45),
    ("1_3min", "1–3 min", 120),
    ("3_10min", "3–10 min", 390),
    ("10min_mas", "Más de 10 min", 900),
]
ALLOWED_TRAIT_VALUES = {
    "src": set(SOURCE_LABELS),
    "dev": set(DEVICE_LABELS),
    "os": set(OS_LABELS),
    "dwell": {key for key, _, _ in DWELL_BUCKETS},
}

# --- Comuna (GeoIP local, sin terceros) ------------------------------------
# La IP se traduce en memoria a un nombre de comuna y se descarta: lo único que
# llega a la base es un contador "geo:providencia" del día. Sin la base de datos
# instalada la función devuelve None y el resto de la analítica sigue igual.
# Base: DB-IP City Lite (CC BY 4.0) — ver server/fetch-geoip.sh.
# El evento guardado es un slug ASCII ("nunoa"); acá se repone la escritura
# correcta de las comunas que más aparecen. Las que falten se muestran
# capitalizadas sin tilde, que es feo pero no incorrecto de leer.
COMUNA_LABELS = {
    "nunoa": "Ñuñoa",
    "vina_del_mar": "Viña del Mar",
    "concepcion": "Concepción",
    "valparaiso": "Valparaíso",
    "san_joaquin": "San Joaquín",
    "san_ramon": "San Ramón",
    "penalolen": "Peñalolén",
    "conchali": "Conchalí",
    "maipu": "Maipú",
    "curico": "Curicó",
    "chillan": "Chillán",
    "copiapo": "Copiapó",
    "vallenar": "Vallenar",
    "quilpue": "Quilpué",
    "san_antonio": "San Antonio",
    "san_bernardo": "San Bernardo",
    "puente_alto": "Puente Alto",
    "la_florida": "La Florida",
    "las_condes": "Las Condes",
    "lo_barnechea": "Lo Barnechea",
    "estacion_central": "Estación Central",
    "san_miguel": "San Miguel",
    "quinta_normal": "Quinta Normal",
    "villa_alemana": "Villa Alemana",
    "talcahuano": "Talcahuano",
    "temuco": "Temuco",
    "valdivia": "Valdivia",
    "osorno": "Osorno",
    "puerto_montt": "Puerto Montt",
    "punta_arenas": "Punta Arenas",
    "antofagasta": "Antofagasta",
    "iquique": "Iquique",
    "arica": "Arica",
    "la_serena": "La Serena",
    "coquimbo": "Coquimbo",
    "rancagua": "Rancagua",
    "talca": "Talca",
    "santiago": "Santiago",
    "providencia": "Providencia",
    "otro_pais": "Fuera de Chile",
    "desconocida": "Sin determinar",
}

GEOIP_DB_PATH = os.environ.get(
    "GEOIP_DB_PATH", str(Path(__file__).parent / "geoip" / "dbip-city-lite.mmdb")
)
_geoip_reader = None
_geoip_tried = False


def clean_field(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


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
        conn.execute(
            """CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                app_version TEXT,
                platform TEXT,
                plan TEXT,
                active INTEGER NOT NULL DEFAULT 0,
                opens INTEGER NOT NULL DEFAULT 0,
                pings INTEGER NOT NULL DEFAULT 0
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS device_days (
                device_id TEXT NOT NULL,
                day TEXT NOT NULL,
                PRIMARY KEY (device_id, day)
            )"""
        )
        from crm import ensure_schema

        ensure_schema(conn, autoincrement)

        from share import ensure_schema as ensure_share_schema

        ensure_share_schema(conn, autoincrement)


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
    prefix, _, value = name.partition(":")
    allowed = ALLOWED_TRAIT_VALUES.get(prefix)
    if allowed is not None and value not in allowed:
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


def geoip_reader():
    """Lector mmdb compartido, o None si la base no está instalada.

    Se intenta una sola vez: si falta el archivo (desarrollo local, tests) la
    analítica de comuna queda apagada en silencio y el resto no se entera.
    """
    global _geoip_reader, _geoip_tried
    if _geoip_tried:
        return _geoip_reader
    _geoip_tried = True
    try:
        import maxminddb

        _geoip_reader = maxminddb.open_database(GEOIP_DB_PATH)
    except Exception:
        _geoip_reader = None
    return _geoip_reader


def client_ip() -> str:
    """IP del visitante detrás del proxy de Render. Se usa y se descarta."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or ""


def slugify(value: str) -> str:
    """'Ñuñoa' → 'nunoa'. El evento es un slug ASCII; la tilde se repone al
    mostrarlo (COMUNA_LABELS)."""
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", plain.lower()).strip("_")[:32]


def geo_event() -> str | None:
    """Nombre de evento con la comuna del visitante, sin guardar la IP.

    Solo se resuelve para Chile; el resto se agrupa en un único contador para no
    convertir el panel en una lista de países con una visita cada uno.
    """
    reader = geoip_reader()
    if reader is None:
        return None
    ip = client_ip()
    if not ip:
        return None
    try:
        record = reader.get(ip) or {}
    except Exception:
        # IP privada, IPv6 mal formada, base corrupta: no es motivo para que
        # falle el evento del visitante.
        return None

    country = (record.get("country") or {}).get("iso_code", "")
    if country and country != "CL":
        return "geo:otro_pais"

    names = (record.get("city") or {}).get("names") or {}
    city = names.get("es") or names.get("en") or ""
    if not city:
        subdivisions = record.get("subdivisions") or []
        if subdivisions:
            region_names = subdivisions[0].get("names") or {}
            city = region_names.get("es") or region_names.get("en") or ""
    slug = slugify(city)
    return f"geo:{slug}" if slug else "geo:desconocida"


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
            recurring = plan.get("auto_recurring") or {}
            amount_ok = int(recurring.get("transaction_amount") or 0) == PLAN_AMOUNT
            if amount_ok and (not collector_id or plan.get("collector_id") == collector_id):
                _plan_cache = plan
                return _plan_cache, None
        # Plan configurado con monto distinto o inválido — buscar/crear uno de $PLAN_AMOUNT CLP

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
        "plan_amount_clp": PLAN_AMOUNT,
        # Sin esto no hay forma de saber desde fuera si DATABASE_URL quedó activa
        # o si el servicio siguió cayendo al SQLite efímero de Render.
        "db_backend": "postgres" if USE_POSTGRES else "sqlite",
        "panel_enabled": bool(PANEL_PASSWORD),
        "return_url": FRONTEND_RETURN_URL,
        "dev_bypass": dev_bypass_enabled(),
        "usage_opens_total": usage_total,
        **sandbox,
    })


@APP.post("/api/usage/ping")
def usage_ping():
    """Latido anónimo por dispositivo. No registra IP ni identificadores del profesional."""
    data = request.get_json(silent=True) or {}
    device_id = clean_field(data.get("device_id"), 64)
    if not device_id:
        return jsonify({"error": "Falta device_id"}), 400

    app_version = clean_field(data.get("app_version"), 32) or "unknown"
    platform = clean_field(data.get("platform"), 16) or "other"
    plan = "pro" if clean_field(data.get("plan"), 8) == "pro" else "demo"
    reason = clean_field(data.get("reason"), 16) or "heartbeat"
    active = 1 if data.get("active") else 0
    ts = now_iso()

    with db() as conn:
        conn.execute(
            """INSERT INTO devices (device_id, first_seen, last_seen, app_version, platform,
                                    plan, active, opens, pings)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(device_id) DO UPDATE SET
                 last_seen   = excluded.last_seen,
                 app_version = excluded.app_version,
                 platform    = excluded.platform,
                 plan        = excluded.plan,
                 active      = excluded.active,
                 opens       = devices.opens + excluded.opens,
                 pings       = devices.pings + 1""",
            (device_id, ts, ts, app_version, platform, plan, active,
             1 if reason == "open" else 0),
        )
        conn.execute(
            # ON CONFLICT DO NOTHING es portable; INSERT OR IGNORE es solo SQLite.
            "INSERT INTO device_days (device_id, day) VALUES (?, ?) "
            "ON CONFLICT (device_id, day) DO NOTHING",
            (device_id, ts[:10]),
        )
        if reason == "open":
            conn.execute(
                "UPDATE usage_opens SET total = total + 1, updated_at = ? WHERE id = 1",
                (ts,),
            )

    return jsonify({"ok": True})


def panel_token() -> str:
    """Token derivado de la contraseña — nunca viaja la contraseña en la cookie."""
    if not PANEL_PASSWORD:
        return ""
    return hmac.new(PANEL_PASSWORD.encode(), b"telar-panel-v1", hashlib.sha256).hexdigest()


def panel_authorized() -> bool:
    expected = panel_token()
    if not expected:
        return False
    provided = request.cookies.get(PANEL_COOKIE, "") or request.args.get("token", "")
    if provided and hmac.compare_digest(provided, expected):
        return True
    # Atajo para curl: ?secret=<contraseña>
    secret = request.args.get("secret", "")
    return bool(secret) and hmac.compare_digest(secret, PANEL_PASSWORD)


@APP.get("/api/admin/usage")
def admin_usage():
    """Compatibilidad: contador acumulado de aperturas."""
    if not WEBHOOK_SECRET or not hmac.compare_digest(request.args.get("secret", ""), WEBHOOK_SECRET):
        return jsonify({"error": "No autorizado"}), 401
    with db() as conn:
        row = conn.execute("SELECT total, updated_at FROM usage_opens WHERE id = 1").fetchone()
    return jsonify({
        "ok": True,
        "usage_opens_total": row["total"] if row else 0,
        "updated_at": row["updated_at"] if row else None,
    })


@APP.post("/api/events")
def collect_event():
    """Evento anónimo del landing. Sin cookies, sin IP, sin user-agent:
    solo incrementa un contador por (día, nombre)."""
    # force=True: el cliente envía text/plain a propósito para evitar el
    # preflight CORS que sendBeacon no puede negociar.
    data = request.get_json(silent=True, force=True) or {}
    name = (data.get("name") or "").strip().lower()[:64]
    # "geo:*" lo escribe solo el servidor a partir de la IP: si viniera del
    # cliente cualquiera podría inventar comunas.
    if name.startswith("geo:"):
        return "", 204
    record_event(name)
    # La comuna se cuenta una vez por sesión, enganchada al primer paso del
    # funnel — que el cliente ya deduplica en sessionStorage.
    if name == FUNNEL_STEPS[0][0]:
        located = geo_event()
        if located:
            record_event(located)
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


def _distribution(totals: dict[str, int], prefix: str, labels: dict[str, str],
                  order: list[str] | None = None) -> list[dict]:
    """Contadores de un prefijo, con % sobre el total del propio grupo."""
    counts = {
        key: totals.get(f"{prefix}:{key}", 0)
        for key in (order or labels)
    }
    total = sum(counts.values())
    items = [
        {
            "key": key,
            "label": labels.get(key, key),
            "count": count,
            "pct": round(count / total * 100, 1) if total else 0.0,
        }
        for key, count in counts.items()
    ]
    if order is None:
        items.sort(key=lambda item: -item["count"])
    return [item for item in items if item["count"] or order]


def comuna_label(slug: str) -> str:
    """Repone tildes de las comunas frecuentes; el resto se muestra capitalizado."""
    if slug in COMUNA_LABELS:
        return COMUNA_LABELS[slug]
    return " ".join(word.capitalize() for word in slug.split("_"))


def dwell_summary(buckets: list[dict]) -> dict:
    """Tramo mediano y promedio aproximado, calculados desde el histograma.

    Nunca se guardó una duración exacta, así que esto es una estimación por
    tramos — suficiente para saber si la gente lee o rebota.
    """
    seconds = {key: secs for key, _, secs in DWELL_BUCKETS}
    total = sum(b["count"] for b in buckets)
    if not total:
        return {"total": 0, "median_label": None, "avg_seconds": 0}
    half, running, median = total / 2, 0, buckets[-1]
    for bucket in buckets:
        running += bucket["count"]
        if running >= half:
            median = bucket
            break
    average = sum(b["count"] * seconds[b["key"]] for b in buckets) / total
    return {
        "total": total,
        "median_label": median["label"],
        "avg_seconds": round(average),
    }


@APP.get("/api/admin/landing")
def admin_landing():
    """Rasgos agregados del landing para el panel: origen, dispositivo, tiempo
    y comuna. Son contadores independientes por día: no se pueden cruzar entre
    sí ni atribuir a una persona."""
    if not panel_authorized():
        return jsonify({"error": "No autorizado"}), 401

    try:
        days = int(request.args.get("days", DEFAULT_LANDING_DAYS))
    except ValueError:
        days = DEFAULT_LANDING_DAYS
    days = max(1, min(days, MAX_FUNNEL_DAYS))
    since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    with db() as conn:
        rows = conn.execute(
            "SELECT name, SUM(count) AS total FROM landing_events "
            "WHERE day >= ? GROUP BY name",
            (since,),
        ).fetchall()
    totals = {row["name"]: int(row["total"]) for row in rows}

    comunas = sorted(
        (
            {"key": name[4:], "label": comuna_label(name[4:]), "count": count}
            for name, count in totals.items()
            if name.startswith("geo:") and count
        ),
        key=lambda item: -item["count"],
    )
    located = sum(item["count"] for item in comunas)
    for item in comunas:
        item["pct"] = round(item["count"] / located * 100, 1) if located else 0.0
    # Cola larga agrupada: la lista útil son las primeras, no 300 filas de a una.
    head, tail = comunas[:TOP_COMUNAS], comunas[TOP_COMUNAS:]
    if tail:
        head.append({
            "key": "otras",
            "label": f"Otras {len(tail)} comunas",
            "count": sum(item["count"] for item in tail),
            "pct": round(sum(item["count"] for item in tail) / located * 100, 1),
        })

    dwell = _distribution(
        totals, "dwell",
        {key: label for key, label, _ in DWELL_BUCKETS},
        order=[key for key, _, _ in DWELL_BUCKETS],
    )

    return jsonify({
        "ok": True,
        "range_days": days,
        "since": since,
        "visits": totals.get("step:visit", 0),
        "sources": _distribution(totals, "src", SOURCE_LABELS),
        "devices": _distribution(totals, "dev", DEVICE_LABELS),
        "os": _distribution(totals, "os", OS_LABELS),
        "dwell": dwell,
        "dwell_summary": dwell_summary(dwell),
        "comunas": head,
        "geo_enabled": geoip_reader() is not None,
        "note": (
            "Contadores agregados por día, sin cookies ni IP almacenada. Cada "
            "rasgo se cuenta una vez por sesión del navegador y son "
            "independientes entre sí: no se pueden cruzar."
        ),
    })


@APP.get("/api/admin/live")
def admin_live():
    """Estado en vivo para el panel privado: quién está usando Telar ahora."""
    if not panel_authorized():
        return jsonify({"error": "No autorizado"}), 401

    now = datetime.now(timezone.utc)
    online_cut = (now - timedelta(minutes=ONLINE_WINDOW_MIN)).isoformat()
    today = now.date().isoformat()
    since_14 = (now - timedelta(days=13)).date().isoformat()

    with db() as conn:
        devices = [dict(r) for r in conn.execute(
            """SELECT device_id, first_seen, last_seen, app_version, platform, plan, active,
                      opens, pings,
                      (SELECT COUNT(*) FROM device_days d WHERE d.device_id = devices.device_id)
                        AS active_days
               FROM devices ORDER BY last_seen DESC LIMIT 200"""
        ).fetchall()]
        daily = [dict(r) for r in conn.execute(
            """SELECT day, COUNT(*) AS devices FROM device_days
               WHERE day >= ? GROUP BY day ORDER BY day""",
            (since_14,),
        ).fetchall()]
        subs = [dict(r) for r in conn.execute(
            "SELECT email, status, updated_at FROM subscriptions ORDER BY id DESC LIMIT 50"
        ).fetchall()]

    for d in devices:
        d["online"] = d["last_seen"] >= online_cut
        d["short_id"] = d["device_id"][:8]

    online = [d for d in devices if d["online"]]
    today_devices = sum(1 for d in devices if d["last_seen"][:10] == today)
    returning = sum(1 for d in devices if d["active_days"] >= 2)

    return jsonify({
        "ok": True,
        "generated_at": now.isoformat(),
        "online_window_min": ONLINE_WINDOW_MIN,
        "totals": {
            "online_now": len(online),
            "devices_today": today_devices,
            "devices_total": len(devices),
            "returning": returning,
            "pro": sum(1 for d in devices if d["plan"] == "pro"),
        },
        "devices": devices,
        "daily": daily,
        "subscriptions": subs,
    })


PANEL_CSS = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:#0e1116; color:#e6edf3; }
.wrap { max-width:1080px; margin:0 auto; padding:32px 20px 64px; }
h1 { font-size:20px; margin:0; letter-spacing:-.01em; }
.sub { color:#8b949e; font-size:13px; margin:4px 0 0; }
.top { display:flex; justify-content:space-between; align-items:baseline; gap:16px;
  flex-wrap:wrap; margin-bottom:28px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
.tile { background:#161b22; border:1px solid #262c36; border-radius:10px; padding:16px 18px; }
.tile b { display:block; font-size:30px; font-weight:650; letter-spacing:-.02em; }
.tile span { color:#8b949e; font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
.tile.live b { color:#3fb950; }
.tile.live.zero b { color:#6e7681; }
h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#8b949e;
  margin:36px 0 12px; font-weight:600; }
.section-head { display:flex; justify-content:space-between; align-items:center;
  gap:12px 16px; flex-wrap:wrap; }
.section-head h2 { margin-bottom:0; }
/* Selector de rango: semana / mes / trimestre / año sobre los mismos contadores
   diarios; no se recalcula nada, solo cambia el "day >= ?" de la consulta. */
.range { display:flex; gap:6px; margin-top:36px; }
.range button { width:auto; padding:5px 11px; font-size:12px; font-weight:500;
  background:#161b22; border:1px solid #262c36; color:#8b949e; border-radius:7px; }
.range button:hover { background:#1c2230; color:#e6edf3; }
.range button[aria-pressed="true"] { background:#1f6feb; border-color:#1f6feb; color:#fff; }
.card { background:#161b22; border:1px solid #262c36; border-radius:10px; overflow:hidden; }
.scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
th { text-align:left; padding:10px 14px; color:#8b949e; font-weight:500; font-size:11px;
  text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #262c36; }
td { padding:11px 14px; border-bottom:1px solid #1c222b; }
tr:last-child td { border-bottom:none; }
code { font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:#a5d6ff; }
.dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#30363d;
  margin-right:7px; vertical-align:middle; }
.dot.on { background:#3fb950; box-shadow:0 0 0 3px rgba(63,185,80,.16); }
.pill { font-size:11px; padding:2px 7px; border-radius:20px; border:1px solid #30363d;
  color:#8b949e; }
.pill.pro { color:#d29922; border-color:#4a3d16; background:#241d08; }
.pill.ok { color:#3fb950; border-color:#1c4428; background:#0f2417; }
.bars { display:flex; align-items:flex-end; gap:5px; height:90px; padding:16px 18px 0; }
.bars div { flex:1; background:#1f6feb; border-radius:3px 3px 0 0; min-height:2px;
  position:relative; }
.bars div:hover { background:#388bfd; }
.blabels { display:flex; gap:5px; padding:6px 18px 16px; }
.blabels span { flex:1; text-align:center; font-size:10px; color:#6e7681; }
.empty { padding:36px 18px; text-align:center; color:#6e7681; font-size:13px; }
.cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:0 24px; }
/* Barras horizontales: la etiqueta se lee sin hover, a diferencia del gráfico
   vertical de arriba, donde solo hay 14 días numerados. */
.rows { padding:14px 18px 16px; display:grid; gap:9px; }
.row { display:grid; grid-template-columns:1fr auto; gap:2px 12px; font-size:13px; }
.row .bar { grid-column:1/-1; height:5px; border-radius:3px; background:#21262d; }
.row .bar i { display:block; height:100%; border-radius:3px; background:#1f6feb; }
.row .n { color:#8b949e; font-variant-numeric:tabular-nums; font-size:12px; }
.row.muted .bar i { background:#30363d; }
.note { color:#6e7681; font-size:12px; margin:10px 0 0; }
.err { color:#f85149; }
body > form { max-width:320px; margin:14vh auto; padding:0 20px; }
body > form input { width:100%; padding:11px 13px; border-radius:8px; border:1px solid #30363d;
  background:#0d1117; color:#e6edf3; font-size:15px; margin:14px 0; }
body > form button { width:100%; padding:11px; border-radius:8px; border:0; background:#238636;
  color:#fff; font-size:15px; font-weight:500; cursor:pointer; }
body > form button:hover { background:#2ea043; }
"""

from crm import CRM_CSS, CRM_MARKUP, CRM_SCRIPT, register_routes

PANEL_CSS = PANEL_CSS + CRM_CSS


def panel_login_page(error: str = "") -> str:
    msg = f'<p class="sub err">{error}</p>' if error else ""
    return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Telar · panel</title><style>{PANEL_CSS}</style></head><body>
<form method="post" action="/panel/login">
  <h1>Telar · panel</h1>
  <p class="sub">Uso en vivo. Acceso privado.</p>
  {msg}
  <input type="password" name="password" placeholder="Contraseña" autofocus required>
  <button type="submit">Entrar</button>
</form></body></html>"""


PANEL_HTML = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Telar · panel</title><style>__CSS__</style></head><body>
<div class="wrap">
  <div class="top">
    <div><h1>Telar · panel</h1><p class="sub" id="stamp">Cargando…</p></div>
    <div>
      <nav class="tabs" id="tabs">
        <button type="button" data-tab="crm" aria-pressed="true">CRM</button>
        <button type="button" data-tab="uso">Uso</button>
      </nav>
      <p class="sub" id="live-hint" hidden>Se actualiza solo cada 20 s</p>
    </div>
  </div>
  __CRM__
  <div id="tab-uso" hidden>
  <div class="tiles" id="tiles"></div>
  <h2>Dispositivos activos por día (14 días)</h2>
  <div class="card" id="chart"></div>
  <h2>Dispositivos</h2>
  <div class="card scroll" id="devices"></div>
  <h2>Suscripciones</h2>
  <div class="card scroll" id="subs"></div>

  <div class="section-head">
    <h2 id="landing-title">Visitas al sitio</h2>
    <div class="range" id="range"></div>
  </div>
  <div class="cols">
    <div>
      <h2>De dónde llegan</h2>
      <div class="card" id="sources"></div>
      <h2>Tipo de dispositivo</h2>
      <div class="card" id="screens"></div>
      <h2>Sistema operativo</h2>
      <div class="card" id="os"></div>
    </div>
    <div>
      <h2>Comuna</h2>
      <div class="card" id="comunas"></div>
      <h2>Tiempo en la página</h2>
      <div class="card" id="dwell"></div>
    </div>
  </div>
  <p class="note" id="landing-note"></p>
  </div>
</div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function ago(iso) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return 'ahora';
  if (secs < 3600) return Math.floor(secs / 60) + ' min';
  if (secs < 86400) return Math.floor(secs / 3600) + ' h';
  return Math.floor(secs / 86400) + ' d';
}

function tile(label, value, cls) {
  return `<div class="tile ${cls || ''} ${value === 0 ? 'zero' : ''}">
    <b>${value}</b><span>${label}</span></div>`;
}

function render(d) {
  const t = d.totals;
  $('stamp').textContent = 'Actualizado ' + new Date(d.generated_at)
    .toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + ' · en línea = visto hace <' + d.online_window_min + ' min';

  $('tiles').innerHTML =
      tile('En línea ahora', t.online_now, 'live')
    + tile('Activos hoy', t.devices_today)
    + tile('Dispositivos totales', t.devices_total)
    + tile('Volvieron (2+ días)', t.returning)
    + tile('En plan Pro', t.pro);

  const max = Math.max(1, ...d.daily.map((r) => r.devices));
  $('chart').innerHTML = d.daily.length
    ? `<div class="bars">${d.daily.map((r) =>
        `<div style="height:${(r.devices / max) * 100}%" title="${r.day}: ${r.devices}"></div>`
      ).join('')}</div><div class="blabels">${d.daily.map((r) =>
        `<span>${r.day.slice(8)}</span>`).join('')}</div>`
    : '<p class="empty">Sin datos todavía.</p>';

  $('devices').innerHTML = d.devices.length
    ? `<table><thead><tr><th>Dispositivo</th><th>Plan</th><th>Versión</th><th>SO</th>
       <th>Días activos</th><th>Aperturas</th><th>Primera vez</th><th>Visto</th></tr></thead>
       <tbody>${d.devices.map((x) => `<tr>
        <td><span class="dot ${x.online ? 'on' : ''}"></span><code>${esc(x.short_id)}</code></td>
        <td><span class="pill ${x.plan === 'pro' ? 'pro' : ''}">${esc(x.plan)}</span></td>
        <td>${esc(x.app_version)}</td><td>${esc(x.platform)}</td>
        <td>${x.active_days}</td><td>${x.opens}</td>
        <td>${new Date(x.first_seen).toLocaleDateString('es-CL')}</td>
        <td>${ago(x.last_seen)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Ningún dispositivo ha hecho ping todavía.</p>';

  $('subs').innerHTML = d.subscriptions.length
    ? `<table><thead><tr><th>Email</th><th>Estado</th><th>Actualizado</th></tr></thead>
       <tbody>${d.subscriptions.map((s) => `<tr><td>${esc(s.email)}</td>
        <td><span class="pill ${['authorized','active'].includes(s.status) ? 'ok' : ''}">${esc(s.status)}</span></td>
        <td>${ago(s.updated_at)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Sin suscripciones registradas.</p>';
}

function rows(items, empty) {
  if (!items || !items.length) return `<p class="empty">${empty}</p>`;
  const max = Math.max(1, ...items.map((i) => i.count));
  return `<div class="rows">${items.map((i) => `<div class="row ${
      i.count ? '' : 'muted'}"><span>${esc(i.label)}</span>
    <span class="n">${i.count} · ${i.pct}%</span>
    <span class="bar"><i style="width:${(i.count / max) * 100}%"></i></span>
  </div>`).join('')}</div>`;
}

// Rangos del bloque de visitas. Los contadores se guardan por día, así que
// cambiar de rango es solo pedir más días: nunca se guarda nada por sesión.
const RANGES = [[7, 'Semana'], [30, 'Mes'], [90, '3 meses'], [365, 'Año']];
let landingDays = 30;

function renderRange() {
  $('range').innerHTML = RANGES.map(([days, label]) =>
    `<button type="button" data-days="${days}" aria-pressed="${
      days === landingDays}">${label}</button>`).join('');
}

function renderLanding(d) {
  const label = (RANGES.find((r) => r[0] === d.range_days) || [])[1];
  $('landing-title').textContent =
    `Visitas al sitio · ${label ? label.toLowerCase() : d.range_days + ' días'} · ${
      d.visits} ${d.visits === 1 ? 'sesión' : 'sesiones'}`;
  $('sources').innerHTML = rows(d.sources, 'Nadie ha llegado todavía.');
  $('screens').innerHTML = rows(d.devices, 'Sin datos de dispositivo.');
  $('os').innerHTML = rows(d.os, 'Sin datos de sistema operativo.');
  // Si la base GeoIP se cae después de haber contado, lo ya registrado se sigue
  // mostrando: el aviso es para cuando no hay nada que mostrar.
  $('comunas').innerHTML = d.comunas.length
    ? rows(d.comunas, '')
    : `<p class="empty">${d.geo_enabled
        ? 'Sin ubicaciones resueltas todavía.'
        : 'Comuna apagada: falta la base GeoIP en el servidor.'}</p>`;

  const s = d.dwell_summary;
  $('dwell').innerHTML = rows(d.dwell, 'Nadie ha completado una visita aún.')
    + (s.total
      ? `<p class="note" style="padding:0 18px 16px">Tramo mediano: ${
          esc(s.median_label)} · promedio aprox. ${
          Math.floor(s.avg_seconds / 60)}m ${s.avg_seconds % 60}s</p>`
      : '');

  $('landing-note').textContent = d.note;
}

async function loadLive() {
  try {
    const res = await fetch('/api/admin/live', { credentials: 'same-origin' });
    if (res.status === 401) { location.reload(); return; }
    render(await res.json());
  } catch (e) {
    $('stamp').innerHTML = '<span class="err">Sin conexión con la API.</span>';
  }
}

async function loadLanding() {
  try {
    const res = await fetch(`/api/admin/landing?days=${landingDays}`,
      { credentials: 'same-origin' });
    if (res.ok) renderLanding(await res.json());
  } catch (e) {
    // El bloque del landing es secundario: si falla, el resto del panel sigue.
    $('landing-note').textContent = 'No se pudo cargar la analítica del sitio.';
  }
}

$('range').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-days]');
  if (!button) return;
  landingDays = Number(button.dataset.days);
  renderRange();
  loadLanding();
});

function load() { loadLive(); loadLanding(); }
renderRange();
load();
setInterval(load, 20000);
__CRM_JS__
</script></body></html>""".replace("__CSS__", PANEL_CSS).replace("__CRM__", CRM_MARKUP).replace("__CRM_JS__", CRM_SCRIPT)


@APP.post("/panel/login")
def panel_login():
    if not PANEL_PASSWORD:
        return "Panel deshabilitado: falta PANEL_PASSWORD en el servidor.", 503
    if not hmac.compare_digest(request.form.get("password", ""), PANEL_PASSWORD):
        return panel_login_page("Contraseña incorrecta."), 401
    resp = APP.make_response(("", 302))
    resp.headers["Location"] = "/panel"
    https = request.is_secure or request.headers.get("X-Forwarded-Proto") == "https"
    resp.set_cookie(
        PANEL_COOKIE, panel_token(),
        max_age=60 * 60 * 24 * 30, httponly=True, secure=https, samesite="Lax",
    )
    return resp


@APP.get("/panel")
def panel():
    if not PANEL_PASSWORD:
        return "Panel deshabilitado: falta PANEL_PASSWORD en el servidor.", 503
    if not panel_authorized():
        return panel_login_page(), 401
    return PANEL_HTML


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


register_routes(APP)

from share import register_routes as register_share_routes

register_share_routes(APP)

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    APP.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
