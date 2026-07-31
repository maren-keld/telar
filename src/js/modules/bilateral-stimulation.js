import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

let activeAnim = null;

export function teardownBilateralStimulation() {
  if (activeAnim) {
    cancelAnimationFrame(activeAnim.raf);
    clearInterval(activeAnim.timer);
    activeAnim = null;
  }
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function renderBilateralStimulation(host, moduleRow) {
  teardownBilateralStimulation();

  const data = parseJsonSafe(moduleRow.data, {});
  const speedHz = Number(data.speed_hz) || 1;
  const durationSec = Number(data.duration_sec) || 60;
  const target = data.target || '';
  const notes = data.notes || '';
  const elapsed = Number(data.elapsed_sec) || 0;

  host.innerHTML = `
    <div class="card bilateral-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">${escapeHtml(t('bls.title', 'Estimulación bilateral'))}</h2>
          <p class="module-card-head__sub">${escapeHtml(t('bls.subtitle', 'Estímulo visual alternado (EMDR-adjacent). No sustituye protocolo EMDR completo.'))}</p>
        </div>
        <div class="badge badge--info" id="bls-timer">${formatDuration(elapsed)}</div>
      </div>

      <div class="bls-stage" id="bls-stage" aria-hidden="true">
        <div class="bls-dot" id="bls-dot"></div>
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
          <button type="button" class="btn btn-primary" id="bls-start">${escapeHtml(t('bls.start', 'Iniciar'))}</button>
          <button type="button" class="btn btn-secondary" id="bls-pause" disabled>${escapeHtml(t('bls.pause', 'Pausar'))}</button>
          <button type="button" class="btn btn-ghost" id="bls-reset">${escapeHtml(t('bls.reset', 'Reiniciar'))}</button>
        </div>
      </form>
      <p class="bls-note">${escapeHtml(t('bls.note', 'Herramienta de apoyo para regulación y procesamiento; el profesional mantiene el juicio clínico y el marco terapéutico.'))}</p>
    </div>`;

  const form = host.querySelector('#bls-form');
  const stage = host.querySelector('#bls-stage');
  const dot = host.querySelector('#bls-dot');
  const timerEl = host.querySelector('#bls-timer');
  const startBtn = host.querySelector('#bls-start');
  const pauseBtn = host.querySelector('#bls-pause');
  const resetBtn = host.querySelector('#bls-reset');
  const speedInput = form.querySelector('[name="speed_hz"]');
  const speedVal = host.querySelector('#bls-speed-val');
  const elapsedInput = host.querySelector('#bls-elapsed');

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
    };
    const status = payload.notes.trim() || payload.elapsed_sec > 0 ? 'completado' : 'pendiente';
    await syncModuleReadableText(moduleRow, payload, status);
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  speedInput?.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speedInput.value).toFixed(1);
  });

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
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stage?.classList.remove('bls-stage--active');
  };

  const startAnim = () => {
    if (running) return;
    running = true;
    lastTs = 0;
    phase = 0;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stage?.classList.add('bls-stage--active');
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

  startBtn?.addEventListener('click', startAnim);
  pauseBtn?.addEventListener('click', () => {
    stopAnim();
    persist();
  });
  resetBtn?.addEventListener('click', () => {
    stopAnim();
    elapsedLocal = 0;
    dot?.classList.remove('bls-dot--right');
    updateTimer();
    persist();
  });
}
