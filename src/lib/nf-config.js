/** Preferencias NF (localStorage). */

const BASELINE_KEY = 'telar_nf_baseline_sec';
export const NF_BASELINE_OPTIONS_SEC = [120, 150, 180];
const DEFAULT_BASELINE_SEC = 150;
/** Mínimo recomendado antes de entrenar sin aviso fuerte. */
export const NF_BASELINE_SKIP_CONFIRM_SEC = 60;

export function getNfBaselineSec() {
  const n = Number(localStorage.getItem(BASELINE_KEY));
  return NF_BASELINE_OPTIONS_SEC.includes(n) ? n : DEFAULT_BASELINE_SEC;
}

export function setNfBaselineSec(sec) {
  const n = Number(sec);
  if (!NF_BASELINE_OPTIONS_SEC.includes(n)) return;
  localStorage.setItem(BASELINE_KEY, String(n));
}

export function getNfBaselineMs() {
  return getNfBaselineSec() * 1000;
}
