import { NF_PROTOCOL_ELECTRODES, NF_PROTOCOL_PRESETS, NF_ORB_SMOOTH_LEVEL, NF_ORB_SMOOTH_PCT, NF_SUPPORTED_DEVICE, nfPreset } from '../../lib/nf-bands.js';
import { getNfBaselineSec, getNfWarmupSec, NF_BASELINE_OPTIONS_SEC, NF_WARMUP_OPTIONS_SEC, setNfBaselineSec, setNfWarmupSec } from '../../lib/nf-config.js';
import { NeurofeedbackSession } from '../../lib/nf-session.js';
import { isAudioFeedbackEnabled, setAudioFeedbackEnabled, setNfAudioProtocol } from '../../lib/nf-audio.js';
import { analyzeSessionPython, saveNeurofeedbackRecording } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { ICON_BATTERY, ICON_VOLUME_OFF, ICON_VOLUME_ON } from '../icons.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import {
  bindNfResultsTab,
  destroyNfResultCharts,
  nfErrorMessage,
  parseAnalyzeOutput,
  renderResults,
  renderResultsError,
  renderResultsLoading,
  startAnalyzeProgress,
} from './nf-results.js';

export const NF_HELP_MESSAGE =
  'Solo Muse 2. BLE nativo en macOS/Windows. Bienestar y autorregulación — no es dispositivo médico. Conecta el Muse, pulsa «Iniciar entrenamiento» para la línea base (~2–3 min), luego «Grabar sesión». Evita parpadear o tensar la mandíbula.';

let nfSession = null;
let frequencyChart = null;
let voltageChart = null;
let activeTab = 'sesion';
/** @type {'visual'|'freq'|'volt'} */
let feedbackMode = 'visual';
let visualTarget = 0;
let visualDisplay = 0;
let pctDisplay = 0;
let feedbackStatus = {
  warming: false,
  artifact: false,
  artifactKind: null,
  warmupRemainingSec: 0,
  recording: false,
  sessionPhase: 'idle',
  baselineElapsedSec: 0,
  baselineRemainingSec: 0,
  baselineComplete: false,
  signalQuality: 'unknown',
  signalArtifactPct: 0,
};
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
  feedbackStatus = {
    warming: false,
    artifact: false,
    artifactKind: null,
    warmupRemainingSec: 0,
    recording: false,
    sessionPhase: 'idle',
    baselineElapsedSec: 0,
    baselineRemainingSec: 0,
    baselineComplete: false,
    signalQuality: 'unknown',
    signalArtifactPct: 0,
  };
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
        visualDisplay += (visualTarget - visualDisplay) * NF_ORB_SMOOTH_LEVEL;
        pctDisplay += (visualTarget - pctDisplay) * NF_ORB_SMOOTH_PCT;
        const pct = Math.round(pctDisplay * 100);
        paintVisualOrb(host, visualDisplay, pct);
        updateFeedbackPct(host, pct, protocol);
        updateFeedbackStatus(host, feedbackStatus);
        updateBaselineOrbTimer(host, feedbackStatus);
        if (nfSession?.checkBaselineComplete()) {
          syncSessionControls(host);
        }
        updateDeviceStatus(host, feedbackStatus, connected, lastBatteryPct);
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

function updateBaselineOrbTimer(host, { sessionPhase, baselineRemainingSec }) {
  const timer = host.querySelector('#nf-baseline-orb-timer');
  if (!timer) return;
  const show = sessionPhase === 'baseline';
  timer.hidden = !show;
  if (show) {
    timer.textContent = `Calculando línea base · ${formatDuration(baselineRemainingSec)} restantes`;
  }
}

