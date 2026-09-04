#!/usr/bin/env python3
"""Carga la red de contactos (docs/crm-red-seed.json) en el CRM del panel.

Lee PANEL_PASSWORD de server/.env. Por defecto pega a la API de producción.
Uso:
  python3 scripts/seed-panel-red.py
  python3 scripts/seed-panel-red.py --base http://127.0.0.1:5001
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "docs" / "crm-red-seed.json"
ENV = ROOT / "server" / ".env"
DEFAULT_BASE = "https://telar-api-aim8.onrender.com"


def load_env_password() -> str:
    if not ENV.exists():
        raise SystemExit(f"Falta {ENV}. Copia server/.env.example y pon PANEL_PASSWORD.")
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "PANEL_PASSWORD":
            return value.strip().strip("'\"")
    raise SystemExit("PANEL_PASSWORD vacío en server/.env")


def request(base: str, secret: str, method: str, path: str, body: dict | None = None) -> dict:
    qs = urlencode({"secret": secret})
    url = f"{base.rstrip('/')}{path}?{qs}"
    data = None if body is None else json.dumps(body).encode()
    req = Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=40) as res:
            return json.loads(res.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode()[:400]
        raise SystemExit(f"{method} {path} → {exc.code} {detail}") from exc
    except URLError as exc:
        raise SystemExit(f"No pude hablar con {base}: {exc.reason}") from exc


def upsert(existing: list[dict], name: str) -> dict | None:
    needle = name.strip().casefold()
    for item in existing:
        if str(item.get("name") or "").strip().casefold() == needle:
            return item
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    args = parser.parse_args()
    if not SEED.exists():
        raise SystemExit(f"Falta {SEED}")
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    secret = load_env_password()
    state = request(args.base, secret, "GET", "/api/admin/crm")
    groups = list(state.get("groups") or [])
    people = list(state.get("people") or [])

    group_ids: dict[str, int] = {}
    for group in seed.get("groups") or []:
        found = upsert(groups, group["name"])
        payload = {
            "name": group["name"],
            "location": group.get("location") or "",
            "status": group.get("status") or "por_crear",
            "notes": group.get("notes") or "",
        }
        if found:
            state = request(args.base, secret, "PATCH", f"/api/admin/crm/groups/{found['id']}", payload)
            print(f"grupo  update  {group['name']}")
        else:
            state = request(args.base, secret, "POST", "/api/admin/crm/groups", payload)
            print(f"grupo  create  {group['name']}")
        groups = list(state.get("groups") or [])
        saved = upsert(groups, group["name"])
        if saved:
            group_ids[group["name"]] = int(saved["id"])

    for person in seed.get("people") or []:
        found = upsert(people, person["name"])
        payload = {
            "name": person["name"],
            "location": person.get("location") or "",
            "contact": person.get("contact") or "",
            "status": person.get("status") or "interesado",
            "notes": person.get("notes") or "",
            "lost_reason": person.get("lost_reason") or "",
            "group_id": group_ids.get(person.get("group") or ""),
        }
        if found:
            state = request(args.base, secret, "PATCH", f"/api/admin/crm/people/{found['id']}", payload)
            print(f"persona update  {person['name']}")
        else:
            state = request(args.base, secret, "POST", "/api/admin/crm/people", payload)
            print(f"persona create  {person['name']}")
        people = list(state.get("people") or [])

    graph = state.get("graph") or {}
    nodes = [n for n in graph.get("nodes") or [] if n.get("kind") == "person"]
    print(f"listo  {len(people)} personas, {len(groups)} grupos, {len(nodes)} nodos en Red")


if __name__ == "__main__":
    main()
