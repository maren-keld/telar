# Guía de desarrollo — Telar

Documentación técnica para quien compila, modifica o contribuye al código. Si buscas **uso clínico**, empieza por el [README](../README.md) y el [Manual clínico](Manual%20Telar%202026.md).

**Stack:** Tauri 2 (Rust) · HTML/CSS/JS · SQLite (SQLCipher) · sidecar Python (PyInstaller) · **macOS y Windows** (dev prioritario en Apple Silicon)

---

## Requisitos

1. [Rust](https://rustup.rs/) (`rustup default stable`)
2. [Node.js](https://nodejs.org/) 18+
3. Python 3.10+:

```bash
pip install -r python/requirements.txt
```

4. macOS: Xcode Command Line Tools (`xcode-select --install`)

---

## Primer arranque

```bash
cd telar   # o la carpeta local del repo
source "$HOME/.cargo/env"   # si Rust recién instalado
cargo install tauri-cli --version "^2" --locked   # solo la primera vez

pip install -r python/requirements.txt
./scripts/build-sidecar.sh   # analizador empaquetado (~80 MB)

./scripts/dev.sh
```

---

## Desarrollo en Cursor

La app es **ventana Tauri aparte** (DB, Bluetooth, etc.), no preview embebido en el editor.

1. `./scripts/dev.sh` o tarea **Telar: Dev** (⌘⇧B / F5)
2. Edita `src/` → la ventana recarga sola (~¼ s) o **Cmd+R**
3. Cambios en `src-tauri/`: reinicia dev

Vista solo CSS (sin DB): Simple Browser → `http://127.0.0.1:1420` con dev corriendo.

---

## Build `.app` (Mac)

Tras cambios en `src/`:

```bash
./scripts/build-app.sh
./scripts/open-app.sh
```

Copia canónica: **`dist/Telar.app`**. No uses `src-tauri/target/.../Telar.app`.

Instalar en Aplicaciones: `./scripts/install-app.sh`

La `.app` incluye el sidecar Python; no hace falta pip en la máquina destino.

Iteración UI: `./scripts/finish-iteration.sh` tras cambios en `src/`.

---

## Build producción (alternativo)

```bash
npm run build
```

Salida en `src-tauri/target/release/bundle/`.

---

## Bluetooth / Muse

- BLE nativo: `src-tauri/src/muse_ble.rs` (`btleplug`)
- Solo **Muse 2**
- macOS: permisos en `src-tauri/Info.plist`
- Frontend: `src/lib/muse-native.js`, `nf-signal.js`, `neurofeedback.js`

---

## Análisis Python

Post-grabación NF, Rust invoca:

```bash
python3 python/analyze_session.py   # stdin = datos @ separados
```

Variables opcionales:

- `TELAR_PYTHON`
- `TELAR_ANALYZE_SCRIPT`

Sidecar empaquetado: `./scripts/build-sidecar.sh` → `src-tauri/binaries/analyze_session-*`

---

## Estructura

```
src/                 UI (agenda, ficha, módulos, ajustes)
src/lib/             Muse, nf-session, nf-signal, nf-audio
src-tauri/           Rust, SQLite, BLE, secure_db, migraciones
python/              analyze_session.py
server/              API suscripciones Mercado Pago (Render)
docs/                Manual, SCRUM, legal
scripts/             dev, build, sidecar
```

---

## Datos locales

- DB cifrada: `telar.enc.db` en Application Support (`cl.telarapp.desktop`)
- **No tocar** la DB de usuario salvo petición explícita en desarrollo
- Migraciones: `src-tauri/migrations/`

---

## Backlog y reglas

- **Workflow agentes (Cursor, Claude Code, etc.):** [WORKFLOW.md](WORKFLOW.md)
- Prioridades: [SCRUM.md](SCRUM.md)
- Tras cerrar tareas: ver checklist en WORKFLOW.md
- Automations Cursor: [CURSOR-AUTOMATIONS.md](CURSOR-AUTOMATIONS.md)

---

## Licencia

[AGPL-3.0](../LICENSE)
