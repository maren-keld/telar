/** ASRS v1.1 — screener WHO (Parte A: 6 ítems). La checklist de 18 ítems no se puntúa. */

export const ASRS_SCREENER_ITEMS = 6;

/** Umbral mínimo por ítem (0–5) para contar como síntoma positivo en Parte A. */
export const ASRS_PART_A_THRESHOLDS = [3, 3, 2, 3, 3, 2];

/** Conserva ítems 7–18 ya guardados; no los muestra ni los puntúa. */
export function mergeAsrsScreenerAnswers(partA, stored) {
  const prev = Array.isArray(stored) ? stored.slice() : [];
  const out = prev.length ? prev : Array(ASRS_SCREENER_ITEMS).fill(null);
  for (let i = 0; i < ASRS_SCREENER_ITEMS; i++) {
    out[i] = partA[i] ?? null;
  }
  return out;
}

export function computeAsrsScores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let partAPositive = 0;
  let partAAnswered = 0;

  for (let i = 0; i < ASRS_SCREENER_ITEMS; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (Number.isNaN(v)) continue;
    partAAnswered += 1;
    if (v >= ASRS_PART_A_THRESHOLDS[i]) partAPositive += 1;
  }

  const screenPositive = partAPositive >= 4;
  return {
    partAPositive,
    partAAnswered,
    screenPositive,
  };
}

export function asrsScreenLabel(screenPositive) {
  if (screenPositive === null || screenPositive === undefined) return '—';
  return screenPositive
    ? 'Tamizaje consistente con TDAH (Parte A)'
    : 'Tamizaje no consistente con TDAH (Parte A)';
}

/** Resumen para PDF / readable_text. */
export function asrsSummary(data) {
  const answers = data?.answers || [];
  if (!answers.slice(0, ASRS_SCREENER_ITEMS).some((v) => v !== null && v !== '')) return null;
  const s = computeAsrsScores(answers);
  return {
    partAPositive: s.partAPositive,
    screenPositive: s.screenPositive,
    screenLabel: asrsScreenLabel(s.screenPositive),
  };
}
