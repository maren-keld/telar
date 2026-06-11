import { renderMotivoConsulta } from './motivo-consulta.js';
import { renderNeurofeedback } from './neurofeedback.js';
import { renderRegistroInicial } from './registro-inicial.js';
import { renderDass21 } from './dass21.js';
import { renderRedesApoyo } from './redes-apoyo.js';
import { renderDiagnostico } from './diagnostico.js';
import { renderEed } from './eed.js';
import { renderQols } from './qols.js';
import { renderEscalaAnimo } from './escala-animo.js';
import { renderEscalaAnsiedad } from './escala-ansiedad.js';
import { renderEscalaFer } from './escala-fer.js';
import { renderRosenberg } from './rosenberg.js';
import { renderSelectorModulo } from './selector-modulo.js';
import { isCustomQuestionnaireType, renderCustomQuestionnaire } from './custom-questionnaire.js';

const RENDERERS = {
  selector_modulo: renderSelectorModulo,
  registro_inicial: renderRegistroInicial,
  motivo_consulta: renderMotivoConsulta,
  neurofeedback: renderNeurofeedback,
  dass21: renderDass21,
  eed: renderEed,
  qols: renderQols,
  escala_animo: renderEscalaAnimo,
  escala_ansiedad: renderEscalaAnsiedad,
  escala_fer: renderEscalaFer,
  rosenberg: renderRosenberg,
  redes_apoyo: renderRedesApoyo,
  diagnostico: renderDiagnostico,
};

export async function renderModule(host, moduleRow, ctx = {}) {
  if (isCustomQuestionnaireType(moduleRow.module_type)) {
    await renderCustomQuestionnaire(host, moduleRow, ctx);
    return;
  }
  const fn = RENDERERS[moduleRow.module_type];
  if (!fn) {
    host.innerHTML = `<div class="card"><p>Módulo «${moduleRow.module_type}» aún no implementado en esta versión.</p></div>`;
    return;
  }
  await fn(host, moduleRow, ctx);
}
