/** ASRS v1.1 — scoring WHO (Parte A: tamizaje con 6 ítems). */

export const ASRS_TOTAL = 18;

/** Umbral mínimo por ítem (0–5) para contar como síntoma positivo en Parte A. */
export const ASRS_PART_A_THRESHOLDS = [3, 3, 2, 3, 3, 2];

export function computeAsrsScores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let partAPositive = 0;
  let partAAnswered = 0;
  let total = 0;
  let totalAnswered = 0;

  for (let i = 0; i < ASRS_TOTAL; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (Number.isNaN(v)) continue;
    total += v;
    totalAnswered += 1;
    if (i < 6) {
      partAAnswered += 1;
      if (v >= ASRS_PART_A_THRESHOLDS[i]) partAPositive += 1;
    }
  }

  const screenPositive = partAPositive >= 4;
  return {
    partAPositive,
    partAAnswered,
    screenPositive,
    total: totalAnswered ? total : null,
    totalAnswered,
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
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const s = computeAsrsScores(answers);
  return {
    partAPositive: s.partAPositive,
    screenPositive: s.screenPositive,
    screenLabel: asrsScreenLabel(s.screenPositive),
    total: s.total,
  };
}
