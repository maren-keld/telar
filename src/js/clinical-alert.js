import { parseJsonSafe } from './utils.js';

/** Ítems de perfil que cuentan como riesgo vital / suicida. */
export const VITAL_RISK_LABELS = [
  'Ideación suicida',
  'Plan suicida',
  'Intentos previos',
  'Acceso a medios de autosión',
  'Autolesiones',
];

const FER_SELF_HARM_INDEX = 6; // primer ítem de riesgos FER
const FER_ALERT_MIN = 2; // «A veces» o más

export function ferSelfHarmAlert(answers) {
  const v = Number(answers?.[FER_SELF_HARM_INDEX]);
  return Number.isFinite(v) && v >= FER_ALERT_MIN;
}

export function sprintSuicideAlert(answers) {
  return Number(answers?.[11]) === 1;
}

export function motivoUrgenciaAlta(data) {
  return String(data?.urgencia || '').toLowerCase() === 'alta';
}

/**
 * Motivos de alerta automática: urgencia alta, escalas de riesgo o checks vitales.
 * No es un tag editable.
 */
export function clinicalAlertReasons({ urgencia, sprintAnswers, ferAnswers, spaceLabels } = {}) {
  const reasons = [];
  if (motivoUrgenciaAlta({ urgencia })) reasons.push('Urgencia alta en la anamnesis');
  if (sprintSuicideAlert(sprintAnswers)) reasons.push('SPRINT-E: ítem de riesgo suicida');
  if (ferSelfHarmAlert(ferAnswers)) reasons.push('Escala FER: autolesiones o daño a sí mismo');
  for (const label of spaceLabels || []) {
    if (VITAL_RISK_LABELS.includes(label) && !reasons.includes(label)) reasons.push(label);
  }
  return reasons;
}

export function treatmentIsClinicalAlert(opts = {}) {
  return clinicalAlertReasons(opts).length > 0;
}

export function clinicalAlertReasonsFromModules(moduleRows, spaceLabels = []) {
  let urgencia = '';
  let sprintAnswers;
  let ferAnswers;
  for (const row of moduleRows || []) {
    const data = typeof row.data === 'string' ? parseJsonSafe(row.data, {}) : row.data || {};
    if (row.module_type === 'motivo_consulta') urgencia = data.urgencia || urgencia;
    if (row.module_type === 'sprint_ecl') sprintAnswers = data.answers;
    if (row.module_type === 'escala_fer') ferAnswers = data.answers;
  }
  return clinicalAlertReasons({ urgencia, sprintAnswers, ferAnswers, spaceLabels });
}

export function clinicalAlertFromModules(moduleRows, spaceLabels = []) {
  return clinicalAlertReasonsFromModules(moduleRows, spaceLabels).length > 0;
}
