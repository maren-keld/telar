import { getModuleDef } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { buildReadableText } from './readable-text.js';
import { asrsSummary } from './asrs-scoring.js';
import { pcl5Summary } from './pcl5-scoring.js';
import { sprintSummary } from './sprint-scoring.js';
import { iesrSummary } from './iesr-scoring.js';
import { adesSummary } from './ades-scoring.js';
import { getScorer, listScorerTypes } from './pack-registry.js';
import { parseJsonSafe } from './utils.js';

const LEGACY_PSYCH_TYPES = ['asrs', 'gad7', 'pcl5', 'sprint_ecl', 'iesr', 'ades', 'dass21'];
const LEGACY_CHART_TYPES = ['asrs', 'gad7', 'pcl5', 'sprint_ecl', 'iesr', 'ades'];

function withPackTypes(base, { chartsOnly = false } = {}) {
  const out = [...base];
  for (const type of listScorerTypes()) {
    if (out.includes(type)) continue;
    if (chartsOnly && getScorer(type)?.chart === false) continue;
    out.push(type);
  }
  return out;
}

/** Escalas con resumen textual (legacy + packs cargados). */
export function psychometricTypes() {
  return withPackTypes(LEGACY_PSYCH_TYPES);
}

/** Escalas con curva longitudinal en el workspace (legacy + packs cargados). */
export function psychometricChartTypes() {
  return withPackTypes(LEGACY_CHART_TYPES, { chartsOnly: true });
}

function latestPsychByType(sessions, type) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    const mod = s.modules.find((m) => m.module_type === type);
    if (!mod) continue;
    const data = parseJsonSafe(mod.data, {});
    const text = buildReadableText(type, data);
    if (!text) continue;
    return { sessionNumber: s.number, type, label: moduleLabelFor(type), text };
  }
  return null;
}

/** Bloque resumen psicométrico TDAH/trauma para PDF o export IA. */
export function buildPsychometricSummaryBlock(sessions) {
  const lines = [];
  for (const type of psychometricTypes()) {
    const entry = latestPsychByType(sessions, type);
    if (!entry) continue;
    lines.push(`${entry.label} (sesión ${entry.sessionNumber})\n${entry.text}`);
  }
  return lines.join('\n\n');
}

/** Serie longitudinal { label, value } por tipo de escala. */
export function psychometricSeries(sessions, type) {
  const points = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === type);
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});

    // Los packs traen su propio scorer; el pack decide qué cuenta como "respondido".
    const scorer = getScorer(type);
    if (scorer) {
      const packValue = scorer.total(data);
      if (packValue != null) points.push({ label: `S${s.number}`, value: packValue });
      return;
    }

    const answers = data.answers || [];
    if (!answers.some((v) => v !== null && v !== '')) return;

    let value = null;
    if (type === 'asrs') {
      value = asrsSummary(data)?.total;
    } else if (type === 'gad7') {
      value = answers.reduce((a, v) => a + (Number(v) || 0), 0);
    } else if (type === 'pcl5') {
      value = pcl5Summary(data)?.total;
    } else if (type === 'sprint_ecl') {
      value = sprintSummary(data)?.total;
    } else if (type === 'iesr') {
      value = iesrSummary(data)?.total;
    } else if (type === 'ades') {
      value = adesSummary(data)?.mean;
    } else if (type === 'dass21') {
      const sum = (idx) => idx.reduce((a, i) => a + (Number(answers[i]) || 0), 0) * 2;
      value = sum([1, 3, 6, 8, 14, 18, 19]);
    }
    if (value != null) points.push({ label: `S${s.number}`, value });
  });
  return points;
}

export function psychometricChartMeta(type) {
  const def = getModuleDef(type);
  const scorer = getScorer(type);
  if (scorer) {
    return {
      title: def?.label || type,
      yMax: scorer.yMax ?? 100,
      color: scorer.color || '#2f6fed',
    };
  }
  return {
    title: def?.label || type,
    yMax:
      type === 'asrs'
        ? 72
        : type === 'gad7'
          ? 21
          : type === 'pcl5'
            ? 80
            : type === 'sprint_ecl'
              ? 44
              : type === 'iesr'
                ? 88
                : type === 'ades'
                  ? 10
                  : 42,
    color:
      type === 'pcl5' || type === 'sprint_ecl' || type === 'iesr' || type === 'ades'
        ? '#c0392b'
        : '#2f6fed',
  };
}
