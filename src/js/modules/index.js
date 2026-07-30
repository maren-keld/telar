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
