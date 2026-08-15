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
 * Alerta automática: urgencia alta en motivo, o indicadores de riesgo vital.
 * No es un tag editable.
 */
export function treatmentIsClinicalAlert({ urgencia, sprintAnswers, ferAnswers, spaceLabels } = {}) {
  if (motivoUrgenciaAlta({ urgencia })) return true;
  if (sprintSuicideAlert(sprintAnswers)) return true;
  if (ferSelfHarmAlert(ferAnswers)) return true;
  return (spaceLabels || []).some((label) => VITAL_RISK_LABELS.includes(label));
}

export function clinicalAlertFromModules(moduleRows, spaceLabels = []) {
  let urgencia = '';
  let sprintAnswers;
  let ferAnswers;
  for (const row of moduleRows || []) {
    const data = typeof row.data === 'string' ? parseJsonSafe(row.data, {}) : row.data || {};
    if (row.module_type === 'motivo_consulta') urgencia = data.urgencia || urgencia;
    if (row.module_type === 'sprint_ecl') sprintAnswers = data.answers;
    if (row.module_type === 'escala_fer') ferAnswers = data.answers;
  }
  return treatmentIsClinicalAlert({ urgencia, sprintAnswers, ferAnswers, spaceLabels });
}
