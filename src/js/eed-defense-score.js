/** Correspondencias descriptivas con los reactivos de EED Telar (índices desde 0).
 * No son subescalas validadas: solo resumen las respuestas relacionadas.
 * Las defensas sin un reactivo específico no reciben un puntaje inferido.
 */
export const EED_DEFENSE_ITEMS = {
  'Sublimación': [0],
  'Altruismo': [1],
  'Humor': [2],
  'Anticipación': [3],
  'Asertividad emocional': [4, 6],
  'Auto-observación': [5],
  'Supresión': [7],
  'Racionalización': [9, 10],
  'Intelectualización': [14],
  'Acting out': [15],
  'Desplazamiento': [16],
  'Disociación leve': [17],
  'Regresión': [18],
  'Negación': [19],
  'Proyección': [20],
  'Fantasía evasiva': [21],
  'Somatización': [22],
  'Pasivo-agresividad': [23],
  'Idealización': [24],
  'Splitting (escisión)': [24],
  'Disociación profunda': [25],
};

function normalizedTitle(title) {
  return String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function eedDefenseScore(title, data = {}) {
  const entry = Object.entries(EED_DEFENSE_ITEMS)
    .find(([name]) => normalizedTitle(name) === normalizedTitle(title));
  if (!entry) return { score: null, answered: 0, total: 0, itemNumbers: [], group: '' };
  const indices = entry[1];
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const values = indices.map((index) => answers[index])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  return {
    score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    answered: values.length,
    total: indices.length,
    itemNumbers: indices.map((index) => index + 1),
    group: indices[0] < 8 ? 'adaptive' : indices[0] < 15 ? 'intermediate' : 'maladaptive',
  };
}
