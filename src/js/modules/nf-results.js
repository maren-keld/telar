import { bindAutoSave, collectFormData } from '../autobind.js';
import { nfPreset } from '../../lib/nf-bands.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import { getSessionsWithModules } from '../db.js';
import { exportNfSessionCsv, exportNfSessionPdf } from '../export-nf-session.js';
import { syncModuleReadableText } from '../readable-text.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { escapeHtml, formatDate, parseJsonSafe, toast } from '../utils.js';

let correlationChart = null;
let evolutionChart = null;

const NF_RESULTS_SUB = {
  porcentaje: 'Nivel promedio de cada estado durante la grabación.',
  tiempo: 'Tiempo en que se mantuvo un nivel elevado de cada estado.',
};

export function bindNfResultsTab(host, moduleRow, exportCtx = {}, liveTrace = []) {
  const tab = host.querySelector('#nf-tab-resultados');
  if (!tab) return;

  const data = parseJsonSafe(moduleRow.data, {});
  const results = data.last_results;
  const meta = data.last_meta;
  const trace = liveTrace.length ? liveTrace : data.last_live_trace || [];
  if (results?.post_series) {
    requestAnimationFrame(() => initCorrelationChart(host, trace, results.post_series, meta));
  }
  if (exportCtx.treatmentId) {
    void mountEvolutionChart(host, exportCtx.treatmentId);
  }

  tab.querySelectorAll('[data-nf-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.nfMode;
      tab.querySelectorAll('[data-nf-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      tab.querySelectorAll('.nf-state-card__value').forEach((el) => {
        el.textContent = mode === 'tiempo' ? el.dataset.time || '—' : el.dataset.pct || '—';
      });
      const sub = tab.querySelector('#nf-results-sub');
      if (sub) sub.textContent = NF_RESULTS_SUB[mode] || NF_RESULTS_SUB.porcentaje;
    });
  });

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
      <p class="nf-analyze-elapsed" id="nf-analyze-elapsed">Transcurrido: 0:00</p>
    </div>`;
}

export function startAnalyzeProgress(host, durationSec) {
  const est = Math.max(20, Math.ceil(durationSec * 1.5 + 12));
  const bar = host.querySelector('#nf-analyze-bar');
  const etaEl = host.querySelector('#nf-analyze-eta');
  const elapsedEl = host.querySelector('#nf-analyze-elapsed');
  const progressEl = host.querySelector('.nf-analyze-progress');
  const t0 = Date.now();
  const tick = () => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const remaining = Math.max(0, est - elapsed);
    const pct = Math.min(95, (elapsed / est) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (progressEl) progressEl.setAttribute('aria-valuenow', String(elapsed));
    if (elapsedEl) elapsedEl.textContent = `Transcurrido: ${formatDuration(elapsed)}`;
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

function formatResultPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Math.round(Number(value) * 10) / 10;
  return `${n}%`;
}

function formatDeltaPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Math.round(Number(value) * 10) / 10;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n} pp`;
}

export function parseAnalyzeOutput(raw) {
  const lines = String(raw).trim().split('\n').filter(Boolean);
  const parts = lines[0].split(',').map(Number);
  while (parts.length < 11) parts.push(0);
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
  return {
    calm_seconds: parts[0],
    attention_seconds: parts[1],
    calm_level: parts[2],
    attention_level: parts[3],
    relaxation_pct: parts[4],
    calm_pct: parts[5],
    attentive_pct: parts[6],
    baseline_calm_pct: parts[7],
    baseline_attentive_pct: parts[8],
    delta_calm_pct: parts[9],
    delta_attentive_pct: parts[10],
    post_series: postSeries,
    spectral,
  };
}

