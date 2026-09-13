import { ICON_EDIT, ICON_REINFORCE } from './icons.js';

/** Ítems marcados del Perfil muestran lápiz (nota clínica) y acción Reforzar. */
export function notePresent(note) {
  return Boolean(String(note || '').trim());
}

export function buildSpaceCheckRowHtml({
  label,
  category,
  checked,
  note = '',
  reinforce = false,
  desc = '',
  xref = '',
  escapeHtml,
}) {
  const rowClass = ['space-check'];
  if (checked) rowClass.push('space-check--checked');
  if (reinforce) rowClass.push('space-check--reinforce');
  if (notePresent(note)) rowClass.push('space-check--has-note');

  const actions =
    checked ?
      `<div class="space-check__actions">
        <button type="button" class="btn btn-ghost btn-icon space-check__edit" data-perfil-edit data-category="${escapeHtml(category)}" data-label="${escapeHtml(label)}" title="Editar nota clínica" aria-label="Editar nota clínica">${ICON_EDIT}</button>
        <button type="button" class="btn btn-ghost btn-icon space-check__reinforce${reinforce ? ' is-active' : ''}" data-perfil-reinforce data-category="${escapeHtml(category)}" data-label="${escapeHtml(label)}" title="Reforzar" data-tooltip="Reforzar" aria-label="Reforzar" aria-pressed="${reinforce ? 'true' : 'false'}">${ICON_REINFORCE}</button>
      </div>`
    : '';

  return `
    <div class="${rowClass.join(' ')}">
      <label class="space-check__main">
        <input type="checkbox" data-space-check data-category="${escapeHtml(category)}" value="${escapeHtml(label)}" ${checked ? 'checked' : ''}/>
        <span class="space-check__body">
          <span class="space-check__title">${escapeHtml(label)}</span>
          ${desc ? `<span class="space-check__desc">${escapeHtml(desc)}</span>` : ''}
          ${xref ? `<span class="space-check__xref">${escapeHtml(xref)}</span>` : ''}
          ${notePresent(note) ? `<span class="space-check__note">${escapeHtml(String(note).trim())}</span>` : ''}
        </span>
      </label>
      ${actions}
    </div>`;
}
