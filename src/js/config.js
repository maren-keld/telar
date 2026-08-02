/**
 * Motor core — metadatos de módulos que no pertenecen a packs clínicos.
 * Los módulos clínicos se registran vía pack-loader → pack-registry.
 */
import { getAllModuleDefs as getPackModuleDefs } from './pack-registry.js';
import { getLegacyModuleDefs } from './legacy-module-defs.js';

export const CORE_MODULE_DEFS = {
  selector_modulo: {
    label: 'Seleccionar módulo',
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
    label: 'Motivo de consulta',
    category: 'conceptualizacion',
    description: 'Razón principal de consulta y expectativas.',
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
  neurofeedback: {
    label: 'Neurofeedback',
    category: 'intervencion',
    description: 'Sesión en vivo con Muse, FFT y análisis local.',
  },
};

/** Core + legacy embebido + packs cargados (pack gana en conflicto). */
export function getModuleDefs() {
  return { ...CORE_MODULE_DEFS, ...getLegacyModuleDefs(), ...getPackModuleDefs() };
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

export const TREATMENT_TAG_DEFS = {
  derivado: { label: 'Derivado', legacyReferral: true },
  necesita_supervision: { label: 'Necesita supervisión', legacySupervised: true },
  estudiar_caso: { label: 'Estudiar más el caso' },
};

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
