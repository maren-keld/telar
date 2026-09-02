import { bindAutoSave, collectFormData } from '../autobind.js';
import { NF_EYE_CONDITION_LABEL, NF_HELP_MESSAGE, nfPreset } from '../../lib/nf-bands.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import { getSessionsWithModules } from '../db.js';
import { exportNfSessionCsv, exportNfSessionPdf } from '../export-nf-session.js';
import { syncModuleReadableText } from '../readable-text.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { escapeHtml, formatDate, parseJsonSafe, toast } from '../utils.js';

let correlationChart = null;
let evolutionChart = null;

export function bindNfResultsTab(host, moduleRow, exportCtx = {}, liveTrace = []) {
  const tab = host.querySelector('#nf-tab-resultados');
  if (!tab) return;

  const data = parseJsonSafe(moduleRow.data, {});
  const results = data.last_results;
  const meta = data.last_meta;
  const trace = liveTrace.length ? liveTrace : data.last_live_trace || [];
  if (trace.length) {
    requestAnimationFrame(() => initLiveSessionChart(host, trace, meta));
  }

  const form = tab.querySelector('#nf-results-form');
  if (form) {
    const persistNotes = async () => {
      const fd = collectFormData(form);
      await syncModuleReadableText(
        moduleRow,
        { session_notes: fd.session_notes || '' },
        moduleRow.status || 'completado',
      );
    };
    bindAutoSave(form, persistNotes, workspaceAutoSaveStatus());
  }

  const getExportPayload = () => {
    const data = parseJsonSafe(moduleRow.data, {});
    return {
      results: data.last_results,
      meta: data.last_meta,
      sessionNotes: form ? collectFormData(form).session_notes || data.session_notes || '' : data.session_notes || '',
      patientName: exportCtx.patientName,
      sessionNumber: exportCtx.sessionNumber,
    };
  };

  tab.querySelector('#nf-export-csv')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: async () => {
        try {
          await exportNfSessionCsv(getExportPayload());
          toast('CSV exportado');
        } catch (e) {
          toast(e.message || 'No se pudo exportar CSV');
        }
      },
    });
  });

  tab.querySelector('#nf-export-pdf')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: async () => {
        try {
          await exportNfSessionPdf(getExportPayload());
          toast('PDF exportado');
        } catch (e) {
          toast(e.message || 'No se pudo exportar PDF');
        }
      },
    });
  });
}

export function renderResultsLoading(durationSec = 0) {
  const est = Math.max(20, Math.ceil(durationSec * 1.5 + 12));
  return `
    <div class="nf-results nf-results--loading">
      <p class="nf-results__loading-title">Analizando sesión…</p>
      <p class="nf-results__loading-hint">Las sesiones largas pueden tardar uno o dos minutos.</p>
      <div class="nf-analyze-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${est}" aria-valuenow="0">
        <div class="nf-analyze-progress__bar" id="nf-analyze-bar"></div>
      </div>
      <p class="nf-analyze-eta" id="nf-analyze-eta">Tiempo estimado: ~${formatDuration(est)}</p>
    </div>`;
}

export function startAnalyzeProgress(host, durationSec) {
  const est = Math.max(20, Math.ceil(durationSec * 1.5 + 12));
  const bar = host.querySelector('#nf-analyze-bar');
  const etaEl = host.querySelector('#nf-analyze-eta');
  const progressEl = host.querySelector('.nf-analyze-progress');
  const t0 = Date.now();
  const tick = () => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const remaining = Math.max(0, est - elapsed);
    const pct = Math.min(95, (elapsed / est) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (progressEl) progressEl.setAttribute('aria-valuenow', String(elapsed));
    if (etaEl) {
      etaEl.textContent =
        remaining > 0 ? `Faltan ~${formatDuration(remaining)} (estimado)` : 'Finalizando análisis…';
    }
  };
  tick();
  return setInterval(tick, 500);
}

export function renderResultsError(message) {
  return `<div class="nf-results"><p class="nf-results-empty nf-results-empty--error">${escapeHtml(message)}</p></div>`;
}

export function nfErrorMessage(err) {
  if (typeof err === 'string') return err;
  return err?.message || String(err) || 'Error al analizar la sesión';
}

