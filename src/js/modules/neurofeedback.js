import { bindAutoSave, collectFormData } from '../autobind.js';
import { NF_PROTOCOL_ELECTRODES, NF_PROTOCOL_PRESETS, NF_SUPPORTED_DEVICE, nfPreset } from '../../lib/nf-bands.js';
import { NeurofeedbackSession } from '../../lib/nf-session.js';
import { isAudioFeedbackEnabled, setAudioFeedbackEnabled, setNfAudioProtocol } from '../../lib/nf-audio.js';
import { analyzeSessionPython, saveNeurofeedbackRecording } from '../db.js';
import { exportNfSessionCsv, exportNfSessionPdf } from '../export-nf-session.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, formatDate, parseJsonSafe, toast } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { ICON_BATTERY, ICON_VOLUME_OFF, ICON_VOLUME_ON } from '../icons.js';

export const NF_HELP_MESSAGE =
  'Solo Muse 2. BLE nativo en macOS/Windows. Bienestar y autorregulación — no es dispositivo médico. Informa al paciente que la señal EEG se guarda cifrada en tu computador. Feedback en vivo: Delta, Theta, Alpha, Beta.';

let nfSession = null;
let frequencyChart = null;
let voltageChart = null;
let activeTab = 'sesion';
/** @type {'visual'|'freq'|'volt'} */
let feedbackMode = 'visual';
let visualTarget = 0;
let visualDisplay = 0;
let pctDisplay = 0;
let orbAnimId = null;
let orbHostRef = null;

const ORB_COLOR_STOPS = [
  { at: 0, h: 2, s: 86, l: 48 },
  { at: 30, h: 6, s: 84, l: 50 },
  { at: 45, h: 46, s: 92, l: 54 },
  { at: 60, h: 52, s: 88, l: 52 },
  { at: 100, h: 138, s: 70, l: 48 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function primaryAccentColor() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(accent)) return hexToHsl(accent);
  return { h: 221, s: 83, l: 55 };
}

function orbColorFromPct(pct) {
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < ORB_COLOR_STOPS.length - 1; i++) {
    const a = ORB_COLOR_STOPS[i];
    const b = ORB_COLOR_STOPS[i + 1];
    if (p <= b.at) {
      const t = (p - a.at) / (b.at - a.at);
      return {
        h: lerp(a.h, b.h, t),
        s: lerp(a.s, b.s, t),
        l: lerp(a.l, b.l, t),
      };
    }
  }
  const last = ORB_COLOR_STOPS[ORB_COLOR_STOPS.length - 1];
  return { h: last.h, s: last.s, l: last.l };
}

function isSessionConnected() {
  return nfSession?.connectionStatus === 'connected';
}

function resetOrbFeedback() {
  visualTarget = 0;
  pctDisplay = 0;
}

function paintVisualOrb(host, level, pct, { idle = false } = {}) {
  const orb = host.querySelector('#nf-orb');
  const glow = host.querySelector('#nf-orb-glow');
  const scene = host.querySelector('.nf-orb-scene');
  if (!orb || !scene) return;
  const orbLevel = idle ? Math.max(level, 0.32) : level;
  const scale = 0.42 + orbLevel * 0.58;
  const { h, s, l } = idle ? primaryAccentColor() : orbColorFromPct(pct);
  const hi = `hsl(${h}, ${Math.min(100, s + 6)}%, ${Math.min(96, l + 22)}%)`;
  const mid = `hsl(${h}, ${s}%, ${l}%)`;
  const lo = `hsl(${h}, ${Math.max(0, s - 4)}%, ${Math.max(8, l - 12)}%)`;

  orb.style.transform = `scale(${scale})`;
  orb.style.background = `radial-gradient(circle at 34% 28%, ${hi} 0%, ${mid} 52%, ${lo} 100%)`;
  orb.style.boxShadow = `0 0 32px hsla(${h}, ${s}%, ${l}%, 0.42), inset 0 -5px 14px rgba(0, 0, 0, 0.14)`;

  if (glow) {
    glow.style.transform = `scale(${scale * 1.12})`;
    glow.style.background = `radial-gradient(circle, hsla(${h}, ${s}%, ${l}%, 0.55) 0%, hsla(${h}, ${s}%, ${l}%, 0.14) 45%, transparent 72%)`;
  }

  scene.style.setProperty('--nf-orb-h', String(Math.round(h)));
  scene.style.setProperty('--nf-orb-s', `${Math.round(s)}%`);
  scene.style.setProperty('--nf-orb-l', `${Math.round(l)}%`);
  scene.style.setProperty('--nf-orb-scale', String(scale));
  host.querySelectorAll('.nf-orb-field').forEach((field) => {
    field.style.setProperty('--nf-orb-scale', String(scale));
  });
}

