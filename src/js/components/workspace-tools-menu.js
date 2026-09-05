import { isProUser, loadProfile, saveProfile } from '../profile.js';
import { SETTINGS_ICONS } from '../icons.js';
import { toast, escapeHtml } from '../utils.js';
import { setToggle } from '../transitions.js';
import { openReferenceDocumentsModal } from './reference-documents-modal.js';
import { requireProOrSubscribe } from './subscribe-pro-modal.js';
import { openAiSettingsModal } from './open-ai-settings-modal.js';
import { hasAiApiConsent } from '../ai-consent.js';
import {
  AI_DEFAULTS,
  AI_LOCAL_MODELS,
  AI_MODE_ORDER,
  AI_MODES,
  aiSettingsSummary,
  ollamaModelFromLocalId,
} from '../ai-config.js';
import { ensureOllamaRunning, getOllamaStatus, isModelPresent } from '../ollama-client.js';
import {
  dispatchWorkspaceIndexMode,
  getWorkspaceIndexMode,
} from '../workspace-index-mode.js';

const WORKSPACE_LEFT_WIDTH_KEY = 'telar.workspace.leftSidebarWidth';
const LEFT_FOCUS_CSS_THRESHOLD = 90;

function getCurrentWorkspaceMode() {
  try {
    const w = Number(localStorage.getItem(WORKSPACE_LEFT_WIDTH_KEY) || '260');
    return w <= LEFT_FOCUS_CSS_THRESHOLD ? 'focus' : 'full';
  } catch {
    return 'full';
  }
}

function dispatchWorkspaceMode(mode) {
  document.dispatchEvent(new CustomEvent('telar:workspace-mode', { detail: { mode } }));
}

const TOOL_ICONS = {
  export: SETTINGS_ICONS.export,
  reference: SETTINGS_ICONS.backup,
  supervision: SETTINGS_ICONS.supervision,
};

function emitAiConfigChanged() {
  document.dispatchEvent(new CustomEvent('telar:ai-config-changed'));
}

function toolsAiSectionHtml(profile) {
  const mode = profile.aiMode || AI_DEFAULTS.aiMode;
  const localModel = profile.aiLocalModel || AI_DEFAULTS.aiLocalModel;
  const modeOptions = AI_MODE_ORDER.map(
    (id) =>
      `<option value="${id}" ${mode === id ? 'selected' : ''}>${escapeHtml(AI_MODES[id].label)}</option>`,
  ).join('');
  const localOptions = AI_LOCAL_MODELS.map(
    (m) =>
      `<option value="${escapeHtml(m.id)}" ${localModel === m.id ? 'selected' : ''}>${escapeHtml(m.label)}</option>`,
  ).join('');
  return `
    <p class="tools-section-label">Asistente IA</p>
    <label class="tools-ai-label" for="tools-ai-mode">Tipo de IA</label>
    <select id="tools-ai-mode" class="tools-ai-select" aria-label="Tipo de IA">
      ${modeOptions}
    </select>
    <p class="tools-ai-summary" id="tools-ai-summary">${escapeHtml(aiSettingsSummary(profile))}</p>
    <p class="tools-ai-slow" id="tools-ai-slow" ${mode === 'local' ? '' : 'hidden'}>En este computador tarda más y suele responder peor que Mistral.</p>
    <div class="tools-ai-local" id="tools-ai-local" ${mode === 'local' ? '' : 'hidden'}>
      <label class="tools-ai-label" for="tools-ai-local-model">Modelo local</label>
      <select id="tools-ai-local-model" class="tools-ai-select" aria-label="Modelo local">
        ${localOptions}
      </select>
      <p class="tools-ai-install" id="tools-ai-install" aria-live="polite"></p>
    </div>
    <button type="button" class="btn btn-ghost btn-sm tools-ai-config" id="tools-ai-config">
      ${mode === 'api' ? 'Consentimiento y servicio…' : 'Descargar / gestionar modelos…'}
    </button>
    <div class="tools-section-divider"></div>`;
}

function localModelInstalled(status, localId) {
  return isModelPresent(status?.models || [], ollamaModelFromLocalId(localId));
}

function paintLocalModelOptions(localEl, hintEl, status) {
  if (!localEl) return;
  const running = Boolean(status?.running);
  for (const opt of localEl.options) {
    const def = AI_LOCAL_MODELS.find((m) => m.id === opt.value);
    if (!def) continue;
    const ok = localModelInstalled(status, def.id);
    opt.dataset.installed = ok ? '1' : '0';
    if (ok) opt.textContent = `${def.label} · instalado`;
    else if (!running) opt.textContent = `${def.label} · Ollama apagado`;
    else opt.textContent = `${def.label} · no descargado`;
  }
  if (hintEl) {
    const selected = localEl.value;
    const ok = localModelInstalled(status, selected);
    if (!running) {
      hintEl.textContent = 'Ollama no está abierto. Telar intenta arrancarlo; si falta un modelo, ábrelo abajo para descargarlo.';
    } else if (ok) {
      hintEl.textContent = 'Este modelo ya está en el equipo.';
    } else {
      hintEl.textContent = 'Este modelo no está descargado. Ábrelo abajo para instalarlo.';
    }
  }
}