function displayProtocolLabel(meta) {
  const raw = meta?.protocol || '';
  if (/relajaci/i.test(raw)) return 'Calma';
  return raw || nfPreset('relajacion').label;
}

export function parseAnalyzeOutput(raw) {
  const lines = String(raw).trim().split('\n').filter(Boolean);
  const parts = lines[0].split(',').map((p) => {
    const t = String(p).trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  });
  while (parts.length < 11) parts.push(null);
  let postSeries = [];
  let spectral = {};
  if (lines[1]) {
    try {
      const extra = JSON.parse(lines[1]);
      postSeries = extra.post || [];
      spectral = extra.spectral || {};
    } catch {
      postSeries = [];
      spectral = {};
    }
  }
  const hasBaseline = spectral.has_baseline === true;
  const numOrNull = (v) => (v == null || Number.isNaN(v) ? null : v);
  return {
    calm_seconds: parts[0] ?? 0,
    attention_seconds: parts[1] ?? 0,
    relaxation_pct: parts[4] ?? 0,
    calm_pct: parts[5] ?? 0,
    attentive_pct: parts[6] ?? 0,
    baseline_calm_pct: hasBaseline ? numOrNull(parts[7]) : null,
    baseline_attentive_pct: hasBaseline ? numOrNull(parts[8]) : null,
    delta_calm_pct: hasBaseline ? numOrNull(parts[9]) : null,
    delta_attentive_pct: hasBaseline ? numOrNull(parts[10]) : null,
    has_baseline: hasBaseline,
    post_series: postSeries,
    spectral,
  };
}

function buildLiveSeries(liveTrace, protocol) {
  const trainedAtt = /atenci/i.test(protocol || '');
  const trainLive = (liveTrace || []).filter((p) => p.phase === 'training' && p.pct != null);
  if (!trainLive.length) return null;
  const t0 = trainLive[0].t;
  const live = trainLive.map((p) => ({ t: (p.t - t0) / 1000, v: p.pct }));
  return { live, label: trainedAtt ? 'atención' : 'calma' };
}

function avgLivePct(liveTrace, protocol) {
  const trainedAtt = /atenci/i.test(protocol || '');
  const pts = (liveTrace || []).filter((p) => p.phase === 'training' && p.pct != null);
  if (!pts.length) return null;
  const avg = pts.reduce((a, p) => a + p.pct, 0) / pts.length;
  return {
    value: Math.round(avg * 10) / 10,
    label: trainedAtt ? 'Atención' : 'Calma',
  };
}

function destroyLiveSessionChart() {
  if (correlationChart) {
    correlationChart.destroy();
    correlationChart = null;
  }
}

function initLiveSessionChart(host, liveTrace, meta) {
  destroyLiveSessionChart();
  const canvas = host.querySelector('#nf-live-chart');
  if (!canvas || !window.Chart) return;
  const series = buildLiveSeries(liveTrace, meta?.protocol);
  if (!series) return;
  const tickColor = chartAxisColor();
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  const mean =
    series.live.reduce((sum, p) => sum + p.v, 0) / Math.max(1, series.live.length);
  const meanRounded = Math.round(mean * 10) / 10;
  const xMin = series.live[0]?.t ?? 0;
  const xMax = series.live[series.live.length - 1]?.t ?? xMin;
  correlationChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: series.label,
          data: series.live.map((p) => ({ x: p.t, y: p.v })),
          borderColor: '#4B7FD1',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          order: 1,
        },
        {
          label: `Media ${meanRounded}%`,
          data: [
            { x: xMin, y: meanRounded },
            { x: xMax, y: meanRounded },
          ],
          borderColor: '#e67e22',
          borderWidth: 2,
          borderDash: [8, 5],
          pointRadius: 0,
          order: 0,
        },
      ],
    },
    options: {
      parsing: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tiempo de grabación (s)', color: tickColor },
          ticks: { color: tickColor },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: '%', color: tickColor },
          ticks: { color: tickColor },
        },
      },
      plugins: {
        legend: { labels: { color: tickColor } },
      },
    },
  });
}

function destroyEvolutionChart() {
  if (evolutionChart) {
    evolutionChart.destroy();
    evolutionChart = null;
  }
}

export function destroyNfResultCharts() {
  destroyLiveSessionChart();
  destroyEvolutionChart();
}