function startOrbAnimation(host) {
  if (orbHostRef !== host) stopOrbAnimation();
  orbHostRef = host;
  if (orbAnimId != null) return;
  const tick = () => {
    const connected = isSessionConnected();
    const protocol = nfSession?.protocol || 'relajacion';
    if (feedbackMode === 'visual') {
      if (connected) {
        visualDisplay += (visualTarget - visualDisplay) * 0.055;
        pctDisplay += (visualTarget - pctDisplay) * 0.07;
        const pct = Math.round(pctDisplay * 100);
        paintVisualOrb(host, visualDisplay, pct);
        updateFeedbackPct(host, pct, protocol);
      } else {
        const idlePulse = 0.38 + 0.07 * Math.sin(Date.now() / 1400);
        visualDisplay += (idlePulse - visualDisplay) * 0.045;
        pctDisplay += (0 - pctDisplay) * 0.07;
        paintVisualOrb(host, visualDisplay, 0, { idle: true });
        updateFeedbackPct(host, 0, protocol);
      }
    }
    orbAnimId = requestAnimationFrame(tick);
  };
  orbAnimId = requestAnimationFrame(tick);
}

function feedbackPctLabel(protocol) {
  return nfPreset(protocol).pctLabel;
}

function feedbackPctHint(protocol) {
  return nfPreset(protocol).pctHint;
}

function applyProtocolElectrodes(host, protocol, session) {
  const defaults = NF_PROTOCOL_ELECTRODES[protocol] || NF_PROTOCOL_ELECTRODES.relajacion;
  host.querySelectorAll('#nf-electrodes .chip').forEach((chip) => {
    const on = Boolean(defaults[chip.dataset.e]);
    chip.classList.toggle('active', on);
    session.setElectrode(chip.dataset.e, on);
  });
}

function stopOrbAnimation() {
  if (orbAnimId != null) {
    cancelAnimationFrame(orbAnimId);
    orbAnimId = null;
  }
  orbHostRef = null;
}

function updateFeedbackPct(host, pct, protocol) {
  const pctEl = host.querySelector('#nf-visual-pct');
  const labelEl = host.querySelector('#nf-visual-pct-label');
  const hintEl = host.querySelector('#nf-visual-pct-hint');
  if (!pctEl) return;
  pctEl.textContent = `${pct}%`;
  if (labelEl) labelEl.textContent = feedbackPctLabel(protocol);
  if (hintEl) hintEl.textContent = feedbackPctHint(protocol);
}

function syncFeedbackVisibility(host) {
  const visualEl = host.querySelector('#nf-visual');
  const freqEl = host.querySelector('#nf-chart-freq');
  const voltEl = host.querySelector('#nf-chart-volt');
  const emptyEl = host.querySelector('#nf-feedback-empty');
  if (visualEl) visualEl.hidden = feedbackMode !== 'visual';
  if (freqEl) freqEl.hidden = feedbackMode !== 'freq';
  if (voltEl) voltEl.hidden = feedbackMode !== 'volt';
  if (emptyEl) emptyEl.hidden = true;
}

