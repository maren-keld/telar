/**
 * Librería de elementos por eje (mismo rol que la librería de módulos).
 */
import { SPACE_CHECK_DESCRIPTIONS } from './space-check-descriptions.js';
import {
  AXIS_MODULE_HINTS,
  CASE_STUDY_AXES,
  SUPPORT_NETWORK_KIND,
  SUPPORT_NETWORK_TITLE,
} from './case-study-model.js';

/** Semillas del módulo Diagnóstico (indicadores/objetivos/puntajes asociados). */
const PROBLEM_LIBRARY = [
  {
    title: 'Ansiedad alta',
    indicators: [
      'Puntaje moderado o alto en dimensión de ansiedad en DASS-21',
      'Percepción de ansiedad alta',
      'Preocupaciones que afectan la vida cotidiana',
    ],
    objectives: ['Reducir niveles de ansiedad'],
  },
  {
    title: 'Estado de ánimo bajo',
    indicators: [
      'Puntaje moderado o alto en dimensión de depresión en DASS-21',
      'Percepción de ánimo bajo',
    ],
    objectives: ['Mejorar estado de ánimo'],
  },
  {
    title: 'TDAH en adultos',
    indicators: ['ASRS Parte A ≥4/6', 'Dificultades sostenidas de atención e impulsividad'],
    objectives: ['Mejorar autorregulación atencional', 'Implementar estrategias compensatorias'],
  },
  {
    title: 'Estrés alto',
    indicators: ['Puntaje moderado o alto en dimensión de estrés en DASS-21'],
    objectives: ['Reducir niveles de estrés'],
  },
  {
    title: 'Estrés postraumático',
    indicators: ['PCL-5 ≥31', 'Intrusiones, evitación o hiperactivación'],
    objectives: ['Reducir síntomas de impacto traumático', 'Fortalecer regulación emocional'],
  },
  {
    title: 'Pensamientos recurrentes',
    indicators: ['Pensamientos/compulsiones obsesivas', 'Deterioro en las actividades diarias'],
    objectives: ['Reducir pensamientos obsesivos o compulsivos', 'Aumentar flexibilidad cognitiva'],
  },
  {
    title: 'Fobia específica',
    indicators: [
      'Evitación persistente del objeto temido',
      'Respuesta inmediata de miedo o ansiedad ante la exposición',
      'Duración de síntomas por 6 meses o más',
    ],
    objectives: [
      'Reducir o eliminar el miedo o la ansiedad',
      'Aumentar gradualmente la exposición al objeto temido',
      'Desarrollar habilidades de afrontamiento para manejar y reducir el miedo',
    ],
  },
  {
    title: 'Duelo extendido',
    indicators: ['Duración prolongada de los síntomas de duelo', 'Deterioro en las actividades diarias'],
    objectives: ['Procesar y aceptar la pérdida'],
  },
  { title: 'Toma de decisiones', indicators: ['Dificultad para la toma de decisiones'], objectives: ['Mejorar las habilidades para la toma de decisiones'] },
  {
    title: 'Suicidalidad',
    indicators: [
      'Expresiones verbales de desesperanza o inutilidad',
      'Establecer un plan suicida',
      'Intentos previos recientes',
      'Búsqueda de aislamiento',
    ],
    objectives: [
      'Estar libre de pensamientos suicidas',
      'Conocer habilidades de afrontamiento para manejar pensamientos suicidas',
    ],
  },
  { title: 'Insomnio' },
  { title: 'Uso problemático de sustancias' },
  { title: 'Conflictos de pareja' },
  { title: 'Dificultades relacionales' },
];

const OTHER_LIBRARY = [
  'Hipótesis de trabajo',
  'Contexto sociocultural',
  'Comorbilidad médica',
  'Preferencias del paciente',
  'Factores identitarios',
];

