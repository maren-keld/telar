import { isProUser } from '../profile.js';
import { isTauriApp } from '../tauri-bridge.js';
import { SETTINGS_ICONS } from '../icons.js';
import { escapeHtml, toast } from '../utils.js';
import { openReferenceDocumentsModal } from './reference-documents-modal.js';

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
  host.innerHTML = `<div class="workspace-tools-tab">${toolsItemsHtml()}</div>`;
  bindToolsActions(host, opts);
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
