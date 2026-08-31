/**
 * Motor core — metadatos de módulos que no pertenecen a packs clínicos.
 * Los módulos clínicos se registran vía pack-loader → pack-registry.
 */
import { getAllModuleDefs as getPackModuleDefs } from './pack-registry.js';
import { getLegacyModuleDefs } from './legacy-module-defs.js';

export const CORE_MODULE_DEFS = {
  selector_modulo: {
    label: 'Librería de módulos',
    category: 'meta',
    description: 'Elige qué módulo añadir a esta sesión.',
    allowMultipleInSession: false,
  },
  registro_inicial: {
    label: 'Registro inicial',
    category: 'conceptualizacion',
    description: 'Datos demográficos y de contacto del paciente.',
    oncePerTreatment: true,
  },
  motivo_consulta: {
    label: 'Anamnesis',
    category: 'conceptualizacion',
    description: 'Anamnesis de la primera sesión: motivo acotado, expectativas y antecedentes.',
    oncePerTreatment: true,
  },
  redes_apoyo: {
    label: 'Redes de apoyo',
    category: 'conceptualizacion',
    description: 'Mapa de personas, tipo de vínculo y áreas de apoyo.',
  },
  diagnostico: {
    label: 'Diagnósticos',
    category: 'conceptualizacion',
    description: 'Problemas, indicadores y objetivos por tratamiento.',
  },
  nota_sesion: {
    label: 'Nota de sesión',
    category: 'conceptualizacion',
    description:
      'Registro libre de una sesión de seguimiento o acompañamiento. No sustituye escalas ni formulación.',
    oncePerTreatment: false,
    allowMultipleInSession: false,
  },
  neurofeedback: {
    label: 'Neurofeedback',
    category: 'intervencion',
    description: 'Sesión en vivo con Muse, FFT y análisis local.',
  },
};

/** Core + legacy embebido + packs cargados (pack gana en conflicto; demo no pisa lo que ya existe). */
export function getModuleDefs() {
  const packs = getPackModuleDefs();
  const merged = { ...CORE_MODULE_DEFS, ...getLegacyModuleDefs() };
  for (const [type, def] of Object.entries(packs)) {
    if (def?.packId === 'demo' && merged[type]) continue;
    merged[type] = def;
  }
  return merged;
}

export function getModuleDef(type) {
  return getModuleDefs()[type] || null;
}

/** @deprecated Usar getModuleDefs() — conservado para transición mínima. */
export const MODULE_DEFS = CORE_MODULE_DEFS;

export const TREATMENT_STATUS = {
  en_tratamiento: { label: 'En tratamiento', order: 0 },
  en_pausa: { label: 'En pausa', order: 1 },
  completado: { label: 'Completado', order: 2 },
  abandonado: { label: 'Abandonados', order: 3 },
  archivado: { label: 'Archivado', order: 4 },
};

export const TAG_COLOR_PRESETS = [
  { id: 'coral', label: 'Coral', hex: '#e05d4f' },
  { id: 'amber', label: 'Ámbar', hex: '#e8a317' },
  { id: 'mint', label: 'Menta', hex: '#3cb371' },
  { id: 'azure', label: 'Azul', hex: '#4c8dff' },
  { id: 'lilac', label: 'Lila', hex: '#9b7ed9' },
  { id: 'rose', label: 'Rosa', hex: '#e07aa5' },
  { id: 'slate', label: 'Pizarra', hex: '#64748b' },
];

export const TREATMENT_TAG_DEFS = {
  derivado: { label: 'Derivado', legacyReferral: true, glyph: 'derivado', color: '#4c8dff' },
  necesita_supervision: { label: 'Supervisado', legacySupervised: true, glyph: 'supervisado', color: '#9b7ed9' },
  estudiar_caso: { label: 'Necesita más estudio', glyph: 'masEstudio', color: '#e8a317' },
  alerta: { label: 'En alerta', auto: true, glyph: 'alerta', color: '#c4473a' },
};

export function selectableTreatmentTags() {
  return Object.entries(TREATMENT_TAG_DEFS);
}

export const PREVISION_OPTIONS = [
  'Fonasa',
  'Isapre Colmena',
  'Isapre Consalud',
  'Isapre Cruz Blanca',
  'Isapre Nueva Masvida',
  'Isapre Vida Tres',
  'Isapre Banmédica',
  'Particular',
  'Otro',
];

export const NOTE_COLORS = [
  { id: 'teal', label: 'Verde agua', short: 'Ve', class: 'note--teal' },
  { id: 'yellow', label: 'Amarillo', short: 'Am', class: 'note--yellow' },
  { id: 'lavender', label: 'Lavanda', short: 'La', class: 'note--lavender' },
  { id: 'pink', label: 'Rosa', short: 'Ro', class: 'note--pink' },
  { id: 'blue', label: 'Azul', short: 'Az', class: 'note--blue' },
];

export const PATIENT_GENDER_OPTIONS = [
  { id: 'femenino', label: 'Femenino' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'no_binario', label: 'No binario' },
  { id: 'otro', label: 'Otro' },
  { id: 'no_identifica', label: 'No se identifica con ninguno' },
  { id: 'no_dice', label: 'Prefiere no decir' },
];

export function patientGenderLabel(id) {
  if (!id) return '';
  return PATIENT_GENDER_OPTIONS.find((o) => o.id === id)?.label || String(id);
}

export const MARITAL_OPTIONS = [
  'Soltero/a',
  'En una relación',
  'Casado/a',
  'Divorciado/a',
  'Viudo/a',
];

export const EDUCATION_OPTIONS = [
  'Sin estudios formales',
  'Educación básica incompleta',
  'Educación básica completa',
  'Educación media incompleta',
  'Educación media completa',
  'Educación técnica / profesional incompleta',
  'Educación técnica / profesional completa',
  'Educación universitaria incompleta',
  'Educación universitaria completa',
  'Postgrado',
  'Otro',
];

export const SOURCE_OPTIONS = [
  'Recomendación de otro cliente',
  'Redes sociales',
  'Búsqueda web',
  'Derivación profesional',
  'Otro',
];