function buildCorrelationSeries(liveTrace, postSeries, protocol) {
  const trainedAtt = /atenci/i.test(protocol || '');
  const trainLive = (liveTrace || []).filter((p) => p.phase === 'training' && p.pct != null);
  if (!trainLive.length || !postSeries?.length) return null;
  const t0 = trainLive[0].t;
  const live = trainLive.map((p) => ({ t: (p.t - t0) / 1000, v: p.pct }));
  const post = postSeries.map((p) => ({
    t: p.t,
    v: trainedAtt ? p.att : p.calm,
  }));
  return { live, post, label: trainedAtt ? 'atención' : 'calma' };
}

function destroyCorrelationChart() {
  if (correlationChart) {
    correlationChart.destroy();
    correlationChart = null;
  }
}

function initCorrelationChart(host, liveTrace, postSeries, meta) {
  destroyCorrelationChart();
  const canvas = host.querySelector('#nf-correlation-chart');
  if (!canvas || !window.Chart) return;
  const series = buildCorrelationSeries(liveTrace, postSeries, meta?.protocol);
  if (!series) return;
  const tickColor = chartAxisColor();
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  correlationChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: `En vivo (${series.label})`,
          data: series.live.map((p) => ({ x: p.t, y: p.v })),
          borderColor: '#4B7FD1',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'Análisis post',
          data: series.post.map((p) => ({ x: p.t, y: p.v })),
          borderColor: '#e67e22',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: {
      parsing: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tiempo entrenamiento (s)', color: tickColor },
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

function renderSpectralBlock(spectral) {
  if (!spectral || spectral.theta_beta_fp2 == null) return '';
  const artifact =
    spectral.artifact_pct != null ? `${Math.round(spectral.artifact_pct)}%` : '—';
  return `
      <div class="nf-results__spectral">
        <h3 class="nf-results__heading">Análisis espectral</h3>
        <p class="nf-results__sub nf-results__disclaimer">Resumen orientativo con 4 electrodos — no es qEEG diagnóstico.</p>
        <ul class="details-list nf-results__details">
          <li><span>Theta/Beta (FP2)</span><span>${escapeHtml(String(spectral.theta_beta_fp2))}</span></li>
          <li><span>Asimetría alpha FP1−FP2</span><span>${escapeHtml(String(spectral.alpha_asym_fp))} pp</span></li>
          <li><span>Ventanas con artefacto</span><span>${escapeHtml(artifact)}</span></li>
        </ul>
      </div>`;
}

function destroyEvolutionChart() {
  if (evolutionChart) {
    evolutionChart.destroy();
    evolutionChart = null;
  }
}

export function destroyNfResultCharts() {
  destroyCorrelationChart();
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

function renderStateCard({ kind, pct, time, trained }) {
  const isCalm = kind === 'calm';
  const title = isCalm ? 'Calma' : 'Atención';
  const cat = isCalm ? 'Estado cognitivo-emocional' : 'Estado ejecutivo';
  const body = isCalm
    ? 'La mente se mantiene tranquila sin acelerarse ni entrar en rumiación. Indica regulación parasimpática y baja activación emocional.'
    : 'Selección y mantenimiento de la información para una tarea. Indica atención estable con baja somnolencia y/o movimiento.';
  const role = trained ? 'Métrica entrenada hoy' : 'Solo referencia';
  const mod = isCalm ? 'calm' : 'attent';
  const trainedMod = trained ? ' nf-state-card--trained' : ' nf-state-card--reference';
  return `
        <div class="nf-state-card nf-state-card--${mod}${trainedMod}">
          <span class="nf-state-card__role">${role}</span>
          <h4 class="nf-state-card__value" data-pct="${escapeHtml(pct)}" data-time="${escapeHtml(time)}">${escapeHtml(pct)}</h4>
          <strong>${title}</strong>
          <span class="nf-state-card__cat">${cat}</span>
          <p>${body}</p>
        </div>`;
}

export function renderResults(results, meta, sessionNotes = '', showExport = false, liveTrace = []) {
  if (!results) {
    return '<p class="nf-results-empty">Graba una sesión y detén la grabación para ver los resultados aquí.</p>';
  }
  const calmPct = formatResultPct(results.calm_pct);
  const attPct = formatResultPct(results.attentive_pct);
  const calmTime = formatDuration(results.calm_seconds);
  const attTime = formatDuration(results.attention_seconds);
  const protocolLabel = displayProtocolLabel(meta);
  const trainedCalm = /calma|relajaci/i.test(meta?.protocol || '');
  const trainedAtt = /atenci/i.test(meta?.protocol || '');
  const calmCard = renderStateCard({ kind: 'calm', pct: calmPct, time: calmTime, trained: trainedCalm });
  const attCard = renderStateCard({ kind: 'attent', pct: attPct, time: attTime, trained: trainedAtt });
  const cardsHtml = trainedAtt ? attCard + calmCard : calmCard + attCard;
  const hasBaseline =
    (results.baseline_calm_pct > 0 || results.baseline_attentive_pct > 0) && !meta?.baseline_skipped;
  const trainedDelta = trainedAtt ? results.delta_attentive_pct : results.delta_calm_pct;
  const trainedBaseline = trainedAtt ? results.baseline_attentive_pct : results.baseline_calm_pct;
  const baselineBlock = hasBaseline
    ? `<div class="nf-results__baseline">
        <h3 class="nf-results__heading">Vs línea base de hoy</h3>
        <p class="nf-results__sub">Reposo antes del entrenamiento vs fase activa (puntos porcentuales).</p>
        <ul class="details-list nf-results__details">
          <li><span>Reposo (${trainedAtt ? 'atención' : 'calma'})</span><span>${formatResultPct(trainedBaseline)}</span></li>
          <li><span>Entrenamiento</span><span>${trainedAtt ? attPct : calmPct}</span></li>
          <li><span>Cambio (Δ)</span><span>${formatDeltaPct(trainedDelta)}</span></li>
        </ul>
      </div>`
    : '';
  const trace = liveTrace?.length ? liveTrace : meta?.live_trace || [];
  const showChart = Boolean(buildCorrelationSeries(trace, results.post_series, meta?.protocol));
  const chartBlock = showChart
    ? `<div class="nf-results__correlation">
        <h3 class="nf-results__heading">Sesión en vivo vs análisis</h3>
        <p class="nf-results__sub nf-results__disclaimer">Comparación orientativa — no es diagnóstico.</p>
        <div class="nf-chart-wrap nf-chart-wrap--correlation">
          <canvas id="nf-correlation-chart" height="160"></canvas>
        </div>
      </div>`
    : '';
  const spectralBlock = renderSpectralBlock(results.spectral);
  const evolutionBlock = `
      <div class="nf-results__evolution" id="nf-evolution-wrap" hidden>
        <h3 class="nf-results__heading">Evolución en el tratamiento</h3>
        <p class="nf-results__sub">Porcentaje medio por sesión con módulo de neurofeedback.</p>
        <div class="nf-chart-wrap nf-chart-wrap--evolution">
          <canvas id="nf-evolution-chart" height="160"></canvas>
        </div>
      </div>`;
  const exportBlock = showExport
    ? `<div class="nf-results__export">
        <button type="button" class="btn btn-secondary btn-sm" id="nf-export-csv">Exportar CSV sesión</button>
        <button type="button" class="btn btn-secondary btn-sm" id="nf-export-pdf">Exportar PDF sesión</button>
      </div>`
    : '';
  return `
    <div class="nf-results">
      <h3 class="nf-results__heading">Estado mental</h3>
      <p class="nf-results__sub" id="nf-results-sub">${NF_RESULTS_SUB.porcentaje}</p>
      <div class="nf-results__toggle" role="tablist">
        <button type="button" class="nf-results__mode active" data-nf-mode="porcentaje">Porcentaje</button>
        <button type="button" class="nf-results__mode" data-nf-mode="tiempo">En tiempo</button>
      </div>
      <div class="nf-results__cards" id="nf-results-cards">
        ${cardsHtml}
      </div>
      ${baselineBlock}
      ${chartBlock}
      ${spectralBlock}
      ${evolutionBlock}
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
