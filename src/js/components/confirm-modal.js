import { escapeHtml } from '../utils.js';

/**
 * @returns {Promise<boolean>}
 */
export function openConfirmModal({
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card confirm-modal" role="alertdialog" aria-labelledby="confirm-title">
          <h2 id="confirm-title" class="modal-card__title">${escapeHtml(title)}</h2>
          <p class="confirm-modal__message">${escapeHtml(message)}</p>
          <div class="modal-card__actions">
            <button type="button" class="btn btn-secondary" data-cancel>${escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`;

    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };

    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    root.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(false);
    });
  });
}
