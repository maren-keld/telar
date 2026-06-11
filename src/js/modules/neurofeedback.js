import { bindAutoSave, collectFormData } from '../autobind.js';
import { NF_SUPPORTED_DEVICE } from '../../lib/nf-bands.js';
import { NeurofeedbackSession } from '../../lib/nf-session.js';
import { analyzeSessionPython, saveNeurofeedbackRecording } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, formatDate, parseJsonSafe, toast } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

let nfSession = null;
let frequencyChart = null;
let activeTab = 'sesion';

function _destroySession() {
  if (nfSession) {
    nfSession.disconnect();
    nfSession = null;
  }
  if (frequencyChart) {
    frequencyChart.destroy();
    frequencyChart = null;
  }
}

/** Detiene BLE, grabación y audio al salir del espacio de psicoterapia. */
export function teardownNeurofeedback() {
  _destroySession();
}

export async function renderNeurofeedback(host, moduleRow, { onSaved }) {
  _destroySession();

  const saved = parseJsonSafe(moduleRow.data);
  const lastResults = saved.last_results || null;

  host.innerHTML = `
    <div class="nf-panel">
      <div class="nf-header">
        <h2 class="module-title" style="margin:0">Neurofeedback</h2>
        <div>
          <button type="button" class="btn btn-ghost" id="nf-help" title="Ayuda">?</button>
        </div>
      </div>
      <div class="tabs" id="nf-tabs">
        <button type="button" class="tab active" data-tab="sesion" title="Sesión en vivo">Sesión</button>
        <button type="button" class="tab" data-tab="resultados" title="Resultados grabados">Resultados</button>
      </div>
      <div id="nf-tab-sesion">
        <div class="nf-device">
          <div class="nf-device__info">
            <span id="nf-device-label">Sin dispositivo</span>
            <span class="nf-status" id="nf-status">Desconectado</span>
          </div>
          <span id="nf-battery" class="nf-battery"></span>
          <button type="button" class="btn btn-ghost" id="nf-connect" title="Conectar ${NF_SUPPORTED_DEVICE} por Bluetooth (solo este modelo)">Conectar ${NF_SUPPORTED_DEVICE}</button>
          <p class="nf-device-hint" style="font-size:0.75rem;color:var(--text-secondary);margin:4px 0 0">Compatible: ${NF_SUPPORTED_DEVICE}. Muse S y otros modelos no están soportados. macOS y Windows.</p>
          <button type="button" class="btn btn-ghost" id="nf-disconnect" hidden title="Desconectar Muse">Desconectar</button>
        </div>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin:8px 0">Ubicación</p>
        <div class="nf-chips" id="nf-electrodes">
          ${['FP1', 'FP2', 'TP9', 'TP10']
            .map((e) => `<button type="button" class="chip active" data-e="${e}" title="Electrodo ${e}">${e}</button>`)
            .join('')}
        </div>
        <p style="font-size:0.8rem;color:var(--text-secondary)">Protocolos</p>
        <div class="nf-chips" id="nf-protocols">
          <button type="button" class="chip active" data-p="relajacion" title="Protocolo de relajación">Relajación</button>
          <button type="button" class="chip" data-p="atencion" title="Protocolo de atención">Atención</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
          <span>Retroalimentación · Frecuencias</span>
        </div>
        <div class="nf-chart-wrap">
          <canvas id="nf-frequency-chart"></canvas>
        </div>
        <div class="nf-record" id="nf-record-wrap">
          <button type="button" class="btn btn-secondary" id="nf-record-btn" title="Iniciar o detener grabación"><span class="dot"></span> Grabar</button>
        </div>
      </div>
      <div id="nf-tab-resultados" hidden>
        ${renderResults(lastResults, saved.last_meta, saved.session_notes || '')}
      </div>
    </div>`;

  initChart(host);
  bindEvents(host, moduleRow, onSaved);
  bindResultsTab(host, moduleRow);

  const obs = new MutationObserver(() => {
    if (!host.isConnected) {
      _destroySession();
      obs.disconnect();
    }
  });
  const watchTarget = host.parentElement?.parentElement ?? document.body;
  obs.observe(watchTarget, { childList: true });
}

