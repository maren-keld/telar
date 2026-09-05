"""Provision de clave Mistral: sin filtrar la maestra, con topes por correo e IP."""

from ai_keys import MAX_ISSUES_PER_EMAIL_DAY


def provision(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555"):
    return api.post(
        "/api/ai/mistral-provision",
        json={"email": email, "device_id": device_id},
    )


def test_health_reports_provision_off_by_default(api, monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    body = api.get("/api/health").json
    assert body["mistral_provision"] is False


def test_unconfigured_server_returns_503(api, monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    response = provision(api)
    assert response.status_code == 503
    assert "habilitada" in response.json["error"]


def test_rejects_invalid_email(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    response = provision(api, email="no-es-correo")
    assert response.status_code == 400


def test_rejects_short_device_id(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    response = provision(api, device_id="abc")
    assert response.status_code == 400


def test_shared_key_is_issued_after_valid_request(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    response = provision(api)
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["api_key"] == "sk-test-mistral"
    assert response.json["source"] == "shared"
    assert response.json["provider"] == "mistral"


def test_email_rate_limit(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    for _ in range(MAX_ISSUES_PER_EMAIL_DAY):
        assert provision(api).status_code == 200
    limited = provision(api)
    assert limited.status_code == 429


def test_admin_key_preferred_over_shared(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-shared")
    monkeypatch.setenv("MISTRAL_ADMIN_API_KEY", "sk-admin")
    monkeypatch.setenv("MISTRAL_WORKSPACE_UUID", "ws-1")
    monkeypatch.setenv("MISTRAL_ADMIN_USER_ID", "user-1")

    def fake_admin(name):
        assert name.startswith("telar-")
        return "sk-unique-for-user", "key-99"

    monkeypatch.setattr("ai_keys.create_admin_workspace_key", fake_admin)
    response = provision(api)
    assert response.status_code == 200
    assert response.json["api_key"] == "sk-unique-for-user"
    assert response.json["source"] == "admin"