function setFeedbackMode(host, mode) {
  feedbackMode = mode;
  syncFeedbackModeChips(host);
  syncFeedbackVisibility(host);
  if (feedbackMode === 'visual') startOrbAnimation(host);
}

function syncFeedbackModeChips(host) {
  host.querySelectorAll('#nf-feedback-modes .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.fb === feedbackMode);
  });
}

function bindAdvancedAccordion(host) {
  const details = host.querySelector('#nf-advanced');
  const chevron = host.querySelector('#nf-advanced-chevron');
  if (!details || !chevron) return;
  const sync = () => {
    chevron.textContent = details.open ? '▾' : '▸';
  };
  details.addEventListener('toggle', sync);
  sync();
}

function nfBarColors() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark
    ? ['#6FA3E8', '#5B8FD9', '#4B7FD1', '#3D6FB8']
    : ['#001745', '#002B5D', '#4B7FD1', '#6FA3E8'];
}

function _destroyCharts() {
  if (frequencyChart) {
    frequencyChart.destroy();
    frequencyChart = null;
  }
  if (voltageChart) {
    voltageChart.destroy();
    voltageChart = null;
  }
}

/** Detiene BLE, grabación y audio al salir del espacio de trabajo. */
export function teardownNeurofeedback() {
  stopOrbAnimation();
  if (nfSession) {
    void nfSession.disconnect();
    nfSession = null;
  }
  _destroyCharts();
}

