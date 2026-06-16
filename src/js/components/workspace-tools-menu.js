import { isProUser, loadProfile, saveProfile } from '../profile.js';
import { isTauriApp } from '../tauri-bridge.js';
import { SETTINGS_ICONS } from '../icons.js';
import { escapeHtml, toast } from '../utils.js';
import { openReferenceDocumentsModal } from './reference-documents-modal.js';

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
  ai: SETTINGS_ICONS.ai,
};

function toolsItemsHtml() {
  return `
    <ul class="workspace-tools-tab__list">
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="export-pdf">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.export}</span>
          <span class="workspace-tools-tab__text">
            <strong>Exportar programa PDF</strong>
            <small>Resumen del tratamiento para el paciente o supervisión</small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="reference-docs">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.reference}</span>
          <span class="workspace-tools-tab__text">
            <strong>Documentos de referencia</strong>
            <small>Adjuntar guías, protocolos o material clínico${isProUser() ? '' : ' · Plan Profesional'}</small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="workspace-tools-tab__item" data-action="ai-program">
          <span class="workspace-tools-tab__icon" aria-hidden="true">${TOOL_ICONS.ai}</span>
          <span class="workspace-tools-tab__text">
            <strong>Crear programa con IA</strong>
            <small>Propuesta de sesiones y módulos según motivo, notas y tests (próximamente)</small>
          </span>
        </button>
      </li>
    </ul>`;
}

function bindToolsActions(root, { treatmentId, onExportPdf }) {
  root.querySelector('[data-action="export-pdf"]')?.addEventListener('click', async () => {
    try {
      await onExportPdf();
    } catch (e) {
      toast(e.message || 'No se pudo exportar');
    }
  });

  root.querySelector('[data-action="reference-docs"]')?.addEventListener('click', () => {
    if (!isProUser()) {
      toast('Documentos de referencia requiere Plan Profesional');
      return;
    }
    openReferenceDocumentsModal({ treatmentId });
  });

  root.querySelector('[data-action="ai-program"]')?.addEventListener('click', () => {
    if (!isTauriApp()) {
      toast('Disponible en la app de escritorio');
      return;
    }
    toast(
      'Próximamente: IA local generará un programa según motivo de consulta, notas y resultados de tests.',
    );
  });
}

/** Pestaña Herramientas en #rightsidebar */
export function mountWorkspaceToolsTab(host, opts) {
  const profile = loadProfile();
  const currentMode = getCurrentWorkspaceMode();
  const isDark = profile.darkMode;

  host.innerHTML = `
    <div class="workspace-tools-tab">
      ${toolsItemsHtml()}

      <div class="tools-section-divider"></div>
      <p class="tools-section-label">Espacio de trabajo</p>
      <div class="tools-mode-row">
        <button type="button" class="tools-mode-btn${currentMode === 'focus' ? ' tools-mode-btn--active' : ''}" data-mode="focus">Foco</button>
        <button type="button" class="tools-mode-btn${currentMode === 'full' ? ' tools-mode-btn--active' : ''}" data-mode="full">Completo</button>
      </div>

      <div class="tools-section-divider"></div>
      <label class="tools-toggle-row" id="tools-dark-toggle">
        <span class="tools-toggle-label">Modo oscuro</span>
        <span class="tools-toggle-switch${isDark ? ' tools-toggle-switch--on' : ''}">
          <span class="tools-toggle-thumb"></span>
        </span>
      </label>
    </div>`;

  bindToolsActions(host, opts);

  let dark = isDark;
  host.querySelector('#tools-dark-toggle')?.addEventListener('click', () => {
    dark = !dark;
    const sw = host.querySelector('.tools-toggle-switch');
    sw?.classList.toggle('tools-toggle-switch--on', dark);
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
          <li><button type="button" class="workspace-tools-menu__item" data-action="ai-program"><span class="workspace-tools-menu__text"><strong>Crear programa con IA</strong><small>Próximamente</small></span></button></li>
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