function bindResultsTab(host, moduleRow) {
  const tab = host.querySelector('#nf-tab-resultados');
  if (!tab) return;

  tab.querySelectorAll('[data-nf-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.nfMode;
      tab.querySelectorAll('[data-nf-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      tab.querySelector('#nf-results-scale').hidden = mode !== 'escala';
      tab.querySelector('#nf-results-time').hidden = mode !== 'tiempo';
    });
  });

  const form = tab.querySelector('#nf-results-form');
  if (!form) return;
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

function renderResults(results, meta, sessionNotes = '') {
  if (!results) {
    return '<p class="nf-results-empty">Graba una sesión y detén la grabación para ver resultados (análisis Python local).</p>';
  }
  const calm = results.calm_pct ?? 0;
  const att = results.attentive_pct ?? 0;
  return `
    <div class="nf-results">
      <h3 class="nf-results__heading">Estado mental</h3>
      <p class="nf-results__sub">Cuánto tiempo pasó la mente del paciente durante estos estados en la grabación</p>
      <div class="nf-results__toggle" role="tablist">
        <button type="button" class="nf-results__mode active" data-nf-mode="escala">Escala</button>
        <button type="button" class="nf-results__mode" data-nf-mode="tiempo">En tiempo</button>
      </div>
      <div class="nf-results__scale" id="nf-results-scale">
        <div class="nf-state-card nf-state-card--calm">
          <h4>${calm}%</h4>
          <strong>Calma</strong>
          <span class="nf-state-card__cat">Estado cognitivo-emocional</span>
          <p>La mente se mantiene tranquila sin acelerarse ni entrar en rumiación. Permite sostener la atención sin presión interna.</p>
        </div>
        <div class="nf-state-card nf-state-card--attent">
          <h4>${att}%</h4>
          <strong>Atención</strong>
          <span class="nf-state-card__cat">Estado ejecutivo</span>
          <p>Selección y mantenimiento de la información para una tarea. Indica atención estable con baja somnolencia y/o movimiento.</p>
        </div>
      </div>
      <div class="nf-results__time" id="nf-results-time" hidden>
        <p class="nf-results__time-hint">Minutos:segundos en calma y atención durante la grabación.</p>
        <div class="nf-time-bars">
          <div><span>Calma</span><strong>${formatDuration(results.calm_seconds)}</strong></div>
          <div><span>Atención</span><strong>${formatDuration(results.attention_seconds)}</strong></div>
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
        <li><span>Protocolo</span><span>${escapeHtml(meta?.protocol || '—')}</span></li>
      </ul>
    </div>`;
}

function formatDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function initChart(host) {
  const canvas = host.querySelector('#nf-frequency-chart');
  if (!canvas || !window.Chart) return;
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  frequencyChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Delta', 'Theta', 'Alpha', 'Beta'],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: ['#00042E', '#001745', '#002B5D', '#4B7FD1'],
        },
      ],
    },
    options: {
      animation: false,
      scales: { y: { min: 0, max: 100 } },
      plugins: { legend: { display: false } },
    },
  });
  nfSession?.setFrequencyChart(frequencyChart);
}

