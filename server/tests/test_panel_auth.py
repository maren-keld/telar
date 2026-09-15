"""F-007: sesiones aleatorias del panel, sin secretos en la URL."""

import base64
import hashlib
import hmac
import struct
import time

import pytest

import app as api_module

PANEL_PASSWORD = "clave-de-panel"
TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def totp_at(secret: str, now: float) -> str:
    key = base64.b32decode(secret)
    counter = int(now // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


@pytest.fixture
def locked(api, monkeypatch):
    monkeypatch.setattr(api_module, "PANEL_PASSWORD", PANEL_PASSWORD)
    monkeypatch.setattr(api_module, "PANEL_TOTP_SECRET", "")
    return api


def login(api, password=PANEL_PASSWORD, totp=""):
    data = {"password": password}
    if totp != "":
        data["totp"] = totp
    return api.post("/panel/login", data=data)


def test_panel_rejects_url_secrets(locked):
    assert locked.get("/panel").status_code == 401
    assert locked.get(f"/panel?secret={PANEL_PASSWORD}").status_code == 401
    assert locked.get(f"/panel?token={PANEL_PASSWORD}").status_code == 401
    assert locked.get("/api/admin/live").status_code == 401
    assert locked.get(f"/api/admin/live?secret={PANEL_PASSWORD}").status_code == 401


def test_panel_login_sets_random_session_cookie(locked):
    first = login(locked)
    assert first.status_code == 302
    cookie = first.headers.get("Set-Cookie", "")
    assert "telar_panel=" in cookie
    assert "HttpOnly" in cookie
    assert locked.get("/panel").status_code == 200
    assert locked.get("/panel").headers.get("Cache-Control") == "no-store"
    live = locked.get("/api/admin/live")
    assert live.status_code == 200
    assert live.headers.get("Cache-Control") == "no-store"


def test_two_logins_issue_distinct_cookies(locked):
    a = login(locked)
    cookie_a = a.headers.get("Set-Cookie", "")
    other = locked.application.test_client()
    b = other.post("/panel/login", data={"password": PANEL_PASSWORD})
    cookie_b = b.headers.get("Set-Cookie", "")
    token_a = cookie_a.split("telar_panel=")[1].split(";")[0]
    token_b = cookie_b.split("telar_panel=")[1].split(";")[0]
    assert token_a and token_b and token_a != token_b


def test_logout_revokes_the_session(locked):
    assert login(locked).status_code == 302
    assert locked.get("/panel").status_code == 200
    out = locked.post("/panel/logout")
    assert out.status_code == 302
    assert locked.get("/panel").status_code == 401
    assert locked.get("/api/admin/live").status_code == 401


def test_wrong_password_is_rate_limited(locked, monkeypatch):
    monkeypatch.setattr(api_module, "PANEL_LOGIN_MAX_ATTEMPTS", 3)
    for _ in range(3):
        assert login(locked, password="no").status_code == 401
    limited = login(locked, password="no")
    assert limited.status_code == 429
    assert login(locked, password=PANEL_PASSWORD).status_code == 429


def test_totp_required_when_configured(api, monkeypatch):
    monkeypatch.setattr(api_module, "PANEL_PASSWORD", PANEL_PASSWORD)
    monkeypatch.setattr(api_module, "PANEL_TOTP_SECRET", TOTP_SECRET)
    assert login(api).status_code == 401
    assert login(api, totp="000000").status_code == 401
    code = totp_at(TOTP_SECRET, time.time())
    ok = login(api, totp=code)
    assert ok.status_code == 302
    assert api.get("/panel").status_code == 200


def test_verify_totp_accepts_the_current_window():
    now = 1_700_000_000
    code = totp_at(TOTP_SECRET, now)
    assert api_module.verify_totp(TOTP_SECRET, code, now=now)
    assert not api_module.verify_totp(TOTP_SECRET, "000000", now=now)
