import hashlib
import hmac
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as subscription_api


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(subscription_api, "DB_PATH", tmp_path / "subscriptions.db")
    monkeypatch.setattr(subscription_api, "LS_API_KEY", "ls-test-api-key")
    monkeypatch.setattr(subscription_api, "LS_STORE_ID", "12345")
    monkeypatch.setattr(subscription_api, "LS_VARIANT_ID", "67890")
    monkeypatch.setattr(subscription_api, "LS_WEBHOOK_SECRET", "webhook-test-secret")
    monkeypatch.setattr(subscription_api, "LS_TEST_MODE", True)
    subscription_api.init_db()
    subscription_api.APP.config.update(TESTING=True)
    return subscription_api.APP.test_client()


def test_health_exposes_readiness(api, monkeypatch):
    monkeypatch.setattr(subscription_api, "validate_ls_config", lambda: (True, None))
    response = api.get("/api/health")
    assert response.status_code == 200
    body = response.json
    assert body["ok"] is True
    assert body["provider"] == "lemonsqueezy"
    assert body["billing_token_valid"] is True
    assert body["ready_for_billing"] is True


def test_checkout_issues_opaque_credential(api, monkeypatch):
    monkeypatch.setattr(subscription_api, "validate_ls_config", lambda: (True, None))
    monkeypatch.setattr(
        subscription_api,
        "create_ls_checkout",
        lambda email, token: f"https://checkout.lemonsqueezy.com/custom/{token[:8]}",
    )

    response = api.post(
        "/api/subscriptions/checkout",
        json={"email": "person@example.com"},
    )

    assert response.status_code == 200
    assert "lemonsqueezy.com" in response.json["checkout_url"]
    assert len(response.json["access_token"]) >= 32

    with subscription_api.db() as conn:
        row = conn.execute(
            "SELECT access_token_hash FROM subscriptions WHERE email = ?",
            ("person@example.com",),
        ).fetchone()
    assert row["access_token_hash"] != response.json["access_token"]


def test_checkout_fails_closed_without_webhook_secret(api, monkeypatch):
    monkeypatch.setattr(subscription_api, "LS_WEBHOOK_SECRET", "")
    monkeypatch.setattr(subscription_api, "validate_ls_config", lambda: (True, None))

    response = api.post(
        "/api/subscriptions/checkout",
        json={"email": "person@example.com"},
    )

    assert response.status_code == 503
    assert "Webhook" in response.json["error"]


def test_status_requires_matching_checkout_credential(api):
    token = subscription_api.issue_access_token("person@example.com")
    subscription_api.upsert_subscription("person@example.com", "sub-1", "active")

    denied = api.post(
        "/api/subscriptions/status",
        json={"email": "person@example.com", "access_token": "wrong"},
    )
    allowed = api.post(
        "/api/subscriptions/status",
        json={"email": "person@example.com", "access_token": token},
    )

    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json["active"] is True


def test_checkout_cannot_rotate_another_installations_active_credential(api, monkeypatch):
    monkeypatch.setattr(subscription_api, "validate_ls_config", lambda: (True, None))
    owner_token = subscription_api.issue_access_token("owner@example.com")
    subscription_api.upsert_subscription("owner@example.com", "sub-1", "active")
    monkeypatch.setattr(
        subscription_api,
        "create_ls_checkout",
        lambda _email, _token: "https://checkout.lemonsqueezy.com/custom/abc",
    )

    takeover = api.post(
        "/api/subscriptions/checkout",
        json={"email": "owner@example.com", "access_token": "attacker-token"},
    )
    owner = api.post(
        "/api/subscriptions/checkout",
        json={"email": "owner@example.com", "access_token": owner_token},
    )

    assert takeover.status_code == 409
    assert owner.status_code == 200


def test_webhook_requires_valid_lemon_squeezy_signature(api):
    payload = {
        "meta": {
            "event_name": "subscription_created",
            "custom_data": {"telar_email": "person@example.com"},
        },
        "data": {
            "type": "subscriptions",
            "id": "99",
            "attributes": {"status": "active", "user_email": "person@example.com"},
        },
    }
    raw = json.dumps(payload).encode("utf-8")
    signature = hmac.new(
        subscription_api.LS_WEBHOOK_SECRET.encode(),
        raw,
        hashlib.sha256,
    ).hexdigest()

    invalid = api.post(
        "/api/webhooks/lemonsqueezy",
        data=raw,
        headers={"Content-Type": "application/json", "X-Signature": "bad"},
    )
    valid = api.post(
        "/api/webhooks/lemonsqueezy",
        data=raw,
        headers={"Content-Type": "application/json", "X-Signature": signature},
    )

    assert invalid.status_code == 401
    assert valid.status_code == 200

    with subscription_api.db() as conn:
        row = conn.execute(
            "SELECT status, ls_subscription_id FROM subscriptions WHERE email = ?",
            ("person@example.com",),
        ).fetchone()
    assert row["status"] == "active"
    assert row["ls_subscription_id"] == "99"