/** Defensas maduras → verde; neuróticas → amarillo; primitivas → rojo. */
const DEFENSE_DOT = {
  Anticipación: 'green',
  Sublimación: 'green',
  Altruismo: 'green',
  Humor: 'green',
  Supresión: 'green',
  'Asertividad emocional': 'green',
  'Auto-observación': 'green',
  'Función reactiva funcional': 'green',
  'Actividad imaginativa': 'yellow',
  'Pseudo-altruismo': 'yellow',
  'Formación reactiva': 'yellow',
  Desplazamiento: 'yellow',
  'Aislamiento del afecto': 'yellow',
  Racionalización: 'yellow',
  Intelectualización: 'yellow',
  'Negación parcial': 'yellow',
  'Represión parcial': 'yellow',
  'Disociación leve': 'yellow',
  Somatización: 'yellow',
  Proyección: 'red',
  'Identificación proyectiva': 'red',
  'Splitting (escisión)': 'red',
  'Pasivo-agresividad': 'red',
  Idealización: 'red',
  'Acting out': 'red',
  Negación: 'red',
  'Fantasía evasiva': 'red',
  'Disociación profunda': 'red',
  Regresión: 'red',
};

const AXIS_DOT = {
  problem: 'red',
  resource: 'green',
  risk: 'yellow',
  other: 'muted',
};

function titlesFromDescriptions(category) {
  return Object.keys(SPACE_CHECK_DESCRIPTIONS[category] || {});
}

export function libraryItemsForAxis(axis) {
  if (axis === 'problem') {
    return PROBLEM_LIBRARY.map((item) => ({
      title: item.title,
      description: '',
    }));
  }
  if (axis === 'resource') {
    return titlesFromDescriptions('fortalezas').map((title) => ({
      title,
      description: SPACE_CHECK_DESCRIPTIONS.fortalezas[title] || '',
    }));
  }
  if (axis === 'defense') {
    return titlesFromDescriptions('defensas').map((title) => ({
      title,
      description: SPACE_CHECK_DESCRIPTIONS.defensas[title] || '',
    }));
  }
  if (axis === 'risk') {
    return titlesFromDescriptions('riesgos').map((title) => ({
      title,
      description: SPACE_CHECK_DESCRIPTIONS.riesgos[title] || '',
    }));
  }
  return OTHER_LIBRARY.map((title) => ({ title, description: '' }));
}

export function libraryTitleForAxis(axis) {
  const meta = CASE_STUDY_AXES.find((a) => a.id === axis);
  return meta ? `Librería de ${meta.label.toLowerCase()}` : 'Librería de elementos';
}

export function elementInAxis(elements, axis, title) {
  const want = String(title || '').trim().toLowerCase();
  if (!want) return false;
  return (elements || []).some(
    (el) => el.axis === axis && String(el.title || '').trim().toLowerCase() === want,
  );
}

export function namedSupportPeople(caseStudy) {
  const network = (caseStudy?.elements || []).find((el) => el.kind === SUPPORT_NETWORK_KIND);
  const people = network?.people?.length ? network.people : caseStudy?.supportPeople || [];
  return people.filter((p) => String(p.name || '').trim());
}

export function summaryDotTone(element) {
  if (!element || element.kind === SUPPORT_NETWORK_KIND) return null;
  if (element.axis === 'defense') return DEFENSE_DOT[element.title] || 'yellow';
  return AXIS_DOT[element.axis] || 'muted';
}

export function summaryDotsForAxis(caseStudy, axis) {
  return (caseStudy?.elements || [])
    .filter((el) => el.axis === axis && el.title && el.kind !== SUPPORT_NETWORK_KIND)
    .map((el) => ({
      title: el.title,
      tone: summaryDotTone(el),
      status: el.status || 'unknown',
    }));
}

export function libraryPresetFor(axis, title) {
  const want = String(title || '').trim().toLowerCase();
  if (!want) return null;
  if (axis === 'problem') {
    return PROBLEM_LIBRARY.find((item) => item.title.toLowerCase() === want) || null;
  }
  return null;
}

