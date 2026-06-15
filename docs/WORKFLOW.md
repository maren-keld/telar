# Telar — Workflow para agentes de código

Documento **único y versionado** para Cursor, Claude Code, o cualquier asistente.  
**Backlog y prioridades:** [`SCRUM.md`](SCRUM.md) (no duplicar aquí).

---

## Fase actual

**Vertical TDAH + trauma — v1 hecho → validación beta.**

- Producto: consultorio local, seguimiento longitudinal, NF opcional (Muse 2).
- Marketing alineado: `landing/`, `docs/PITCH-1-PAGINA.md`.
- **No implementar** ítems en **Estacionado** de SCRUM salvo petición explícita.

---

## Stack

| Capa | Ubicación |
|------|-----------|
| UI | `src/` (HTML/CSS/JS vanilla) |
| Nativo / DB / BLE | `src-tauri/` (`secure_db.rs`, `muse_ble.rs`) |
| Análisis NF | `python/analyze_session.py` + sidecar PyInstaller |
| Suscripciones (solo cobro) | `server/` — **nunca** datos clínicos |
| Migraciones | `src-tauri/migrations/` |

**Plataformas:** macOS y Windows · **Licencia:** AGPL-3.0 open-core · **NF:** solo Muse 2.

---

## Comandos

```bash
./scripts/dev.sh              # desarrollo (hot-reload UI)
./scripts/finish-iteration.sh # tras cambios en src/: build + dist/Telar.app
./scripts/open-app.sh         # abrir build canónica
./scripts/build-app.sh        # → dist/Telar.app
./scripts/build-sidecar.sh    # sidecar Python (~80 MB)
./scripts/qa-smoke.sh         # smoke tests (analyze_session + secure_db)
```

- Copia canónica del `.app`: **`dist/Telar.app`**. No usar `src-tauri/target/.../Telar.app`.
- UI en dev: **Cmd+R** en ventana Tauri.
- Cambios en `src-tauri/`: reiniciar `./scripts/dev.sh`.

---

## Dos agents en paralelo (Cursor)

Evitar editar los **mismos archivos** a la vez.

| Agente | Carril | Archivos típicos |
|--------|--------|------------------|
| **A — Clínica** | Escalas, plantillas, gráficos, diagnósticos, handouts TCC | `src/js/modules/*.js`, `config.js`, `workspace-scores.js`, `treatment-templates.js` |
| **B — Plataforma / NF / IA** | BLE, export, tests, sidecar, API IA | `readable-text.js`, `muse_ble.rs`, `neurofeedback.js`, `analyze_session.py`, `ai-client.js`, `src-tauri/src/ai_api.rs` |

Prioridades y IDs: ver **En curso** y **Backlog** en [`SCRUM.md`](SCRUM.md).

---

## Al cerrar cualquier tarea de producto

1. Mover ítem a **Hecho** en `docs/SCRUM.md` (o actualizar **En curso**).
2. Añadir línea en **Changelog** con fecha `YYYY-MM-DD`.
3. Si surge deuda nueva → **Deuda técnica** en SCRUM.
4. Si cambia arquitectura → una frase en `README.md`.
5. Tras cambios en `src/` → `./scripts/finish-iteration.sh`.

---

## Estilo de código

- Diff mínimo; no abstracciones ni deps nuevas salvo que se pidan.
- Reutilizar patrones existentes (ej. módulos clínicos → copiar `gad7.js` / `asrs.js`).
- Comentarios solo para lógica no obvia.
- Tests: solo si aportan valor; smoke en `scripts/qa-smoke.sh`.

---

## No hacer sin pedirlo

- Commits / push git.
- Tocar `~/Library/Application Support/cl.telarapp.desktop/telar.db` (o `telar.enc.db`).
- Sync clínico a la nube.
- Ítems **Estacionado** en SCRUM.
- Electron (usar Tauri).

---

## Herramientas

| Herramienta | Qué lee automáticamente |
|-------------|-------------------------|
| **Cursor** | `.cursor/rules/telar-roadmap.mdc` → apunta aquí; skill `telar-scrum` |
| **Claude Code** | `CLAUDE.md` en raíz → apunta aquí |
| **Ambos** | `docs/WORKFLOW.md` + `docs/SCRUM.md` |

Automations solo Cursor: [`CURSOR-AUTOMATIONS.md`](CURSOR-AUTOMATIONS.md).

Guía técnica extendida: [`DESARROLLO.md`](DESARROLLO.md).

---

## Backlog activo (resumen — detalle en SCRUM)

| ID | Tarea |
|----|-------|
| DI-2 | Validar BLE Muse en Windows (hardware real; checklist `DI-2-WINDOWS-BLE.md`) |
| AI-1 | Dock asistente + sidecar Ollama bajo demanda (AI-1a/1b parcial en Hecho) |
| UX-10 | Firma psicólogo en informes PDF |
| MOD-1 | Más módulos alineados TDAH/trauma |

---

## Referencias

- Backlog: [`SCRUM.md`](SCRUM.md)
- Dev: [`DESARROLLO.md`](DESARROLLO.md)
- Privacidad: [`Términos y Condiciones _ Políticas Privacidad _ Telar.md`](Términos%20y%20Condiciones%20_%20Políticas%20Privacidad%20_%20Telar.md)
- Windows BLE: [`DI-2-WINDOWS-BLE.md`](DI-2-WINDOWS-BLE.md)
