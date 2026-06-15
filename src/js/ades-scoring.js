/** A-DES — Adolescent Dissociative Experiences Scale (30 ítems, 0–10). */

export const ADES_TOTAL = 30;
export const ADES_CLINICAL_CUTOFF = 4;

/** Subescalas (índices 0-based). */
export const ADES_AMNESIA_IDX = [1, 4, 7, 11, 14, 21, 26];
export const ADES_ABSORPTION_IDX = [0, 6, 9, 17, 23, 27];
export const ADES_PASSIVE_IDX = [3, 13, 15, 18, 22];
export const ADES_DEPERSONALIZATION_IDX = [2, 5, 8, 10, 12, 16, 19, 20, 24, 25, 28, 29];
export const ADES_TAXON_IDX = [5, 8, 14, 16, 19, 21, 24, 29];

function meanDim(answers, idx) {
  let sum = 0;
  let n = 0;
  for (const i of idx) {
    const v = answers[i];
    if (v === null || v === undefined || v === '') continue;
    sum += Number(v);
    n += 1;
  }
  return n ? sum / n : null;
}

export function computeAdesScores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let sum = 0;
  let answered = 0;
  for (let i = 0; i < ADES_TOTAL; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    sum += Number(raw);
    answered += 1;
  }
  const complete = answered === ADES_TOTAL;
  const mean = answered ? sum / answered : null;
  const totalMean = complete ? sum / ADES_TOTAL : mean;
  const elevated = complete && totalMean >= ADES_CLINICAL_CUTOFF;
  const taxonMean = meanDim(a, ADES_TAXON_IDX);
  const taxonElevated = taxonMean != null && taxonMean >= ADES_CLINICAL_CUTOFF;
  return {
    mean: totalMean,
    answered,
    complete,
    elevated,
    amnesia: meanDim(a, ADES_AMNESIA_IDX),
    absorption: meanDim(a, ADES_ABSORPTION_IDX),
    passive: meanDim(a, ADES_PASSIVE_IDX),
    depersonalization: meanDim(a, ADES_DEPERSONALIZATION_IDX),
    taxonMean,
    taxonElevated,
  };
}

export function adesSeverityLabel(mean) {
  if (mean == null) return '—';
  if (mean < 2) return 'Bajo (0–1,9)';
  if (mean < 3) return 'Leve (2,0–2,9)';
  if (mean < ADES_CLINICAL_CUTOFF) return 'Moderado (3,0–3,9)';
  return `Alto (≥${ADES_CLINICAL_CUTOFF})`;
}

export function adesScreenLabel(elevated) {
  if (elevated === null || elevated === undefined) return '—';
  return elevated
    ? `Disociación clínica (media ≥${ADES_CLINICAL_CUTOFF})`
    : `Por debajo del umbral (${ADES_CLINICAL_CUTOFF})`;
}

export function adesSummary(data) {
  const answers = data?.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const s = computeAdesScores(answers);
  return {
    mean: s.mean,
    amnesia: s.amnesia,
    absorption: s.absorption,
    passive: s.passive,
    depersonalization: s.depersonalization,
    taxonMean: s.taxonMean,
    elevated: s.elevated,
    taxonElevated: s.taxonElevated,
    screenLabel: s.complete ? adesScreenLabel(s.elevated) : null,
    severityLabel: s.complete ? adesSeverityLabel(s.mean) : null,
  };
}
