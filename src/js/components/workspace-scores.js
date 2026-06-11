import { getSessionsWithModules } from '../db.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';

const DASS_STRESS_BANDS = [
  { max: 14, label: 'Normal', cls: 'dass-sev--normal', hint: 'Puntaje Normal es menor o igual a 14' },
  { max: 18, label: 'Leve', cls: 'dass-sev--mild', hint: 'Puntaje Leve: 15 a 18' },
  { max: 25, label: 'Moderado', cls: 'dass-sev--moderate', hint: 'Puntaje Moderado: 19 a 25' },
  { max: 33, label: 'Severo', cls: 'dass-sev--severe', hint: 'Puntaje Severo: 26 a 33' },
  { max: 999, label: 'Extremadamente severo', cls: 'dass-sev--extreme', hint: 'Puntaje extremo: 34 o más' },
];

const DASS_DEP_BANDS = [
  { max: 9, label: 'Normal', cls: 'dass-sev--normal', hint: 'Puntaje Normal es menor o igual a 9' },
  { max: 13, label: 'Leve', cls: 'dass-sev--mild', hint: 'Puntaje Leve: 10 a 13' },
  { max: 20, label: 'Moderado', cls: 'dass-sev--moderate', hint: 'Puntaje Moderado: 14 a 20' },
  { max: 27, label: 'Severo', cls: 'dass-sev--severe', hint: 'Puntaje Severo: 21 a 27' },
  { max: 999, label: 'Extremadamente severo', cls: 'dass-sev--extreme', hint: 'Puntaje extremo: 28 o más' },
];

const DASS_ANX_BANDS = [
  { max: 7, label: 'Normal', cls: 'dass-sev--normal', hint: 'Puntaje Normal es menor o igual a 7' },
  { max: 9, label: 'Leve', cls: 'dass-sev--mild', hint: 'Puntaje Leve: 8 a 9' },
  { max: 14, label: 'Moderado', cls: 'dass-sev--moderate', hint: 'Puntaje Moderado: 10 a 14' },
  { max: 19, label: 'Severo', cls: 'dass-sev--severe', hint: 'Puntaje Severo: 15 a 19' },
  { max: 999, label: 'Extremadamente severo', cls: 'dass-sev--extreme', hint: 'Puntaje extremo: 20 o más' },
];

const STRESS_IDX = [0, 5, 7, 10, 11, 13, 17];
const ANX_IDX = [1, 3, 6, 8, 14, 18, 19];
const DEP_IDX = [2, 4, 9, 12, 15, 16, 20];

function sumDim(answers, idx) {
  return idx.reduce((a, i) => {
    const v = answers[i];
    return a + (v === null || v === undefined || v === '' ? 0 : Number(v));
  }, 0);
}

function dassScore(answers, idx) {
  return sumDim(answers, idx) * 2;
}

function bandFor(score, bands) {
  return bands.find((b) => score <= b.max) || bands[bands.length - 1];
}

function chartYMax(bands) {
  return bands[0]?.max || 14;
}

function buildDassSeries(sessions, idx) {
  const points = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === 'dass21');
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const answers = Array.isArray(data.answers) ? data.answers : [];
    if (!answers.some((v) => v !== null && v !== '')) return;
    points.push({ label: `S${s.number}`, value: dassScore(answers, idx) });
  });
  return points;
}

function buildEedSeries(sessions, kind) {
  const ranges =
    kind === 'adapt'
      ? [0, 1, 2, 3, 4, 5, 6, 7]
      : kind === 'inter'
        ? [8, 9, 10, 11, 12, 13, 14]
        : [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const points = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === 'eed');
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const vals = ranges
      .map((i) => answers[i])
      .filter((v) => v !== null && v !== undefined && v !== '');
    if (!vals.length) return;
    const avg = vals.reduce((a, v) => a + Number(v), 0) / vals.length;
    points.push({ label: `S${s.number}`, value: Math.round(avg * 10) / 10 });
  });
  return points;
}

function buildNfSeries(sessions) {
  const calm = [];
  const att = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === 'neurofeedback');
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const res = data.last_results;
    if (!res) return;
    const label = `S${s.number}`;
    if (res.calm_pct != null) calm.push({ label, value: res.calm_pct });
    if (res.attentive_pct != null) att.push({ label, value: res.attentive_pct });
  });
  return { calm, att };
}

