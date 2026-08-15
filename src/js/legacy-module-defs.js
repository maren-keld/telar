/**
 * Metadatos de módulos con renderer legacy embebido (sin manifest de pack).
 * Sin esto, el selector queda vacío si los packs clínicos no están en src/packs/.
 */
import { isModuleTypeAvailable } from './modules/index.js';
import { moduleLabelI18n } from './i18n.js';
import { tccHandoutDef } from './tcc-handout-defs.js';

const ONCE_PER_TREATMENT = new Set(['registro_inicial', 'motivo_consulta']);

/** Tipos clínicos con renderer en src/js/modules/ (excl. selector_modulo). */
export const LEGACY_CLINICAL_MODULE_TYPES = [
  'registro_inicial',
  'motivo_consulta',
  'redes_apoyo',
  'diagnostico',
  'neurofeedback',
  'bilateral_stimulation',
  'tcc_abc',
  'tcc_plan_seguridad',
  'tcc_activacion',
  'tcc_socratico',
  'tcc_flexibilidad',
  'tcc_probabilidades',
  'tcc_sesgos',
  'tcc_autoconceptos',
  'tcc_preocupaciones',
  'tcc_gratitud',
  'tcc_estres',
  'dass21',
  'gad7',
  'asrs',
  'pcl5',
  'sprint_ecl',
  'iesr',
  'ades',
  'eed',
  'qols',
  'rosenberg',
  'escala_animo',
  'escala_ansiedad',
  'escala_fer',
];

const FALLBACK_LABELS = {
  bilateral_stimulation: 'Estimulación bilateral (BLS)',
  neurofeedback: 'Neurofeedback',
  dass21: 'DASS-21 — Depresión, ansiedad y estrés',
  gad7: 'GAD-7 — Ansiedad generalizada',
  asrs: 'ASRS v1.1 — TDAH en adultos',
  pcl5: 'PCL-5 — TEPT (DSM-5)',
  sprint_ecl: 'SPRINT-E — TEPT breve',
  iesr: 'IES-R — Impacto de eventos',
  ades: 'ADES — Disociación',
  eed: 'EED — Estilos defensivos',
  qols: 'QOLS — Calidad de vida',
  rosenberg: 'Rosenberg — Autoestima',
  escala_animo: 'Escala de ánimo (VAS)',
  escala_ansiedad: 'Escala de ansiedad (VAS)',
  escala_fer: 'Escala FER',
  redes_apoyo: 'Redes de apoyo',
  diagnostico: 'Diagnósticos',
  registro_inicial: 'Registro inicial',
  motivo_consulta: 'Motivo de consulta',
};

function legacyDefFor(type) {
  const handout = tccHandoutDef(type);
  const intro = handout?.intro?.trim();
  return {
    label: handout?.title || moduleLabelI18n(type, FALLBACK_LABELS[type] || type.replace(/_/g, ' ')),
    description: intro ? intro.split('.')[0] + (intro.includes('.') ? '.' : '') : 'Módulo clínico.',
    oncePerTreatment: ONCE_PER_TREATMENT.has(type) || Boolean(handout),
  };
}

export function getLegacyModuleDefs() {
  const defs = {};
  for (const type of LEGACY_CLINICAL_MODULE_TYPES) {
    if (!isModuleTypeAvailable(type)) continue;
    defs[type] = legacyDefFor(type);
  }
  return defs;
}