export async function renderNeurofeedback(host, moduleRow, ctx = {}) {
  stopOrbAnimation();
  activeTab = 'sesion';
  feedbackMode = 'visual';
  visualTarget = 0;
  visualDisplay = 0;
  pctDisplay = 0;
  if (nfSession) {
    nfSession.disconnect();
    nfSession = null;
  }
  _destroyCharts();

  const saved = parseJsonSafe(moduleRow.data);
  const lastResults = saved.last_results || null;
  const lastMeta = saved.last_meta || null;
  const initialProtocol = lastMeta?.protocol || 'relajacion';
  const protocolChips = Object.values(NF_PROTOCOL_PRESETS)
    .map(
      (p) =>
        `<button type="button" class="chip${p.id === initialProtocol ? ' active' : ''}" data-p="${p.id}" title="${escapeHtml(p.description)}">${escapeHtml(p.label)}</button>`,
    )
    .join('');

  host.innerHTML = `
    <div class="nf-panel" id="neurofeedback">
      <div class="nf-header">
        <div class="nf-header__intro">
          <h2 class="module-title" style="margin:0">Neurofeedback</h2>
          <p class="nf-disclaimer nf-disclaimer--head">Herramienta de bienestar y autorregulación fisiológica.</p>
        </div>
      </div>
      <div class="tabs" id="nf-tabs">
        <button type="button" class="tab active" data-tab="sesion" title="Sesión en vivo">Sesión</button>
        <button type="button" class="tab" data-tab="resultados" title="Resultados grabados">Resultados</button>
      </div>
      <div id="nf-tab-sesion">
        <div class="nf-row nf-row--device">
          <div class="nf-row__left">
            <span class="nf-row__title">Dispositivo <span id="nf-device-state" class="nf-device-state" hidden></span></span>
            <span id="nf-device-label" class="nf-device-name" hidden></span>
          </div>
          <div class="nf-row__right">
            <span id="nf-battery" class="nf-battery"></span>
            <button type="button" class="btn btn-primary nf-device__connect" id="nf-connect" title="Conectar o desconectar ${NF_SUPPORTED_DEVICE}">Conectar ${NF_SUPPORTED_DEVICE}</button>
          </div>
        </div>
        <div class="nf-row nf-row--protocols">
          <span class="nf-row__title">Protocolos</span>
          <div class="nf-chips nf-protocols" id="nf-protocols">
            ${protocolChips}
          </div>
        </div>
        <details class="nf-advanced" id="nf-advanced">
          <summary class="nf-advanced__head">
            <span class="nf-advanced__title">Ajustes avanzados</span>
            <span class="nf-advanced__chevron" id="nf-advanced-chevron" aria-hidden="true">▸</span>
          </summary>
          <div class="nf-advanced__body">
            <p class="nf-field-label">Ubicación</p>
            <div class="nf-chips" id="nf-electrodes">
              ${['FP1', 'FP2', 'TP9', 'TP10']
                .map((e) => `<button type="button" class="chip active" data-e="${e}" title="Electrodo ${e}">${e}</button>`)
                .join('')}
            </div>
            <p class="nf-field-label">Retroalimentación</p>
            <div class="nf-chips nf-feedback-modes" id="nf-feedback-modes">
              <button type="button" class="chip active" data-fb="visual" title="Animación visual en vivo">Visual</button>
              <button type="button" class="chip" data-fb="freq" title="Potencia por banda">Frecuencias</button>
              <button type="button" class="chip" data-fb="volt" title="Señal en µV (últimos 3 s)">Voltaje</button>
            </div>
          </div>
        </details>
        <div class="nf-feedback-head">
          <p class="nf-field-label nf-feedback-section-label">Retroalimentación</p>
          <button type="button" class="nf-audio-toggle" id="nf-audio-toggle" aria-pressed="false" title="Audio de feedback (activar/desactivar)">
            <span class="nf-audio-toggle__icon nf-audio-toggle__icon--off" aria-hidden="true">${ICON_VOLUME_OFF}</span>
            <span class="nf-audio-toggle__icon nf-audio-toggle__icon--on" aria-hidden="true">${ICON_VOLUME_ON}</span>
          </button>
        </div>
        <div class="nf-feedback-output" id="nf-feedback-output">
          <p class="nf-feedback-empty" id="nf-feedback-empty" hidden>Activa al menos un modo en Ajustes avanzados.</p>
          <div class="nf-visual" id="nf-visual">
            <div class="nf-orb-scene" aria-hidden="true">
              <div class="nf-orb-field nf-orb-field--1"></div>
              <div class="nf-orb-field nf-orb-field--2"></div>
              <div class="nf-orb-field nf-orb-field--3"></div>
              <div class="nf-orb-glow" id="nf-orb-glow"></div>
              <div class="nf-orb" id="nf-orb"></div>
            </div>
            <div class="nf-visual-meta">
              <span class="nf-visual-pct" id="nf-visual-pct">0%</span>
              <span class="nf-visual-pct-label" id="nf-visual-pct-label">calma</span>
              <span class="nf-visual-pct-hint" id="nf-visual-pct-hint">alpha + theta</span>
            </div>
          </div>
          <div class="nf-chart-wrap" id="nf-chart-freq">
            <canvas id="nf-frequency-chart"></canvas>
          </div>
          <div class="nf-chart-wrap" id="nf-chart-volt" hidden>
            <canvas id="nf-voltage-chart"></canvas>
          </div>
        </div>
        <div class="nf-record-wrap">
          <span class="nf-record-timer badge badge--info" id="nf-record-timer" hidden aria-live="polite">0:00</span>
          <div class="nf-record" id="nf-record-wrap">
            <button type="button" class="btn btn-secondary" id="nf-record-btn" title="Iniciar o detener grabación de sesión"><span class="dot"></span> Grabar sesión</button>
          </div>
        </div>
      </div>
      <div id="nf-tab-resultados" hidden>
        ${renderResults(lastResults, lastMeta, saved.session_notes || '', Boolean(lastResults))}
      </div>
    </div>`;

  const exportCtx = {
    patientName: ctx.treatment?.patient_name || ctx.patientName,
    sessionNumber: ctx.sessionNumber,
  };

  initCharts(host);
  bindEvents(host, moduleRow, ctx.onSaved, initialProtocol, exportCtx);
  bindResultsTab(host, moduleRow, exportCtx);

  const obs = new MutationObserver(() => {
    if (!host.isConnected) {
      if (nfSession) {
        nfSession.disconnect();
        nfSession = null;
      }
      _destroyCharts();
      obs.disconnect();
    }
  });
  const watchTarget = host.parentElement?.parentElement ?? document.body;
  obs.observe(watchTarget, { childList: true });
}