function bindEvents(host, moduleRow, onSaved) {
  nfSession = new NeurofeedbackSession();
  nfSession.setFrequencyChart(frequencyChart);

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
      nfSession.setProtocol(chip.dataset.p);
    });
  });

  const btnConnect = host.querySelector('#nf-connect');
  const btnDisconnect = host.querySelector('#nf-disconnect');
  const deviceLabel = host.querySelector('#nf-device-label');
  const statusEl = host.querySelector('#nf-status');
  const batteryEl = host.querySelector('#nf-battery');

  const statusLabels = {
    disconnected: 'Desconectado',
    connecting: 'Conectando…',
    connected: 'Conectado',
  };

  const syncUi = () => {
    const st = nfSession.connectionStatus;
    statusEl.textContent = statusLabels[st] || st;
    statusEl.className = `nf-status nf-status--${st}`;
    const connected = st === 'connected' && nfSession.muse?.state === 2;
    deviceLabel.textContent = connected ? nfSession.getDeviceLabel() : 'Sin dispositivo';
    btnConnect.hidden = connected || st === 'connecting';
    btnDisconnect.hidden = !connected;
    btnConnect.disabled = st === 'connecting';
  };

  nfSession.onStatusChange = () => syncUi();
  nfSession.onBatteryUpdate = (pct) => {
    batteryEl.textContent = pct != null ? `${pct}% 🔋` : '';
    batteryEl.classList.toggle('nf-battery--low', pct != null && pct <= 20);
  };

  btnConnect?.addEventListener('click', async () => {
    try {
      await nfSession.connect();
      syncUi();
      toast('Muse conectado');
    } catch (e) {
      syncUi();
      toast(e.message || 'Error al conectar');
    }
  });

  btnDisconnect?.addEventListener('click', () => {
    nfSession.disconnect();
    batteryEl.textContent = '';
    syncUi();
  });

  nfSession.onDisconnected = () => {
    syncUi();
    toast('Muse desconectado — intentando reconectar…');
  };

  syncUi();

  const recordBtn = host.querySelector('#nf-record-btn');
  const recordWrap = host.querySelector('#nf-record-wrap');
  let isRec = false;

  recordBtn?.addEventListener('click', async () => {
    if (!nfSession.muse || nfSession.muse.state !== 2) {
      toast('Conecta el Muse primero');
      return;
    }
    if (!isRec) {
      nfSession.startRecording();
      isRec = true;
      recordWrap.classList.add('recording');
      recordBtn.innerHTML = '<span class="dot"></span> Detener';
      return;
    }

    const payload = nfSession.stopRecording();
    isRec = false;
    recordWrap.classList.remove('recording');
    recordBtn.innerHTML = '<span class="dot"></span> Grabar';

    if (!payload) {
      toast('Sin datos grabados');
      return;
    }

    toast('Analizando sesión…');
    try {
      const csv = await analyzeSessionPython(payload);
      const parts = csv.split(',').map(Number);
      const results = {
        calm_seconds: parts[0],
        attention_seconds: parts[1],
        calm_level: parts[2],
        attention_level: parts[3],
        relaxation_pct: parts[4],
        calm_pct: parts[5],
        attentive_pct: parts[6],
      };
      const meta = nfSession.getRecordingMeta();
      await saveNeurofeedbackRecording(moduleRow.id, {
        ...meta,
        raw_data: payload,
        results,
      });
      await syncModuleReadableText(
        moduleRow,
        { last_results: results, last_meta: meta },
        'completado',
      );
      const prev = parseJsonSafe(moduleRow.data, {});
      host.querySelector('#nf-tab-resultados').innerHTML = renderResults(
        results,
        meta,
        prev.session_notes || '',
      );
      bindResultsTab(host, moduleRow);
      host.querySelector('#nf-tab-resultados').hidden = false;
      host.querySelector('#nf-tab-sesion').hidden = true;
      host.querySelectorAll('#nf-tabs .tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'resultados');
      });
      onSaved?.();
      toast('Sesión analizada y guardada');
    } catch (e) {
      toast(e.message || 'Error en análisis Python');
      console.error(e);
    }
  });

  host.querySelector('#nf-help')?.addEventListener('click', () => {
    toast(
      `Solo ${NF_SUPPORTED_DEVICE}. BLE nativo en macOS/Windows. Feedback en vivo con mismas bandas que el análisis post-sesión (Delta, Theta, Alpha, Beta).`,
    );
  });
}
