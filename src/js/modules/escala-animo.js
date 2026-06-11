import { renderSubjectiveScale } from './subjective-scale.js';

export async function renderEscalaAnimo(host, moduleRow, ctx) {
  return renderSubjectiveScale(host, moduleRow, {
    title: 'Escala subjetiva de ánimo',
    subtitle: 'Estimación de los últimos 7 días (1 = muy bajo, 100 = muy alto).',
    field: 'mood_score',
  });
}
