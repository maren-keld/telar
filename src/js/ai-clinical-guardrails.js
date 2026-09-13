/**
 * F-011 — Guardrails clínicos para IA (edad / escalas / riesgo / fármacos).
 * Tubería Telar: prompt + catálogo filtrado + sanitizePlan. No depende del proveedor.
 */
import { psychometricsFor } from './module-psychometrics.js';

/** Escalas de uso adulto que no deben ir en menores de 18. */
export const ADULT_ONLY_MODULES = new Set([
  'asrs',
  'pcl5',
  'gad7',
  'iesr',
  'phq9',
  'phq_9',
  'oasis',
  'odsis',
]);

/** Alias que a veces inventa la IA → id real del catálogo. */
export const MODULE_ID_ALIASES = {
  sig_autoconceptos: 'tcc_autoconceptos',
};

/** Módulos de exposición / trauma que no van en fases tempranas con riesgo reciente. */
export const EXPOSURE_TRAUMA_MODULES = new Set(['tcc_exposicion', 'bilateral_stimulation', 'sprint_ecl']);

/** Sesiones 1–3 (índice 0–2): bloquear exposición si hay riesgo reciente. */
export const EARLY_SESSION_EXPOSURE_BLOCK = 3;

export function patientAgeFromBirth(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function normalizeModuleId(id) {
  const modId = String(id || '').trim().toLowerCase();
  return MODULE_ID_ALIASES[modId] || modId;
}

/**
 * Señales de hospitalización / ideación / autolesión reciente en el contexto del caso.
 * Heurística sobre texto (notas, motivo, diagnóstico).
 */
export function detectRecentRiskSignals(contextText) {
  const text = String(contextText || '').toLowerCase();
  if (!text.trim()) return false;

  const risk =
    /hospitalizaci[oó]n|ideaci[oó]n\s+suicida|autolesi[oó]n|intento\s+de\s+suicid|pensamientos?\s+suicid|voces\s+en\s+crisis|\bhosp\.?\b/.test(
      text,
    );
  if (!risk) return false;

  const recency =
    /202[4-9]|reciente|últim[oa]s?\s+(mes|semana|día|año)|hace\s+pocos|mayo|agosto|enero|febrero|marzo|abril|junio|julio|septiembre|octubre|noviembre|diciembre/.test(
      text,
    );
  return recency;
}

export function isAdultOnlyModule(moduleId) {
  return ADULT_ONLY_MODULES.has(normalizeModuleId(moduleId));
}

export function isModuleAllowedForPatient(moduleId, { patientAge, recentRisk, sessionIndex } = {}) {
  const id = normalizeModuleId(moduleId);
  if (patientAge != null && patientAge < 18 && ADULT_ONLY_MODULES.has(id)) {
    return { allowed: false, reason: 'escala_adulta' };
  }
  if (
    recentRisk &&
    sessionIndex != null &&
    sessionIndex < EARLY_SESSION_EXPOSURE_BLOCK &&
    EXPOSURE_TRAUMA_MODULES.has(id)
  ) {
    return { allowed: false, reason: 'exposicion_precoce' };
  }
  return { allowed: true };
}

export function filterModulesByGuardrails(modules, guardrails, sessionIndex) {
  const kept = [];
  const blocked = [];
  for (const rawId of modules) {
    const id = normalizeModuleId(rawId);
    const check = isModuleAllowedForPatient(id, { ...guardrails, sessionIndex });
    if (!check.allowed) {
      blocked.push({ id, reason: check.reason });
    } else {
      kept.push(id);
    }
  }
  return { modules: kept, blocked };
}

/** Catálogo de módulos filtrado por edad (pre-request). */
export function filterModuleIdsForCatalog(moduleIds, patientAge) {
  if (patientAge == null || patientAge >= 18) return moduleIds;
  return moduleIds.filter((id) => !isAdultOnlyModule(id));
}

export function buildClinicalGuardrailsPrompt({ patientAge, recentRisk } = {}) {
  const lines = ['GUARDRAILS CLÍNICOS (F-011)'];

  if (patientAge == null) {
    lines.push(
      '- Si la edad es menor de 18 o no está clara, no recomiendes ASRS, PCL-5, GAD-7, PHQ-9, OASIS, ODSIS ni SPRINT-E-CL como primera línea.',
    );
  } else if (patientAge < 18) {
    lines.push(
      `Paciente ~${patientAge} años (<18): NO uses ASRS, PCL-5, GAD-7, PHQ-9, OASIS, ODSIS ni IES-R como escalas principales.`,
      'Prefiere SNAP-IV/Conners/ADHD-RS (TDAH), RCADS/SCARED/CDI-MFQ (ánimo/ansiedad), CPSS/CRIES (trauma), ADES si aplica.',
    );
  }

  if (recentRisk) {
    lines.push(
      'Hay señales de hospitalización, ideación o autolesión reciente: prioriza estabilización y plan de seguridad (tcc_plan_seguridad).',
      'NO programes exposición a trauma, tcc_exposicion ni SPRINT-E-CL en las primeras 3 sesiones.',
    );
  }

  lines.push(
    '- Ante fármacos: solo «coordinar con psiquiatría»; nunca pautar baja, suspensión ni deprescripción.',
    '- Neurofeedback es adyuvante, no tratamiento principal de TDAH.',
    '- Si el relato trae fortalezas (cocina, arte, deporte, música…), inclúyelas como recursos en el plan.',
    '- Estructura por FASES (estabilización → habilidades → consolidación), no menú rígido de 12 módulos.',
    '- No etiquetes trastornos de personalidad en adolescentes desde el relato parental.',
  );

  return lines.join('\n');
}

/** ageRange del módulo indica solo adultos (≥ 18). */
export function moduleMinAgeFromPsychometrics(moduleId) {
  const psych = psychometricsFor(moduleId);
  const range = String(psych?.ageRange || '').toLowerCase();
  if (!range) return null;
  if (/adultos?\s*\(\s*≥\s*18|adultos?\s*≥\s*18|16\s*años\s*en\s*adelante/.test(range)) return 18;
  if (/adultos?\s*expuestos|adultos?\s*≥/.test(range) && !/adolescentes/.test(range)) return 18;
  const m = range.match(/≥\s*(\d+)/);
  if (m) return Number(m[1]);
  if (/desde\s*12|≥\s*12|10–21|adolescentes/.test(range)) return 10;
  if (/todas las edades/.test(range)) return 0;
  return null;
}
