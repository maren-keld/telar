import { TREATMENT_STATUS, TREATMENT_TAG_DEFS } from '../config.js';
import { listConvenios, updateTreatmentConvenio, updateTreatmentStatus, updateTreatmentTags } from '../db.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';

export async function openAgendaCardMenu(anchorEl, row, { onUpdated }) {
  const root = document.getElementById('modal-root');
  const rect = anchorEl.getBoundingClientRect();
  const tags = Array.isArray(row.tags) ? [...row.tags] : parseJsonSafe(row.tags, []);
  const convenios = await listConvenios();

  root.innerHTML = `
    <div class="dropdown-backdrop" id="agenda-menu-backdrop">
      <div class="dropdown-menu" style="top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 280)}px">
        <p class="dropdown-menu__title">${escapeHtml(row.name)} · T${row.treatment_number}</p>
        <label class="dropdown-label">Estado del tratamiento</label>
        <select id="menu-status">
          ${Object.entries(TREATMENT_STATUS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${row.status === k ? 'selected' : ''}>${escapeHtml(v.label)}</option>`,
            )
            .join('')}
        </select>
        <label class="dropdown-label">Convenio</label>
        <select id="menu-convenio">
          <option value="">Sin convenio</option>
          ${convenios
            .map(
              (c) =>
                `<option value="${c.id}" ${Number(row.convenio_id) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`,
            )
            .join('')}
        </select>
        <label class="dropdown-label">Tags</label>
        <div class="dropdown-tags" id="menu-tags">
          ${Object.entries(TREATMENT_TAG_DEFS)
            .map(([k, v]) => {
              const on = tags.includes(k);
              return `<label class="tag-check"><input type="checkbox" value="${k}" ${on ? 'checked' : ''} /> ${escapeHtml(v.label)}</label>`;
            })
            .join('')}
        </div>
        <button type="button" class="btn btn-primary btn-block" id="menu-apply">Aplicar</button>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelector('#agenda-menu-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'agenda-menu-backdrop') close();
  });

  root.querySelector('#menu-apply')?.addEventListener('click', async () => {
    const status = root.querySelector('#menu-status').value;
    const newTags = [...root.querySelectorAll('#menu-tags input:checked')].map((i) => i.value);
    const convenioVal = root.querySelector('#menu-convenio')?.value || '';
    await updateTreatmentStatus(row.treatment_id, status);
    await updateTreatmentTags(row.treatment_id, newTags);
    await updateTreatmentConvenio(row.treatment_id, convenioVal || null);
    close();
    onUpdated?.();
  });
}