const MODULE_ESTUDIO_LINKS = {
  gad7: { axis: 'problem', element: 'Ansiedad alta' },
  dass21: { axis: 'problem', element: 'Estado de ánimo bajo' },
  asrs: { axis: 'problem', element: 'TDAH en adultos' },
  pcl5: { axis: 'problem', element: 'Estrés postraumático' },
  sprint_ecl: { axis: 'problem', element: 'Estrés postraumático' },
  iesr: { axis: 'problem', element: 'Estrés postraumático' },
  tcc_preocupaciones: { axis: 'problem', element: 'Ansiedad alta' },
  tcc_registro_pensamientos: { axis: 'problem', element: 'Pensamientos recurrentes' },
  tcc_abc: { axis: 'problem', element: 'Pensamientos recurrentes' },
  tcc_exposicion: { axis: 'problem', element: 'Fobia específica' },
  tcc_plan_seguridad: { axis: 'risk', element: 'Suicidalidad' },
  tcc_estres: { axis: 'problem', element: 'Estrés alto' },
  eed: { axis: 'defense', element: '' },
  ades: { axis: 'defense', element: 'Disociación profunda' },
  rosenberg: { axis: 'resource', element: 'Autocuidado' },
  qols: { axis: 'resource', element: 'Autocuidado' },
  tcc_gratitud: { axis: 'resource', element: 'Capacidad de disfrute' },
  tcc_activacion: { axis: 'resource', element: 'Estructura diaria / disciplina' },
  tcc_autoconceptos: { axis: 'resource', element: 'Autocuidado' },
  tcc_sesgos: { axis: 'defense', element: 'Racionalización' },
  tcc_socratico: { axis: 'defense', element: 'Intelectualización' },
  tcc_flexibilidad: { axis: 'defense', element: 'Humor' },
  nota_sesion: { axis: 'other', element: '' },
  tcc_prevencion_recaida: { axis: 'other', element: 'Hipótesis de trabajo' },
  redes_apoyo: { axis: 'resource', element: 'Red de apoyo (emocional)' },
};

export function estudioRelationForModule(type) {
  const explicit = MODULE_ESTUDIO_LINKS[type];
  if (explicit) {
    const axis = CASE_STUDY_AXES.find((a) => a.id === explicit.axis);
    return {
      axis: explicit.axis,
      axisLabel: axis?.label || explicit.axis,
      element: explicit.element || '',
    };
  }
  for (const [axisId, types] of Object.entries(AXIS_MODULE_HINTS)) {
    if (types.includes(type)) {
      const axis = CASE_STUDY_AXES.find((a) => a.id === axisId);
      return { axis: axisId, axisLabel: axis?.label || axisId, element: '' };
    }
  }
  return null;
}

const WORD_STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'u',
  'a', 'en', 'con', 'sin', 'por', 'para', 'que', 'se', 'su', 'sus', 'lo', 'le', 'les',
  'es', 'son', 'ser', 'como', 'más', 'mas', 'muy', 'ya', 'no', 'si', 'sí', 'este', 'esta',
  'estos', 'estas', 'ese', 'esa', 'eso', 'aqui', 'aquí', 'aún', 'aun', 'the', 'of', 'and',
  'notas', 'nota', 'clínicas', 'clinicas', 'elemento', 'sesión', 'sesion', 'caso',
]);

function pushWords(bucket, raw) {
  String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9áéíóúñü]+/i)
    .forEach((word) => {
      const w = word.trim();
      if (w.length < 3 || WORD_STOP.has(w)) return;
      bucket.set(w, (bucket.get(w) || 0) + 1);
    });
}

export function essentialWordsFromCaseStudy(caseStudy, limit = 24) {
  const bucket = new Map();
  for (const el of caseStudy?.elements || []) {
    if (el.kind === SUPPORT_NETWORK_KIND) {
      pushWords(bucket, 'red apoyo');
      (el.people || []).forEach((p) => pushWords(bucket, p.relation));
      continue;
    }
    pushWords(bucket, el.title);
    pushWords(bucket, el.notes);
    for (const key of ['manifestations', 'indicators', 'objectives', 'evidence']) {
      (el[key] || []).forEach((item) => pushWords(bucket, item?.text || item));
    }
  }
  return [...bucket.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

export { SUPPORT_NETWORK_TITLE, DEFENSE_DOT };
