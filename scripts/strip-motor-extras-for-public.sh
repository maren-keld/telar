#!/usr/bin/env bash
# Quita del árbol público: neurofeedback/Muse 2, suscripciones Free/Pro y backend de pagos.
# La app completa (releases) conserva todo vía build-release-full.sh + CI con packs bundle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> strip-motor-extras: neurofeedback, suscripciones y backend Pro"

# --- Neurofeedback / Muse 2 ---
rm -f \
  src/js/modules/neurofeedback.js \
  src/js/modules/nf-results.js \
  src/js/export-nf-session.js \
  src/lib/nf-session.js src/lib/nf-bands.js src/lib/nf-fft.js src/lib/nf-signal.js \
  src/lib/nf-audio.js src/lib/nf-config.js src/lib/muse-native.js src/lib/Muse.js src/lib/muse-battery.js \
  python/analyze_session.py \
  src-tauri/src/muse_ble.rs \
  scripts/qa-nf.sh \
  scripts/build-sidecar.sh \
  landing/neurofeedback.html \
  landing/assets/telar-neurofeedback.png
rm -rf landing/assets/curso-nf-v2
rm -f tests/frontend/nf-*.test.js tests/hardware/MUSE2_VALIDATION.md tests/hardware/muse2-validation-template.csv

# Quitar neurofeedback de config e imports (motor público compila sin NF)
python3 <<'PY'
from pathlib import Path
import re

cfg = Path("src/js/config.js")
text = cfg.read_text()
text = re.sub(
    r"\n  neurofeedback: \{[^}]+\},?\n",
    "\n",
    text,
    count=1,
)
cfg.write_text(text)

idx = Path("src/js/modules/index.js")
text = idx.read_text()
text = text.replace("import { renderNeurofeedback } from './neurofeedback.js';\n", "")
text = re.sub(r"\n  neurofeedback: renderNeurofeedback,\n", "\n", text)
idx.write_text(text)

for rel in ("src/js/app.js", "src/js/views/workspace.js"):
    p = Path(rel)
    t = p.read_text()
    t = t.replace("import { teardownNeurofeedback } from './modules/neurofeedback.js';\n", "")
    t = t.replace("import { NF_HELP_MESSAGE, teardownNeurofeedback } from '../modules/neurofeedback.js';\n", "")
    t = t.replace("    teardownNeurofeedback();\n", "")
    t = t.replace(" || mod.module_type === 'neurofeedback'", "")
    t = re.sub(
        r"\n        if \(mod\.module_type === 'neurofeedback'\) \{.*?\n        \}\n",
        "\n",
        t,
        flags=re.DOTALL,
    )
    p.write_text(t)

sel = Path("src/js/components/module-selector.js")
t = sel.read_text()
t = t.replace("    types: ['neurofeedback', 'bilateral_stimulation'],", "    types: ['bilateral_stimulation'],")
sel.write_text(t)

rt = Path("src/js/readable-text.js")
t = rt.read_text()
t = re.sub(r"\nfunction formatNeurofeedback\(d\) \{.*?\n\}\n", "\n", t, flags=re.DOTALL)
t = t.replace("    case 'neurofeedback':\n      return formatNeurofeedback(d);\n", "")
rt.write_text(t)

pdf = Path("src/js/export-treatment-pdf.js")
t = pdf.read_text()
t = t.replace(", getTreatmentReport", "")
t = t.replace("  const nfRecordings = await getTreatmentReport(treatmentId);\n", "")
t = re.sub(r"\n  if \(nfRecordings\.length\) \{.*?\n  \}\n", "\n", t, flags=re.DOTALL)
pdf.write_text(t)

rep = Path("src/js/views/reportes.js")
t = rep.read_text()
t = t.replace(", getTreatmentReport", "")
t = re.sub(
    r"\n  let extraHtml = '';\n  if \(treatmentId\) \{.*?\n  \}\n",
    "\n  const extraHtml = '';\n",
    t,
    flags=re.DOTALL,
)
rep.write_text(t)
PY

