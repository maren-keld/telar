# Psicoterapia Lab

Aplicación de escritorio **open source** (AGPL-3.0) para gestión clínica local de salud mental. Stack: **Tauri 2** (Rust) + **HTML/CSS/JS** + **SQLite** + análisis **Python** local.

Funciona **sin servidor**: la base de datos y el análisis de sesiones corren en tu Mac (Apple Silicon) o Windows. Linux en roadmap.

## Características

- **Agenda** de pacientes por estado (en tratamiento, completado, abandonado, archivado)
- **Programa de tratamiento** con sesiones y módulos clínicos modulares
- Módulos iniciales: **Registro inicial**, **Motivo de consulta**, **Neurofeedback**
- **Notas clínicas** por tratamiento
- **Reportes** simples y resultados de sesiones NF
- **Neurofeedback**: BLE nativo (Rust/btleplug) en **macOS y Windows** con Muse 2; FFT en vivo alineada con post-análisis (`src/lib/nf-signal.js`); análisis con `python/analyze_session.py`

## Requisitos (macOS M4)

1. [Rust](https://rustup.rs/) (`rustup default stable`)
2. [Node.js](https://nodejs.org/) 18+ (para CLI de Tauri)
3. Python 3.10+ con dependencias científicas:

```bash
pip install -r python/requirements.txt
```

4. Xcode Command Line Tools (para compilar en macOS):

```bash
xcode-select --install
```

## Instalación y desarrollo

```bash
cd PsicoterapiaLAB
# Rust (si falta): curl --proto '=https' -tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
cargo install tauri-cli --version "^2" --locked   # solo la primera vez

pip install -r python/requirements.txt
./scripts/build-sidecar.sh   # analizador empaquetado (~80 MB)

./scripts/dev.sh
```

### Desarrollo en Cursor (cambios casi en tiempo real)

**La app no se embebe dentro del editor de Cursor** (no es una extensión tipo “preview” de Figma). Es una app de escritorio Tauri: hace falta una **ventana aparte** con base de datos, Bluetooth, etc.

Para CSS/HTML/JS **no recompiles la `.app` cada vez**. Usa solo modo dev:

1. **⌘ + Shift + B** → tarea **Psicoterapia Lab: Dev**, o **F5** / Run and Debug → **Psicoterapia Lab (dev)**, o `./scripts/dev.sh`
2. Se abre la ventana de **Psicoterapia Lab** (déjala abierta).
3. Editas y **guardas** en `src/` → la ventana **se recarga sola** (~¼ s). Si no, **Cmd+R** en esa ventana.
4. Cambios en **Rust** (`src-tauri/`): detén dev y vuelve a lanzar.

Vista previa **solo visual** (sin base de datos ni Tauri): con dev corriendo, panel **Simple Browser** en Cursor → `http://127.0.0.1:1420` (útil para maquetar CSS; la agenda/DB no funcionará ahí).

### Ejecutable (.app en Mac) — solo para probar el build final

Tras cambios en `src/`, si quieres la `.app` empaquetada (no para el día a día del CSS):

```bash
./scripts/build-app.sh
./scripts/open-app.sh
```

Solo existe **una** copia en el proyecto: `dist/Psicoterapia Lab.app` (evita abrir la de `src-tauri/target/`, ya no se deja ahí).

Opcional en Aplicaciones (un solo icono):

```bash
./scripts/install-app.sh
```

El `.app` incluye el analizador Python empaquetado; **no necesitas pip** en la máquina donde solo ejecutas la app.

Esto abre la ventana nativa, sirve el frontend en `http://127.0.0.1:1420` y aplica migraciones SQLite automáticamente.

## Build de producción

```bash
npm run build
```

El `.app` / instalador queda en `src-tauri/target/release/bundle/`.

### Bluetooth (macOS y Windows)

Neurofeedback usa **BLE nativo** (`src-tauri/src/muse_ble.rs`) vía `btleplug`. Solo **Muse 2** está soportado (Muse S y otros modelos no). Concede permiso Bluetooth cuando el sistema lo solicite.

En macOS la app declara uso de Bluetooth en `src-tauri/Info.plist`.

### Análisis Python

Tras grabar una sesión, Rust invoca:

```bash
python3 python/analyze_session.py   # stdin = datos @ separados
```

Variables opcionales:

- `PSICOTERAPIA_PYTHON` — ruta al binario Python
- `PSICOTERAPIA_ANALYZE_SCRIPT` — ruta al script de análisis

## Estructura del proyecto

```
src/                 # UI (agenda, ficha, módulos)
src/lib/             # Muse.js, nf-session, nf-signal (filtros + bandas EEG)
src-tauri/           # Rust, SQLite, comando analyze_*
python/              # analyze_session.py (scipy/pandas)
```

## Datos

SQLite: `psicoterapia.db` en el directorio de datos de la app (Tauri SQL plugin).

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](LICENSE).
