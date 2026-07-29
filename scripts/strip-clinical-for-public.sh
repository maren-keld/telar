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

# index.js público — solo módulos core + demo (sin imports a packs clínicos borrados)
cat > src/js/modules/index.js <<'EOF'
/**
 * Registry dinámico de renderers — motor público (pack demo + core).
 */
import { getRenderer, hasModuleType } from '../pack-registry.js';
import { isCustomQuestionnaireType, renderCustomQuestionnaire } from './custom-questionnaire.js';
import { renderMotivoConsulta } from './motivo-consulta.js';
import { renderRegistroInicial } from './registro-inicial.js';
import { renderRedesApoyo } from './redes-apoyo.js';
import { renderDiagnostico } from './diagnostico.js';
import { renderEscalaAnimo } from './escala-animo.js';
import { renderTccAbc } from './tcc-abc.js';
import { renderTccGeneric } from './tcc-generic.js';
import { renderSelectorModulo } from './selector-modulo.js';

const LEGACY_RENDERERS = {
  selector_modulo: renderSelectorModulo,
  registro_inicial: renderRegistroInicial,
  motivo_consulta: renderMotivoConsulta,
  redes_apoyo: renderRedesApoyo,
  diagnostico: renderDiagnostico,
  escala_animo: renderEscalaAnimo,
  tcc_abc: renderTccAbc,
  tcc_socratico: renderTccGeneric,
  tcc_flexibilidad: renderTccGeneric,
  tcc_probabilidades: renderTccGeneric,
  tcc_sesgos: renderTccGeneric,
  tcc_autoconceptos: renderTccGeneric,
  tcc_preocupaciones: renderTccGeneric,
  tcc_gratitud: renderTccGeneric,
  tcc_estres: renderTccGeneric,
};

function resolveRenderer(moduleType) {
  const fromPack = getRenderer(moduleType);
  if (fromPack) return fromPack;
  return LEGACY_RENDERERS[moduleType] || null;
}

export async function renderModule(host, moduleRow, ctx = {}) {
  if (isCustomQuestionnaireType(moduleRow.module_type)) {
    await renderCustomQuestionnaire(host, moduleRow, ctx);
    return;
  }
  const fn = resolveRenderer(moduleRow.module_type);
  if (!fn) {
    host.innerHTML = `<div class="card"><p>Módulo «${moduleRow.module_type}» aún no implementado en esta versión.</p></div>`;
    return;
  }
  await fn(host, moduleRow, ctx);
}

export function isModuleTypeAvailable(moduleType) {
  if (isCustomQuestionnaireType(moduleType)) return true;
  return hasModuleType(moduleType) || Boolean(LEGACY_RENDERERS[moduleType]);
}

export function teardownBilateralStimulation() {}
EOF

python3 <<'PY'
from pathlib import Path
p = Path("tests/frontend/pack-registry.test.js")
t = p.read_text()
t = t.replace("  assert.ok(defs.neurofeedback);\n", "  assert.ok(defs.registro_inicial);\n")
# avoid duplicate assert
t = t.replace("  assert.ok(defs.registro_inicial);\n  assert.ok(defs.registro_inicial);\n", "  assert.ok(defs.registro_inicial);\n")
p.write_text(t)
PY

# module-selector: sin bilateral (pack clínico)
python3 <<'PY'
from pathlib import Path
p = Path("src/js/components/module-selector.js")
t = p.read_text()
t = t.replace(
    "    id: 'intervencion',\n    label: 'Intervención',\n    types: ['bilateral_stimulation'],\n  },",
    "",
)
p.write_text(t)
PY

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

"$ROOT/scripts/strip-motor-extras-for-public.sh"

"$ROOT/scripts/prepare-public-repo.sh"

echo ""
echo "Listo. Revisa git diff antes de commit público."
