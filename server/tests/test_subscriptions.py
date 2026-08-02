"""Tests del flujo de suscripciones con Mercado Pago.

Reemplazan una suite anterior escrita contra Lemon Squeezy, un proveedor que
nunca se llegó a usar: probaba credenciales opacas y firmas de webhook que no
existen en `app.py`, y fallaba entera al importarse.

Todo lo que sale a la red de MP se sustituye por dobles; lo que se verifica es
la lógica propia del servidor.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api_module

PROD_TOKEN = "APP_USR-token-de-produccion"


@pytest.fixture()
def mp(monkeypatch):
    """Token de producción y MP incomunicado, para no salir a la red."""
    monkeypatch.setattr(api_module, "MP_TOKEN", PROD_TOKEN)
    monkeypatch.setattr(api_module, "MP_PUBLIC_BACK_URL", "https://telarapp.cl/gracias")
    monkeypatch.setattr(api_module, "fetch_mp_me", lambda: {"email": "vendedor@telarapp.cl", "id": 42})
    monkeypatch.setattr(api_module, "fetch_mp_preapproval", lambda _id: {})
    monkeypatch.setattr(api_module, "find_mp_preapproval_by_email", lambda _email: None)
    return monkeypatch


def subscription_rows(email):
    with api_module.db() as conn:
        return conn.execute(
            "SELECT email, mp_preapproval_id, status FROM subscriptions WHERE email = ?",
            (email,),
        ).fetchall()


# --- salud ------------------------------------------------------------------

def test_health_reports_mp_configuration(api, mp):
    body = api.get("/api/health").json

    assert body["ok"] is True
    assert body["mp_configured"] is True
    assert body["mp_test_mode"] is False


def test_health_without_token_says_mp_is_not_configured(api, monkeypatch):
    monkeypatch.setattr(api_module, "MP_TOKEN", "")

    body = api.get("/api/health").json

    assert body["ok"] is True
    assert body["mp_configured"] is False


# --- checkout ---------------------------------------------------------------

def test_checkout_rejects_invalid_email(api, mp):
    response = api.post("/api/subscriptions/checkout", json={"email": "no-es-un-email"})

    assert response.status_code == 400
    assert response.json["error"] == "Email inválido"


def test_checkout_without_mp_token_returns_service_unavailable(api, monkeypatch):
    monkeypatch.setattr(api_module, "MP_TOKEN", "")

    response = api.post("/api/subscriptions/checkout", json={"email": "persona@example.com"})

    assert response.status_code == 503


def test_checkout_creates_preapproval_and_saves_it_as_pending(api, mp):
    mp.setattr(
        api_module,
        "create_user_preapproval",
        lambda sdk, email, back_url: ("https://mp.cl/checkout/abc", "preapproval-123"),
    )
    mp.setattr(api_module, "mp_sdk", lambda: object())

    response = api.post("/api/subscriptions/checkout", json={"email": "Persona@Example.com"})

    assert response.status_code == 200
    assert response.json["checkout_url"] == "https://mp.cl/checkout/abc"
    assert response.json["preapproval_id"] == "preapproval-123"
    assert response.json["amount_clp"] == api_module.PLAN_AMOUNT

    # El email se normaliza a minúsculas antes de guardarse.
    rows = subscription_rows("persona@example.com")
    assert len(rows) == 1
    assert rows[0]["status"] == "pending"
    assert rows[0]["mp_preapproval_id"] == "preapproval-123"


def test_checkout_reports_when_mp_gives_no_payment_url(api, mp):
    mp.setattr(api_module, "create_user_preapproval", lambda sdk, email, back_url: (None, None))
    mp.setattr(api_module, "resolve_mp_plan", lambda sdk, back_url: (None, "MP no responde"))
    mp.setattr(api_module, "mp_sdk", lambda: object())

    response = api.post("/api/subscriptions/checkout", json={"email": "persona@example.com"})

    assert response.status_code == 502
    assert "MP no responde" in response.json["error"]


# --- estado -----------------------------------------------------------------

def test_status_requires_an_email(api, mp):
    assert api.get("/api/subscriptions/status").status_code == 400


def test_status_is_inactive_for_an_unknown_email(api, mp):
    body = api.get("/api/subscriptions/status?email=nadie@example.com").json

    assert body["active"] is False
    assert body["status"] == "none"


def test_status_is_active_for_an_authorized_subscription(api, mp):
    api_module.upsert_subscription("persona@example.com", "preapproval-123", "authorized")
    # Sin cambios remotos: MP confirma el mismo estado.
    mp.setattr(api_module, "fetch_mp_preapproval", lambda _id: {"status": "authorized"})

    body = api.get("/api/subscriptions/status?email=persona@example.com").json

    assert body["active"] is True
    assert body["status"] == "authorized"


def test_status_picks_up_a_cancellation_made_in_mercado_pago(api, mp):
    api_module.upsert_subscription("persona@example.com", "preapproval-123", "authorized")
    mp.setattr(api_module, "fetch_mp_preapproval", lambda _id: {"status": "cancelled"})

    body = api.get("/api/subscriptions/status?email=persona@example.com").json

    assert body["active"] is False
    assert body["status"] == "cancelled"
    # El cambio remoto queda persistido localmente.
    assert subscription_rows("persona@example.com")[0]["status"] == "cancelled"


def test_status_rebuilds_a_lost_row_from_mercado_pago(api, mp):
    """Escenario del disco efímero de Render: la base se borró entera.

    MP es la fuente de verdad, así que el estado debe reconstruirse solo. Si
    esto se rompiera, un cliente que pagó vería su plan como inactivo.
    """
    assert subscription_rows("persona@example.com") == []
    mp.setattr(
        api_module,
        "find_mp_preapproval_by_email",
        lambda _email: {"id": "preapproval-123", "status": "authorized"},
    )

    body = api.get("/api/subscriptions/status?email=persona@example.com").json

    assert body["active"] is True
    assert subscription_rows("persona@example.com")[0]["mp_preapproval_id"] == "preapproval-123"


def test_status_stays_inactive_when_mercado_pago_is_unreachable(api, mp):
    """Ante un fallo de MP se responde 'none', no un estado revocado: el cliente
    distingue ambos casos y solo baja el plan ante una revocación explícita."""
    def explota(_email):
        raise RuntimeError("MP caído")

    mp.setattr(api_module, "find_mp_preapproval_by_email", explota)

    body = api.get("/api/subscriptions/status?email=persona@example.com").json

    assert body["active"] is False
    assert body["status"] == "none"


# --- webhook ----------------------------------------------------------------

def test_webhook_rejects_a_wrong_secret(api, mp):
    response = api.post(
        "/api/webhooks/mercadopago?secret=incorrecto",
        json={"type": "subscription_preapproval", "data": {"id": "preapproval-123"}},
    )

    assert response.status_code == 401


def test_webhook_updates_the_subscription_status(api, mp):
    api_module.upsert_subscription("persona@example.com", "preapproval-123", "pending")
    mp.setattr(
        api_module,
        "fetch_mp_preapproval",
        lambda _id: {"status": "authorized", "external_reference": "persona@example.com"},
    )

    response = api.post(
        "/api/webhooks/mercadopago?secret=secreto-de-prueba",
        json={"type": "subscription_preapproval", "data": {"id": "preapproval-123"}},
    )

    assert response.status_code == 200
    assert subscription_rows("persona@example.com")[0]["status"] == "authorized"


# --- soporte manual ---------------------------------------------------------

def test_link_subscription_requires_the_secret(api, mp):
    response = api.post(
        "/api/admin/link-subscription",
        json={"email": "persona@example.com", "preapproval_id": "preapproval-123"},
    )

    assert response.status_code == 401


def test_link_subscription_binds_email_to_preapproval(api, mp):
    mp.setattr(api_module, "fetch_mp_preapproval", lambda _id: {"status": "authorized"})

    response = api.post(
        "/api/admin/link-subscription?secret=secreto-de-prueba",
        json={"email": "persona@example.com", "preapproval_id": "preapproval-123"},
    )

    assert response.status_code == 200
    assert subscription_rows("persona@example.com")[0]["status"] == "authorized"


def test_link_subscription_404s_for_an_unknown_preapproval(api, mp):
    response = api.post(
        "/api/admin/link-subscription?secret=secreto-de-prueba",
        json={"email": "persona@example.com", "preapproval_id": "no-existe"},
    )

    assert response.status_code == 404


# --- bypass de desarrollo ---------------------------------------------------

def test_dev_activate_is_unavailable_by_default(api, mp):
    response = api.post("/api/subscriptions/dev-activate", json={"email": "persona@example.com"})

    assert response.status_code == 404


def test_dev_bypass_never_activates_with_a_production_token(api, mp, monkeypatch):
    """El bypass es de desarrollo: un token APP_USR- debe desactivarlo aunque
    la variable de entorno esté encendida."""
    monkeypatch.setenv("SUBSCRIPTION_DEV_BYPASS", "1")

    assert api_module.dev_bypass_enabled() is False
