import { parseJsonSafe } from './utils.js';
import { cssrsBandScore, cssrsRiskBand } from './modules/cssrs.js';

const GAD_SEVERE = 15;
const DASS_ANX_SEVERE = 15;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function latestModule(sessions, type) {
  for (let i = (sessions || []).length - 1; i >= 0; i -= 1) {
    const mod = (sessions[i].modules || []).find((m) => m.module_type === type);
    if (mod) return { session: sessions[i], mod };
  }
  return null;
}

function maritalFromSessions(sessions) {
  const hit = latestModule(sessions, 'registro_inicial');
  return String(parseJsonSafe(hit?.mod?.data, {}).marital_status || '');
}

function gad7Total(data) {
  const answers = Array.isArray(data?.answers) ? data.answers : [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  return answers.reduce((a, v) => a + (Number(v) || 0), 0);
}

function dassAnxiety(data) {
  const answers = Array.isArray(data?.answers) ? data.answers : [];
  const idx = [1, 3, 6, 8, 14, 18, 19];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  return idx.reduce((a, i) => a + (Number(answers[i]) || 0), 0) * 2;
}

function textHaystack(sessions, caseStudy, marital) {
  const bits = [marital || ''];
  for (const el of caseStudy?.elements || []) {
    bits.push(el.title, el.notes);
    for (const key of ['manifestations', 'indicators', 'objectives', 'evidence']) {
      (el[key] || []).forEach((item) => bits.push(item?.text || item));
    }
  }
  for (const s of sessions || []) {
    for (const mod of s.modules || []) {
      if (mod.module_type !== 'motivo_consulta' && mod.module_type !== 'registro_inicial') continue;
      const data = parseJsonSafe(mod.data, {});
      bits.push(JSON.stringify(data));
    }
  }
  return bits.join(' ').toLowerCase();
}

/**
 * 0 = verde oscuro … 1 = rojo.
 * Combina C-SSRS, urgencia de anamnesis, escalas y eje Riesgos (experimental).
 */
export function computeVitalRisk({ sessions = [], caseStudy = {}, marital = '' } = {}) {
  const reasons = [];
  const findings = [];
  // Un tratamiento nuevo no tiene hallazgos todavía: no se le asigna riesgo basal artificial.
  let score = 0;
  const maritalStatus = marital || maritalFromSessions(sessions);

  const cssrsHit = latestModule(sessions, 'cssrs');
  let cssrsKey = 'none';
  if (cssrsHit) {
    const data = parseJsonSafe(cssrsHit.mod.data, {});
    cssrsKey = data.triage || cssrsRiskBand(data.answers || {}).key;
    const bandScore = cssrsBandScore(cssrsKey);
    score = [0, 0.28, 0.55, 0.88][bandScore] ?? 0;
    const cssrsFinding = `C-SSRS: ${cssrsKey === 'none' ? 'sin señales registradas' : cssrsKey}`;
    findings.push(cssrsFinding);
    if (cssrsKey !== 'none') reasons.push(`C-SSRS ${cssrsKey}`);
  }

  const motivo = latestModule(sessions, 'motivo_consulta');
  const urgencia = parseJsonSafe(motivo?.mod?.data, {}).urgencia;
  if (urgencia === 'alta') {
    score += 0.18;
    reasons.push('urgencia alta');
  } else if (urgencia === 'media') {
    score += 0.05;
  }
  findings.push(`Urgencia: ${urgencia || 'sin registro'}`);

  const gad = latestModule(sessions, 'gad7');
  const gadTotal = gad ? gad7Total(parseJsonSafe(gad.mod.data, {})) : null;
  if (gadTotal != null && gadTotal >= GAD_SEVERE) {
    score += 0.1;
    reasons.push('GAD-7 severo');
  }
  findings.push(`GAD-7: ${gadTotal == null ? 'sin registro' : `${gadTotal} puntos`}`);

  const dass = latestModule(sessions, 'dass21');
  const dassAnx = dass ? dassAnxiety(parseJsonSafe(dass.mod.data, {})) : null;
  if (dassAnx != null && dassAnx >= DASS_ANX_SEVERE) {
    score += 0.08;
    reasons.push('DASS ansiedad severa');
  }
  findings.push(`DASS-21 ansiedad: ${dassAnx == null ? 'sin registro' : `${dassAnx} puntos`}`);

  const riskEls = (caseStudy.elements || []).filter(
    (el) => el.axis === 'risk' && el.title && el.status !== 'unknown',
  );
  if (riskEls.length) {
    score += Math.min(0.24, riskEls.length * 0.08);
    reasons.push(`eje riesgos (${riskEls.length})`);
  }
  riskEls.slice(0, 5).forEach((el) => findings.push(el.title));

  const hay = textHaystack(sessions, caseStudy, maritalStatus);
  if (/solter/.test(hay) || /single/.test(String(maritalStatus).toLowerCase())) {
    score += 0.04;
    reasons.push('soltero/a');
  }
  if (/vive\s+sol|lives\s+alone|vive\s+solo/.test(hay)) {
    score += 0.08;
    reasons.push('vive solo');
  }
  if (/psicof[aá]rm|psychopharm|antidepres|antipsic[oó]t/.test(hay)) {
    score += 0.06;
    reasons.push('psicofármacos');
  }

  score = clamp01(score);
  const label =
    score >= 0.75 ? 'Alto' : score >= 0.45 ? 'Moderado' : score >= 0.25 ? 'Leve' : 'Bajo';
  if (findings.length < 5) findings.push('Sin elementos de riesgo registrados');
  return { score, label, cssrsKey, reasons, findings: [...new Set(findings)].slice(0, 5) };
}

export function vitalRiskOrbHtml(risk, escapeHtml) {
  const pct = Math.round((risk?.score || 0) * 100);
  const findings = (risk?.findings || risk?.reasons || []).slice(0, 5);
  const tone = pct >= 75
    ? ['#b42318', '#ef4444']
    : pct >= 45
      ? ['#b45309', '#f59e0b']
      : pct >= 25
        ? ['#a16207', '#eab308']
        : ['#157347', '#4caf50'];
  return `
    <article class="estudio-summary-card card estudio-summary-card--vital" style="--vital:${(risk?.score || 0).toFixed(3)};--risk-tone-start:${tone[0]};--risk-tone-end:${tone[1]}">
      <h3 class="estudio-summary-card__title">Riesgo vital <span class="estudio-vital__exp">experimental</span></h3>
      <div class="vital-risk-card__body">
        <div class="vital-risk-card__score" aria-label="Riesgo vital ${escapeHtml(risk?.label || 'Bajo')}: ${pct} de 100">
          <strong>${pct}</strong>
          <span>${escapeHtml(risk?.label || 'Bajo')}</span>
        </div>
        <div class="vital-risk-card__findings">
          <h4>Hallazgos</h4>
          <ul>${findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ul>
        </div>
      </div>
    </article>`;
}
