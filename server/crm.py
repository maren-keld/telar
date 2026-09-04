"""CRM liviano del panel: objetivo diario, grupos, personas y alcances.

El objetivo no es “conseguir usuarios”. Es un hábito chico y controlable:
tres mensajes personales, una cosa útil publicada, y una demo corta si
alguien responde. Los días sin cumplir quedan a la vista a propósito.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from flask import jsonify, request

CHILE_TZ = ZoneInfo("America/Santiago")
HISTORY_DAYS = 42
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

GROUP_STATUSES = {
    "por_crear": "Por crear",
    "creado": "Creado",
    "activo": "Activo",
    "archivado": "Archivado",
}
PEOPLE_STATUSES = {
    "interesado": "Interesado",
    "conversando": "Conversando",
    "demo": "Vio demo",
    "usando": "Usa Telar",
    "curso": "Hizo el curso",
    "no_instalo": "Curso, no instaló",
    "abandono": "Instaló y no volvió",
    "perdido": "Desapareció",
    "no_interesado": "No se interesó",
    "pausa": "En pausa",
}
LOST_STATUSES = frozenset({
    "no_instalo", "abandono", "perdido", "no_interesado", "pausa",
})
LOST_REASONS = {
    "nf": "El neurofeedback no mostraba lo que esperaban",
    "modulo": "Pedían un módulo que aún no estaba",
    "nunca_uso": "Instaló, usó poco y no volvió",
    "desaparecio": "Desapareció",
    "otro": "Otro",
}
REACH_KINDS = {
    "grupo": "Grupo",
    "persona": "Persona",
    "otro": "Otro",
}


def _api():
    import app as api

    return api


def today_chile(now: datetime | None = None) -> str:
    current = now or datetime.now(CHILE_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=CHILE_TZ)
    return current.astimezone(CHILE_TZ).strftime("%Y-%m-%d")


def parse_day(raw, today: str) -> str | None:
    value = (raw or "").strip() or today
    if not DAY_RE.match(value):
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d").date()
        end = datetime.strptime(today, "%Y-%m-%d").date()
    except ValueError:
        return None
    start = end - timedelta(days=HISTORY_DAYS - 1)
    if day > end or day < start:
        return None
    return value


def day_complete(row: dict | None) -> bool:
    if not row:
        return False
    return (
        int(row.get("messages") or 0) >= 3
        and int(row.get("posted") or 0) == 1
        and (int(row.get("demo") or 0) == 1 or int(row.get("demo_na") or 0) == 1)
    )


def empty_day(day: str) -> dict:
    return {
        "day": day,
        "messages": 0,
        "posted": 0,
        "demo": 0,
        "demo_na": 0,
        "complete": False,
        "blank": True,
        "is_today": False,
    }


def _started_on(conn) -> str | None:
    """Primer día con algo anotado. Antes de eso el calendario no cuenta falta."""
    dates = []
    for sql in (
        "SELECT MIN(day) AS d FROM crm_days",
        "SELECT MIN(day) AS d FROM crm_reaches",
        "SELECT MIN(created_at) AS d FROM crm_groups",
        "SELECT MIN(created_at) AS d FROM crm_people",
    ):
        row = conn.execute(sql).fetchone()
        value = row["d"] if row else None
        if value:
            dates.append(str(value)[:10])
    return min(dates) if dates else None


def ensure_schema(conn, autoincrement: str) -> None:
    conn.execute(
        f"""CREATE TABLE IF NOT EXISTS crm_groups (
            id {autoincrement},
            name TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'por_crear',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        f"""CREATE TABLE IF NOT EXISTS crm_people (
            id {autoincrement},
            name TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'interesado',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS crm_days (
            day TEXT PRIMARY KEY,
            messages INTEGER NOT NULL DEFAULT 0,
            posted INTEGER NOT NULL DEFAULT 0,
            demo INTEGER NOT NULL DEFAULT 0,
            demo_na INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        f"""CREATE TABLE IF NOT EXISTS crm_reaches (
            id {autoincrement},
            day TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'grupo',
            group_id INTEGER,
            person_id INTEGER,
            where_text TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_reaches_day ON crm_reaches(day)")
    _ensure_column(conn, "crm_people", "group_id", "INTEGER")
    _ensure_column(conn, "crm_people", "lost_reason", "TEXT NOT NULL DEFAULT ''")
    seed_missing_network(conn)


def _should_seed_network() -> bool:
    import os

    if os.environ.get("TELAR_SEED_CRM", "").strip() == "0":
        return False
    return bool(os.environ.get("RENDER") or os.environ.get("TELAR_SEED_CRM"))


# Contactos de GROKBOT / docs/crm-contactos.md. Solo nombres y estado;
# sin mail ni teléfono. Se insertan si faltan; no pisan fichas ya editadas.
NETWORK_SEED_GROUPS = (
    {
        "name": "LinkedIn orgánico",
        "location": "Chile / Latam",
        "status": "activo",
        "notes": "Post 1-2 sep 2026. Katerin, Pamela, Raúl, Edgar.",
    },
    {
        "name": "WhatsApp frío (Encuadrado)",
        "location": "Chile",
        "status": "archivado",
        "notes": "~38 salidas en frío. No ampliar el spray. Firmar como Felipe.",
    },
    {
        "name": "Curso NF 2025",
        "location": "Viña / Copiapó",
        "status": "creado",
        "notes": "Alumnos del curso presencial. Luis: posible colaboración.",
    },
    {
        "name": "Asesoría MIC",
        "location": "Chile",
        "status": "activo",
        "notes": "Marcela + Aye. Ética de IA en consulta. No es staff.",
    },
)

NETWORK_SEED_PEOPLE = (
    {
        "name": "Carolina Danyau",
        "location": "Providencia",
        "contact": "Videollamada / WhatsApp",
        "status": "conversando",
        "group": "LinkedIn orgánico",
        "notes": "Pack privado autismo + CodePen. Call 4 sep. Hablar como Felipe. Siguiente: share de módulos.",
        "reach": "Videollamada 4 sep: pack autismo e interactivas.",
    },
    {
        "name": "Caro Díaz",
        "location": "Chile",
        "contact": "Videollamada",
        "status": "no_interesado",
        "lost_reason": "otro",
        "group": "WhatsApp frío (Encuadrado)",
        "notes": "Transpersonal. No lo pagaría: notas en agenda. No perseguir. No confundir con Danyau.",
        "reach": "Call: dijo que no lo pagaría.",
    },
    {
        "name": "Sara Bardález Pérez",
        "location": "Madrid",
        "contact": "LinkedIn · MentalSearch",
        "status": "perdido",
        "lost_reason": "desaparecio",
        "group": "LinkedIn orgánico",
        "notes": "Founder MentalSearch. DM 1 sep, sin respuesta. Esperar. No pitch de integración clínica.",
        "reach": "DM LinkedIn 1 sep.",
    },
    {
        "name": "Katerin Osorio Hernández",
        "location": "Chile",
        "contact": "LinkedIn",
        "status": "interesado",
        "group": "LinkedIn orgánico",
        "notes": "Comentó «Yo quiero probar!». Aún sin DM. Mandar Demo. No liderar con NF.",
    },
    {
        "name": "Pamela de Leiva",
        "location": "Chile",
        "contact": "LinkedIn",
        "status": "interesado",
        "group": "LinkedIn orgánico",
        "notes": "Pendiente conectar. Completar ficha cuando haya apellido y qué hace.",
    },
    {
        "name": "Raúl Carrasco Aguilar",
        "location": "Argentina",
        "contact": "WhatsApp",
        "status": "demo",
        "group": "LinkedIn orgánico",
        "notes": "Bajó Demo. Le gusta la UI. No compra por NF/BLS: hace TCC. Plantilla TDAH 8 sesiones sin NF.",
        "reach": "DM 3 sep: bajó Demo, objeción NF.",
    },
    {
        "name": "Edgar Alexis Adonahi Ponce Juárez",
        "location": "México",
        "contact": "LinkedIn · Psynder",
        "status": "no_interesado",
        "lost_reason": "otro",
        "group": "LinkedIn orgánico",
        "notes": "Founder Psynder. Sondeó copyright. No es lead. No hablarle de packs privados.",
        "reach": "Comentario LinkedIn sobre copyright.",
    },
    {
        "name": "Cecilia Gálvez",
        "location": "Chile",
        "contact": "WhatsApp",
        "status": "interesado",
        "group": "WhatsApp frío (Encuadrado)",
        "notes": "Mostró interés ~3-4 sep. Sin respuesta al follow-up. Un mensaje corto, no Muse.",
        "reach": "WhatsApp: mostró interés.",
    },
    {
        "name": "Florencia Sofía",
        "location": "Chile",
        "contact": "WhatsApp",
        "status": "perdido",
        "lost_reason": "desaparecio",
        "group": "WhatsApp frío (Encuadrado)",
        "notes": "Agendó videollamada y no llegó. Un mensaje para reprogramar; si no, cerrar.",
        "reach": "Agendó call y no llegó.",
    },
    {
        "name": "Maria Jose Araya",
        "location": "Chile",
        "contact": "WhatsApp",
        "status": "no_interesado",
        "lost_reason": "otro",
        "group": "WhatsApp frío (Encuadrado)",
        "notes": "Frío 1 sep. «Gracias pero no es de mi interés».",
        "reach": "WhatsApp frío: no le interesa.",
    },
    {
        "name": "Marcela Barría Cárdenas",
        "location": "Chile",
        "contact": "iaysaludmental.com",
        "status": "conversando",
        "group": "Asesoría MIC",
        "notes": "Asesora ética IA (no staff). MIC. Confirmar foto antes de /equipo.",
        "reach": "Reunión con Aye: local vs Psypilot.",
    },
    {
        "name": "Luis",
        "location": "Chile",
        "contact": "Curso NF 2025",
        "status": "curso",
        "group": "Curso NF 2025",
        "notes": "Hizo el curso. Posible colaboración, no cofundador. Falta apellido y OK explícito.",
    },
    {
        "name": "Aye",
        "location": "Chile",
        "contact": "Reunión con Marcela",
        "status": "conversando",
        "group": "Asesoría MIC",
        "notes": "Reunión posición local vs Psypilot. Poca ficha; completar.",
        "reach": "Reunión con Marcela.",
    },
)


def seed_missing_network(conn) -> int:
    """Inserta grupos y personas que aún no están. No pisa fichas existentes."""
    if not _should_seed_network():
        return 0
    now = _api().now_iso()
    today = today_chile()
    created = 0
    groups = {
        str(row["name"]).casefold(): int(row["id"])
        for row in conn.execute("SELECT id, name FROM crm_groups")
    }
    for group in NETWORK_SEED_GROUPS:
        key = group["name"].casefold()
        if key in groups:
            continue
        gid = _insert_id(
            conn,
            """INSERT INTO crm_groups
               (name, location, status, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                group["name"],
                group.get("location") or "",
                group.get("status") or "por_crear",
                group.get("notes") or "",
                now,
                now,
            ),
        )
        groups[key] = gid
        created += 1
    people = {
        str(row["name"]).casefold(): int(row["id"])
        for row in conn.execute("SELECT id, name FROM crm_people")
    }
    reached = {
        int(row["person_id"])
        for row in conn.execute(
            "SELECT person_id FROM crm_reaches WHERE person_id IS NOT NULL"
        )
    }
    for person in NETWORK_SEED_PEOPLE:
        key = person["name"].casefold()
        group_id = groups.get((person.get("group") or "").casefold())
        if key not in people:
            pid = _insert_id(
                conn,
                """INSERT INTO crm_people
                   (name, location, contact, status, notes, group_id, lost_reason,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    person["name"],
                    person.get("location") or "",
                    person.get("contact") or "",
                    person.get("status") or "interesado",
                    person.get("notes") or "",
                    group_id,
                    person.get("lost_reason") or "",
                    now,
                    now,
                ),
            )
            people[key] = pid
            created += 1
        pid = people[key]
        note = person.get("reach") or ""
        if note and pid not in reached:
            _insert_id(
                conn,
                """INSERT INTO crm_reaches
                   (day, kind, group_id, person_id, where_text, note, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (today, "persona", None, pid, person["name"], note, now),
            )
            reached.add(pid)
            created += 1
    return created


def _ensure_column(conn, table: str, column: str, spec: str) -> None:
    api = _api()
    if api.USE_POSTGRES:
        exists = conn.execute(
            """SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = ? AND column_name = ?""",
            (table, column),
        ).fetchone()
        if not exists:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {spec}")
        return
    info = conn.execute(f"PRAGMA table_info({table})").fetchall()
    names = {dict(row)["name"] for row in info}
    if column not in names:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {spec}")


def _insert_id(conn, sql: str, params) -> int:
    api = _api()
    if api.USE_POSTGRES:
        row = conn.execute(sql + " RETURNING id", params).fetchone()
        return int(row["id"])
    cur = conn.execute(sql, params)
    return int(cur.lastrowid)


def _rows(result) -> list[dict]:
    return [dict(r) for r in result.fetchall()]


def _require_panel(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not _api().panel_authorized():
            return jsonify({"error": "No autorizado"}), 401
        return fn(*args, **kwargs)

    return wrapper


def _serialize_day(row: dict | None, day: str, today: str, started: str | None) -> dict:
    data = empty_day(day)
    data["blank"] = row is None and (not started or day < started)
    if row:
        data.update({
            "messages": int(row.get("messages") or 0),
            "posted": int(row.get("posted") or 0),
            "demo": int(row.get("demo") or 0),
            "demo_na": int(row.get("demo_na") or 0),
            "blank": False,
        })
    data["complete"] = day_complete(data)
    data["is_today"] = day == today
    return data


def _history(conn, today: str) -> list[dict]:
    start = (
        datetime.strptime(today, "%Y-%m-%d").date() - timedelta(days=HISTORY_DAYS - 1)
    ).isoformat()
    saved = {
        r["day"]: r
        for r in _rows(
            conn.execute(
                "SELECT day, messages, posted, demo, demo_na FROM crm_days "
                "WHERE day >= ? AND day <= ? ORDER BY day",
                (start, today),
            )
        )
    }
    started = _started_on(conn)
    end = datetime.strptime(today, "%Y-%m-%d").date()
    begin = datetime.strptime(start, "%Y-%m-%d").date()
    days = []
    cursor = begin
    while cursor <= end:
        key = cursor.isoformat()
        days.append(_serialize_day(saved.get(key), key, today, started))
        cursor += timedelta(days=1)
    return days


def _goal_summary(history: list[dict], today: str) -> dict:
    today_row = next((d for d in history if d["day"] == today), empty_day(today))
    past = [d for d in history if not d["is_today"]]
    missed = [d["day"] for d in past if not d["complete"] and not d["blank"]]
    done_days = [d["day"] for d in history if d["complete"]]
    streak = 0
    for row in reversed(history):
        if row["is_today"] and not row["complete"]:
            continue
        if row["complete"]:
            streak += 1
        else:
            break
    week_start = datetime.strptime(today, "%Y-%m-%d").date()
    week_start -= timedelta(days=week_start.weekday())
    week = [
        d for d in history
        if datetime.strptime(d["day"], "%Y-%m-%d").date() >= week_start
    ]
    return {
        **today_row,
        "streak": streak,
        "missed": missed,
        "missed_count": len(missed),
        "done_count": len(done_days),
        "week_done": sum(1 for d in week if d["complete"]),
        "week_total": len(week),
        "history_days": HISTORY_DAYS,
    }


PEOPLE_RINGS = {
    "usando": "inner",
    "demo": "inner",
    "conversando": "work",
    "curso": "work",
    "interesado": "outer",
    "no_instalo": "deep",
    "abandono": "deep",
    "perdido": "deep",
    "no_interesado": "deep",
    "pausa": "deep",
}
GROUP_RINGS = {
    "activo": "inner",
    "creado": "work",
    "por_crear": "outer",
    "archivado": "deep",
}


def build_graph(groups: list[dict], people: list[dict], reaches: list[dict]) -> dict:
    """Nodos en órbita (cerca = más caliente) y aristas de alcances + origen."""
    group_ids = {int(g["id"]) for g in groups}
    person_ids = {int(p["id"]) for p in people}
    weight: dict[str, int] = {}
    reach_edges: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    latest = None
    for reach in reaches:
        target = None
        gid = reach.get("group_id")
        pid = reach.get("person_id")
        if gid and int(gid) in group_ids:
            target = f"g-{int(gid)}"
        elif pid and int(pid) in person_ids:
            target = f"p-{int(pid)}"
        if not target:
            continue
        weight[target] = weight.get(target, 0) + 1
        key = ("telar", target)
        if key not in seen:
            seen.add(key)
            reach_edges.append(key)
        if latest is None:
            latest = key

    nodes = [{
        "id": "telar",
        "kind": "center",
        "name": "Telar",
        "ring": "center",
        "weight": 0,
    }]
    for group in groups:
        key = f"g-{int(group['id'])}"
        nodes.append({
            "id": key,
            "kind": "group",
            "ref": int(group["id"]),
            "name": group["name"],
            "location": group.get("location") or "",
            "status": group["status"],
            "ring": GROUP_RINGS.get(group["status"], "outer"),
            "weight": weight.get(key, 0),
        })
    for person in people:
        key = f"p-{int(person['id'])}"
        nodes.append({
            "id": key,
            "kind": "person",
            "ref": int(person["id"]),
            "name": person["name"],
            "location": person.get("location") or "",
            "status": person["status"],
            "lost": person["status"] in LOST_STATUSES,
            "lost_reason": person.get("lost_reason") or "",
            "ring": PEOPLE_RINGS.get(person["status"], "outer"),
            "weight": weight.get(key, 0),
        })

    edges = [{
        "from": src,
        "to": dst,
        "kind": "reach",
        "latest": (src, dst) == latest,
    } for src, dst in reach_edges]
    for person in people:
        gid = person.get("group_id")
        if not gid or int(gid) not in group_ids:
            continue
        edges.append({
            "from": f"p-{int(person['id'])}",
            "to": f"g-{int(gid)}",
            "kind": "member",
            "latest": False,
        })
    return {"nodes": nodes, "edges": edges}


def crm_state() -> dict:
    api = _api()
    today = today_chile()
    with api.db() as conn:
        history = _history(conn, today)
        groups = _rows(
            conn.execute(
                """SELECT g.id, g.name, g.location, g.status, g.notes,
                          g.created_at, g.updated_at,
                          (SELECT MAX(r.created_at) FROM crm_reaches r
                           WHERE r.group_id = g.id) AS last_reach_at
                   FROM crm_groups g
                   ORDER BY CASE g.status WHEN 'archivado' THEN 1 ELSE 0 END,
                            g.updated_at DESC"""
            )
        )
        people = _rows(
            conn.execute(
                """SELECT id, name, location, contact, status, notes, group_id,
                          lost_reason, created_at, updated_at
                   FROM crm_people
                   ORDER BY CASE WHEN status IN
                     ('no_instalo','abandono','perdido','no_interesado','pausa')
                     THEN 1 ELSE 0 END,
                            updated_at DESC"""
            )
        )
        reaches = _rows(
            conn.execute(
                """SELECT id, day, kind, group_id, person_id, where_text, note, created_at
                   FROM crm_reaches ORDER BY created_at DESC, id DESC LIMIT 80"""
            )
        )
    return {
        "ok": True,
        "today": today,
        "goal": _goal_summary(history, today),
        "history": history,
        "groups": groups,
        "people": people,
        "reaches": reaches,
        "graph": build_graph(groups, people, reaches),
        "labels": {
            "groups": GROUP_STATUSES,
            "people": PEOPLE_STATUSES,
            "reaches": REACH_KINDS,
            "reasons": LOST_REASONS,
        },
        "lost_statuses": sorted(LOST_STATUSES),
    }


def _upsert_day(day: str, data: dict) -> dict:
    api = _api()
    with api.db() as conn:
        row = conn.execute(
            "SELECT day, messages, posted, demo, demo_na FROM crm_days WHERE day = ?",
            (day,),
        ).fetchone()
        current = dict(row) if row else {
            "day": day, "messages": 0, "posted": 0, "demo": 0, "demo_na": 0,
        }
        if "messages" in data:
            try:
                current["messages"] = max(0, min(3, int(data["messages"])))
            except (TypeError, ValueError):
                pass
        if "posted" in data:
            current["posted"] = 1 if data["posted"] else 0
        if "demo" in data and data["demo"]:
            current["demo"] = 1
            current["demo_na"] = 0
        elif "demo_na" in data and data["demo_na"]:
            current["demo"] = 0
            current["demo_na"] = 1
        elif "demo" in data or "demo_na" in data:
            current["demo"] = 0
            current["demo_na"] = 0
        conn.execute(
            """INSERT INTO crm_days (day, messages, posted, demo, demo_na, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(day) DO UPDATE SET
                 messages = excluded.messages,
                 posted = excluded.posted,
                 demo = excluded.demo,
                 demo_na = excluded.demo_na,
                 updated_at = excluded.updated_at""",
            (
                day,
                int(current["messages"]),
                int(current["posted"]),
                int(current["demo"]),
                int(current["demo_na"]),
                api.now_iso(),
            ),
        )
    return crm_state()


def register_routes(app) -> None:
    @app.get("/api/admin/crm")
    @_require_panel
    def crm_get():
        return jsonify(crm_state())

    @app.patch("/api/admin/crm/today")
    @_require_panel
    def crm_today():
        data = request.get_json(silent=True) or {}
        today = today_chile()
        day = parse_day(data.get("day"), today)
        if not day:
            return jsonify({"error": "Día fuera de rango"}), 400
        return jsonify(_upsert_day(day, data))

    @app.post("/api/admin/crm/groups")
    @_require_panel
    def crm_group_create():
        return _save_group(None)

    @app.patch("/api/admin/crm/groups/<int:item_id>")
    @_require_panel
    def crm_group_update(item_id: int):
        return _save_group(item_id)

    @app.delete("/api/admin/crm/groups/<int:item_id>")
    @_require_panel
    def crm_group_delete(item_id: int):
        api = _api()
        with api.db() as conn:
            conn.execute(
                "UPDATE crm_reaches SET group_id = NULL WHERE group_id = ?",
                (item_id,),
            )
            conn.execute(
                "UPDATE crm_people SET group_id = NULL WHERE group_id = ?",
                (item_id,),
            )
            conn.execute("DELETE FROM crm_groups WHERE id = ?", (item_id,))
        return jsonify(crm_state())

    @app.post("/api/admin/crm/people")
    @_require_panel
    def crm_person_create():
        return _save_person(None)

    @app.patch("/api/admin/crm/people/<int:item_id>")
    @_require_panel
    def crm_person_update(item_id: int):
        return _save_person(item_id)

    @app.delete("/api/admin/crm/people/<int:item_id>")
    @_require_panel
    def crm_person_delete(item_id: int):
        api = _api()
        with api.db() as conn:
            conn.execute(
                "UPDATE crm_reaches SET person_id = NULL WHERE person_id = ?",
                (item_id,),
            )
            conn.execute("DELETE FROM crm_people WHERE id = ?", (item_id,))
        return jsonify(crm_state())

    @app.post("/api/admin/crm/reaches")
    @_require_panel
    def crm_reach_create():
        api = _api()
        data = request.get_json(silent=True) or {}
        today = today_chile()
        day = parse_day(data.get("day"), today) or today
        kind = data.get("kind") if data.get("kind") in REACH_KINDS else "grupo"
        where_text = api.clean_field(data.get("where_text"), 160)
        note = api.clean_field(data.get("note"), 400)
        group_id = _optional_id(data.get("group_id"))
        person_id = _optional_id(data.get("person_id"))
        with api.db() as conn:
            if group_id:
                row = conn.execute(
                    "SELECT name FROM crm_groups WHERE id = ?", (group_id,)
                ).fetchone()
                if not row:
                    group_id = None
                elif not where_text:
                    where_text = row["name"]
            if person_id:
                row = conn.execute(
                    "SELECT name FROM crm_people WHERE id = ?", (person_id,)
                ).fetchone()
                if not row:
                    person_id = None
                elif not where_text:
                    where_text = row["name"]
            if not where_text:
                return jsonify({"error": "Falta dónde se escribió"}), 400
            _insert_id(
                conn,
                """INSERT INTO crm_reaches
                   (day, kind, group_id, person_id, where_text, note, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (day, kind, group_id, person_id, where_text, note, api.now_iso()),
            )
        return jsonify(crm_state())

    @app.delete("/api/admin/crm/reaches/<int:item_id>")
    @_require_panel
    def crm_reach_delete(item_id: int):
        api = _api()
        with api.db() as conn:
            conn.execute("DELETE FROM crm_reaches WHERE id = ?", (item_id,))
        return jsonify(crm_state())


def _optional_id(value) -> int | None:
    if value in (None, "", 0, "0"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _save_group(item_id: int | None):
    api = _api()
    data = request.get_json(silent=True) or {}
    name = api.clean_field(data.get("name"), 80)
    if not name:
        return jsonify({"error": "Falta el nombre del grupo"}), 400
    location = api.clean_field(data.get("location"), 80)
    notes = api.clean_field(data.get("notes"), 400)
    status = data.get("status") if data.get("status") in GROUP_STATUSES else "por_crear"
    now = api.now_iso()
    with api.db() as conn:
        if item_id is None:
            _insert_id(
                conn,
                """INSERT INTO crm_groups
                   (name, location, status, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (name, location, status, notes, now, now),
            )
        else:
            conn.execute(
                """UPDATE crm_groups
                   SET name = ?, location = ?, status = ?, notes = ?, updated_at = ?
                   WHERE id = ?""",
                (name, location, status, notes, now, item_id),
            )
    return jsonify(crm_state())


def _save_person(item_id: int | None):
    api = _api()
    data = request.get_json(silent=True) or {}
    name = api.clean_field(data.get("name"), 80)
    if not name:
        return jsonify({"error": "Falta el nombre"}), 400
    location = api.clean_field(data.get("location"), 80)
    contact = api.clean_field(data.get("contact"), 80)
    notes = api.clean_field(data.get("notes"), 400)
    status = data.get("status") if data.get("status") in PEOPLE_STATUSES else "interesado"
    group_id = _optional_id(data.get("group_id"))
    lost_reason = data.get("lost_reason") if data.get("lost_reason") in LOST_REASONS else ""
    if status not in LOST_STATUSES:
        lost_reason = lost_reason or ""
    now = api.now_iso()
    with api.db() as conn:
        if group_id:
            row = conn.execute(
                "SELECT id FROM crm_groups WHERE id = ?", (group_id,)
            ).fetchone()
            if not row:
                group_id = None
        if item_id is None:
            _insert_id(
                conn,
                """INSERT INTO crm_people
                   (name, location, contact, status, notes, group_id, lost_reason,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (name, location, contact, status, notes, group_id, lost_reason, now, now),
            )
        else:
            conn.execute(
                """UPDATE crm_people
                   SET name = ?, location = ?, contact = ?, status = ?, notes = ?,
                       group_id = ?, lost_reason = ?, updated_at = ?
                   WHERE id = ?""",
                (name, location, contact, status, notes, group_id, lost_reason, now, item_id),
            )
    return jsonify(crm_state())


CRM_CSS = """
.tabs { display:flex; gap:6px; }
.tabs button { width:auto; padding:7px 14px; font-size:13px; font-weight:550;
  background:#161b22; border:1px solid #262c36; color:#8b949e; border-radius:8px;
  cursor:pointer; }
.tabs button:hover { background:#1c2230; color:#e6edf3; }
.tabs button[aria-pressed="true"] { background:#e6edf3; border-color:#e6edf3; color:#0e1116; }
.tabs-sub { margin:0 0 18px; }
.tabs-sub button { padding:5px 11px; font-size:12px; }
.tabs-sub button[aria-pressed="true"] { background:#1f6feb; border-color:#1f6feb; color:#fff; }
#tab-crm h2 { margin-top:28px; }
#tab-crm [data-crm-pane] > h2:first-child { margin-top:4px; }
.goal { padding:22px 22px 18px; }
.goal h3 { margin:0 0 6px; font-size:22px; letter-spacing:-.02em; font-weight:650; }
.goal .lead { color:#8b949e; margin:0 0 18px; font-size:14px; max-width:62ch; }
.goal-grid { display:grid; gap:12px; }
.goal-item { border:1px solid #262c36; background:#0e1116; border-radius:10px; padding:14px 16px; }
.goal-item.done { border-color:#1c4428; background:#0f2417; }
.goal-item b { display:block; font-size:15px; font-weight:600; }
.goal-item p { margin:4px 0 12px; color:#8b949e; font-size:13px; }
.ticks { display:flex; gap:8px; }
.ticks button, .choice button, .crm-form button, .crm-list button, .reach-form button,
.missed button {
  width:auto; margin:0; padding:8px 12px; border-radius:8px; border:1px solid #30363d;
  background:#161b22; color:#e6edf3; font-size:13px; font-weight:500; cursor:pointer; }
.ticks button:hover, .choice button:hover, .crm-form button:hover, .reach-form button:hover {
  background:#1c2230; }
.ticks button.on { background:#238636; border-color:#238636; color:#fff; }
.choice { display:flex; flex-wrap:wrap; gap:8px; }
.choice button.on { background:#1f6feb; border-color:#1f6feb; color:#fff; }
.choice button.on.alt { background:#6e7681; border-color:#6e7681; }
.cal-wrap { margin-top:20px; }
.cal-head { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
  align-items:baseline; margin-bottom:10px; }
.cal-head strong { font-size:13px; font-weight:600; }
.cal-weekdays, .cal { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; }
.cal-weekdays span { text-align:center; font-size:10px; color:#6e7681;
  text-transform:uppercase; letter-spacing:.04em; }
.cal button { width:100%; aspect-ratio:1; max-height:42px; padding:0; margin:0;
  border-radius:7px; border:1px solid #21262d; background:#161b22; color:#8b949e;
  font-size:11px; font-variant-numeric:tabular-nums; cursor:pointer; }
.cal button.ok { background:#0f2417; border-color:#1c4428; color:#3fb950; }
.cal button.miss { background:#2a1215; border-color:#3d1c21; color:#f85149; }
.cal button.today { box-shadow:0 0 0 2px #1f6feb; color:#e6edf3; }
.cal button.today.ok { box-shadow:0 0 0 2px #3fb950; }
.missed { margin:12px 0 0; color:#f85149; font-size:13px; }
.missed span { color:#8b949e; }
.crm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:0 24px; }
.crm-form, .reach-form { display:grid; gap:8px; margin:0 0 12px; }
.crm-form .row2, .reach-form .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.crm-form input, .crm-form select, .crm-form textarea,
.reach-form input, .reach-form select, .reach-form textarea {
  width:100%; margin:0; padding:9px 11px; border-radius:8px; border:1px solid #30363d;
  background:#0d1117; color:#e6edf3; font:13px/1.4 inherit; }
.crm-form textarea, .reach-form textarea { min-height:64px; resize:vertical; }
.crm-form .actions, .reach-form .actions { display:flex; gap:8px; flex-wrap:wrap; }
.crm-form button[type="submit"], .reach-form button[type="submit"] {
  background:#238636; border-color:#238636; color:#fff; }
.crm-form button[type="submit"]:hover, .reach-form button[type="submit"]:hover {
  background:#2ea043; }
.crm-list { display:grid; }
.crm-list article { padding:14px 16px; border-bottom:1px solid #1c222b; }
.crm-list article:last-child { border-bottom:none; }
.crm-list header { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
.crm-list h4 { margin:0; font-size:14px; font-weight:600; }
.crm-list p { margin:4px 0 0; color:#8b949e; font-size:13px; }
.crm-list .meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.crm-list .actions { margin-top:10px; display:flex; gap:6px; }
.crm-list button.danger:hover { background:#3d1c21; color:#f85149; }
.pill.wait { color:#d29922; border-color:#4a3d16; background:#241d08; }
.pill.live { color:#3fb950; border-color:#1c4428; background:#0f2417; }
.pill.lost { color:#f85149; border-color:#3d1c21; background:#2a1215; }
.crm-sub { padding:12px 16px 4px; font-size:11px; font-weight:600; letter-spacing:.06em;
  text-transform:uppercase; color:#8b949e; }
.crm-list article.lost h4 { color:#c9c4bc; }
.map-card { background:#f4efe6; border-color:#e6dccb; overflow:hidden; }
.map-card svg { display:block; width:100%; height:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.map-hint { margin:0 0 12px; color:#8b949e; font-size:13px; max-width:72ch; }
#tab-uso { margin-top:8px; }
@media (max-width:640px) {
  .crm-form .row2, .reach-form .row2 { grid-template-columns:1fr; }
}
"""

CRM_MARKUP = """
<section id="tab-crm">
  <nav class="tabs tabs-sub" id="crm-tabs">
    <button type="button" data-pane="hoy" aria-pressed="true">Hoy</button>
    <button type="button" data-pane="red">Red</button>
    <button type="button" data-pane="gente">Gente</button>
    <button type="button" data-pane="alcances">Alcances</button>
  </nav>
  <div data-crm-pane="hoy">
  <div class="card goal" id="goal"></div>
  </div>
  <div data-crm-pane="red" hidden>
  <h2>Red</h2>
  <p class="map-hint">Cerca del centro: usan Telar o vieron una demo. Afuera, en gris: hicieron el curso y no instalaron, usaron dos días o desaparecieron. Anotarlos importa tanto como a los interesados: ahí se ve el patrón (por ahora, el NF y los módulos que faltan).</p>
  <div class="card map-card" id="map"></div>
  </div>
  <div data-crm-pane="gente" hidden>
  <div class="crm-grid">
    <div>
      <h2>Grupos de WhatsApp</h2>
      <form class="crm-form" id="group-form" autocomplete="off">
        <input type="hidden" name="item_id" value="">
        <input name="name" required maxlength="80" placeholder="Nombre del grupo">
        <div class="row2">
          <input name="location" maxlength="80" placeholder="Zona o tema · p.ej. psicólogos Santiago">
          <select name="status">
            <option value="por_crear">Por crear</option>
            <option value="creado">Creado</option>
            <option value="activo">Activo</option>
            <option value="archivado">Archivado</option>
          </select>
        </div>
        <textarea name="notes" maxlength="400" placeholder="Para qué es, quién lo admin, o el siguiente paso"></textarea>
        <div class="actions">
          <button type="submit">Añadir grupo</button>
          <button type="button" id="group-cancel" hidden>Cancelar</button>
        </div>
      </form>
      <div class="card crm-list" id="groups"></div>
    </div>
    <div>
      <h2>Personas</h2>
      <form class="crm-form" id="person-form" autocomplete="off">
        <input type="hidden" name="item_id" value="">
        <input name="name" required maxlength="80" placeholder="Nombre">
        <div class="row2">
          <input name="location" maxlength="80" placeholder="Comuna o ciudad">
          <input name="contact" maxlength="80" placeholder="WhatsApp o correo">
        </div>
        <div class="row2">
          <select name="status">
            <optgroup label="En juego">
              <option value="interesado">Interesado</option>
              <option value="conversando">Conversando</option>
              <option value="demo">Vio demo</option>
              <option value="usando">Usa Telar</option>
              <option value="curso">Hizo el curso</option>
            </optgroup>
            <optgroup label="No se quedaron">
              <option value="no_instalo">Curso, no instaló</option>
              <option value="abandono">Instaló y no volvió</option>
              <option value="perdido">Desapareció</option>
              <option value="no_interesado">No se interesó</option>
              <option value="pausa">En pausa</option>
            </optgroup>
          </select>
          <select name="lost_reason">
            <option value="">Si no se quedó, ¿por qué?</option>
            <option value="nf">El NF no mostraba lo que esperaban</option>
            <option value="modulo">Pedían un módulo que no estaba</option>
            <option value="nunca_uso">Usó poco y no volvió</option>
            <option value="desaparecio">Desapareció</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <select name="group_id">
          <option value="">Sin grupo de origen</option>
        </select>
        <textarea name="notes" maxlength="400" placeholder="De dónde salió, qué le interesa, cuándo seguir — o por qué no se quedó"></textarea>
        <div class="actions">
          <button type="submit">Añadir persona</button>
          <button type="button" id="person-cancel" hidden>Cancelar</button>
        </div>
      </form>
      <div class="card crm-list" id="people"></div>
    </div>
  </div>
  </div>
  <div data-crm-pane="alcances" hidden>
  <h2>Alcances</h2>
  <p class="note" style="margin:0 0 12px">Cada vez que escribas en un grupo —o a alguien— déjalo acá. No es un funnel: es para no repetir el mismo lado y ver los días en que sí apareciste.</p>
  <form class="reach-form" id="reach-form" autocomplete="off">
    <div class="row2">
      <select name="kind">
        <option value="grupo">Escribí en un grupo</option>
        <option value="persona">Escribí a alguien</option>
        <option value="otro">Otro alcance</option>
      </select>
      <select name="ref" id="reach-target"></select>
    </div>
    <input name="where_text" maxlength="160" placeholder="Si no está en la lista, escríbelo acá">
    <textarea name="note" maxlength="400" placeholder="Qué publicaste o a quién le escribiste (opcional)"></textarea>
    <div class="actions">
      <button type="submit">Registrar alcance</button>
    </div>
  </form>
  <div class="card crm-list" id="reaches"></div>
  </div>
</section>
"""

CRM_SCRIPT = r"""
const WEEKDAYS = ['L','M','M','J','V','S','D'];
let crm = null;
let crmTab = sessionStorage.getItem('telar-panel-tab') || 'crm';
if (crmTab === 'hoy') crmTab = 'crm';
let crmPane = sessionStorage.getItem('telar-crm-pane') || 'hoy';

function prettyDay(iso, withWeekday) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const opts = withWeekday
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'short' };
  return dt.toLocaleDateString('es-CL', opts);
}

function shortMissed(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
}

function pillClass(status) {
  if (status === 'activo' || status === 'usando' || status === 'demo') return 'ok';
  if (status === 'por_crear' || status === 'interesado' || status === 'conversando' || status === 'curso') return 'wait';
  if (status === 'creado') return 'live';
  if (status === 'no_instalo' || status === 'abandono' || status === 'perdido' || status === 'no_interesado') return 'lost';
  return '';
}

function fillSelect(sel, items, placeholder) {
  const current = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` + items.map((it) =>
    `<option value="${it.id}">${esc(it.name)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

const MAP_RINGS = { inner: 102, work: 188, outer: 274, deep: 360 };
const MAP_CX = 460, MAP_CY = 460, MAP_VB = 920;

function hash01(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function firstName(name) {
  return String(name || '').split(/\s+/)[0].slice(0, 14);
}

function curvePath(x1, y1, x2, y2, bend) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

function renderMap(d) {
  const graph = d.graph || { nodes: [], edges: [] };
  const placed = { telar: { x: MAP_CX, y: MAP_CY } };
  ['inner', 'work', 'outer', 'deep'].forEach((ring, ri) => {
    const list = graph.nodes.filter((n) => n.ring === ring);
    const r = MAP_RINGS[ring];
    const start = ri * 0.45;
    list.forEach((n, i) => {
      const t = (i + 0.5) / Math.max(list.length, 1);
      const ang = start + t * Math.PI * 2 + (hash01(n.id) - 0.5) * 0.14;
      placed[n.id] = { x: MAP_CX + Math.cos(ang) * r, y: MAP_CY + Math.sin(ang) * r };
    });
  });

  const dust = Array.from({ length: 90 }, (_, i) => {
    const a = hash01('a' + i) * Math.PI * 2;
    const r = 48 + hash01('r' + i) * 340;
    const o = 0.07 + hash01('o' + i) * 0.16;
    return `<circle cx="${(MAP_CX + Math.cos(a) * r).toFixed(1)}" cy="${(MAP_CY + Math.sin(a) * r).toFixed(1)}" r="${hash01('s' + i) < 0.12 ? 1.5 : 0.7}" fill="#2c2824" opacity="${o.toFixed(2)}"/>`;
  }).join('');

  const rings = Object.values(MAP_RINGS).map((r) =>
    `<circle cx="${MAP_CX}" cy="${MAP_CY}" r="${r}" fill="none" stroke="#cbbfa8" stroke-width="1"/>`
  ).join('');

  const ringLabels = [
    [102, 'Círculo cercano'],
    [188, 'En trabajo'],
    [274, 'Órbita'],
    [360, 'Afuera'],
  ].map(([r, label]) =>
    `<text x="${MAP_CX}" y="${MAP_CY - r - 10}" text-anchor="middle" fill="#8a7f70" font-size="11" font-weight="600" letter-spacing="1.8">${label.toUpperCase()}</text>`
  ).join('');

  const rim = `
    <text x="34" y="${MAP_CY}" fill="#8a7f70" font-size="11" letter-spacing="2.4" text-anchor="middle" transform="rotate(-90 34 ${MAP_CY})">GRUPOS</text>
    <text x="${MAP_VB - 34}" y="${MAP_CY}" fill="#8a7f70" font-size="11" letter-spacing="2.4" text-anchor="middle" transform="rotate(90 ${MAP_VB - 34} ${MAP_CY})">PERSONAS</text>
    <text x="${MAP_CX}" y="${MAP_VB - 28}" fill="#8a7f70" font-size="11" letter-spacing="2.4" text-anchor="middle">NO SE QUEDARON</text>`;

  const edges = (graph.edges || []).map((e) => {
    const a = placed[e.from] || placed.telar;
    const b = placed[e.to];
    if (!b) return '';
    const bend = e.kind === 'member' ? 0.22 : 0.13;
    const sw = e.latest ? 2.4 : (e.kind === 'member' ? 1.15 : 0.95);
    const op = e.latest ? 0.92 : 0.28;
    return `<path d="${curvePath(a.x, a.y, b.x, b.y, bend)}" fill="none" stroke="#c45c32" stroke-width="${sw}" opacity="${op}"/>`;
  }).join('');

  const nodes = graph.nodes.filter((n) => n.kind !== 'center').map((n) => {
    const p = placed[n.id];
    if (!p) return '';
    const rad = 4.5 + Math.min(n.weight || 0, 6) * 1.25;
    const label = firstName(n.name);
    const lx = p.x + (p.x >= MAP_CX ? 9 : -9);
    const anchor = p.x >= MAP_CX ? 'start' : 'end';
    const fill = n.lost ? '#9a9084' : '#2c2824';
    const mark = n.kind === 'group'
      ? `<rect x="${(p.x - rad).toFixed(1)}" y="${(p.y - rad).toFixed(1)}" width="${(rad * 2).toFixed(1)}" height="${(rad * 2).toFixed(1)}" rx="1.6" fill="${fill}"/>`
      : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${rad}" fill="${fill}"/>`;
    const tip = [n.name, n.location, n.lost ? 'no se quedó' : ''].filter(Boolean).join(' · ');
    return `<g class="map-node" data-node="${n.kind}:${n.ref}" style="cursor:pointer">
      <title>${esc(tip)}</title>
      ${mark}
      <text x="${lx.toFixed(1)}" y="${(p.y - rad - 5).toFixed(1)}" text-anchor="${anchor}" fill="${fill}" font-size="11">${esc(label)}</text>
    </g>`;
  }).join('');

  const empty = graph.nodes.length <= 1
    ? `<text x="${MAP_CX}" y="${MAP_CY + 30}" text-anchor="middle" fill="#8a7f70" font-size="13">Aún vacío. Las órbitas se llenan al anotar grupos y personas.</text>`
    : '';

  $('map').innerHTML = `<svg viewBox="0 0 ${MAP_VB} ${MAP_VB}" role="img" aria-label="Mapa de la red Telar">
    <rect width="${MAP_VB}" height="${MAP_VB}" fill="#f4efe6"/>
    ${dust}${rings}${ringLabels}${rim}${edges}
    <circle cx="${MAP_CX}" cy="${MAP_CY}" r="9" fill="#c45c32"/>
    <text x="${MAP_CX}" y="${MAP_CY + 24}" text-anchor="middle" fill="#c45c32" font-size="11" font-weight="700" letter-spacing="1.6">TELAR</text>
    ${nodes}${empty}
  </svg>`;
}

function renderGoal(d) {
  const g = d.goal;
  const msgDone = g.messages >= 3;
  const ticks = [1,2,3].map((n) =>
    `<button type="button" data-n="${n}" class="${g.messages >= n ? 'on' : ''}">${n}</button>`
  ).join('');
  const miss = g.missed.slice().reverse();
  const missHtml = miss.length
    ? `<p class="missed">No cumplido: ${miss.map((day) => esc(shortMissed(day))).join(' · ')}</p>`
    : `<p class="missed"><span>Sin días pendientes en estas ${g.history_days} jornadas.</span></p>`;
  const first = d.history[0]?.day;
  const pad = first ? (new Date(+first.slice(0,4), +first.slice(5,7)-1, +first.slice(8,10)).getDay() + 6) % 7 : 0;
  const cells = Array(pad).fill('<span></span>').join('') + d.history.map((h) => {
    const cls = [
      h.complete ? 'ok' : (h.is_today || h.blank ? '' : 'miss'),
      h.is_today ? 'today' : '',
    ].filter(Boolean).join(' ');
    const title = h.complete ? 'cumplido' : (h.is_today ? 'en curso' : (h.blank ? 'sin registro' : 'no cumplido'));
    return `<button type="button" class="${cls}" data-day="${h.day}" title="${h.day}: ${title}">${h.day.slice(8)}</button>`;
  }).join('');

  $('goal').innerHTML = `
    <h3>${esc(prettyDay(d.today, true))}</h3>
    <p class="lead">El objetivo de hoy es chico a propósito. No es conseguir usuarios ni cobrar: son tres gestos que sí controlas.</p>
    <div class="goal-grid">
      <div class="goal-item ${msgDone ? 'done' : ''}">
        <b>Enviar 3 mensajes personales</b>
        <p>Uno a uno, a alguien concreto. Un copiar y pegar masivo no cuenta.</p>
        <div class="ticks" data-field="messages">${ticks}</div>
      </div>
      <div class="goal-item ${g.posted ? 'done' : ''}">
        <b>Publicar una cosa útil</b>
        <p>Un comentario, una nota, una respuesta. Algo que ayude, no un pitch.</p>
        <div class="choice">
          <button type="button" data-field="posted" data-on="${g.posted ? 0 : 1}" class="${g.posted ? 'on' : ''}">${
            g.posted ? 'Hecho' : 'Marcar hecho'}</button>
        </div>
      </div>
      <div class="goal-item ${g.demo || g.demo_na ? 'done' : ''}">
        <b>Si alguien responde, una demo corta</b>
        <p>Diez minutos bastan. Si nadie respondió, márcalo: el día igual cuenta.</p>
        <div class="choice">
          <button type="button" data-demo="1" class="${g.demo ? 'on' : ''}">Hice una demo</button>
          <button type="button" data-demo-na="1" class="${g.demo_na ? 'on alt' : ''}">Nadie respondió</button>
        </div>
      </div>
    </div>
    <div class="cal-wrap">
      <div class="cal-head">
        <strong>Últimas 6 semanas</strong>
        <span class="sub">Esta semana ${g.week_done} de ${g.week_total} · racha ${g.streak} ${g.streak === 1 ? 'día' : 'días'}</span>
      </div>
      <div class="cal-weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal" id="cal">${cells}</div>
      ${missHtml}
    </div>`;
}

function renderGroups(d) {
  if (!d.groups.length) {
    $('groups').innerHTML = '<p class="empty">Anota los grupos que quieres crear. Con el nombre basta.</p>';
    return;
  }
  $('groups').innerHTML = d.groups.map((g) => `<article>
    <header>
      <h4>${esc(g.name)}</h4>
      <span class="pill ${pillClass(g.status)}">${esc(d.labels.groups[g.status] || g.status)}</span>
    </header>
    <p>${esc([g.location, g.notes].filter(Boolean).join(' · ') || 'Sin nota')}</p>
    <div class="meta">
      ${g.last_reach_at ? `<span class="sub">Último alcance ${esc(ago(g.last_reach_at))}</span>` : '<span class="sub">Sin alcances aún</span>'}
    </div>
    <div class="actions">
      <button type="button" data-edit-group="${g.id}">Editar</button>
      <button type="button" class="danger" data-del-group="${g.id}">Quitar</button>
    </div>
  </article>`).join('');
}

function renderPeople(d) {
  const origin = $('person-form').querySelector('[name="group_id"]');
  fillSelect(origin, d.groups.filter((g) => g.status !== 'archivado'), 'Sin grupo de origen');
  const lostSet = new Set(d.lost_statuses || []);
  const groupsById = Object.fromEntries(d.groups.map((g) => [String(g.id), g]));
  const card = (p) => {
    const from = p.group_id ? groupsById[String(p.group_id)] : null;
    const why = p.lost_reason && d.labels.reasons ? d.labels.reasons[p.lost_reason] : '';
    const bits = [p.location, p.contact, from ? 'Grupo: ' + from.name : '', why, p.notes].filter(Boolean);
    const lost = lostSet.has(p.status);
    return `<article class="${lost ? 'lost' : ''}">
    <header>
      <h4>${esc(p.name)}</h4>
      <span class="pill ${pillClass(p.status)}">${esc(d.labels.people[p.status] || p.status)}</span>
    </header>
    <p>${esc(bits.join(' · ') || 'Sin nota')}</p>
    <div class="actions">
      <button type="button" data-edit-person="${p.id}">Editar</button>
      <button type="button" class="danger" data-del-person="${p.id}">Quitar</button>
    </div>
  </article>`;
  };
  if (!d.people.length) {
    $('people').innerHTML = '<p class="empty">Anota también a quienes hicieron el curso y no instalaron, o desaparecieron. El patrón se ve después.</p>';
    return;
  }
  const live = d.people.filter((p) => !lostSet.has(p.status));
  const lost = d.people.filter((p) => lostSet.has(p.status));
  $('people').innerHTML =
      `<div class="crm-sub">En juego · ${live.length}</div>`
    + (live.length ? live.map(card).join('') : '<p class="empty">Nadie en juego ahora.</p>')
    + `<div class="crm-sub">No se quedaron · ${lost.length}</div>`
    + (lost.length ? lost.map(card).join('') : '<p class="empty">Cuando alguien no instale, use dos días o desaparezca, anótalo. El NF que no muestra lo esperado ya es un patrón.</p>');
}

function renderReaches(d) {
  const form = $('reach-form');
  const kind = form.kind.value;
  const target = $('reach-target');
  if (kind === 'grupo') fillSelect(target, d.groups.filter((g) => g.status !== 'archivado'), 'Elegir grupo');
  else if (kind === 'persona') fillSelect(target, d.people, 'Elegir persona');
  else fillSelect(target, [], 'No aplica');
  target.disabled = kind === 'otro';

  if (!d.reaches.length) {
    $('reaches').innerHTML = '<p class="empty">Todavía no hay alcances registrados.</p>';
    return;
  }
  $('reaches').innerHTML = d.reaches.map((r) => `<article>
    <header>
      <h4>${esc(r.where_text)}</h4>
      <span class="pill">${esc(d.labels.reaches[r.kind] || r.kind)}</span>
    </header>
    <p>${esc(prettyDay(r.day, false))}${r.note ? ' · ' + esc(r.note) : ''}</p>
    <div class="actions">
      <button type="button" class="danger" data-del-reach="${r.id}">Quitar</button>
    </div>
  </article>`).join('');
}

function renderCrm(d) {
  crm = d;
  renderGoal(d);
  renderMap(d);
  renderGroups(d);
  renderPeople(d);
  renderReaches(d);
}

async function crmFetch(path, opts) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) { location.reload(); return null; }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo guardar');
  }
  return res.json();
}

async function patchGoal(payload) {
  try {
    const data = await crmFetch('/api/admin/crm/today', {
      method: 'PATCH', body: JSON.stringify(payload),
    });
    if (data) renderCrm(data);
  } catch (err) { alert(err.message); }
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function itemField(form) {
  return form.querySelector('[name="item_id"]');
}

function resetForm(form, cancelId, submitLabel) {
  form.reset();
  itemField(form).value = '';
  $(cancelId).hidden = true;
  form.querySelector('[type="submit"]').textContent = submitLabel;
}

function fillForm(form, item, cancelId, submitLabel) {
  for (const el of form.elements) {
    if (!el.name || el.name === 'item_id') continue;
    if (item[el.name] != null) el.value = item[el.name];
    else if (el.name === 'group_id' || el.name === 'lost_reason') el.value = '';
  }
  itemField(form).value = item.id;
  $(cancelId).hidden = false;
  form.querySelector('[type="submit"]').textContent = submitLabel;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setTab(name) {
  crmTab = name;
  sessionStorage.setItem('telar-panel-tab', name);
  $('tab-crm').hidden = name !== 'crm';
  $('tab-uso').hidden = name !== 'uso';
  document.querySelectorAll('#tabs > button').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.tab === name ? 'true' : 'false');
  });
  $('live-hint').hidden = name !== 'uso';
}

function setCrmPane(name) {
  crmPane = name;
  sessionStorage.setItem('telar-crm-pane', name);
  document.querySelectorAll('[data-crm-pane]').forEach((el) => {
    el.hidden = el.dataset.crmPane !== name;
  });
  document.querySelectorAll('#crm-tabs button').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.pane === name ? 'true' : 'false');
  });
}

$('tabs').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-tab]');
  if (btn) setTab(btn.dataset.tab);
});

$('crm-tabs').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-pane]');
  if (btn) setCrmPane(btn.dataset.pane);
});

$('map').addEventListener('click', (event) => {
  const node = event.target.closest('[data-node]');
  if (!node || !crm) return;
  const [kind, id] = node.dataset.node.split(':');
  if (kind === 'group') {
    const item = crm.groups.find((g) => String(g.id) === id);
    if (item) {
      setTab('crm');
      setCrmPane('gente');
      fillForm($('group-form'), item, 'group-cancel', 'Guardar grupo');
    }
  } else if (kind === 'person') {
    const item = crm.people.find((p) => String(p.id) === id);
    if (item) {
      setTab('crm');
      setCrmPane('gente');
      fillForm($('person-form'), item, 'person-cancel', 'Guardar persona');
    }
  }
});

$('goal').addEventListener('click', (event) => {
  if (!crm) return;
  const tick = event.target.closest('.ticks button[data-n]');
  if (tick) {
    const n = Number(tick.dataset.n);
    const next = crm.goal.messages === n ? n - 1 : n;
    patchGoal({ messages: next });
    return;
  }
  const posted = event.target.closest('[data-field="posted"]');
  if (posted) {
    patchGoal({ posted: posted.dataset.on === '1' });
    return;
  }
  const demo = event.target.closest('[data-demo]');
  if (demo) {
    patchGoal({ demo: crm.goal.demo ? false : true, demo_na: false });
    return;
  }
  const demoNa = event.target.closest('[data-demo-na]');
  if (demoNa) {
    patchGoal({ demo: false, demo_na: crm.goal.demo_na ? false : true });
  }
});

$('group-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = formData(event.target);
  const id = body.item_id;
  delete body.item_id;
  try {
    const data = await crmFetch(id ? `/api/admin/crm/groups/${id}` : '/api/admin/crm/groups', {
      method: id ? 'PATCH' : 'POST', body: JSON.stringify(body),
    });
    if (data) {
      resetForm(event.target, 'group-cancel', 'Añadir grupo');
      renderCrm(data);
    }
  } catch (err) { alert(err.message); }
});
$('group-cancel').addEventListener('click', () => resetForm($('group-form'), 'group-cancel', 'Añadir grupo'));

$('person-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = formData(event.target);
  const id = body.item_id;
  delete body.item_id;
  try {
    const data = await crmFetch(id ? `/api/admin/crm/people/${id}` : '/api/admin/crm/people', {
      method: id ? 'PATCH' : 'POST', body: JSON.stringify(body),
    });
    if (data) {
      resetForm(event.target, 'person-cancel', 'Añadir persona');
      renderCrm(data);
    }
  } catch (err) { alert(err.message); }
});
$('person-cancel').addEventListener('click', () => resetForm($('person-form'), 'person-cancel', 'Añadir persona'));

$('reach-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = formData(event.target);
  const payload = { kind: raw.kind, where_text: raw.where_text, note: raw.note };
  if (raw.kind === 'grupo' && raw.ref) payload.group_id = Number(raw.ref);
  if (raw.kind === 'persona' && raw.ref) payload.person_id = Number(raw.ref);
  try {
    const data = await crmFetch('/api/admin/crm/reaches', {
      method: 'POST', body: JSON.stringify(payload),
    });
    if (data) {
      event.target.reset();
      renderCrm(data);
    }
  } catch (err) { alert(err.message); }
});
$('reach-form').kind.addEventListener('change', () => { if (crm) renderReaches(crm); });

$('groups').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-group]');
  if (edit) {
    const item = crm.groups.find((g) => String(g.id) === edit.dataset.editGroup);
    if (item) fillForm($('group-form'), item, 'group-cancel', 'Guardar grupo');
    return;
  }
  const del = event.target.closest('[data-del-group]');
  if (del && confirm('¿Quitar este grupo?')) {
    const data = await crmFetch(`/api/admin/crm/groups/${del.dataset.delGroup}`, { method: 'DELETE' });
    if (data) renderCrm(data);
  }
});

$('people').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-person]');
  if (edit) {
    const item = crm.people.find((p) => String(p.id) === edit.dataset.editPerson);
    if (item) fillForm($('person-form'), item, 'person-cancel', 'Guardar persona');
    return;
  }
  const del = event.target.closest('[data-del-person]');
  if (del && confirm('¿Quitar a esta persona?')) {
    const data = await crmFetch(`/api/admin/crm/people/${del.dataset.delPerson}`, { method: 'DELETE' });
    if (data) renderCrm(data);
  }
});

$('reaches').addEventListener('click', async (event) => {
  const del = event.target.closest('[data-del-reach]');
  if (del && confirm('¿Quitar este alcance?')) {
    const data = await crmFetch(`/api/admin/crm/reaches/${del.dataset.delReach}`, { method: 'DELETE' });
    if (data) renderCrm(data);
  }
});

async function loadCrm() {
  try {
    const data = await crmFetch('/api/admin/crm');
    if (data) renderCrm(data);
  } catch (e) {
    $('goal').innerHTML = '<p class="err" style="padding:18px">No se pudo cargar el CRM.</p>';
  }
}

setTab(crmTab);
setCrmPane(crmPane);
loadCrm();
"""
