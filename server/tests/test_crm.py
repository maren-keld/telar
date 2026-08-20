"""CRM del panel: objetivo diario chico, grupos, personas y alcances."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api_module
import crm

PANEL_PASSWORD = "clave-de-panel"
TODAY = "2026-08-20"


@pytest.fixture
def panel(api, monkeypatch):
    monkeypatch.setattr(api_module, "PANEL_PASSWORD", PANEL_PASSWORD)
    monkeypatch.setattr(crm, "today_chile", lambda now=None: TODAY)
    return api


def crm_get(api, **query):
    query.setdefault("secret", PANEL_PASSWORD)
    qs = "&".join(f"{k}={v}" for k, v in query.items())
    return api.get(f"/api/admin/crm?{qs}")


def crm_patch(api, payload, **query):
    query.setdefault("secret", PANEL_PASSWORD)
    qs = "&".join(f"{k}={v}" for k, v in query.items())
    return api.patch(f"/api/admin/crm/today?{qs}", json=payload)


def test_crm_requires_the_panel_password(panel):
    assert panel.get("/api/admin/crm").status_code == 401
    assert panel.get("/api/admin/crm?secret=incorrecta").status_code == 401


def test_new_crm_does_not_mark_the_past_as_missed(panel):
    body = crm_get(panel).json
    assert body["today"] == TODAY
    assert body["goal"]["complete"] is False
    assert body["goal"]["missed"] == []
    assert body["goal"]["messages"] == 0
    past = [d for d in body["history"] if not d["is_today"]]
    assert past and all(d["blank"] for d in past)


def test_today_is_complete_only_with_the_three_gestures(panel):
    assert crm_patch(panel, {"messages": 3, "posted": True}).json["goal"]["complete"] is False
    done = crm_patch(panel, {"demo_na": True}).json["goal"]
    assert done["complete"] is True
    assert done["messages"] == 3
    assert done["posted"] == 1
    assert done["demo_na"] == 1
    assert done["missed"] == []


def test_demo_and_nobody_replied_are_mutually_exclusive(panel):
    crm_patch(panel, {"messages": 3, "posted": True, "demo_na": True})
    body = crm_patch(panel, {"demo": True}).json["goal"]
    assert body["demo"] == 1
    assert body["demo_na"] == 0
    assert body["complete"] is True


def test_missed_days_appear_after_the_crm_starts(panel):
    crm_patch(panel, {"day": "2026-08-18", "messages": 1})
    body = crm_get(panel).json
    assert "2026-08-18" in body["goal"]["missed"]
    assert "2026-08-19" in body["goal"]["missed"]
    assert TODAY not in body["goal"]["missed"]
    by_day = {d["day"]: d for d in body["history"]}
    assert by_day["2026-08-17"]["blank"] is True
    assert by_day["2026-08-18"]["blank"] is False
    assert by_day["2026-08-18"]["complete"] is False


def test_completing_a_past_day_clears_it_from_missed(panel):
    for day in ("2026-08-18", "2026-08-19", TODAY):
        crm_patch(panel, {"day": day, "messages": 3, "posted": True, "demo": True})
    body = crm_get(panel).json
    assert body["goal"]["missed"] == []
    assert body["goal"]["complete"] is True
    assert body["goal"]["streak"] == 3


def test_groups_people_and_reaches(panel):
    created = panel.post(
        f"/api/admin/crm/groups?secret={PANEL_PASSWORD}",
        json={
            "name": "Psicólogos Chile",
            "location": "Nacional",
            "status": "por_crear",
            "notes": "Grupo a armar",
        },
    )
    assert created.status_code == 200
    group = created.json["groups"][0]
    assert group["name"] == "Psicólogos Chile"
    assert group["status"] == "por_crear"

    person = panel.post(
        f"/api/admin/crm/people?secret={PANEL_PASSWORD}",
        json={
            "name": "Ana Pérez",
            "location": "Ñuñoa",
            "contact": "+56 9 1111 1111",
            "status": "interesado",
            "notes": "Vio el landing",
        },
    ).json["people"][0]
    assert person["location"] == "Ñuñoa"

    reach = panel.post(
        f"/api/admin/crm/reaches?secret={PANEL_PASSWORD}",
        json={"kind": "grupo", "group_id": group["id"], "note": "Me presenté"},
    )
    assert reach.status_code == 200
    row = reach.json["reaches"][0]
    assert row["where_text"] == "Psicólogos Chile"
    assert row["note"] == "Me presenté"
    assert row["day"] == TODAY

    updated = panel.patch(
        f"/api/admin/crm/groups/{group['id']}?secret={PANEL_PASSWORD}",
        json={"name": "Psicólogos Chile", "status": "creado", "location": "Nacional", "notes": ""},
    ).json["groups"][0]
    assert updated["status"] == "creado"


def test_reach_without_where_is_rejected(panel):
    res = panel.post(
        f"/api/admin/crm/reaches?secret={PANEL_PASSWORD}",
        json={"kind": "otro", "where_text": "  "},
    )
    assert res.status_code == 400


def test_group_name_is_required(panel):
    res = panel.post(
        f"/api/admin/crm/groups?secret={PANEL_PASSWORD}",
        json={"name": "  "},
    )
    assert res.status_code == 400


def test_day_outside_the_window_is_rejected(panel):
    assert crm_patch(panel, {"day": "2020-01-01", "messages": 3}).status_code == 400
    assert crm_patch(panel, {"day": "no-es-fecha", "messages": 1}).status_code == 400