# lib.rs público (sin BLE Muse, sidecar NF ni API suscripciones)
python3 <<'PY'
from pathlib import Path
import re

p = Path("src-tauri/src/lib.rs")
t = p.read_text()
for mod in ("muse_ble", "subscription_api", "usage_ping"):
    t = re.sub(rf"mod {mod};\n", "", t)
t = re.sub(
    r"#\[tauri::command\]\nasync fn analyze_neurofeedback_session.*?\n\}\n\nasync fn run_sidecar.*?\n\}\n\nfn run_python_script.*?\n\}\n\n",
    "",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"\nfn resolve_python_binary\(\) -> String \{.*?\n\}\n\nfn resolve_python_script\(\) -> Result<PathBuf, String> \{.*?\n\}\n\n",
    "\n",
    t,
    flags=re.DOTALL,
)
for cmd in (
    "analyze_neurofeedback_session",
    "muse_ble::muse_connect",
    "muse_ble::muse_disconnect",
    "muse_ble::muse_is_native_available",
    "subscription_api::subscription_checkout",
    "subscription_api::subscription_health",
    "subscription_api::subscription_status",
    "usage_ping::usage_ping",
):
    t = re.sub(rf"            {re.escape(cmd)},\n", "", t)
t = t.replace("use tauri_plugin_shell::process::CommandEvent;\n", "")
t = re.sub(r"use std::io::Write;\n", "", t)
t = re.sub(r"use std::process::\{Command, Stdio\};\n", "", t)
p.write_text(t)
PY

# Cargo.toml — sin deps BLE
python3 <<'PY'
from pathlib import Path
import re
p = Path("src-tauri/Cargo.toml")
t = p.read_text()
for dep in ("btleplug", "tokio", "futures", "uuid"):
    t = re.sub(rf'^{dep} = .*$\n', "", t, flags=re.M)
p.write_text(t)
PY

# tauri.conf — sin sidecar ni API suscripciones en CSP
python3 <<'PY'
from pathlib import Path
import re
p = Path("src-tauri/tauri.conf.json")
t = p.read_text()
t = re.sub(r'\n    "externalBin": \["binaries/analyze_session"\],', "", t)
t = t.replace("http://127.0.0.1:5001 http://localhost:5001 ", "")
t = re.sub(r"https://telar-api[^ ]* ", "", t)
p.write_text(t)
PY

# build-app.sh — sin sidecar en build público
sed -i '' '/build-sidecar\.sh/d' scripts/build-app.sh 2>/dev/null || sed -i '/build-sidecar\.sh/d' scripts/build-app.sh

# --- Suscripciones Free/Pro ---
rm -rf server
rm -f render.yaml scripts/deploy-subscription-api.sh
rm -f src-tauri/src/subscription_api.rs src-tauri/src/usage_ping.rs

cat > src/js/subscription-config.js <<'EOF'
/** Stub repo público — suscripciones solo en instalador oficial (Releases). */
export const SUBSCRIPTION_API_PRODUCTION = '';
export const FREE_ACTIVE_PATIENT_LIMIT = 999;
EOF

cat > src/js/subscription.js <<'EOF'
/** Stub repo público — sin backend Mercado Pago en GitHub. */
export function getSubscriptionApiBase() {
  return '';
}
export function clearStaleLocalSubscriptionApiCache() {}
export function initSubscriptionCheckoutWatcher() {}
export function resetLocalSubscriptionState() {}
export function isLocalDevFrontend() {
  return false;
}
export async function maybeSyncProFromServer() {
  return { nowPro: true, changed: false };
}
export async function syncProFromServer() {
  return { nowPro: true, changed: false, revoked: false };
}
EOF

cat > src/js/plan-limits.js <<'EOF'
/** Stub repo público — sin límite Demo en GitHub; gates en instalador oficial. */
import { query } from './db.js';

export const FREE_ACTIVE_PATIENT_LIMIT = 999;

export async function countActivePatients() {
  const [row] = await query(
    `SELECT COUNT(DISTINCT patient_id) AS n FROM treatments WHERE status = 'en_tratamiento'`,
  );
  return Number(row?.n || 0);
}

