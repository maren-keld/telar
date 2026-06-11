import { escapeHtml } from '../utils.js';

export function openEditFieldModal({ title, value = '', multiline = false, onSave }) {
  const root = document.getElementById('modal-root');
  const inputTag = multiline
    ? `<textarea class="input" id="edit-field-input" rows="4">${escapeHtml(value)}</textarea>`
    : `<input type="text" class="input" id="edit-field-input" value="${escapeHtml(value)}" />`;

  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card" role="dialog" aria-labelledby="edit-field-title">
        <h2 id="edit-field-title" class="modal-card__title">${escapeHtml(title)}</h2>
        ${inputTag}
        <div class="modal-card__actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="edit-field-save">Guardar</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
  });

  const input = root.querySelector('#edit-field-input');
  input?.focus();
  if (!multiline) input?.select();

  root.querySelector('#edit-field-save')?.addEventListener('click', async () => {
    const next = input?.value?.trim() ?? '';
    await onSave(next);
    close();
  });
}