function accordionHtml(id, title, hint, bodyHtml, open = true, hintIsHtml = false) {
  const hintBlock = hint
    ? `<p class="score-accordion__hint">${hintIsHtml ? hint : escapeHtml(hint)}</p>`
    : '';
  return `
    <section class="score-accordion${open ? ' score-accordion--open' : ''}" data-accordion>
      <button type="button" class="score-accordion__head" aria-expanded="${open}">
        <span class="score-accordion__title">${escapeHtml(title)}</span>
        <span class="score-accordion__chev" aria-hidden="true">▾</span>
      </button>
      ${hintBlock}
      <div class="score-accordion__body">${bodyHtml}</div>
    </section>`;
}

function lineChartHtml(canvasId, yMax) {
  return `<div class="score-chart-wrap"><canvas id="${canvasId}" height="160"></canvas></div>`;
}

export async function renderWorkspaceScores(listEl, treatmentId, moduleTypes) {
  const sessions = await getSessionsWithModules(treatmentId);
  const types = new Set(moduleTypes.filter((t) => t !== 'selector_modulo'));
  const sections = [];

  if (types.has('dass21')) {
    const dims = [
      { key: 'stress', title: 'DASS-21 — Estrés', bands: DASS_STRESS_BANDS, idx: STRESS_IDX },
      { key: 'dep', title: 'DASS-21 — Depresión', bands: DASS_DEP_BANDS, idx: DEP_IDX },
      { key: 'anx', title: 'DASS-21 — Ansiedad', bands: DASS_ANX_BANDS, idx: ANX_IDX },
    ];
    dims.forEach((dim, di) => {
      const series = buildDassSeries(sessions, dim.idx);
      const last = series[series.length - 1];
      const band = last ? bandFor(last.value, dim.bands) : dim.bands[0];
      const hintText = last
        ? `<span class="dass-sev ${band.cls}">${escapeHtml(band.label)}</span> · ${escapeHtml(band.hint)}`
        : dim.bands[0].hint;
      const cid = `chart-dass-${dim.key}`;
      sections.push(
        accordionHtml(
          cid,
          dim.title,
          hintText,
          series.length
            ? lineChartHtml(cid, chartYMax(dim.bands))
            : '<p class="scores-empty">Sin puntajes DASS-21 registrados aún.</p>',
          di === 0,
          Boolean(last),
        ),
      );
    });
  }

  if (types.has('eed')) {
    [
      { key: 'adapt', title: 'EED — Adaptativas' },
      { key: 'inter', title: 'EED — Intermedias' },
      { key: 'mal', title: 'EED — Desadaptativas' },
    ].forEach((dim, di) => {
      const series = buildEedSeries(sessions, dim.key);
      const cid = `chart-eed-${dim.key}`;
      sections.push(
        accordionHtml(
          cid,
          dim.title,
          'Promedio por sesión (escala 1–5)',
          series.length
            ? lineChartHtml(cid, 5)
            : '<p class="scores-empty">Sin puntajes EED registrados aún.</p>',
          !sections.length && di === 0,
        ),
      );
    });
  }

  if (types.has('neurofeedback')) {
    const { calm, att } = buildNfSeries(sessions);
    if (calm.length || att.length) {
      sections.push(
        accordionHtml(
          'chart-nf',
          'Neurofeedback',
          'En tiempo — porcentaje en la grabación',
          `<div class="score-chart-wrap"><canvas id="chart-nf-time" height="160"></canvas></div>`,
          !sections.length,
        ),
      );
    }
  }

  if (types.has('escala_animo') || types.has('escala_ansiedad')) {
    if (types.has('escala_animo')) {
      sections.push(
        accordionHtml(
          'chart-animo',
          'Escala subjetiva de ánimo',
          'Valor 1–100 por sesión',
          lineChartHtml('chart-animo', 100),
          !sections.length,
        ),
      );
    }
    if (types.has('escala_ansiedad')) {
      sections.push(
        accordionHtml(
          'chart-ansiedad',
          'Escala subjetiva de ansiedad',
          'Valor 1–100 por sesión',
          lineChartHtml('chart-ansiedad', 100),
          !sections.length,
        ),
      );
    }
  }

  if (!sections.length) {
    listEl.innerHTML =
      '<p class="scores-empty">Añade módulos de pruebas o neurofeedback al tratamiento para ver gráficos aquí.</p>';
    return;
  }

  listEl.innerHTML = `<div class="scores-panel">${sections.join('')}</div>`;

  listEl.querySelectorAll('[data-accordion]').forEach((acc) => {
    const head = acc.querySelector('.score-accordion__head');
    head?.addEventListener('click', () => {
      acc.classList.toggle('score-accordion--open');
      head.setAttribute('aria-expanded', acc.classList.contains('score-accordion--open'));
    });
  });

  if (!window.Chart) return;

  if (types.has('dass21')) {
    paintDassChart('chart-dass-stress', buildDassSeries(sessions, STRESS_IDX), DASS_STRESS_BANDS);
    paintDassChart('chart-dass-dep', buildDassSeries(sessions, DEP_IDX), DASS_DEP_BANDS);
    paintDassChart('chart-dass-anx', buildDassSeries(sessions, ANX_IDX), DASS_ANX_BANDS);
  }

  if (types.has('eed')) {
    paintSimpleLine('chart-eed-adapt', buildEedSeries(sessions, 'adapt'), 5, '#2e7d32');
    paintSimpleLine('chart-eed-inter', buildEedSeries(sessions, 'inter'), 5, '#856404');
    paintSimpleLine('chart-eed-mal', buildEedSeries(sessions, 'mal'), 5, '#c0392b');
  }

  if (types.has('neurofeedback')) {
    const { calm, att } = buildNfSeries(sessions);
    paintNfChart('chart-nf-time', calm, att);
  }

  if (types.has('escala_animo')) {
    paintSubjective('chart-animo', sessions, 'escala_animo', 'mood_score');
  }
  if (types.has('escala_ansiedad')) {
    paintSubjective('chart-ansiedad', sessions, 'escala_ansiedad', 'anxiety_score');
  }
}

