import { applyTreatmentTemplate } from '../db.js';
import { MODULE_DEFS } from '../config.js';
import { listTreatmentTemplates } from '../treatment-templates.js';
import { escapeHtml, toast } from '../utils.js';
import { openConfirmModal } from './confirm-modal.js';

function moduleLabel(type) {
  return MODULE_DEFS[type]?.label || type;
}

function sessionPreviewHtml(tpl) {
  return tpl.sessions
    .map((s, i) => {
      const mods = (s.modules || []).map(moduleLabel).join(', ');
      return `<li><strong>S${i + 1} · ${escapeHtml(s.label)}</strong><span>${escapeHtml(mods)}</span></li>`;
    })
    .join('');
}

/**
 * Modal: elegir plantilla de tratamiento (append-only).
 * @returns {Promise<string|null>} templateId o null si cancela
 */
export function openTreatmentTemplatesModal() {
  return new Promise((resolve) => {
    const templates = listTreatmentTemplates();
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card treatment-templates-modal" role="dialog" aria-labelledby="tpl-title">
          <header class="treatment-templates-modal__head">
            <h2 id="tpl-title" class="modal-card__title">Plantillas de tratamiento</h2>
            <button type="button" class="modal-close" data-cancel aria-label="Cerrar">×</button>
          </header>
          <p class="treatment-templates-modal__intro">
            Al aplicar una plantilla solo se <strong>añaden</strong> sesiones y módulos nuevos.
            No se borran ni se vacían los módulos que ya tengas.
          </p>
          <ul class="treatment-templates-list">
            ${templates
              .map(
                (tpl) => `
              <li>
                <button type="button" class="treatment-templates-list__item" data-template="${escapeHtml(tpl.id)}">
                  <span class="treatment-templates-list__title">
                    ${escapeHtml(tpl.label)}
                    ${tpl.featured ? '<span class="treatment-templates-list__badge">TDAH</span>' : ''}
                  </span>
                  <span class="treatment-templates-list__desc">${escapeHtml(tpl.description)}</span>
                  <span class="treatment-templates-list__meta">${tpl.sessions.length} sesiones</span>
                </button>
                <details class="treatment-templates-list__preview">
                  <summary>Ver sesiones</summary>
                  <ol>${sessionPreviewHtml(tpl)}</ol>
                </details>
              </li>`,
              )
              .join('')}
          </ul>
        </div>
      </div>`;

    const close = (id) => {
      root.innerHTML = '';
      resolve(id);
    };

    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(null);
    });
    root.querySelectorAll('[data-template]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.template));
    });
  });
}

/** Flujo completo: elegir → confirmar → aplicar. */
export async function applyTemplateFromTools(treatmentId, { onApplied } = {}) {
  const templateId = await openTreatmentTemplatesModal();
  if (!templateId) return;

  const tpl = listTreatmentTemplates().find((t) => t.id === templateId);
  const ok = await openConfirmModal({
    title: `¿Aplicar «${tpl?.label || 'plantilla'}»?`,
    message:
      'Se crearán las sesiones que falten y se añadirán los módulos de la plantilla. ' +
      'Los módulos ya existentes (y su contenido) no se sobrescriben ni se eliminan. ' +
      'Solo se agregan los que aún no estén en cada sesión.',
    confirmLabel: 'Aplicar plantilla',
    cancelLabel: 'Cancelar',
    danger: false,
  });
  if (!ok) return;

  try {
    const result = await applyTreatmentTemplate(treatmentId, templateId);
    toast(
      `Plantilla aplicada: +${result.modulesAdded} módulos` +
        (result.sessionsCreated ? `, +${result.sessionsCreated} sesiones` : '') +
        (result.modulesSkipped ? ` (${result.modulesSkipped} ya existían)` : ''),
    );
    await onApplied?.(result);
  } catch (e) {
    toast(e.message || 'No se pudo aplicar la plantilla');
  }
}
