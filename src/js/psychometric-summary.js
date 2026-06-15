import { MODULE_DEFS } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { buildReadableText } from './readable-text.js';
import { asrsSummary } from './asrs-scoring.js';
import { pcl5Summary } from './pcl5-scoring.js';
import { sprintSummary } from './sprint-scoring.js';
import { iesrSummary } from './iesr-scoring.js';
import { adesSummary } from './ades-scoring.js';
import { parseJsonSafe } from './utils.js';

const PSYCH_TYPES = ['asrs', 'gad7', 'pcl5', 'sprint_ecl', 'iesr', 'ades', 'dass21'];

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
  for (const type of PSYCH_TYPES) {
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
  const def = MODULE_DEFS[type];
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
