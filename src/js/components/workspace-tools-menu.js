import { isProUser, loadProfile, saveProfile } from '../profile.js';
import { SETTINGS_ICONS } from '../icons.js';
import { toast } from '../utils.js';
import { setToggle } from '../transitions.js';
import {
  dispatchWorkspaceIndexMode,
  getWorkspaceIndexMode,
  indexChromeState,
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
  supervision: SETTINGS_ICONS.supervision,
};

export function toolsItemsHtml({ compact = false } = {}) {
  const detail = (text) => (compact ? '' : `<small>${text}</small>`);
  return `
    <ul class="workspace-tools-tab__list">
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-pdf">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.export}</span>
          <span class="workspace-tools-tab__text">
            <span>Exportar programa PDF</span>
            ${detail('Resumen del tratamiento para el paciente o supervisión')}
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-case">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.supervision}</span>
          <span class="workspace-tools-tab__text">
            <span>Presentación de caso</span>
            ${detail('PDF anonimizado para supervisión — sin nombre ni RUT')}
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-word">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.export}</span>
          <span class="workspace-tools-tab__text">
            <span>Exportar programa Word (.doc)</span>
            ${detail('Documento editable del programa de tratamiento')}
          </span>
        </button>
      </li>
    </ul>`;
}

export function bindToolsActions(root, { onExportPdf, onExportWord, onExportCasePresentation }) {
  // PDF de programa: gratis (mismo criterio que presentación de caso — canal de adopción).
  root.querySelector('[data-action="export-pdf"]')?.addEventListener('click', async () => {
    try {
      await onExportPdf();
    } catch (e) {
      toast(e.message || 'No se pudo exportar');
    }
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

  root.querySelector('[data-action="export-word"]')?.addEventListener('click', async () => {
    try {
      await onExportWord();
    } catch (e) {
      toast(e.message || 'No se pudo exportar el documento Word');
    }
  });
}

/** Pestaña Herramientas en #rightsidebar */
export function mountWorkspaceToolsTab(host, opts) {
  const profile = loadProfile();
  const currentMode = getCurrentWorkspaceMode();
  const indexMode = getWorkspaceIndexMode();
  const chrome = indexChromeState(indexMode);
  const isDark = profile.darkMode;

  host.innerHTML = `
    <div class="workspace-tools-tab">
      <p class="tools-section-label">Vista</p>
      <div class="tools-mode-row">
        <button type="button" class="tools-mode-btn${currentMode === 'focus' ? ' tools-mode-btn--active' : ''}" data-mode="focus">Foco</button>
        <button type="button" class="tools-mode-btn${currentMode === 'full' ? ' tools-mode-btn--active' : ''}" data-mode="full">Completo</button>
      </div>

      ${
        chrome.showIndex
          ? `<div class="tools-section-divider"></div>
      <p class="tools-section-label">Índice</p>
      <div class="tools-mode-row">
        <button type="button" class="tools-mode-btn${chrome.categoryActive ? ' tools-mode-btn--active' : ''}" data-index-mode="category">Categoría</button>
        <button type="button" class="tools-mode-btn${chrome.chronoActive ? ' tools-mode-btn--active' : ''}" data-index-mode="chrono">Sesiones</button>
      </div>`
          : ''
      }

      <div class="tools-section-divider"></div>
      <div class="tools-toggle-row" id="tools-dark-toggle">
        <span class="tools-toggle-label">Modo oscuro</span>
        <button type="button" class="t-toggle" role="switch" data-on="${isDark ? 'true' : 'false'}" aria-checked="${isDark ? 'true' : 'false'}" aria-label="Modo oscuro">
          <span class="t-toggle-thumb"></span>
        </button>
      </div>
    </div>`;

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
      if (btn.disabled) return;
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
          <li><button type="button" class="workspace-tools-menu__item" data-action="export-pdf"><span class="workspace-tools-menu__text"><span>Exportar programa PDF</span><small>Resumen del tratamiento</small></span></button></li>
          <li><button type="button" class="workspace-tools-menu__item" data-action="export-word"><span class="workspace-tools-menu__text"><span>Exportar programa Word (.doc)</span><small>Documento editable del tratamiento</small></span></button></li>
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