function bindToolsAi(host) {
  const modeEl = host.querySelector('#tools-ai-mode');
  const localWrap = host.querySelector('#tools-ai-local');
  const localEl = host.querySelector('#tools-ai-local-model');
  const summaryEl = host.querySelector('#tools-ai-summary');
  const configBtn = host.querySelector('#tools-ai-config');
  const hintEl = host.querySelector('#tools-ai-install');
  const slowEl = host.querySelector('#tools-ai-slow');
  let ollamaStatus = { running: false, models: [] };

  const openAiModal = (preferredLocalModel) => {
    openAiSettingsModal({
      source: 'tools',
      preferredLocalModel,
      onSaved: () => {
        paint(loadProfile());
        emitAiConfigChanged();
        void refreshOllama(true);
      },
    });
  };

  const paint = (profile) => {
    const mode = profile.aiMode || AI_DEFAULTS.aiMode;
    if (modeEl) modeEl.value = mode;
    if (localEl) localEl.value = profile.aiLocalModel || AI_DEFAULTS.aiLocalModel;
    if (localWrap) localWrap.hidden = mode !== 'local';
    if (slowEl) slowEl.hidden = mode !== 'local';
    if (configBtn) {
      configBtn.hidden = false;
      configBtn.textContent = mode === 'api' ? 'Configurar API…' : 'Descargar / gestionar modelos…';
    }
    if (summaryEl) summaryEl.textContent = aiSettingsSummary(profile);
    paintLocalModelOptions(localEl, hintEl, ollamaStatus);
  };

  const refreshOllama = async (startIfNeeded = false) => {
    try {
      ollamaStatus = startIfNeeded ? await ensureOllamaRunning() : await getOllamaStatus();
    } catch {
      if (startIfNeeded) {
        try {
          ollamaStatus = await getOllamaStatus();
        } catch {
          ollamaStatus = { running: false, models: [] };
        }
      } else {
        ollamaStatus = { running: false, models: [] };
      }
    }
    paintLocalModelOptions(localEl, hintEl, ollamaStatus);
    return ollamaStatus;
  };

  modeEl?.addEventListener('change', () => {
    const next = modeEl.value;
    const prev = loadProfile();
    const prevMode = prev.aiMode || AI_DEFAULTS.aiMode;
    if (next === 'api' && !hasAiApiConsent(prev)) {
      modeEl.value = prevMode;
      openAiModal(prev.aiLocalModel);
      return;
    }
    saveProfile({ aiMode: next });
    paint(loadProfile());
    emitAiConfigChanged();
    if (next === 'local') {
      const id = loadProfile().aiLocalModel || AI_DEFAULTS.aiLocalModel;
      void refreshOllama(true).then((status) => {
        if (!localModelInstalled(status, id)) openAiModal(id);
      });
    }
  });

  localEl?.addEventListener('change', () => {
    const id = localEl.value;
    saveProfile({ aiLocalModel: id });
    paint(loadProfile());
    emitAiConfigChanged();
    if (!localModelInstalled(ollamaStatus, id)) {
      openAiModal(id);
    }
  });

  configBtn?.addEventListener('click', () => {
    openAiModal(loadProfile().aiLocalModel);
  });

  void refreshOllama(false).then((status) => {
    if (!status.running && (loadProfile().aiMode || AI_DEFAULTS.aiMode) === 'local') {
      void refreshOllama(true);
    }
  });
}

function toolsItemsHtml() {
  return `
    <ul class="workspace-tools-tab__list">
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-pdf">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.export}</span>
          <span class="workspace-tools-tab__text">
            <strong>Exportar programa PDF</strong>
            <small>Resumen del tratamiento para el paciente o supervisión${isProUser() ? '' : ' · Plan Profesional'}</small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-case">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.supervision}</span>
          <span class="workspace-tools-tab__text">
            <strong>Presentación de caso</strong>
            <small>PDF anonimizado para supervisión — sin nombre ni RUT</small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="reference-docs">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.reference}</span>
          <span class="workspace-tools-tab__text">
            <strong>Documentos de referencia</strong>
            <small>Adjuntar guías, protocolos o material clínico</small>
          </span>
        </button>
      </li>
    </ul>`;
}