function syncSessionControls(host) {
  const connected = isSessionConnected();
  const phase = nfSession?.sessionPhase || 'idle';
  const baselineComplete = Boolean(nfSession?.baselineComplete);
  const recording = Boolean(nfSession?.recording);

  const baselineAction = host.querySelector('#nf-baseline-action');
  const recordSection = host.querySelector('#nf-record-section');
  const startBaselineBtn = host.querySelector('#nf-start-baseline');

  const inBaseline = phase === 'baseline';
  const showBaselineStart = connected && !baselineComplete && !recording && !inBaseline;
  const showRecordSection = connected && baselineComplete && !inBaseline;

  if (baselineAction) {
    baselineAction.hidden = !showBaselineStart;
    baselineAction.style.display = showBaselineStart ? '' : 'none';
  }
  if (startBaselineBtn) startBaselineBtn.disabled = !showBaselineStart;

  if (recordSection) {
    recordSection.hidden = !showRecordSection;
    recordSection.style.display = showRecordSection ? '' : 'none';
  }
}

function updateFeedbackStatus(host, { warming, artifact, artifactKind, warmupRemainingSec, recording }) {
  const el = host.querySelector('#nf-feedback-status');
  if (!el) return;
  if (!recording) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  if (warming && warmupRemainingSec > 0) {
    el.hidden = false;
    el.className = 'nf-feedback-status nf-feedback-status--warmup';
    el.textContent = `Calibrando sesión… ~${warmupRemainingSec} s`;
    return;
  }
  if (artifact) {
    el.hidden = false;
    el.className = 'nf-feedback-status nf-feedback-status--artifact';
    el.textContent =
      artifactKind === 'emg'
        ? 'Tensión mandibular — suelta la mandíbula'
        : 'Señal con artefacto — evita parpadear y movimientos bruscos';
    return;
  }
  el.hidden = true;
  el.textContent = '';
}

const NF_SIGNAL_QUALITY_LABEL = {
  good: 'Buena señal',
  fair: 'Señal regular',
  poor: 'Señal mala',
  unknown: '—',
};

let lastBatteryPct = null;

function updateDeviceStatus(host, { signalQuality, signalArtifactPct }, connected, batteryPct) {
  const wrap = host.querySelector('#nf-device-status');
  const sigEl = host.querySelector('#nf-signal-quality');
  const batEl = host.querySelector('#nf-battery');
  if (!wrap || !sigEl || !batEl) return;
  if (!connected) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const level = signalQuality || 'unknown';
  sigEl.hidden = false;
  sigEl.className = `nf-device-status__item nf-signal-quality nf-signal-quality--${level}`;
  const label = NF_SIGNAL_QUALITY_LABEL[level] || NF_SIGNAL_QUALITY_LABEL.unknown;
  sigEl.title = `Calidad de señal (últimos 30 s): ${signalArtifactPct ?? 0}% con artefacto`;
  sigEl.innerHTML = `<span class="nf-signal-quality__dot" aria-hidden="true"></span><span>${label}</span>`;

  if (batteryPct != null) {
    batEl.hidden = false;
    batEl.innerHTML = `<span class="nf-battery__icon" aria-hidden="true">${ICON_BATTERY}</span><span>${batteryPct}%</span>`;
    batEl.classList.toggle('nf-battery--low', batteryPct <= 20);
  } else {
    batEl.hidden = true;
    batEl.innerHTML = '';
  }
}