function paintDassChart(id, series, bands) {
  const canvas = document.getElementById(id);
  if (!canvas || !series.length) return;
  const yMax = chartYMax(bands);
  const bg = bands.map((b, i) => {
    const from = i === 0 ? 0 : bands[i - 1].max + 0.01;
    const to = b.max;
    const colors = {
      'dass-sev--normal': 'rgba(212, 237, 218, 0.55)',
      'dass-sev--mild': 'rgba(232, 245, 233, 0.45)',
      'dass-sev--moderate': 'rgba(255, 243, 205, 0.5)',
      'dass-sev--severe': 'rgba(253, 226, 216, 0.5)',
      'dass-sev--extreme': 'rgba(248, 215, 218, 0.5)',
    };
    return { from, to, color: colors[b.cls] || 'transparent' };
  });

  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();

  // eslint-disable-next-line no-new
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.map((p) => p.label),
      datasets: [
        {
          label: 'Puntaje',
          data: series.map((p) => p.value),
          borderColor: '#2f6fed',
          backgroundColor: 'rgba(47, 111, 237, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: yMax,
          title: { display: true, text: 'Puntaje' },
        },
      },
      plugins: {
        legend: { display: false },
        annotation: false,
      },
    },
    plugins: [
      {
        id: 'severityBands',
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea) return;
          const yScale = scales.y;
          bg.forEach((zone) => {
            const yTop = yScale.getPixelForValue(zone.to);
            const yBot = yScale.getPixelForValue(zone.from);
            ctx.save();
            ctx.fillStyle = zone.color;
            ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop);
            ctx.restore();
          });
        },
      },
    ],
  });
}

function paintSimpleLine(id, series, yMax, color) {
  const canvas = document.getElementById(id);
  if (!canvas || !series.length) return;
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  // eslint-disable-next-line no-new
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.map((p) => p.label),
      datasets: [{ data: series.map((p) => p.value), borderColor: color, tension: 0.25 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: yMax } },
      plugins: { legend: { display: false } },
    },
  });
}

function paintNfChart(id, calm, att) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const labels = [...new Set([...calm, ...att].map((p) => p.label))];
  if (!labels.length) return;
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  const calmMap = Object.fromEntries(calm.map((p) => [p.label, p.value]));
  const attMap = Object.fromEntries(att.map((p) => [p.label, p.value]));
  // eslint-disable-next-line no-new
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Calma',
          data: labels.map((l) => calmMap[l] ?? null),
          borderColor: '#9b8fd9',
          backgroundColor: 'rgba(155, 143, 217, 0.15)',
          tension: 0.25,
        },
        {
          label: 'Atención',
          data: labels.map((l) => attMap[l] ?? null),
          borderColor: '#e6c84a',
          backgroundColor: 'rgba(230, 200, 74, 0.15)',
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
    },
  });
}

function paintSubjective(id, sessions, moduleType, field) {
  const series = [];
  sessions.forEach((s) => {
    const mod = s.modules.find((m) => m.module_type === moduleType);
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const v = data[field];
    if (v === null || v === undefined || v === '') return;
    series.push({ label: `S${s.number}`, value: Number(v) });
  });
  paintSimpleLine(id, series, 100, '#2f6fed');
}