function bindToolsActions(root, { treatmentId, onExportPdf, onExportCasePresentation }) {
  root.querySelector('[data-action="export-pdf"]')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: async () => {
        try {
          await onExportPdf();
        } catch (e) {
          toast(e.message || 'No se pudo exportar');
        }
      },
    });
  });

  // Sin gate Pro a propósito: este PDF circula hacia el supervisor y es el canal
  // por el que Telar se muestra solo. Cobrarlo cerraría esa puerta.
  root.querySelector('[data-action="export-case"]')?.addEventListener('click', async () => {
    try {
      await onExportCasePresentation();
    } catch (e) {
      toast(e.message || 'No se pudo generar la presentación');
    }
  });

  root.querySelector('[data-action="reference-docs"]')?.addEventListener('click', () => {
    openReferenceDocumentsModal({ treatmentId });
  });
}

/** Pestaña Herramientas en #rightsidebar */
export function mountWorkspaceToolsTab(host, opts) {
  const profile = loadProfile();
  const currentMode = getCurrentWorkspaceMode();
  const indexMode = getWorkspaceIndexMode();
  const isDark = profile.darkMode;

  host.innerHTML = `
    <div class="workspace-tools-tab">
      ${toolsAiSectionHtml(profile)}
      ${toolsItemsHtml()}

      <div class="tools-section-divider"></div>
      <p class="tools-section-label">Espacio de trabajo</p>
      <div class="tools-mode-row">
        <button type="button" class="tools-mode-btn${currentMode === 'focus' ? ' tools-mode-btn--active' : ''}" data-mode="focus">Foco</button>
        <button type="button" class="tools-mode-btn${currentMode === 'full' ? ' tools-mode-btn--active' : ''}" data-mode="full">Completo</button>
      </div>

      <div class="tools-section-divider"></div>
      <p class="tools-section-label">Índice</p>
      <div class="tools-mode-row">
        <button type="button" class="tools-mode-btn${indexMode === 'chrono' ? ' tools-mode-btn--active' : ''}" data-index-mode="chrono">Cronológica</button>
        <button type="button" class="tools-mode-btn${indexMode === 'category' ? ' tools-mode-btn--active' : ''}" data-index-mode="category">Por categoría</button>
      </div>

      <div class="tools-section-divider"></div>
      <div class="tools-toggle-row" id="tools-dark-toggle">
        <span class="tools-toggle-label">Modo oscuro</span>
        <button type="button" class="t-toggle" role="switch" data-on="${isDark ? 'true' : 'false'}" aria-checked="${isDark ? 'true' : 'false'}" aria-label="Modo oscuro">
          <span class="t-toggle-thumb"></span>
        </button>
      </div>
    </div>`;

  bindToolsActions(host, opts);
  bindToolsAi(host);

  let dark = isDark;
  host.querySelector('#tools-dark-toggle')?.addEventListener('click', () => {
    dark = !dark;
    const sw = host.querySelector('.t-toggle');
    setToggle(sw, dark);
    saveProfile({ darkMode: dark });
  });

  host.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      host.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('tools-mode-btn--active', b.dataset.mode === mode);
      });
      dispatchWorkspaceMode(mode);
    });
  });

  host.querySelectorAll('[data-index-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.indexMode;
      host.querySelectorAll('[data-index-mode]').forEach((b) => {
        b.classList.toggle('tools-mode-btn--active', b.dataset.indexMode === mode);
      });
      dispatchWorkspaceIndexMode(mode);
    });
  });
}

/** Modal legacy (si se necesita desde otro lugar) */
export function openWorkspaceToolsMenu(opts) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop workspace-tools-backdrop" data-close>
      <div class="workspace-tools-menu" role="menu" aria-label="Herramientas del tratamiento">
        <header class="workspace-tools-menu__head">
          <h2 class="workspace-tools-menu__title">Herramientas</h2>
          <button type="button" class="modal-close" data-dismiss aria-label="Cerrar">×</button>
        </header>
        <ul class="workspace-tools-menu__list">
          <li><button type="button" class="workspace-tools-menu__item" data-action="export-pdf"><span class="workspace-tools-menu__text"><strong>Exportar programa PDF</strong><small>Resumen del tratamiento</small></span></button></li>
          <li><button type="button" class="workspace-tools-menu__item" data-action="reference-docs"><span class="workspace-tools-menu__text"><strong>Documentos de referencia</strong><small>Adjuntar guías y protocolos</small></span></button></li>
        </ul>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelector('[data-dismiss]')?.addEventListener('click', close);
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  bindToolsActions(root, {
    ...opts,
    onExportPdf: async () => {
      close();
      await opts.onExportPdf();
    },
  });
}
