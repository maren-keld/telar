/** SPRINT-E-CL — 11 ítems Likert (0–4) + ítem 12 ideación suicida (no suma). */

export const SPRINT_LIKERT_COUNT = 11;
export const SPRINT_TOTAL_ITEMS = 12;
/** Umbral orientativo de síntomas elevados (validación chilena 27-F). */
export const SPRINT_ELEVATED_CUTOFF = 17;

export function computeSprintScores(answers) {
  const a = Array.isArray(answers) ? answers : [];
  let total = 0;
  let likertAnswered = 0;
  for (let i = 0; i < SPRINT_LIKERT_COUNT; i++) {
    const raw = a[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (Number.isNaN(v)) continue;
    total += v;
    likertAnswered += 1;
  }
  const suicideRaw = a[11];
  const suicideAnswered = suicideRaw !== null && suicideRaw !== undefined && suicideRaw !== '';
  const suicideRisk = suicideAnswered && Number(suicideRaw) === 1;
  const complete = likertAnswered === SPRINT_LIKERT_COUNT;
  const elevated = complete && total >= SPRINT_ELEVATED_CUTOFF;
  return {
    total: likertAnswered ? total : null,
    likertAnswered,
    complete,
    elevated,
    suicideRisk,
    suicideAnswered,
  };
}

export function sprintScreenLabel(elevated) {
  if (elevated === null || elevated === undefined) return '—';
  return elevated ? 'Síntomas elevados (≥17)' : 'Por debajo del umbral (17)';
}

export function sprintSummary(data) {
  const answers = data?.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const s = computeSprintScores(answers);
  return {
    total: s.total,
    elevated: s.elevated,
    suicideRisk: s.suicideRisk,
    screenLabel: s.complete ? sprintScreenLabel(s.elevated) : null,
  };
}
