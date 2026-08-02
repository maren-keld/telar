"""Tests de la analítica agregada del landing (/api/events y /api/admin/funnel)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api_module


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(api_module, "DB_PATH", tmp_path / "events.db")
    monkeypatch.setattr(api_module, "WEBHOOK_SECRET", "secreto-de-prueba")
    api_module.init_db()
    api_module.APP.config.update(TESTING=True)
    return api_module.APP.test_client()


def post_event(api, name):
    return api.post("/api/events", json={"name": name})


def funnel(api, **query):
    query.setdefault("secret", "secreto-de-prueba")
    qs = "&".join(f"{k}={v}" for k, v in query.items())
    return api.get(f"/api/admin/funnel?{qs}")


def test_event_increments_daily_counter(api):
    for _ in range(3):
        assert post_event(api, "view:precio").status_code == 204

    body = funnel(api).json
    assert body["events"]["view:precio"] == 3


def test_accepts_text_plain_body_from_sendbeacon(api):
    """El cliente envía text/plain a propósito para evitar el preflight CORS.
    Si el servidor dejara de parsearlo, la analítica se cae en silencio."""
    response = api.post(
        "/api/events",
        data='{"name": "cta:whatsapp"}',
        content_type="text/plain;charset=UTF-8",
    )

    assert response.status_code == 204
    assert funnel(api).json["events"]["cta:whatsapp"] == 1


def test_malformed_body_does_not_error(api):
    assert api.post("/api/events", data="no soy json", content_type="text/plain").status_code == 204
    assert api.post("/api/events", json={}).status_code == 204
    assert funnel(api).json["events"] == {}


def test_invalid_event_names_are_ignored(api):
    for bad in ("", "precio", "drop:table", "view:" + "x" * 40, "VIEW:PRECIO!"):
        assert post_event(api, bad).status_code == 204

    assert funnel(api).json["events"] == {}


def test_event_name_cap_blocks_new_names_but_not_known_ones(api, monkeypatch):
    monkeypatch.setattr(api_module, "MAX_DISTINCT_EVENTS", 2)

    assert api_module.record_event("view:a") is True
    assert api_module.record_event("view:b") is True
    # Techo alcanzado: un nombre nuevo se rechaza…
    assert api_module.record_event("view:c") is False
    # …pero los ya conocidos siguen sumando.
    assert api_module.record_event("view:a") is True

    events = funnel(api).json["events"]
    assert events == {"view:a": 2, "view:b": 1}


def test_funnel_requires_secret(api):
    assert api.get("/api/admin/funnel").status_code == 401
    assert api.get("/api/admin/funnel?secret=incorrecto").status_code == 401


def test_funnel_is_ordered_and_reports_drop_off(api):
    for _ in range(10):
        post_event(api, "step:visit")
    for _ in range(6):
        post_event(api, "step:explore")
    for _ in range(4):
        post_event(api, "step:pricing")
    post_event(api, "step:intent")

    steps = funnel(api).json["funnel"]

    assert [s["key"] for s in steps] == [
        "step:visit", "step:explore", "step:pricing", "step:intent",
    ]
    assert [s["count"] for s in steps] == [10, 6, 4, 1]
    assert steps[0]["drop_from_previous"] is None
    assert steps[1]["pct_of_top"] == 60.0
    assert steps[2]["drop_from_previous"] == pytest.approx(33.3)
    assert steps[3]["drop_from_previous"] == 75.0


def test_funnel_without_traffic_returns_zeroed_steps(api):
    body = funnel(api).json

    assert [s["count"] for s in body["funnel"]] == [0, 0, 0, 0]
    assert all(s["pct_of_top"] == 0.0 for s in body["funnel"])
    assert body["events"] == {}


def test_series_covers_every_day_in_range_including_empty_ones(api):
    post_event(api, "step:visit")

    body = funnel(api, days=7).json

    assert body["range_days"] == 7
    assert len(body["series"]) == 7
    # El día de hoy es el último de la serie y lleva la visita registrada.
    assert body["series"][-1]["visits"] == 1
    assert sum(day["visits"] for day in body["series"]) == 1


def test_days_parameter_is_clamped(api):
    assert funnel(api, days=0).json["range_days"] == 1
    assert funnel(api, days=9999).json["range_days"] == api_module.MAX_FUNNEL_DAYS
    assert funnel(api, days="abc").json["range_days"] == api_module.DEFAULT_FUNNEL_DAYS


def test_funnel_still_reports_app_usage_counter(api):
    api.post("/api/usage/ping", json={"app_version": "0.1.0"})
    api.post("/api/usage/ping", json={"app_version": "0.1.0"})

    assert funnel(api).json["usage_opens_total"] == 2
