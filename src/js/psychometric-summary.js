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

function latestSubjectiveLine(sessions, type, field, label) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const mod = sessions[i].modules.find((m) => m.module_type === type);
    if (!mod) continue;
    const data = parseJsonSafe(mod.data, {});
    const raw = data[field] ?? data.value;
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    return `${label} (sesión ${sessions[i].number}): ${n}/100 (escala 1–100)`;
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
  const animo = latestSubjectiveLine(sessions, 'escala_animo', 'mood_score', 'Ánimo subjetivo');
  const ansiedad = latestSubjectiveLine(
    sessions,
    'escala_ansiedad',
    'anxiety_score',
    'Ansiedad subjetiva',
  );
  if (animo) lines.push(animo);
  if (ansiedad) lines.push(ansiedad);
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

function seriesFromAnswers(sessions, type, valueFn) {
  const points = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === type);
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const value = valueFn(data);
    if (value == null || Number.isNaN(Number(value))) return;
    points.push({ label: `S${s.number}`, value: Number(value) });
  });
  return points;
}

function dassDimScore(data, idx) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  return idx.reduce((a, i) => a + (Number(answers[i]) || 0), 0) * 2;
}

function eedDimAvg(data, ranges) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const vals = ranges
    .map((i) => answers[i])
    .filter((v) => v !== null && v !== undefined && v !== '');
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, v) => a + Number(v), 0) / vals.length) * 10) / 10;
}

function rosenbergTotal(data) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const reverseIdx = new Set([2, 4, 7, 8, 9]);
  let sum = 0;
  let any = false;
  for (let i = 0; i < 10; i++) {
    const raw = answers[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    sum += reverseIdx.has(i) ? 5 - v : v;
    any = true;
  }
  return any ? sum : null;
}

function qolsTotal(data) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const vals = answers
    .slice(0, 16)
    .map((v) => (v === null || v === undefined || v === '' ? null : Number(v)))
    .filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0);
}

function ferSection(data, start, count) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  let total = 0;
  let any = false;
  for (let i = 0; i < count; i++) {
    const v = answers[start + i];
    if (v === null || v === undefined || v === '') continue;
    total += Number(v);
    any = true;
  }
  return any ? total : null;
}

function pushSeries(out, { title, yMax, color, points }) {
  if (!points?.length) return;
  out.push({ title, yMax, color, points });
}

/**
 * Series de puntaje para PDF de programa (mismas curvas del workspace, sin NF en vivo).
 */
export function buildScoreChartSeries(sessions) {
  const out = [];
  const DASS_STRESS = [0, 5, 7, 10, 11, 13, 17];
  const DASS_ANX = [1, 3, 6, 8, 14, 18, 19];
  const DASS_DEP = [2, 4, 9, 12, 15, 16, 20];

  pushSeries(out, {
    title: 'DASS-21 — Estrés',
    yMax: 42,
    color: '#e6a800',
    points: seriesFromAnswers(sessions, 'dass21', (d) => dassDimScore(d, DASS_STRESS)),
  });
  pushSeries(out, {
    title: 'DASS-21 — Ansiedad',
    yMax: 42,
    color: '#8b5cf6',
    points: seriesFromAnswers(sessions, 'dass21', (d) => dassDimScore(d, DASS_ANX)),
  });
  pushSeries(out, {
    title: 'DASS-21 — Depresión',
    yMax: 42,
    color: '#2f6fed',
    points: seriesFromAnswers(sessions, 'dass21', (d) => dassDimScore(d, DASS_DEP)),
  });

  pushSeries(out, {
    title: 'EED — Adaptativas',
    yMax: 5,
    color: '#2e7d32',
    points: seriesFromAnswers(sessions, 'eed', (d) => eedDimAvg(d, [0, 1, 2, 3, 4, 5, 6, 7])),
  });
  pushSeries(out, {
    title: 'EED — Intermedias',
    yMax: 5,
    color: '#856404',
    points: seriesFromAnswers(sessions, 'eed', (d) => eedDimAvg(d, [8, 9, 10, 11, 12, 13, 14])),
  });
  pushSeries(out, {
    title: 'EED — Desadaptativas',
    yMax: 5,
    color: '#c0392b',
    points: seriesFromAnswers(sessions, 'eed', (d) =>
      eedDimAvg(d, [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]),
    ),
  });

  for (const type of psychometricChartTypes()) {
    const points = psychometricSeries(sessions, type);
    if (!points.length) continue;
    const meta = psychometricChartMeta(type);
    pushSeries(out, { type, title: meta.title, yMax: meta.yMax, color: meta.color, points });
  }

  pushSeries(out, {
    title: 'Rosenberg — Autoestima',
    yMax: 40,
    color: '#2f6fed',
    points: seriesFromAnswers(sessions, 'rosenberg', rosenbergTotal),
  });
  pushSeries(out, {
    title: 'QOLS — Calidad de vida',
    yMax: 112,
    color: '#3d9b6e',
    points: seriesFromAnswers(sessions, 'qols', qolsTotal),
  });
  pushSeries(out, {
    title: 'EFR — Fortalezas',
    yMax: 24,
    color: '#2e7d32',
    points: seriesFromAnswers(sessions, 'escala_fer', (d) => ferSection(d, 0, 6)),
  });
  pushSeries(out, {
    title: 'EFR — Riesgos',
    yMax: 24,
    color: '#c0392b',
    points: seriesFromAnswers(sessions, 'escala_fer', (d) => ferSection(d, 6, 6)),
  });
  pushSeries(out, {
    title: 'Ánimo (1–100)',
    yMax: 100,
    color: '#2f6fed',
    points: seriesFromAnswers(sessions, 'escala_animo', (d) => d.mood_score ?? d.value),
  });
  pushSeries(out, {
    title: 'Ansiedad (1–100)',
    yMax: 100,
    color: '#c0392b',
    points: seriesFromAnswers(sessions, 'escala_ansiedad', (d) => d.anxiety_score ?? d.value),
  });

  return out;
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
