"""Rasgos agregados del landing: origen, dispositivo, tiempo y comuna.

Lo que estos tests protegen es la promesa de privacidad, no solo el formato:
que nadie pueda inventar categorías, que la comuna la escriba el servidor y no
el cliente, y que la IP no termine en la base.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api_module

PANEL_PASSWORD = "clave-de-panel"


@pytest.fixture
def panel(api, monkeypatch):
    """Cliente con el panel encendido; la ruta acepta ?secret= para curl."""
    monkeypatch.setattr(api_module, "PANEL_PASSWORD", PANEL_PASSWORD)
    return api


def landing(api, **query):
    query.setdefault("secret", PANEL_PASSWORD)
    qs = "&".join(f"{k}={v}" for k, v in query.items())
    return api.get(f"/api/admin/landing?{qs}").json


def post_event(api, name, ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return api.post("/api/events", json={"name": name}, headers=headers)


class FakeGeoIP:
    """Sustituto de la base mmdb: mapea IP → registro, como maxminddb."""

    def __init__(self, records):
        self.records = records

    def get(self, ip):
        return self.records.get(ip)


def use_geoip(monkeypatch, records):
    monkeypatch.setattr(api_module, "geoip_reader", lambda: FakeGeoIP(records))


def test_traits_are_counted_and_summarised(panel):
    for _ in range(3):
        post_event(panel, "src:instagram")
    post_event(panel, "src:google")
    post_event(panel, "dev:movil")
    post_event(panel, "dwell:1_3min")

    body = landing(panel)

    sources = {s["key"]: s for s in body["sources"]}
    assert sources["instagram"]["count"] == 3
    assert sources["instagram"]["pct"] == 75.0
    assert sources["instagram"]["label"] == "Instagram"
    assert sources["google"]["count"] == 1
    assert {d["key"]: d["count"] for d in body["devices"]}["movil"] == 1


def test_operating_system_is_counted_separately(panel):
    """El SO es su propio contador: saber que hubo 3 Android y 2 móviles no dice
    qué usó nadie en particular, que es justamente la idea."""
    for _ in range(3):
        post_event(panel, "os:android")
    post_event(panel, "os:macos")

    body = landing(panel)

    counts = {o["key"]: o for o in body["os"]}
    assert counts["android"]["count"] == 3
    assert counts["android"]["pct"] == 75.0
    assert counts["macos"]["label"] == "macOS"


def test_unknown_trait_values_are_rejected(panel):
    """Cualquiera puede postear a /api/events: las categorías son lista cerrada."""
    for bad in ("src:mi_empresa", "dev:reloj", "os:symbian", "dwell:99", "dwell:0_10x"):
        assert post_event(panel, bad).status_code == 204

    body = landing(panel)
    assert body["sources"] == []
    assert body["os"] == []
    assert all(item["count"] == 0 for item in body["devices"])
    assert all(item["count"] == 0 for item in body["dwell"])


def test_dwell_keeps_bucket_order_and_estimates_typical_time(panel):
    for _ in range(8):
        post_event(panel, "dwell:0_10")
    for _ in range(2):
        post_event(panel, "dwell:3_10min")

    body = landing(panel)

    # Orden cronológico fijo, no por frecuencia: es un histograma.
    assert [b["key"] for b in body["dwell"]] == [k for k, _, _ in api_module.DWELL_BUCKETS]
    assert body["dwell_summary"]["total"] == 10
    assert body["dwell_summary"]["median_label"] == "Menos de 10 s"
    # 8 tramos de ~5 s y 2 de ~390 s.
    assert body["dwell_summary"]["avg_seconds"] == 82


def test_comuna_is_resolved_by_the_server_on_the_first_step(panel, monkeypatch):
    use_geoip(monkeypatch, {
        "190.1.1.1": {"country": {"iso_code": "CL"}, "city": {"names": {"es": "Ñuñoa"}}},
    })

    post_event(panel, "step:visit", ip="190.1.1.1")

    body = landing(panel)
    assert body["geo_enabled"] is True
    # El evento guardado es ASCII; la tilde se repone al mostrarlo.
    assert body["comunas"] == [
        {"key": "nunoa", "label": "Ñuñoa", "count": 1, "pct": 100.0},
    ]


def test_only_the_first_funnel_step_resolves_the_comuna(panel, monkeypatch):
    """Si cada evento resolviera geo, una sesión activa contaría diez veces."""
    use_geoip(monkeypatch, {
        "190.1.1.1": {"country": {"iso_code": "CL"}, "city": {"names": {"es": "Maipú"}}},
    })

    post_event(panel, "step:visit", ip="190.1.1.1")
    post_event(panel, "view:precio", ip="190.1.1.1")
    post_event(panel, "cta:whatsapp", ip="190.1.1.1")

    assert [c["count"] for c in landing(panel)["comunas"]] == [1]


def test_client_cannot_write_comunas(panel, monkeypatch):
    use_geoip(monkeypatch, {})

    assert post_event(panel, "geo:providencia").status_code == 204

    assert landing(panel)["comunas"] == []


def test_traffic_outside_chile_is_grouped(panel, monkeypatch):
    use_geoip(monkeypatch, {
        "8.8.8.8": {"country": {"iso_code": "US"}, "city": {"names": {"en": "Mountain View"}}},
    })

    post_event(panel, "step:visit", ip="8.8.8.8")

    comunas = landing(panel)["comunas"]
    assert [c["key"] for c in comunas] == ["otro_pais"]
    assert comunas[0]["label"] == "Fuera de Chile"


def test_unresolvable_ip_counts_as_unknown(panel, monkeypatch):
    """La visita se registra igual y el no-resuelto queda a la vista, en vez de
    desaparecer y hacer creer que el mapa está completo."""
    use_geoip(monkeypatch, {})  # IP privada o ausente de la base

    assert post_event(panel, "step:visit", ip="10.0.0.4").status_code == 204

    body = landing(panel)
    assert [c["key"] for c in body["comunas"]] == ["desconocida"]
    assert body["visits"] == 1


def test_long_tail_of_comunas_is_grouped(panel, monkeypatch):
    extra = 4
    records = {
        f"190.0.0.{i}": {"country": {"iso_code": "CL"},
                         "city": {"names": {"es": f"Comuna{i}"}}}
        for i in range(api_module.TOP_COMUNAS + extra)
    }
    use_geoip(monkeypatch, records)
    for ip in records:
        post_event(panel, "step:visit", ip=ip)

    comunas = landing(panel)["comunas"]

    assert len(comunas) == api_module.TOP_COMUNAS + 1
    assert comunas[-1]["key"] == "otras"
    assert comunas[-1]["count"] == extra


def test_landing_without_geoip_database_still_serves_the_rest(panel, monkeypatch):
    monkeypatch.setattr(api_module, "geoip_reader", lambda: None)

    post_event(panel, "step:visit", ip="190.1.1.1")
    post_event(panel, "src:reddit")

    body = landing(panel)
    assert body["geo_enabled"] is False
    assert body["comunas"] == []
    assert body["sources"][0]["key"] == "reddit"


def test_landing_requires_the_panel_password(panel):
    assert panel.get("/api/admin/landing").status_code == 401
    assert panel.get("/api/admin/landing?secret=incorrecta").status_code == 401


def test_landing_is_off_when_the_panel_has_no_password(api, monkeypatch):
    """Falla cerrado, igual que /panel."""
    monkeypatch.setattr(api_module, "PANEL_PASSWORD", "")

    assert api.get("/api/admin/landing?secret=").status_code == 401


def test_days_parameter_is_clamped(panel):
    assert landing(panel, days=0)["range_days"] == 1
    assert landing(panel, days=9999)["range_days"] == api_module.MAX_FUNNEL_DAYS
    assert landing(panel, days="abc")["range_days"] == api_module.DEFAULT_LANDING_DAYS