function bindResultsTab(host, moduleRow, exportCtx = {}) {
  const tab = host.querySelector('#nf-tab-resultados');
  if (!tab) return;

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

  tab.querySelector('#nf-export-csv')?.addEventListener('click', async () => {
    try {
      await exportNfSessionCsv(getExportPayload());
      toast('CSV exportado');
    } catch (e) {
      toast(e.message || 'No se pudo exportar CSV');
    }
  });

  tab.querySelector('#nf-export-pdf')?.addEventListener('click', async () => {
    try {
      await exportNfSessionPdf(getExportPayload());
      toast('PDF exportado');
    } catch (e) {
      toast(e.message || 'No se pudo exportar PDF');
    }
  });
}

function renderResultsLoading(durationSec = 0) {
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

function startAnalyzeProgress(host, durationSec) {
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

function renderResultsError(message) {
  return `<div class="nf-results"><p class="nf-results-empty nf-results-empty--error">${escapeHtml(message)}</p></div>`;
}

function nfErrorMessage(err) {
  if (typeof err === 'string') return err;
  return err?.message || String(err) || 'Error al analizar la sesión';
}

function displayProtocolLabel(meta) {
  const raw = meta?.protocol || '';
  if (/relajaci/i.test(raw)) return 'Calma';
  return raw || nfPreset('relajacion').label;
}

const NF_RESULTS_SUB = {
  porcentaje: 'Nivel promedio de cada estado durante la grabación.',
  tiempo: 'Tiempo en que se mantuvo un nivel elevado de cada estado.',
};

function formatResultPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Math.round(Number(value) * 10) / 10;
  return `${n}%`;
}

function renderResults(results, meta, sessionNotes = '', showExport = false) {
  if (!results) {
    return '<p class="nf-results-empty">Graba una sesión y detén la grabación para ver los resultados aquí.</p>';
  }
  const calmPct = formatResultPct(results.calm_pct);
  const attPct = formatResultPct(results.attentive_pct);
  const calmTime = formatDuration(results.calm_seconds);
  const attTime = formatDuration(results.attention_seconds);
  const protocolLabel = displayProtocolLabel(meta);
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
        <div class="nf-state-card nf-state-card--calm">
          <h4 class="nf-state-card__value" data-pct="${escapeHtml(calmPct)}" data-time="${escapeHtml(calmTime)}">${escapeHtml(calmPct)}</h4>
          <strong>Calma</strong>
          <span class="nf-state-card__cat">Estado cognitivo-emocional</span>
          <p>La mente se mantiene tranquila sin acelerarse ni entrar en rumiación. Indica regulación parasimpática y baja activación emocional.</p>
        </div>
        <div class="nf-state-card nf-state-card--attent">
          <h4 class="nf-state-card__value" data-pct="${escapeHtml(attPct)}" data-time="${escapeHtml(attTime)}">${escapeHtml(attPct)}</h4>
          <strong>Atención</strong>
          <span class="nf-state-card__cat">Estado ejecutivo</span>
          <p>Selección y mantenimiento de la información para una tarea. Indica atención estable con baja somnolencia y/o movimiento.</p>
        </div>
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

function switchToResultsTab(host) {
  activeTab = 'resultados';
  host.querySelectorAll('#nf-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === 'resultados');
  });
  const sesion = host.querySelector('#nf-tab-sesion');
  const resultados = host.querySelector('#nf-tab-resultados');
  if (!sesion || !resultados) return;
  sesion.hidden = true;
  resultados.hidden = false;
  resultados.removeAttribute('hidden');
  requestAnimationFrame(() => {
    host.querySelector('#nf-tabs')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function initCharts(host) {
  const tickColor = chartAxisColor();
  const chartAnim = { duration: 280, easing: 'easeOutQuad' };
  const freqCanvas = host.querySelector('#nf-frequency-chart');
  if (freqCanvas && window.Chart) {
    const prev = Chart.getChart(freqCanvas);
    if (prev) prev.destroy();
    frequencyChart = new Chart(freqCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Delta', 'Theta', 'Alpha', 'Beta'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: nfBarColors() }],
      },
      options: {
        animation: chartAnim,
        scales: {
          y: { min: 0, max: 100, ticks: { color: tickColor } },
          x: { ticks: { color: tickColor } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  const voltCanvas = host.querySelector('#nf-voltage-chart');
  if (voltCanvas && window.Chart) {
    const prev = Chart.getChart(voltCanvas);
    if (prev) prev.destroy();
    voltageChart = new Chart(voltCanvas.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        animation: { duration: 120, easing: 'linear' },
        scales: {
          y: {
            min: -400,
            max: 400,
            title: { display: true, text: 'µV', color: tickColor },
            ticks: { color: tickColor },
          },
          x: { display: false },
        },
        plugins: {
          legend: { display: true, labels: { color: tickColor, boxWidth: 12 } },
        },
      },
    });
  }

  nfSession?.setFrequencyChart(frequencyChart);
  nfSession?.setVoltageChart(voltageChart);
}

function bindEvents(host, moduleRow, onSaved, initialProtocol = 'relajacion', exportCtx = {}) {
  nfSession = new NeurofeedbackSession();
  nfSession.setFrequencyChart(frequencyChart);
  nfSession.setVoltageChart(voltageChart);

  host.querySelectorAll('#nf-feedback-modes .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setFeedbackMode(host, chip.dataset.fb);
    });
  });

  bindAdvancedAccordion(host);
  syncFeedbackVisibility(host);

  const syncAudioToggle = () => {
    const btn = host.querySelector('#nf-audio-toggle');
    if (!btn) return;
    const on = isAudioFeedbackEnabled();
    btn.classList.toggle('nf-audio-toggle--on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Desactivar audio de feedback' : 'Activar audio de feedback';
  };
  host.querySelector('#nf-audio-toggle')?.addEventListener('click', () => {
    setAudioFeedbackEnabled(!isAudioFeedbackEnabled());
    setNfAudioProtocol(nfSession?.protocol || 'relajacion');
    syncAudioToggle();
  });
  syncAudioToggle();

  host.querySelectorAll('#nf-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      host.querySelectorAll('#nf-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      host.querySelector('#nf-tab-sesion').hidden = activeTab !== 'sesion';
      host.querySelector('#nf-tab-resultados').hidden = activeTab !== 'resultados';
    });
  });

  host.querySelectorAll('#nf-electrodes .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      nfSession.setElectrode(chip.dataset.e, chip.classList.contains('active'));
    });
  });

  host.querySelectorAll('#nf-protocols .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      host.querySelectorAll('#nf-protocols .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const protocol = chip.dataset.p;
      nfSession.setProtocol(protocol);
      setNfAudioProtocol(protocol);
      applyProtocolElectrodes(host, protocol, nfSession);
      updateFeedbackPct(host, Math.round(pctDisplay * 100), protocol);
    });
  });

  const btnConnect = host.querySelector('#nf-connect');
  const deviceLabel = host.querySelector('#nf-device-label');
  const deviceStateEl = host.querySelector('#nf-device-state');
  const batteryEl = host.querySelector('#nf-battery');

  const renderBattery = (pct) => {
    if (pct == null) {
      batteryEl.innerHTML = '';
      return;
    }
    batteryEl.innerHTML = `<span class="nf-battery__icon" aria-hidden="true">${ICON_BATTERY}</span><span class="nf-battery__pct">${pct}%</span>`;
    batteryEl.classList.toggle('nf-battery--low', pct <= 20);
  };

  const isMuseConnected = () =>
    nfSession.muse?.state === 2 || nfSession.connectionStatus === 'connected';

  const syncUi = () => {
    const st = nfSession.connectionStatus;
    const connected = isMuseConnected();
    const connecting = st === 'connecting' && !connected;

    if (deviceStateEl) {
      if (connecting) {
        deviceStateEl.textContent = '(buscando dispositivo)';
        deviceStateEl.hidden = false;
        deviceStateEl.className = 'nf-device-state nf-device-state--connecting';
      } else if (connected) {
        deviceStateEl.textContent = '(conectado)';
        deviceStateEl.hidden = false;
        deviceStateEl.className = 'nf-device-state nf-device-state--connected';
      } else {
        deviceStateEl.textContent = '';
        deviceStateEl.hidden = true;
        deviceStateEl.className = 'nf-device-state';
      }
    }

    if (connected) {
      deviceLabel.textContent = nfSession.getDeviceLabel();
      deviceLabel.hidden = false;
    } else {
      deviceLabel.textContent = '';
      deviceLabel.hidden = true;
    }

    btnConnect.disabled = false;
    if (connecting) {
      btnConnect.textContent = 'Cancelar';
      btnConnect.dataset.action = 'cancel';
    } else if (connected) {
      btnConnect.textContent = 'Desconectar';
      btnConnect.dataset.action = 'disconnect';
    } else if (nfSession.connectError) {
      btnConnect.textContent = `Reconectar ${NF_SUPPORTED_DEVICE}`;
      btnConnect.dataset.action = 'connect';
    } else {
      btnConnect.textContent = `Conectar ${NF_SUPPORTED_DEVICE}`;
      btnConnect.dataset.action = 'connect';
    }
    const primary = btnConnect.dataset.action === 'connect';
    btnConnect.classList.toggle('btn-primary', primary);
    btnConnect.classList.toggle('btn-secondary', !primary);
  };

  nfSession.onConnectFailed = (msg) => {
    syncUi();
    toast(msg || 'Error al conectar');
  };

  nfSession.onBandsUpdate = ({ level }) => {
    if (nfSession.connectionStatus !== 'connected') return;
    visualTarget = level;
  };

  nfSession.setProtocol(initialProtocol);
  setNfAudioProtocol(initialProtocol);
  applyProtocolElectrodes(host, initialProtocol, nfSession);
  updateFeedbackPct(host, 0, initialProtocol);
  paintVisualOrb(host, 0.38, 0, { idle: true });
  startOrbAnimation(host);

  nfSession.onStatusChange = (status) => {
    syncUi();
    if (status === 'disconnected') {
      resetOrbFeedback();
    }
  };
  nfSession.onBatteryUpdate = (pct) => {
    renderBattery(pct);
  };

  btnConnect?.addEventListener('click', async () => {
    if (nfSession.connectionStatus === 'connecting' && !isMuseConnected()) {
      nfSession.cancelConnect();
      syncUi();
      toast('Conexión cancelada');
      return;
    }
    if (isMuseConnected()) {
      resetOrbFeedback();
      await nfSession.disconnect();
      renderBattery(null);
      syncUi();
      toast('Muse desconectado');
      return;
    }
    nfSession.connectError = null;
    syncUi();
    try {
      await nfSession.connect();
      syncUi();
      toast('Muse conectado');
    } catch (e) {
      syncUi();
    }
  });

  nfSession.onDisconnected = () => {
    resetOrbFeedback();
    syncUi();
    if (nfSession.connectionStatus !== 'connecting') {
      toast('Muse desconectado — intentando reconectar…');
    }
  };

  syncUi();

  const recordBtn = host.querySelector('#nf-record-btn');
  const recordWrap = host.querySelector('#nf-record-wrap');
  const recordTimerEl = host.querySelector('#nf-record-timer');
  let isRec = false;
  let recordTimerInterval = null;
  let recordStartedAt = 0;

  const stopRecordTimer = () => {
    if (recordTimerInterval) {
      clearInterval(recordTimerInterval);
      recordTimerInterval = null;
    }
    if (recordTimerEl) recordTimerEl.hidden = true;
  };

  const tickRecordTimer = () => {
    if (!recordTimerEl || !recordStartedAt) return;
    const sec = Math.floor((Date.now() - recordStartedAt) / 1000);
    recordTimerEl.textContent = formatDuration(sec);
  };

  recordBtn?.addEventListener('click', async () => {
    if (!isMuseConnected()) {
      toast('Conecta el Muse primero');
      return;
    }
    if (!isRec) {
      nfSession.startRecording();
      isRec = true;
      recordWrap.classList.add('recording');
      recordStartedAt = Date.now();
      if (recordTimerEl) {
        recordTimerEl.hidden = false;
        recordTimerEl.textContent = '0:00';
      }
      recordTimerInterval = setInterval(tickRecordTimer, 1000);
      recordBtn.innerHTML = '<span class="dot"></span> Detener grabación';
      return;
    }

    const payload = nfSession.stopRecording();
    isRec = false;
    recordWrap.classList.remove('recording');
    stopRecordTimer();
    recordBtn.innerHTML = '<span class="dot"></span> Grabar sesión';

    if (!payload || !payload.trim()) {
      toast('Sin datos grabados — verifica que el Muse envía señal');
      return;
    }

    const meta = nfSession.getRecordingMeta();
    const resultadosEl = host.querySelector('#nf-tab-resultados');
    const sessionDur = meta.duration_sec || 0;
    recordBtn.disabled = true;
    let analyzeTimer = null;
    try {
      await nfSession.disconnect();
      resetOrbFeedback();
      renderBattery(null);
      syncUi();

      if (resultadosEl) {
        resultadosEl.innerHTML = renderResultsLoading(sessionDur);
        switchToResultsTab(host);
        analyzeTimer = startAnalyzeProgress(host, sessionDur);
      }

      const csv = String(await analyzeSessionPython(payload)).trim();
      const parts = csv.split(',').map(Number);
      if (parts.length < 7 || parts.some((n) => Number.isNaN(n))) {
        throw new Error(`Respuesta inválida del analizador: ${csv.slice(0, 120)}`);
      }
      const results = {
        calm_seconds: parts[0],
        attention_seconds: parts[1],
        calm_level: parts[2],
        attention_level: parts[3],
        relaxation_pct: parts[4],
        calm_pct: parts[5],
        attentive_pct: parts[6],
      };
      await saveNeurofeedbackRecording(moduleRow.id, {
        ...meta,
        raw_data: payload,
        results,
      });
      const merged = await syncModuleReadableText(
        moduleRow,
        { last_results: results, last_meta: meta },
        'completado',
      );
      moduleRow.data = JSON.stringify(merged);
      const prev = parseJsonSafe(moduleRow.data, {});
      if (!resultadosEl) throw new Error('Panel de resultados no encontrado');
      resultadosEl.innerHTML = renderResults(
        results,
        meta,
        prev.session_notes || '',
        true,
      );
      bindResultsTab(host, moduleRow, exportCtx);
      switchToResultsTab(host);
      onSaved?.();
      toast('Sesión analizada — ver Resultados');
    } catch (e) {
      const msg = nfErrorMessage(e);
      toast(msg);
      console.error(e);
      if (resultadosEl) {
        resultadosEl.innerHTML = renderResultsError(msg);
        switchToResultsTab(host);
      }
    } finally {
      if (analyzeTimer) clearInterval(analyzeTimer);
      recordBtn.disabled = false;
    }
  });

  /* Ayuda: botón en module-card-actions (workspace.js) */
}
