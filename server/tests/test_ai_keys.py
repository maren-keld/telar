"""Provision de clave Mistral: sin filtrar la maestra, con topes por correo e IP."""

from ai_keys import MAX_ISSUES_PER_EMAIL_DAY


def provision(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555"):
    return api.post(
        "/api/ai/mistral-provision",
        json={"email": email, "device_id": device_id},
    )


def seed_active_sub(api, email="persona@example.com"):
    import app as appmod
    appmod.upsert_subscription(email, "test-preapproval", "authorized")


def enable_shared(monkeypatch):
    monkeypatch.setenv("AI_ALLOW_SHARED_KEYS", "1")


def test_health_reports_provision_off_by_default(api, monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    body = api.get("/api/health").json
    assert body["mistral_provision"] is False
    assert body["xai_provision"] is False


def test_unconfigured_server_returns_503(api, monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    response = provision(api)
    assert response.status_code == 503
    assert "habilitada" in response.json["error"]


def test_shared_key_without_flag_returns_503(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    response = provision(api)
    assert response.status_code == 503


def test_rejects_invalid_email(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    response = provision(api, email="no-es-correo")
    assert response.status_code == 400


def test_rejects_short_device_id(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    response = provision(api, device_id="abc")
    assert response.status_code == 400


def test_requires_active_subscription(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    response = provision(api)
    assert response.status_code == 403
    assert "suscripción" in response.json["error"].lower() or "Pro" in response.json["error"]


def test_shared_key_is_issued_after_valid_request(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    response = provision(api)
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["api_key"] == "sk-test-mistral"
    assert response.json["source"] == "shared"
    assert response.json["provider"] == "mistral"


def test_device_mismatch_is_rejected(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    assert provision(api, device_id="11111111-2222-3333-4444-555555555555").status_code == 200
    other = provision(api, device_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert other.status_code == 403
    assert "instalación" in other.json["error"].lower() or "coincide" in other.json["error"].lower()


def test_email_rate_limit(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    for _ in range(MAX_ISSUES_PER_EMAIL_DAY):
        assert provision(api).status_code == 200
    limited = provision(api)
    assert limited.status_code == 429


def test_admin_key_preferred_over_shared(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-shared")
    monkeypatch.setenv("MISTRAL_ADMIN_API_KEY", "sk-admin")
    monkeypatch.setenv("MISTRAL_WORKSPACE_UUID", "ws-1")
    monkeypatch.setenv("MISTRAL_ADMIN_USER_ID", "user-1")
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    seed_active_sub(api)

    def fake_admin(name):
        assert name.startswith("telar-")
        return "sk-unique-for-user", "key-99"

    monkeypatch.setattr("ai_keys.create_admin_workspace_key", fake_admin)
    response = provision(api)
    assert response.status_code == 200
    assert response.json["api_key"] == "sk-unique-for-user"
    assert response.json["source"] == "admin"


def xai_provision(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555"):
    return api.post(
        "/api/ai/xai-provision",
        json={"email": email, "device_id": device_id},
    )


def test_xai_unconfigured_returns_503(api, monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    response = xai_provision(api)
    assert response.status_code == 503
    assert "Grok" in response.json["error"]


def test_xai_shared_without_flag_returns_503(api, monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "xai-test-key")
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    response = xai_provision(api)
    assert response.status_code == 503


def test_xai_shared_key_is_issued(api, monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "xai-test-key")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    response = xai_provision(api)
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["api_key"] == "xai-test-key"
    assert response.json["provider"] == "xai"
    assert response.json["source"] == "shared"
