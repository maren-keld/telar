/** PCL-5 — DSM-5 TEPT (20 ítems, escala 0–4, último mes). */

export const PCL5_TOTAL = 20;
export const PCL5_PROBABLE_CUTOFF = 31;

export function computePcl5Scores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let total = 0;
  let answered = 0;
  for (let i = 0; i < PCL5_TOTAL; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (Number.isNaN(v)) continue;
    total += v;
    answered += 1;
  }
  const complete = answered === PCL5_TOTAL;
  const probablePtsd = complete && total >= PCL5_PROBABLE_CUTOFF;
  return {
    total: answered ? total : null,
    answered,
    complete,
    probablePtsd,
  };
}

export function pcl5ScreenLabel(probablePtsd) {
  if (probablePtsd === null || probablePtsd === undefined) return '—';
  return probablePtsd
    ? 'Tamizaje consistente con TEPT (≥31)'
    : 'Por debajo del punto de corte (31)';
}

export function pcl5Summary(data) {
  const answers = data?.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const s = computePcl5Scores(answers);
  return {
    total: s.total,
    probablePtsd: s.probablePtsd,
    screenLabel: s.complete ? pcl5ScreenLabel(s.probablePtsd) : null,
  };
}