export async function patientHasActiveTreatment(patientId) {
  if (patientId == null) return false;
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM treatments WHERE patient_id = ? AND status = 'en_tratamiento'`,
    [patientId],
  );
  return Number(row?.n || 0) > 0;
}

export async function getActivePatientUsage() {
  const count = await countActivePatients();
  return { count, limit: Infinity, pro: true, remaining: Infinity };
}

export async function wouldExceedActivePatientLimit() {
  return false;
}

export async function requireActivePatientSlot({ onAllowed } = {}) {
  onAllowed?.();
  return true;
}
EOF

cat > src/js/components/subscribe-pro-modal.js <<'EOF'
/** Stub repo público — modal Pro solo en instalador oficial. */
export function openSubscribeProModal() {}
export async function requireProOrSubscribe({ onAllowed }) {
  onAllowed?.();
  return true;
}
EOF

cat > src/js/usage-ping.js <<'EOF'
/** Stub repo público — ping desactivado (sin backend). */
export async function maybeSendUsagePing() {}
EOF

# settings: quitar UI de plan Pro
python3 <<'PY'
from pathlib import Path
import re
p = Path("src/js/views/settings.js")
t = p.read_text()
t = t.replace("import { openSubscribeProModal } from '../components/subscribe-pro-modal.js';\n", "")
t = t.replace("import { FREE_ACTIVE_PATIENT_LIMIT, getActivePatientUsage } from '../plan-limits.js';\n", "")
t = t.replace(", isProUser", "")
t = t.replace("import { syncProFromServer, resetLocalSubscriptionState, isLocalDevFrontend } from '../subscription.js';\n", "")
t = re.sub(
    r"  let planUsageSub = .*?\n  \} catch \{\n    /\* DB aún no disponible \*/\n  \}\n",
    "",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"\n        <button type=\"button\" class=\"settings-card settings-card--plan\".*?\n        \}\n        <div class=\"settings-card\">",
    "\n        <div class=\"settings-card\">",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"\n  syncProFromServer\(\)\.then\(\(\{ changed, revoked \}\) => \{.*?\n  \}\);\n",
    "\n",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"\n  container\.querySelector\('#btn-settings-plan'\).*?\n  \}\);\n",
    "\n",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"\n  container\.querySelector\('\[data-field=\"resetSubscription\"\]'\).*?\n  \}\);\n",
    "\n",
    t,
    flags=re.DOTALL,
)
t = re.sub(
    r"  container\.querySelector\('\[data-field=\"backupCloud\"\]'\)\?\.addEventListener\('click', \(\) => \{\n    if \(!isProUser\(\)\) \{\n      openSubscribeProModal\(\);\n      return;\n    \}\n    toast\('Respaldo en la nube",
    "  container.querySelector('[data-field=\"backupCloud\"]')?.addEventListener('click', () => {\n    toast('Respaldo en la nube",
    t,
)
t = t.replace("  'resetSubscription',\n", "")
p.write_text(t)
PY

# sidebar: sin badge Pro
python3 <<'PY'
from pathlib import Path
import re
p = Path("src/js/components/app-sidebar.js")
t = p.read_text()
t = t.replace("import { isProUser } from '../profile.js';\n", "")
t = t.replace("import { ICON_PRO } from '../icons.js';\n", "")
t = re.sub(
    r"\n  const proBadge = isProUser\(\).*?\n    : '';\n",
    "\n",
    t,
    flags=re.DOTALL,
)
t = t.replace("${proBadge}", "")
p.write_text(t)
PY

# landing: sin NF, planes Demo/Pro ni footnote open-core confusa
python3 <<'PY'
from pathlib import Path
import re
p = Path("landing/index.html")
t = p.read_text()
t = t.replace('        <a href="neurofeedback.html">Neurofeedback</a>\n', "")
t = t.replace('        <a href="#demo">Demo</a>\n        <a href="#planes">Planes</a>\n', "")
t = re.sub(r"\n    <section id=\"demo\" class=\"demo-section\">.*?\n    </section>\n", "\n", t, flags=re.DOTALL)
t = re.sub(
    r"\n          <article class=\"feature-card feature-card--shot\">.*?\n          </article>\n",
    "\n",
    t,
    count=1,
    flags=re.DOTALL,
)
t = re.sub(r"\n    <section id=\"planes\" class=\"pricing-section\">.*?\n    </section>\n", "\n", t, flags=re.DOTALL)
t = re.sub(r"\n            <p class=\"req-platform-note\"><strong>Muse 2.*?</p>\n", "\n", t, flags=re.DOTALL)
t = t.replace(
    "Internet no es necesario para el día a día clínico. Solo para verificar suscripción Pro o recibir actualizaciones si las activas.",
    "Internet no es necesario para el día a día clínico. Solo para recibir actualizaciones si las activas.",
)
t = t.replace(
    "Los instaladores están en <a href=\"https://github.com/maren-keld/telar/releases/latest\" target=\"_blank\" rel=\"noopener\">GitHub Releases</a> (app lista para usar, con packs clínicos). El <a href=\"https://github.com/maren-keld/telar\" target=\"_blank\" rel=\"noopener\">repositorio</a> es solo el código del motor (AGPL-3.0).",
    "Descarga la app completa desde <a href=\"https://github.com/maren-keld/telar/releases/latest\" target=\"_blank\" rel=\"noopener\">GitHub Releases</a>.",
)
t = t.replace('        <a href="neurofeedback.html">Neurofeedback</a>\n', "")
p.write_text(t)

priv = Path("landing/privacidad.html")
pt = priv.read_text()
pt = pt.replace(
    "<p>Internet se usa solo si activas el Plan Profesional (verificación de suscripción con el proveedor de pagos), si descargas una actualización de la app, o si mantienes activo el <strong>contador anónimo de uso</strong> (solo versión de app, 1× al día, sin IP ni datos clínicos; activado por defecto, desactivable en Ajustes).</p>\n    <p>La señal EEG de Neurofeedback se guarda cifrada solo en el computador del profesional; informa al paciente antes de grabar.</p>",
    "<p>Internet se usa solo si descargas una actualización de la app.</p>",
)
priv.write_text(pt)
PY

# Tests que no aplican al motor público
rm -f tests/frontend/subscription.test.js tests/frontend/plan-limits.test.js

# CI público (sin pytest suscripciones ni QA NF)
cat > .github/workflows/ci.yml <<'EOF'
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  frontend-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install JavaScript dependencies
        run: npm ci

      - name: Frontend unit tests
        run: npm run test:frontend

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: Browser E2E
        run: npm run test:e2e

  rust:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Rust tests
        run: cargo test --manifest-path src-tauri/Cargo.toml --lib
EOF

# README público
cat > README.md <<'EOF'
# Telar

App de escritorio (macOS y Windows) para gestión clínica local. Los datos del consultorio se guardan **cifrados en tu equipo**.

**Sitio:** [telarapp.cl](https://telarapp.cl) · **Licencia motor:** [AGPL-3.0](LICENSE)

## Qué hay en este repositorio (motor open source)

Este repo contiene el **motor Telar** bajo AGPL-3.0: workspace clínico, base de datos cifrada y pack demo mínimo.

**No incluye** (solo en [instaladores oficiales](https://github.com/maren-keld/telar/releases)):

- Packs clínicos (TDAH, trauma, escalas validadas, handouts TCC)
- Neurofeedback con Muse 2
- Suscripciones Demo/Pro y exportación PDF de programas
- Backend de pagos

## Descargar app completa

[GitHub Releases](https://github.com/maren-keld/telar/releases) — macOS y Windows con todo lo anterior.

## Desarrollo del motor

```bash
npm install
npm run dev
npm run test
./scripts/build-app.sh
```

Pack demo: `src/packs/demo/` (escala subjetiva + ABC).

## Privacidad

[telarapp.cl/privacidad](https://telarapp.cl/privacidad.html)
EOF

echo "==> strip-motor-extras: OK"
