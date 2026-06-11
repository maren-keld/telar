import { renderSubjectiveScale } from './subjective-scale.js';

export async function renderEscalaAnsiedad(host, moduleRow, ctx) {
  return renderSubjectiveScale(host, moduleRow, {
    title: 'Escala subjetiva de ansiedad',
    subtitle: 'Estimación de los últimos 7 días (1 = muy baja, 100 = muy alta).',
    field: 'anxiety_score',
  });
}
