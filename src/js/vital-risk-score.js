/**
 * Riesgo vital (experimental) para Resumen: combina C-SSRS, urgencia de anamnesis,
 * señales de tests (SPRINT/FER) y eje Riesgos del Estudio.
 * Nivel 0 = bajo (verde oscuro) … 1 = alto (rojo).
 */
import { clinicalAlertReasonsFromModules, VITAL_RISK_LABELS } from './clinical-alert.js';
import { SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { cssrsRiskBand } from './modules/cssrs.js';
import { parseJsonSafe } from './utils.js';

const CSSRS_WEIGHT = {
  none: 0,
  low: 0.35,
  moderate: 0.7,
  high: 1,
};

/** Gradiente rojo → amarillo → verde claro → verde oscuro (alto → bajo). */
const GRADIENT = [
  { t: 0, dark: '#14532d', light: '#86efac' }, // verde oscuro
  { t: 0.33, dark: '#3f7d3a', light: '#bbf7d0' }, // verde claro
  { t: 0.66, dark: '#a16207', light: '#fde68a' }, // amarillo
  { t: 1, dark: '#991b1b', light: '#fecaca' }, // rojo
];

function lerpHex(a, b, u) {
  const parse = (hex) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const ch = (x, y) => Math.round(x + (y - x) * u);
  const to = (n) => n.toString(16).padStart(2, '0');
  return `#${to(ch(ar, br))}${to(ch(ag, bg))}${to(ch(ab, bb))}`;
}

export function vitalRiskPalette(level) {
  const t = Math.max(0, Math.min(1, Number(level) || 0));
  let i = 0;
  while (i < GRADIENT.length - 2 && t > GRADIENT[i + 1].t) i += 1;
  const a = GRADIENT[i];
  const b = GRADIENT[i + 1];
  const span = b.t - a.t || 1;
  const u = (t - a.t) / span;
  return {
    dark: lerpHex(a.dark, b.dark, u),
    light: lerpHex(a.light, b.light, u),
  };
}

function cssrsLevelFromSessions(sessions) {
  let best = 0;
  for (const session of sessions || []) {
    for (const mod of session.modules || []) {
      if (mod.module_type !== 'cssrs') continue;
      const data = typeof mod.data === 'string' ? parseJsonSafe(mod.data, {}) : mod.data || {};
      const band = cssrsRiskBand(data.answers || {});
      best = Math.max(best, CSSRS_WEIGHT[band.key] ?? 0);
    }
  }
  return best;
}

function riskAxisLevel(caseStudy) {
  const els = (caseStudy?.elements || []).filter(
    (el) => el.axis === 'risk' && el.title && el.kind !== SUPPORT_NETWORK_KIND,
  );
  if (!els.length) return 0;
  let score = 0;
  for (const el of els) {
    const vital = VITAL_RISK_LABELS.some(
      (label) => label.toLowerCase() === String(el.title || '').trim().toLowerCase(),
    );
    const status = el.status || 'unknown';
    if (status === 'resolved') {
      score += vital ? 0.15 : 0.05;
      continue;
    }
    if (status === 'unknown') {
      score += vital ? 0.45 : 0.2;
      continue;
    }
    // managed / present / developing
    score += vital ? 0.7 : 0.35;
  }
  return Math.min(1, score / Math.max(1.2, els.length * 0.55));
}

function urgenciaLevel(moduleRows) {
  for (const row of moduleRows || []) {
    if (row.module_type !== 'motivo_consulta') continue;
    const data = typeof row.data === 'string' ? parseJsonSafe(row.data, {}) : row.data || {};
    const u = String(data.urgencia || '').toLowerCase();
    if (u === 'alta') return 0.85;
    if (u === 'media') return 0.4;
    if (u === 'baja') return 0.15;
  }
  return 0;
}

/**
 * @returns {{ level: number, label: string, reasons: string[], palette: { dark: string, light: string } }}
 */
export function computeVitalRisk({ sessions = [], caseStudy = null } = {}) {
  const modules = (sessions || []).flatMap((s) => s.modules || []);
  const spaceLabels = (caseStudy?.elements || [])
    .filter((el) => el.axis === 'risk' && el.title)
    .map((el) => el.title);
  const alertReasons = clinicalAlertReasonsFromModules(modules, spaceLabels);
  const cssrs = cssrsLevelFromSessions(sessions);
  const urgencia = urgenciaLevel(modules);
  const axis = riskAxisLevel(caseStudy);
  const alertBoost = Math.min(0.35, alertReasons.length * 0.12);

  const level = Math.max(0, Math.min(1, cssrs * 0.45 + urgencia * 0.25 + axis * 0.25 + alertBoost));

  let label = 'Bajo';
  if (level >= 0.75) label = 'Alto';
  else if (level >= 0.45) label = 'Moderado';
  else if (level >= 0.2) label = 'Leve';

  const reasons = [];
  if (cssrs >= 0.7) reasons.push('C-SSRS: riesgo moderado o alto');
  else if (cssrs >= 0.35) reasons.push('C-SSRS: ideación pasiva');
  if (urgencia >= 0.85) reasons.push('Urgencia alta en anamnesis');
  else if (urgencia >= 0.4) reasons.push('Urgencia media en anamnesis');
  if (axis >= 0.35) reasons.push('Factores en eje Riesgos del Estudio');
  for (const r of alertReasons) {
    if (!reasons.includes(r)) reasons.push(r);
  }

  return { level, label, reasons, palette: vitalRiskPalette(level) };
}