function updateFeedbackPct(host, pct, protocol) {
  const pctEl = host.querySelector('#nf-visual-pct');
  const labelEl = host.querySelector('#nf-visual-pct-label');
  const hintEl = host.querySelector('#nf-visual-pct-hint');
  if (!pctEl) return;

  if (!isSessionConnected()) {
    pctEl.textContent = '—';
    if (labelEl) labelEl.textContent = 'sin señal';
    if (hintEl) hintEl.textContent = 'conecta el Muse';
    return;
  }

  if (feedbackStatus.sessionPhase === 'baseline') {
    pctEl.textContent = `${pct}%`;
    if (labelEl) labelEl.textContent = feedbackPctLabel(protocol);
    if (hintEl) hintEl.textContent = 'línea base';
    return;
  }

  if (feedbackStatus.recording && feedbackStatus.warming) {
    pctEl.textContent = `${pct}%`;
    if (labelEl) labelEl.textContent = feedbackPctLabel(protocol);
    if (hintEl) hintEl.textContent = 'calibrando sesión';
    return;
  }

  if (feedbackStatus.artifact) {
    pctEl.textContent = '—';
    if (labelEl) labelEl.textContent = feedbackPctLabel(protocol);
    if (hintEl) hintEl.textContent = 'mantén la postura';
    return;
  }

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
  destroyNfResultCharts();
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
          <h2 class="module-title">Neurofeedback</h2>
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
          </div>
          <div class="nf-row__right">
            <span id="nf-device-status" class="nf-device-status" hidden>
              <span id="nf-signal-quality" class="nf-device-status__item nf-signal-quality" hidden></span>
              <span id="nf-battery" class="nf-device-status__item nf-battery" hidden></span>
            </span>
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
            <p class="nf-field-label">Calibración EMA al grabar</p>
            <select class="nf-select" id="nf-warmup-sec" title="Segundos de calibración al iniciar la grabación (distinto de la línea base)">
              ${NF_WARMUP_OPTIONS_SEC.map(
                (s) =>
                  `<option value="${s}"${s === getNfWarmupSec() ? ' selected' : ''}>${s} s</option>`,
              ).join('')}
            </select>
            <p class="nf-field-label">Reposo / línea base</p>
            <select class="nf-select" id="nf-baseline-sec" title="Duración sugerida de reposo antes del entrenamiento">
              ${NF_BASELINE_OPTIONS_SEC.map(
                (s) =>
                  `<option value="${s}"${s === getNfBaselineSec() ? ' selected' : ''}>${s} s (2–3 min)</option>`,
              ).join('')}
            </select>
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
              <p class="nf-feedback-status" id="nf-feedback-status" hidden></p>
              <span class="nf-baseline-orb-timer" id="nf-baseline-orb-timer" hidden aria-live="polite"></span>
              <span class="nf-visual-pct" id="nf-visual-pct">—</span>
              <span class="nf-visual-pct-label" id="nf-visual-pct-label">calma</span>
              <span class="nf-visual-pct-hint" id="nf-visual-pct-hint">conecta el Muse</span>
            </div>
          </div>
          <div class="nf-chart-wrap" id="nf-chart-freq">
            <canvas id="nf-frequency-chart"></canvas>
          </div>
          <div class="nf-chart-wrap" id="nf-chart-volt" hidden>
            <canvas id="nf-voltage-chart"></canvas>
          </div>
        </div>
        <div class="nf-baseline-action" id="nf-baseline-action" hidden>
          <button type="button" class="btn btn-primary" id="nf-start-baseline">Iniciar entrenamiento</button>
        </div>
        <div class="nf-record-wrap" id="nf-record-section" hidden>
          <span class="nf-record-timer badge badge--info" id="nf-record-timer" hidden aria-live="polite">0:00</span>
          <div class="nf-record" id="nf-record-wrap">
            <button type="button" class="btn btn-secondary" id="nf-record-btn" title="Grabar sesión clínica"><span class="dot"></span> Grabar sesión</button>
          </div>
        </div>
      </div>
      <div id="nf-tab-resultados" hidden>
        ${renderResults(lastResults, lastMeta, saved.session_notes || '', Boolean(lastResults), saved.last_live_trace || [])}
      </div>
    </div>`;

  const exportCtx = {
    patientName: ctx.treatment?.patient_name || ctx.patientName,
    sessionNumber: ctx.sessionNumber,
    treatmentId: ctx.treatment?.id,
  };

  initCharts(host);
  bindEvents(host, moduleRow, ctx.onSaved, initialProtocol, exportCtx);
  bindNfResultsTab(host, moduleRow, exportCtx, saved.last_live_trace || []);

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

  host.querySelector('#nf-warmup-sec')?.addEventListener('change', (e) => {
    setNfWarmupSec(Number(e.target.value));
    toast(`Calibración al grabar: ${e.target.value} s`);
  });

  host.querySelector('#nf-baseline-sec')?.addEventListener('change', (e) => {
    setNfBaselineSec(Number(e.target.value));
    toast(`Reposo sugerido: ${e.target.value} s`);
  });

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
  const deviceStateEl = host.querySelector('#nf-device-state');

  const renderBattery = (pct) => {
    lastBatteryPct = pct;
    updateDeviceStatus(host, feedbackStatus, isMuseConnected(), pct);
  };

  const isMuseConnected = () =>
    nfSession.muse?.state === 2 || nfSession.connectionStatus === 'connected';

  const syncUi = () => {
    const st = nfSession.connectionStatus;
    const connected = isMuseConnected();
    const connecting = st === 'connecting' && !connected;

    if (deviceStateEl) {
      if (connected) {
        deviceStateEl.textContent = '(conectado)';
        deviceStateEl.hidden = false;
        deviceStateEl.className = 'nf-device-state nf-device-state--connected';
      } else if (connecting) {
        deviceStateEl.textContent = '(buscando dispositivo)';
        deviceStateEl.hidden = false;
        deviceStateEl.className = 'nf-device-state nf-device-state--connecting';
      } else {
        deviceStateEl.textContent = '';
        deviceStateEl.hidden = true;
        deviceStateEl.className = 'nf-device-state';
      }
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
    syncSessionControls(host);
    updateDeviceStatus(host, feedbackStatus, connected, lastBatteryPct);
  };

  nfSession.onConnectFailed = (msg) => {
    syncUi();
    toast(msg || 'Error al conectar');
  };

  let prevBaselineComplete = false;

  nfSession.onBandsUpdate = ({
    level,
    percent,
    warming,
    artifact,
    artifactKind,
    warmupRemainingSec,
    recording,
    sessionPhase,
    baselineElapsedSec,
    baselineRemainingSec,
    baselineComplete,
    signalQuality,
    signalArtifactPct,
  }) => {
    if (nfSession.connectionStatus !== 'connected') return;
    feedbackStatus = {
      warming: Boolean(warming),
      artifact: Boolean(artifact),
      artifactKind: artifactKind || null,
      warmupRemainingSec: warmupRemainingSec ?? 0,
      recording: Boolean(recording),
      sessionPhase: sessionPhase || 'idle',
      baselineElapsedSec: baselineElapsedSec ?? 0,
      baselineRemainingSec: baselineRemainingSec ?? 0,
      baselineComplete: Boolean(baselineComplete),
      signalQuality: signalQuality ?? 'unknown',
      signalArtifactPct: signalArtifactPct ?? 0,
    };
    if (baselineComplete && !prevBaselineComplete) {
      toast('Línea base completa — ya puedes grabar la sesión');
      syncSessionControls(host);
    }
    prevBaselineComplete = Boolean(baselineComplete);
    if (sessionPhase === 'baseline') {
      visualTarget = !artifact && percent != null ? level : 0.38;
      return;
    }
    if (warming) {
      visualTarget = !artifact && percent != null ? level : 0.38;
      return;
    }
    if (!artifact && percent != null) {
      visualTarget = level;
    } else if (artifact) {
      visualTarget = level;
    }
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
      lastBatteryPct = null;
      prevBaselineComplete = false;
      syncSessionControls(host);
    } else if (status === 'connected') {
      syncSessionControls(host);
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
  const startBaselineBtn = host.querySelector('#nf-start-baseline');
  let isRec = false;
  let recordTimerInterval = null;
  let recordStartedAt = 0;

  startBaselineBtn?.addEventListener('click', () => {
    if (!isMuseConnected()) {
      toast('Conecta el Muse primero');
      return;
    }
    if (!nfSession.startBaseline()) return;
    syncSessionControls(host);
    toast(`Calculando línea base (~${formatDuration(getNfBaselineSec())}) — reposo con ojos cerrados`);
  });

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
      if (!nfSession.baselineComplete) {
        toast('Completa la línea base con «Iniciar entrenamiento» primero');
        return;
      }
      let allowed = false;
      await requireProOrSubscribe({ onAllowed: () => { allowed = true; } });
      if (!allowed) return;
      try {
        nfSession.startRecording();
      } catch (e) {
        toast(e?.message || 'No se pudo iniciar la grabación');
        return;
      }
      isRec = true;
      recordWrap.classList.add('recording');
      recordStartedAt = Date.now();
      if (recordTimerEl) {
        recordTimerEl.hidden = false;
        recordTimerEl.textContent = '0:00';
      }
      recordTimerInterval = setInterval(tickRecordTimer, 1000);
      recordBtn.innerHTML = '<span class="dot"></span> Detener grabación';
      syncSessionControls(host);
      toast('Grabando sesión');
      return;
    }

    const payload = nfSession.stopRecording();
    const meta = nfSession.getRecordingMeta();
    const liveTrace = meta.live_trace || [];
    const { live_trace: _lt, ...metaForDb } = meta;
    const audioWasOn = isAudioFeedbackEnabled();
    const savedProtocol = nfSession.protocol;
    isRec = false;
    recordWrap.classList.remove('recording');
    stopRecordTimer();
    recordBtn.innerHTML = '<span class="dot"></span> Grabar sesión';

    await nfSession.disconnect();
    resetOrbFeedback();
    prevBaselineComplete = false;
    lastBatteryPct = null;
    renderBattery(null);
    if (audioWasOn) {
      setAudioFeedbackEnabled(true);
      setNfAudioProtocol(savedProtocol);
    }
    syncUi();
    syncAudioToggle();

    const resultadosEl = host.querySelector('#nf-tab-resultados');
    const sessionDur = meta.duration_sec || 0;
    recordBtn.disabled = true;

    if (!payload || !payload.trim()) {
      toast('Sin datos grabados — verifica que el Muse envía señal');
      if (resultadosEl) {
        resultadosEl.innerHTML = renderResultsError('No se registraron datos EEG durante la grabación.');
        switchToResultsTab(host);
      }
      recordBtn.disabled = false;
      return;
    }

    let analyzeTimer = null;
    try {
      if (resultadosEl) {
        resultadosEl.innerHTML = renderResultsLoading(sessionDur);
        switchToResultsTab(host);
        analyzeTimer = startAnalyzeProgress(host, sessionDur);
      }

      const rawOut = String(await analyzeSessionPython(payload)).trim();
      const parsed = parseAnalyzeOutput(rawOut);
      const core = [parsed.calm_seconds, parsed.calm_pct, parsed.attentive_pct];
      if (core.some((n) => Number.isNaN(n))) {
        throw new Error(`Respuesta inválida del analizador: ${rawOut.slice(0, 160)}`);
      }
      const { post_series, spectral, ...results } = parsed;
      const resultsStored = { ...results, post_series, spectral };
      await saveNeurofeedbackRecording(moduleRow.id, {
        ...metaForDb,
        raw_data: payload,
        results: resultsStored,
      });
      const merged = await syncModuleReadableText(
        moduleRow,
        { last_results: resultsStored, last_meta: metaForDb, last_live_trace: liveTrace },
        'completado',
      );
      moduleRow.data = JSON.stringify(merged);
      const prev = parseJsonSafe(moduleRow.data, {});
      if (!resultadosEl) throw new Error('Panel de resultados no encontrado');
      resultadosEl.innerHTML = renderResults(
        resultsStored,
        metaForDb,
        prev.session_notes || '',
        true,
        liveTrace,
      );
      bindNfResultsTab(host, moduleRow, exportCtx, liveTrace);
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
