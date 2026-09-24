import { estudioRelationForModule } from './case-study-catalog.js';
import { CATEGORIES } from './module-categories.js';
import { parseJsonSafe } from './utils.js';

const QUANTITATIVE_MODULE_TYPES = new Set(
  (CATEGORIES.find((category) => category.id === 'pruebas')?.types || []).filter(
    (type) => type !== 'medicion_cualitativa',
  ),
);
const INTERVENTION_MODULE_TYPES = new Set(
  CATEGORIES.filter((category) => ['tcc', 'significado', 'intervencion'].includes(category.id))
    .flatMap((category) => category.types),
);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

/** Categorías compactas que alimentan el resumen y la exportación del análisis por ejes. */
export function analysisCategoriesForElement(element, sessions = []) {
  const programTypes = (sessions || [])
    .flatMap((session) => session.modules || [])
    .filter((module) => {
      const data = parseJsonSafe(module.data, {});
      if ((data.elementIds || []).map(String).includes(String(element.id))) return true;
      const relation = estudioRelationForModule(module.module_type);
      return relation?.axis === element.axis && relation.element === element.title;
    })
    .map((module) => module.module_type);
  const quantitative = unique([
    ...(element.quantitativeEvidence || []).map((row) => row.moduleType),
    ...programTypes.filter((type) => QUANTITATIVE_MODULE_TYPES.has(type)),
  ]);
  const qualitative = unique([
    ...(element.qualitativeEvidence || []).map((row) => row.text),
    ...programTypes.filter((type) => type === 'medicion_cualitativa'),
  ]);
  const intervention = unique([
    ...(element.activities || []).map((row) => row.moduleType),
    ...programTypes.filter((type) => INTERVENTION_MODULE_TYPES.has(type)),
  ]);
  return [
    { label: 'Evaluación cuantitativa', values: quantitative, kind: 'module' },
    { label: 'Evaluación cualitativa', values: qualitative, kind: 'moduleOrText' },
    { label: 'Intervención', values: intervention, kind: 'module' },
  ].filter((category) => category.values.length);
}
