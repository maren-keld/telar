/**
 * Librería de elementos por eje (mismo rol que la librería de módulos).
 */
import { SPACE_CHECK_DESCRIPTIONS } from './space-check-descriptions.js';
import { CASE_STUDY_AXES, SUPPORT_NETWORK_KIND, SUPPORT_NETWORK_TITLE } from './case-study-model.js';

const PROBLEM_LIBRARY = [
  'Ansiedad alta',
  'Estado de ánimo bajo',
  'TDAH en adultos',
  'Estrés alto',
  'Estrés postraumático',
  'Pensamientos recurrentes',
  'Fobia específica',
  'Duelo extendido',
  'Toma de decisiones',
  'Suicidalidad',
  'Insomnio',
  'Uso problemático de sustancias',
  'Conflictos de pareja',
  'Dificultades relacionales',
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
    return PROBLEM_LIBRARY.map((title) => ({
      title,
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

export { SUPPORT_NETWORK_TITLE, DEFENSE_DOT };