function buildNfEvolutionPoints(sessions) {
  const calm = [];
  const att = [];
  sessions.forEach((s) => {
    const mod = s.modules?.find((m) => m.module_type === 'neurofeedback');
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

async function mountEvolutionChart(host, treatmentId) {
  destroyEvolutionChart();
  const wrap = host.querySelector('#nf-evolution-wrap');
  if (!wrap || !treatmentId) return;
  try {
    const sessions = await getSessionsWithModules(treatmentId);
    const { calm, att } = buildNfEvolutionPoints(sessions);
    if (calm.length < 2 && att.length < 2) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const canvas = host.querySelector('#nf-evolution-chart');
    if (!canvas || !window.Chart) return;
    const tickColor = chartAxisColor();
    const prev = Chart.getChart(canvas);
    if (prev) prev.destroy();
    const datasets = [];
    if (calm.length >= 2) {
      datasets.push({
        label: 'Calma %',
        data: calm.map((p) => p.value),
        borderColor: '#6FA3E8',
        backgroundColor: 'transparent',
        tension: 0.25,
        pointRadius: 3,
      });
    }
    if (att.length >= 2) {
      datasets.push({
        label: 'Atención %',
        data: att.map((p) => p.value),
        borderColor: '#e6a817',
        backgroundColor: 'transparent',
        tension: 0.25,
        pointRadius: 3,
      });
    }
    const labels = (calm.length >= att.length ? calm : att).map((p) => p.label);
    evolutionChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        scales: {
          y: { min: 0, max: 100, ticks: { color: tickColor } },
          x: { ticks: { color: tickColor } },
        },
        plugins: { legend: { labels: { color: tickColor } } },
      },
    });
  } catch (e) {
    console.warn('NF evolution chart', e);
    wrap.hidden = true;
  }
}

function renderExplainCard({ kind, trained }) {
  const isCalm = kind === 'calm';
  const title = isCalm ? 'Calma' : 'Atención';
  const cat = isCalm ? 'Índice espectral · sienes' : 'Índice espectral · frente';
  const body = isCalm
    ? 'Más alpha (8–12 Hz) y theta (4–8 Hz) frente a beta, en TP9 y TP10, comparado con tu línea base de ojos abiertos. No mide tono parasimpático ni “mente sin rumiación”.'
    : 'Más beta estrecha (15–20 Hz) frente a theta y delta, promedio de FP1 y FP2, comparado con tu línea base. No es un diagnóstico de TDAH ni de “atención estable”.'
  const role = trained ? 'Métrica entrenada hoy' : 'Solo referencia';
  const mod = isCalm ? 'calm' : 'attent';
  const trainedMod = trained ? ' nf-state-card--trained' : ' nf-state-card--reference';
  return `
        <div class="nf-state-card nf-state-card--${mod}${trainedMod} nf-state-card--explain">
          <span class="nf-state-card__role">${role}</span>
          <strong class="nf-state-card__title">${title}</strong>
          <span class="nf-state-card__cat">${cat}</span>
          <p>${body}</p>
        </div>`;
}

