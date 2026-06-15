/** IES-R — Impact of Event Scale Revised (22 ítems, 0–4, últimos 7 días). */

export const IESR_TOTAL = 22;
export const IESR_CLINICAL_CUTOFF = 33;

/** Subescalas Weiss & Marmar (índices 0-based). */
export const IESR_INTRUSION_IDX = [0, 1, 2, 3, 5, 6, 9, 13];
export const IESR_AVOIDANCE_IDX = [4, 8, 11, 12, 16, 17, 18, 20];
export const IESR_HYPERAROUSAL_IDX = [7, 10, 14, 15, 19, 21];

function sumDim(answers, idx) {
  return idx.reduce((acc, i) => {
    const v = answers[i];
    if (v === null || v === undefined || v === '') return acc;
    return acc + Number(v);
  }, 0);
}

export function computeIesrScores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let total = 0;
  let answered = 0;
  for (let i = 0; i < IESR_TOTAL; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    total += Number(raw);
    answered += 1;
  }
  const complete = answered === IESR_TOTAL;
  const intrusion = sumDim(a, IESR_INTRUSION_IDX);
  const avoidance = sumDim(a, IESR_AVOIDANCE_IDX);
  const hyperarousal = sumDim(a, IESR_HYPERAROUSAL_IDX);
  const elevated = complete && total >= IESR_CLINICAL_CUTOFF;
  return {
    total: answered ? total : null,
    answered,
    complete,
    intrusion,
    avoidance,
    hyperarousal,
    elevated,
  };
}

export function iesrScreenLabel(elevated) {
  if (elevated === null || elevated === undefined) return '—';
  return elevated
    ? `Impacto elevado (≥${IESR_CLINICAL_CUTOFF})`
    : `Por debajo del umbral (${IESR_CLINICAL_CUTOFF})`;
}

export function iesrSummary(data) {
  const answers = data?.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const s = computeIesrScores(answers);
  return {
    total: s.total,
    intrusion: s.intrusion,
    avoidance: s.avoidance,
    hyperarousal: s.hyperarousal,
    elevated: s.elevated,
    screenLabel: s.complete ? iesrScreenLabel(s.elevated) : null,
    event: data?.event_label || null,
  };
}
