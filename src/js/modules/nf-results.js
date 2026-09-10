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
  if (meta?.protocol_id === 'atencion') return 'Beta frontal relativa';
  if (meta?.protocol_id === 'relajacion') return 'Alpha/theta relativa';
  const raw = meta?.protocol || '';
  if (/relajaci|calma/i.test(raw)) return 'Alpha/theta relativa';
  if (/atenci/i.test(raw)) return 'Beta frontal relativa';
  return raw || nfPreset('relajacion').label;
}

function displayLocations(locations) {
  return (locations || []).map((name) => ({ FP1: 'AF7', FP2: 'AF8' })[name] || name);
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
    alpha_theta_relative_score: parts[5] ?? 0,
    beta_frontal_relative_score: parts[6] ?? 0,
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
  const trainedAtt = /atenci|beta frontal/i.test(protocol || '');
  const trainLive = (liveTrace || []).filter((p) => p.phase === 'training' && p.pct != null);
  if (!trainLive.length) return null;
  const t0 = trainLive[0].t;
  const live = trainLive.map((p) => ({ t: (p.t - t0) / 1000, v: p.pct }));
  return { live, label: trainedAtt ? 'índice beta frontal' : 'índice alpha/theta' };
}

function avgLivePct(liveTrace, protocol) {
  const trainedAtt = /atenci|beta frontal/i.test(protocol || '');
  const pts = (liveTrace || []).filter((p) => p.phase === 'training' && p.pct != null);
  if (!pts.length) return null;
  const avg = pts.reduce((a, p) => a + p.pct, 0) / pts.length;
  return {
    value: Math.round(avg * 10) / 10,
    label: trainedAtt ? 'Índice beta frontal' : 'Índice alpha/theta',
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
  const alphaTheta = [];
  const betaFrontal = [];
  sessions.forEach((s) => {
    const mod = s.modules?.find((m) => m.module_type === 'neurofeedback');
    if (!mod) return;
    const data = parseJsonSafe(mod.data, {});
    const res = data.last_results;
    if (!res) return;
    const label = `S${s.number}`;
    const spec = res.spectral || {};
    if (spec.delta_alpha_theta_log_index != null) {
      alphaTheta.push({ label, value: spec.delta_alpha_theta_log_index });
    }
    if (spec.delta_attention_log_index != null) {
      betaFrontal.push({ label, value: spec.delta_attention_log_index });
    }
  });
  return { alphaTheta, betaFrontal };
}

async function mountEvolutionChart(host, treatmentId) {
  destroyEvolutionChart();
  const wrap = host.querySelector('#nf-evolution-wrap');
  if (!wrap || !treatmentId) return;
  try {
    const sessions = await getSessionsWithModules(treatmentId);
    const { alphaTheta, betaFrontal } = buildNfEvolutionPoints(sessions);
    if (alphaTheta.length < 2 && betaFrontal.length < 2) {
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
    if (alphaTheta.length >= 2) {
      datasets.push({
        label: 'Cambio índice alpha/theta (log-ratio)',
        data: alphaTheta.map((p) => p.value),
        borderColor: '#6FA3E8',
        backgroundColor: 'transparent',
        tension: 0.25,
        pointRadius: 3,
      });
    }
    if (betaFrontal.length >= 2) {
      datasets.push({
        label: 'Cambio índice beta frontal (log-ratio)',
        data: betaFrontal.map((p) => p.value),
        borderColor: '#e6a817',
        backgroundColor: 'transparent',
        tension: 0.25,
        pointRadius: 3,
      });
    }
    const labels = (alphaTheta.length >= betaFrontal.length ? alphaTheta : betaFrontal).map((p) => p.label);
    evolutionChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        scales: {
          y: {
            title: { display: true, text: 'Cambio vs línea base (log-ratio)', color: tickColor },
            ticks: { color: tickColor },
          },
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
  const title = isCalm ? 'Índice alpha/theta' : 'Índice beta frontal';
  const cat = isCalm ? 'Índice espectral · sienes' : 'Índice espectral · frente';
  const body = isCalm
    ? 'Más alpha (8–12 Hz) y theta (4–8 Hz) frente a beta, en TP9 y TP10, comparado con la línea base de ojos abiertos. Es un proxy EEG de entrenamiento: no mide calma, tono parasimpático ni “mente sin rumiación”.'
    : 'Más beta estrecha (15–20 Hz) frente a theta y delta, promedio de AF7 y AF8, comparado con la línea base. Es un proxy EEG de entrenamiento: no mide atención ni diagnostica TDAH.'
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
  const trainedCalm = meta?.protocol_id === 'relajacion' || /calma|relajaci|alpha/i.test(meta?.protocol || '');
  const trainedAtt = meta?.protocol_id === 'atencion' || /atenci|beta frontal/i.test(meta?.protocol || '');
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
    `<li><span>Cambio índice alpha/theta</span><span>${fmtDelta(spec.delta_alpha_theta_log_index)} log-ratio</span></li>`,
    `<li><span>Cambio índice beta frontal</span><span>${fmtDelta(spec.delta_attention_log_index)} log-ratio</span></li>`,
    `<li><span>Ventanas válidas de entrenamiento</span><span>${fmtDelta(spec.valid_training_windows)}</span></li>`,
  ].join('');
  return `
    <div class="nf-results">
      <h3 class="nf-results__heading">Resultados de la sesión</h3>
      <p class="nf-results__sub">Protocolo: ${escapeHtml(protocolLabel)}</p>
      <p class="nf-results__sub nf-results__disclaimer">${escapeHtml(NF_HELP_MESSAGE)}</p>
      ${incompleteBanner}
      ${chartBlock}
      <h3 class="nf-results__heading nf-results__heading--secondary">¿Qué significan estos índices?</h3>
      <p class="nf-results__sub">La escala 0–100 transforma la distancia estadística respecto al reposo de esta sesión; no es un porcentaje de un estado mental. 50 = media de la línea base. El orbe adapta su umbral por separado.</p>
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
        <li><span>Ubicaciones</span><span>${escapeHtml(displayLocations(meta?.locations).join(', ') || '—')}</span></li>
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