export function renderResults(results, meta, sessionNotes = '', showExport = false, liveTrace = []) {
  if (!results) {
    return '<p class="nf-results-empty">Graba una sesión y detén la grabación para ver los resultados aquí.</p>';
  }
  const protocolLabel = displayProtocolLabel(meta);
  const trainedCalm = /calma|relajaci/i.test(meta?.protocol || '');
  const trainedAtt = /atenci/i.test(meta?.protocol || '');
  const calmCard = renderExplainCard({ kind: 'calm', trained: trainedCalm });
  const attCard = renderExplainCard({ kind: 'attent', trained: trainedAtt });
  const cardsHtml = trainedAtt ? attCard + calmCard : calmCard + attCard;
  const trace = liveTrace?.length ? liveTrace : meta?.live_trace || [];
  const showChart = Boolean(buildLiveSeries(trace, meta?.protocol));
  const chartBlock = showChart
    ? `<div class="nf-results__correlation nf-results__correlation--full">
        <div class="nf-chart-wrap nf-chart-wrap--correlation nf-chart-wrap--live">
          <canvas id="nf-live-chart"></canvas>
        </div>
      </div>`
    : '';
  const exportBlock = showExport
    ? `<div class="nf-results__export">
        <button type="button" class="btn btn-secondary btn-sm" id="nf-export-csv">Exportar CSV sesión</button>
        <button type="button" class="btn btn-secondary btn-sm" id="nf-export-pdf">Exportar PDF sesión</button>
      </div>`
    : '';
  const spec = results.spectral || {};
  const incompleteBanner = meta?.incomplete
    ? `<p class="nf-results-empty nf-results-empty--error">Sesión incompleta${meta.incomplete_reason ? ` (${escapeHtml(String(meta.incomplete_reason))})` : ''}.</p>`
    : '';
  const fmtDelta = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `${v}`);
  const lost = spec.packets_lost ?? meta?.packets_lost;
  const expected = spec.packets_expected ?? meta?.packets_expected;
  const fsHz = spec.effective_fs ?? spec.fs_hz ?? meta?.effective_fs;
  const fsOff = spec.fs_off_nominal === true;
  const qualityDetails = [
    lost != null
      ? `<li><span>Paquetes perdidos</span><span>${escapeHtml(String(lost))}${expected != null ? ` / ${escapeHtml(String(expected))}` : ''}</span></li>`
      : '',
    fsHz != null && fsHz !== ''
      ? `<li><span>Frecuencia de muestreo efectiva</span><span>${escapeHtml(String(fsHz))} Hz${fsOff ? ' (desvío &gt;2 % de 256)' : ''}</span></li>`
      : '',
    results.has_baseline
      ? `<li><span>Calma vs línea base</span><span>${fmtDelta(results.delta_calm_pct)}</span></li>`
      : `<li><span>Calma vs línea base</span><span>—</span></li>`,
    results.has_baseline
      ? `<li><span>Atención vs línea base</span><span>${fmtDelta(results.delta_attentive_pct)}</span></li>`
      : `<li><span>Atención vs línea base</span><span>—</span></li>`,
  ].join('');
  return `
    <div class="nf-results">
      <h3 class="nf-results__heading">Resultados de la sesión</h3>
      <p class="nf-results__sub">Protocolo: ${escapeHtml(protocolLabel)}</p>
      <p class="nf-results__sub nf-results__disclaimer">${escapeHtml(NF_HELP_MESSAGE)}</p>
      ${incompleteBanner}
      ${chartBlock}
      <h3 class="nf-results__heading nf-results__heading--secondary">¿Qué significan calma y atención?</h3>
      <p class="nf-results__sub">El % es respecto a tu reposo de esta sesión (ojos abiertos). 50 % = igual que la línea base. El orbe se adapta para el entrenamiento; el número no.</p>
      <div class="nf-results__cards" id="nf-results-cards">
        ${cardsHtml}
      </div>
      <form id="nf-results-form" class="nf-results__notes-form">
        <label class="nf-results__notes-label">
          <span>Descripción de la sesión (opcional)</span>
          <textarea name="session_notes" id="nf-session-notes" rows="3" placeholder="Descripción de la sesión (opcional)">${escapeHtml(sessionNotes)}</textarea>
        </label>
      </form>
      <h3 class="nf-results__details-title">Detalles</h3>
      <ul class="details-list nf-results__details">
        <li><span>Dispositivo</span><span>${escapeHtml(meta?.device || 'Muse 2')}</span></li>
        <li><span>Ubicaciones</span><span>${escapeHtml((meta?.locations || []).join(', ') || '—')}</span></li>
        <li><span>Fecha de inicio</span><span>${formatDate(meta?.started_at)}</span></li>
        <li><span>Fecha de finalización</span><span>${formatDate(meta?.ended_at)}</span></li>
        <li><span>Duración de sesión</span><span>${formatDuration(meta?.duration_sec)}</span></li>
        <li><span>Protocolo</span><span>${escapeHtml(protocolLabel)}</span></li>
        <li><span>Condición de ojos</span><span>${escapeHtml(
          (meta?.eye_condition || spec.eye_condition) === 'closed'
            ? 'Ojos cerrados'
            : NF_EYE_CONDITION_LABEL,
        )}</span></li>
        ${qualityDetails}
      </ul>
      ${exportBlock}
    </div>`;
}

function formatDuration(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '—';
  const n = Math.max(0, Math.floor(Number(sec)));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function chartAxisColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() ||
    '#888888'
  );
}
