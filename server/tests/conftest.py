"""Fixtures compartidas.

Cada test corre dos veces: contra SQLite y contra Postgres. Así la capa de
compatibilidad queda verificada en los dos motores en vez de asumir que el SQL
es portable. Postgres se omite si no hay TEST_DATABASE_URL apuntando a una
base desechable.

    TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/telar_test pytest
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as api_module

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
TABLES = (
    "crm_reaches",
    "crm_people",
    "crm_groups",
    "crm_days",
    "subscriptions",
    "usage_opens",
    "landing_events",
    "shared_forms",
    "ai_mistral_grants",
    "ai_mistral_ip_hits",
)


@pytest.fixture(params=["sqlite", "postgres"])
def api(request, tmp_path, monkeypatch):
    if request.param == "postgres":
        if not TEST_DATABASE_URL:
            pytest.skip("sin TEST_DATABASE_URL: se omite la verificación en Postgres")
        monkeypatch.setattr(api_module, "DATABASE_URL", TEST_DATABASE_URL)
        monkeypatch.setattr(api_module, "USE_POSTGRES", True)
        # Base compartida entre tests: hay que dejarla limpia en cada uno.
        with api_module.db() as conn:
            for table in TABLES:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
    else:
        monkeypatch.setattr(api_module, "USE_POSTGRES", False)
        monkeypatch.setattr(api_module, "DB_PATH", tmp_path / "telar.db")

    monkeypatch.setattr(api_module, "WEBHOOK_SECRET", "secreto-de-prueba")
    api_module.init_db()
    api_module.APP.config.update(TESTING=True)
    return api_module.APP.test_client()
