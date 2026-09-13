"""Provision de clave Mistral: sin filtrar la maestra, con topes por correo e IP.

SEC-001: exige prueba de control del correo (email_code) + bind CAS de device.
"""

from ai_keys import MAX_ISSUES_PER_EMAIL_DAY


def enable_debug_challenge(monkeypatch):
    monkeypatch.setenv("AI_EMAIL_CHALLENGE_DEBUG", "1")


def request_code(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555", product="mistral"):
    return api.post(
        "/api/ai/email-challenge",
        json={"email": email, "device_id": device_id, "product": product},
    )


def provision(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555", email_code=None):
    body = {"email": email, "device_id": device_id}
    if email_code is not None:
        body["email_code"] = email_code
    return api.post("/api/ai/mistral-provision", json=body)


def seed_active_sub(api, email="persona@example.com"):
    import app as appmod
    appmod.upsert_subscription(email, "test-preapproval", "authorized")


def enable_shared(monkeypatch):
    monkeypatch.setenv("AI_ALLOW_SHARED_KEYS", "1")


def challenge_and_code(api, monkeypatch, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555", product="mistral"):
    enable_debug_challenge(monkeypatch)
    response = request_code(api, email=email, device_id=device_id, product=product)
    assert response.status_code == 200, response.json
    code = response.json["debug_code"]
    assert code
    return code


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
    response = provision(api, email_code="000000")
    assert response.status_code == 503
    assert "habilitada" in response.json["error"]


def test_shared_key_without_flag_returns_503(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    monkeypatch.delenv("MISTRAL_ADMIN_API_KEY", raising=False)
    response = provision(api, email_code="000000")
    assert response.status_code == 503


def test_rejects_invalid_email(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    response = provision(api, email="no-es-correo", email_code="000000")
    assert response.status_code == 400


def test_rejects_short_device_id(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    response = provision(api, device_id="abc", email_code="000000")
    assert response.status_code == 400


def test_requires_active_subscription(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    enable_debug_challenge(monkeypatch)
    # Challenge itself also requires Pro.
    challenged = request_code(api)
    assert challenged.status_code == 403
    assert "suscripción" in challenged.json["error"].lower() or "Pro" in challenged.json["error"]


def test_provision_without_email_code_is_rejected(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    response = provision(api)
    assert response.status_code == 401
    assert "código" in response.json["error"].lower() or "correo" in response.json["error"].lower()


def test_wrong_email_code_is_rejected(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    challenge_and_code(api, monkeypatch)
    response = provision(api, email_code="999999")
    assert response.status_code == 401


def test_shared_key_is_issued_after_valid_request(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    code = challenge_and_code(api, monkeypatch)
    response = provision(api, email_code=code)
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["api_key"] == "sk-test-mistral"
    assert response.json["source"] == "shared"
    assert response.json["provider"] == "mistral"


def test_email_code_is_single_use(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    code = challenge_and_code(api, monkeypatch)
    assert provision(api, email_code=code).status_code == 200
    replay = provision(api, email_code=code)
    assert replay.status_code == 401


def test_device_mismatch_is_rejected(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    device_a = "11111111-2222-3333-4444-555555555555"
    device_b = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    code_a = challenge_and_code(api, monkeypatch, device_id=device_a)
    assert provision(api, device_id=device_a, email_code=code_a).status_code == 200
    code_b = challenge_and_code(api, monkeypatch, device_id=device_b)
    other = provision(api, device_id=device_b, email_code=code_b)
    assert other.status_code == 403
    assert "instalación" in other.json["error"].lower() or "coincide" in other.json["error"].lower()


def test_legacy_unbound_grant_binds_atomically(api, monkeypatch):
    """device_hash vacío no se puede claimar sin OTP; con OTP gana un solo device (CAS)."""
    import app as appmod
    from ai_keys import _email_hash, _device_hash

    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    email = "persona@example.com"
    email_hash = _email_hash(appmod.normalize_payer_email(email))
    with appmod.db() as conn:
        conn.execute(
            """INSERT INTO ai_mistral_grants
               (email_hash, key_id, source, created_at, last_issued_at, issue_count, device_hash)
               VALUES (?, '', 'shared', ?, ?, 0, '')""",
            (email_hash, appmod.now_iso(), appmod.now_iso()),
        )

    device = "11111111-2222-3333-4444-555555555555"
    code = challenge_and_code(api, monkeypatch, device_id=device)
    assert provision(api, device_id=device, email_code=code).status_code == 200

    with appmod.db() as conn:
        row = conn.execute(
            "SELECT device_hash FROM ai_mistral_grants WHERE email_hash = ?",
            (email_hash,),
        ).fetchone()
        assert row["device_hash"] == _device_hash(device)


def test_email_rate_limit(api, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "sk-test-mistral")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    for _ in range(MAX_ISSUES_PER_EMAIL_DAY):
        code = challenge_and_code(api, monkeypatch)
        assert provision(api, email_code=code).status_code == 200
    code = challenge_and_code(api, monkeypatch)
    limited = provision(api, email_code=code)
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
    code = challenge_and_code(api, monkeypatch)
    response = provision(api, email_code=code)
    assert response.status_code == 200
    assert response.json["api_key"] == "sk-unique-for-user"
    assert response.json["source"] == "admin"


def xai_provision(api, email="persona@example.com", device_id="11111111-2222-3333-4444-555555555555", email_code=None):
    body = {"email": email, "device_id": device_id}
    if email_code is not None:
        body["email_code"] = email_code
    return api.post("/api/ai/xai-provision", json=body)


def test_xai_unconfigured_returns_503(api, monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    response = xai_provision(api, email_code="000000")
    assert response.status_code == 503
    assert "Grok" in response.json["error"]


def test_xai_shared_without_flag_returns_503(api, monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "xai-test-key")
    monkeypatch.delenv("AI_ALLOW_SHARED_KEYS", raising=False)
    response = xai_provision(api, email_code="000000")
    assert response.status_code == 503


def test_xai_shared_key_is_issued(api, monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "xai-test-key")
    enable_shared(monkeypatch)
    seed_active_sub(api)
    code = challenge_and_code(api, monkeypatch, product="xai")
    response = xai_provision(api, email_code=code)
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["api_key"] == "xai-test-key"
    assert response.json["provider"] == "xai"
    assert response.json["source"] == "shared"
