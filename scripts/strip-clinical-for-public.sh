#!/usr/bin/env bash
# Prepara working tree para repo público GitHub (motor + demo pack).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> prepare-public-repo: limpiando contenido clínico propietario"

# Índice solo demo
cp src/packs/index.public.json src/packs/index.json

# Quitar packs clínicos de src/packs/
for p in clinical-shared tdah-adulto trauma-regulacion; do
  rm -rf "src/packs/$p"
done

# Quitar handouts clínicos del path público legacy
rm -rf src/assets/handouts
mkdir -p src/assets/handouts
echo '# Handouts clínicos en packs/ (instalador oficial). Ver packs/demo/.' > src/assets/handouts/README.md

# Módulos clínicos — quitar del motor (fallback legacy desactivado en build público)
CLINICAL_MODULES=(
  asrs ades bilateral-stimulation dass21 eed escala-ansiedad escala-fer
  gad7 iesr pcl5 qols rosenberg sprint-ecl
  tcc-activacion tcc-plan-seguridad
)
for m in "${CLINICAL_MODULES[@]}"; do
  rm -f "src/js/modules/${m}.js"
done

# Legacy clinical data en motor — vaciar (packs demo los proveen)
cat > src/js/tcc-handout-defs.js <<'EOF'
/** Stub público — handouts clínicos en packs propietarios / instalador oficial. */
import { getHandoutDef, getSearchExtra, getTccVariables } from './pack-registry.js';

const LEGACY_TCC_HANDOUT_DEFS = {};

export function tccHandoutDef(moduleType) {
  return getHandoutDef(moduleType) || LEGACY_TCC_HANDOUT_DEFS[moduleType] || null;
}

export const TCC_HANDOUT_DEFS = LEGACY_TCC_HANDOUT_DEFS;

export function formatTccHandoutReadable(moduleType, data) {
  const def = tccHandoutDef(moduleType);
  if (!def) return '';
  const d = data || {};
  const parts = [];
  for (const s of def.sections || []) {
    const v = d[s.key];
    if (v == null || v === '') continue;
    parts.push(`${s.title}:\n${String(v).trim()}`);
  }
  return parts.join('\n\n');
}

const LEGACY_TCC_VARIABLES = {};
export function tccVariablesFor(type) {
  return getTccVariables(type) || LEGACY_TCC_VARIABLES[type] || null;
}
export const TCC_VARIABLES = LEGACY_TCC_VARIABLES;

const LEGACY_MODULE_SEARCH_EXTRA = {};
export function moduleSearchBlob(type, def, psych) {
  const handout = tccHandoutDef(type);
  const tags = handout?.searchTags || [];
  const chunks = [def?.label, def?.description, getSearchExtra(type), ...tags];
  return chunks.filter(Boolean).join(' ').toLowerCase();
}
EOF

cat > src/js/module-psychometrics.js <<'EOF'
import { getPsychometric } from './pack-registry.js';
const LEGACY_MODULE_PSYCHOMETRICS = {};
export function psychometricsFor(type) {
  return getPsychometric(type) || LEGACY_MODULE_PSYCHOMETRICS[type] || null;
}
export const MODULE_PSYCHOMETRICS = LEGACY_MODULE_PSYCHOMETRICS;
EOF

cat > src/js/treatment-templates.js <<'EOF'
import { listPrograms, getProgram as getPackProgram } from './pack-registry.js';
export function listTreatmentTemplates() {
  return listPrograms();
}
export function getTreatmentTemplate(id) {
  return getPackProgram(id) || null;
}
export const TREATMENT_TEMPLATES = {};
EOF

"$ROOT/scripts/prepare-public-repo.sh" || true
echo ""
echo "Listo. Revisa git diff antes de commit público."
