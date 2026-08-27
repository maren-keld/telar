import { bindAutoSave, collectFormData } from '../autobind.js';
import { ICON_EXPAND } from '../icons.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

const BLS_CHANNEL = 'telar-bls-stage';
const BLS_POPUP_NAME = 'telar-bls-stage';

let activeAnim = null;
let blsPopup = null;
let blsOverlay = null;
let blsKeyHandler = null;

export function teardownBilateralStimulation() {
  if (activeAnim) {
    cancelAnimationFrame(activeAnim.raf);
    clearInterval(activeAnim.timer);
    activeAnim = null;
  }
  closeBlsFullscreen();
}

function formatDuration(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseSud(raw) {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return String(Math.min(10, Math.max(0, Math.round(n))));
}

function sudValue(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function popupHtml() {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8" />
<title>Estimulación bilateral</title>
<style>
  html, body { margin: 0; height: 100%; background: #0d1526; }
  .stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .dot {
    position: absolute; top: 50%; left: 8%;
    width: 48px; height: 48px; margin-top: -24px;
    border-radius: 50%; background: #2f6fed;
    box-shadow: 0 0 22px rgba(47, 111, 237, 0.7);
    transition: left 0.35s ease-in-out;
  }
  .dot.right { left: calc(92% - 48px); }
</style>
</head><body>
  <div class="stage"><div class="dot" id="dot"></div></div>
</body></html>`;
}

function postBlsSide(right) {
  try {
    const ch = new BroadcastChannel(BLS_CHANNEL);
    ch.postMessage({ type: 'side', right: Boolean(right) });
    ch.close();
  } catch {
    /* ignore */
  }
  const popupDot = blsPopup?.document?.getElementById('dot');
  popupDot?.classList.toggle('right', Boolean(right));
  blsOverlay?.querySelector('.bls-dot')?.classList.toggle('bls-dot--right', Boolean(right));
}

function closeBlsFullscreen() {
  if (blsKeyHandler) {
    document.removeEventListener('keydown', blsKeyHandler);
    blsKeyHandler = null;
  }
  if (blsPopup && !blsPopup.closed) {
    try {
      blsPopup.close();
    } catch {
      /* ignore */
    }
  }
  blsPopup = null;
  if (blsOverlay) {
    if (document.fullscreenElement === blsOverlay) {
      document.exitFullscreen?.().catch(() => {});
    }
    blsOverlay.remove();
    blsOverlay = null;
  }
}

function openBlsOverlay(onClose) {
  closeBlsFullscreen();
  blsOverlay = document.createElement('div');
  blsOverlay.className = 'bls-fs-overlay';
  blsOverlay.innerHTML = `
    <button type="button" class="bls-fs-close" aria-label="Cerrar pantalla completa">Cerrar</button>
    <div class="bls-stage bls-stage--fs bls-stage--active">
      <div class="bls-dot"></div>
    </div>`;
  document.body.appendChild(blsOverlay);
  const close = () => {
    closeBlsFullscreen();
    onClose?.();
  };
  blsOverlay.querySelector('.bls-fs-close')?.addEventListener('click', close);
  blsKeyHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', blsKeyHandler);
  blsOverlay.requestFullscreen?.().catch(() => {});
}

function openBlsWindow(onClose) {
  closeBlsFullscreen();
  let win = null;
  try {
    win = window.open('', BLS_POPUP_NAME, 'popup=yes,width=1100,height=640,menubar=no,toolbar=no,location=no,status=no');
  } catch {
    win = null;
  }
  if (win) {
    try {
      if (win.document?.getElementById('app')) {
        win.close();
        win = null;
      }
    } catch {
      win = null;
    }
  }
  if (win) {
    try {
      win.document.open();
      win.document.write(popupHtml());
      win.document.close();
      blsPopup = win;
      win.addEventListener('beforeunload', () => {
        if (blsPopup === win) blsPopup = null;
        onClose?.();
      });
      return;
    } catch {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    }
  }
  openBlsOverlay(onClose);
}

export async function renderBilateralStimulation(host, moduleRow) {
  teardownBilateralStimulation();

  const data = parseJsonSafe(moduleRow.data, {});
  const speedHz = Number(data.speed_hz) || 1;
  const durationSec = Number(data.duration_sec) || 60;
  const target = data.target || '';
  const notes = data.notes || '';
  const elapsed = Number(data.elapsed_sec) || 0;
  const sudPre = parseSud(data.sud_pre);
  const sudPost = parseSud(data.sud_post);

  host.innerHTML = `
    <div class="card bilateral-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title">${escapeHtml(t('bls.title', 'Estimulación bilateral'))}</h2>
          <p class="module-card-head__sub">${escapeHtml(t('bls.subtitle', 'Estímulo visual alternado (EMDR-adjacent). No sustituye protocolo EMDR completo.'))}</p>
        </div>
      </div>

      <div class="bls-stage-wrap">
        <span class="bls-timer" id="bls-timer" aria-live="polite">${formatDuration(elapsed)}</span>
        <div class="bls-stage" id="bls-stage" aria-hidden="true">
          <div class="bls-dot" id="bls-dot"></div>
          <button type="button" class="bls-fs-btn" id="bls-fullscreen" title="Pantalla completa (ventana nueva)" aria-label="Pantalla completa">${ICON_EXPAND}</button>
        </div>
      </div>

      <form id="bls-form" class="bls-form">
        <div class="bls-controls">
          <label class="bls-field">
            <span>${escapeHtml(t('bls.speed', 'Velocidad (Hz)'))}</span>
            <input type="range" name="speed_hz" min="0.5" max="2" step="0.1" value="${speedHz}" />
            <output id="bls-speed-val">${speedHz.toFixed(1)}</output>
          </label>
          <label class="bls-field">
            <span>${escapeHtml(t('bls.duration', 'Duración objetivo (s)'))}</span>
            <input type="number" name="duration_sec" min="15" max="600" step="15" value="${durationSec}" />
          </label>
        </div>
        <div class="bls-controls bls-controls--sud">
          <label class="bls-field">
            <span>SUD pre (0–10)</span>
            <input type="number" name="sud_pre" min="0" max="10" step="1" inputmode="numeric" value="${escapeHtml(sudPre)}" placeholder="—" />
          </label>
          <label class="bls-field">
            <span>SUD post (0–10)</span>
            <input type="number" name="sud_post" min="0" max="10" step="1" inputmode="numeric" value="${escapeHtml(sudPost)}" placeholder="—" />
          </label>
        </div>
        <label class="bls-field bls-field--full">
          <span>${escapeHtml(t('bls.target', 'Objetivo / recuerdo (opcional)'))}</span>
          <textarea name="target" rows="2" placeholder="${escapeHtml(t('bls.targetPh', 'Fragmento a procesar…'))}">${escapeHtml(target)}</textarea>
        </label>
        <label class="bls-field bls-field--full">
          <span>${escapeHtml(t('bls.notes', 'Notas de sesión'))}</span>
          <textarea name="notes" rows="3" placeholder="${escapeHtml(t('bls.notesPh', 'Observaciones clínicas…'))}">${escapeHtml(notes)}</textarea>
        </label>
        <input type="hidden" name="elapsed_sec" id="bls-elapsed" value="${elapsed}" />
        <div class="bls-actions">
          <button type="button" class="btn btn-primary" id="bls-toggle">${escapeHtml(t('bls.start', 'Iniciar'))}</button>
          <button type="button" class="btn btn-ghost" id="bls-reset">${escapeHtml(t('bls.reset', 'Reiniciar'))}</button>
        </div>
      </form>
    </div>`;

  const form = host.querySelector('#bls-form');
  const stage = host.querySelector('#bls-stage');
  const dot = host.querySelector('#bls-dot');
  const timerEl = host.querySelector('#bls-timer');
  const toggleBtn = host.querySelector('#bls-toggle');
  const resetBtn = host.querySelector('#bls-reset');
  const speedInput = form.querySelector('[name="speed_hz"]');
  const speedVal = host.querySelector('#bls-speed-val');
  const elapsedInput = host.querySelector('#bls-elapsed');
  const fsBtn = host.querySelector('#bls-fullscreen');

  let running = false;
  let elapsedLocal = elapsed;
  let tickTimer = null;
  let phase = 0;
  let lastTs = 0;

  const persist = async () => {
    const fd = collectFormData(form);
    const payload = {
      speed_hz: Number(fd.speed_hz) || 1,
      duration_sec: Number(fd.duration_sec) || 60,
      target: fd.target || '',
      notes: fd.notes || '',
      elapsed_sec: Number(fd.elapsed_sec) || 0,
      sud_pre: sudValue(fd.sud_pre),
      sud_post: sudValue(fd.sud_post),
    };
    const status =
      payload.notes.trim() ||
      payload.elapsed_sec > 0 ||
      payload.sud_pre != null ||
      payload.sud_post != null
        ? 'completado'
        : 'pendiente';
    await syncModuleReadableText(moduleRow, payload, status);
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  speedInput?.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speedInput.value).toFixed(1);
  });

  const setToggleLabel = () => {
    if (!toggleBtn) return;
    toggleBtn.textContent = running
      ? t('bls.pause', 'Pausar')
      : t('bls.start', 'Iniciar');
    toggleBtn.classList.toggle('btn-secondary', running);
    toggleBtn.classList.toggle('btn-primary', !running);
  };

  const updateTimer = () => {
    if (timerEl) timerEl.textContent = formatDuration(elapsedLocal);
    if (elapsedInput) elapsedInput.value = String(elapsedLocal);
  };

  const animate = (ts) => {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const hz = Number(speedInput?.value) || 1;
    const period = 1000 / hz;
    phase += ts - lastTs;
    lastTs = ts;
    if (phase >= period) {
      phase = 0;
      dot?.classList.toggle('bls-dot--right');
      postBlsSide(dot?.classList.contains('bls-dot--right'));
    }
    activeAnim.raf = requestAnimationFrame(animate);
  };

  const stopAnim = () => {
    running = false;
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (activeAnim?.raf) {
      cancelAnimationFrame(activeAnim.raf);
      activeAnim.raf = null;
    }
    stage?.classList.remove('bls-stage--active');
    setToggleLabel();
  };

  const startAnim = () => {
    if (running) return;
    running = true;
    lastTs = 0;
    phase = 0;
    stage?.classList.add('bls-stage--active');
    setToggleLabel();
    activeAnim = activeAnim || {};
    activeAnim.raf = requestAnimationFrame(animate);
    tickTimer = setInterval(() => {
      elapsedLocal += 1;
      updateTimer();
      const goal = Number(form.querySelector('[name="duration_sec"]')?.value) || 60;
      if (elapsedLocal >= goal) {
        stopAnim();
        persist();
      }
    }, 1000);
    activeAnim.timer = tickTimer;
  };

  toggleBtn?.addEventListener('click', () => {
    if (running) {
      stopAnim();
      persist();
    } else {
      startAnim();
    }
  });
  resetBtn?.addEventListener('click', () => {
    stopAnim();
    elapsedLocal = 0;
    dot?.classList.remove('bls-dot--right');
    postBlsSide(false);
    updateTimer();
    persist();
  });
  fsBtn?.addEventListener('click', () => {
    openBlsWindow(() => {});
    postBlsSide(dot?.classList.contains('bls-dot--right'));
    if (running) stage?.classList.add('bls-stage--active');
  });
}
