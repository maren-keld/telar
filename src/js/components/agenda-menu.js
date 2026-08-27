import { TREATMENT_STATUS } from '../config.js';
import { allTagEntries } from '../custom-tags.js';
import {
  copyModuleDataBetweenTreatments,
  createTreatment,
  listConvenios,
  updateTreatmentConvenio,
  updateTreatmentStatus,
  updateTreatmentTags,
} from '../db.js';
import { TAG_GLYPHS } from '../glyphs.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { requireActivePatientSlot } from '../plan-limits.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';

function menuCheckItem({ checked, label, attrs, glyph = '' }) {
  return `
    <button type="button" class="patient-menu-status-item${checked ? ' patient-menu-status-item--active' : ''}" ${attrs}>
      <span class="patient-menu-status-item__check" aria-hidden="true">${checked ? '✓' : ''}</span>
      ${glyph}
      <span>${escapeHtml(label)}</span>
    </button>`;
}

function paintChecks(root, selector, key, current) {
  root.querySelectorAll(selector).forEach((btn) => {
    const active = typeof current === 'function' ? current(btn) : btn.dataset[key] === current;
    btn.classList.toggle('patient-menu-status-item--active', active);
    const check = btn.querySelector('.patient-menu-status-item__check');
    if (check) check.textContent = active ? '✓' : '';
    if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export async function openAgendaCardMenu(anchorEl, row, { onUpdated, onNavigate }) {
  const root = document.getElementById('modal-root');
  const rect = anchorEl.getBoundingClientRect();
  const tags = Array.isArray(row.tags) ? [...row.tags] : parseJsonSafe(row.tags, []);
  const selectedTags = new Set(tags);
  const convenios = await listConvenios();
  let currentStatus = row.status;
  const tagIsOn = (key) => selectedTags.has(key) || (key === 'alerta' && row.clinical_alert);

  const statusItems = Object.entries(TREATMENT_STATUS)
    .map(([k, v]) =>
      menuCheckItem({
        checked: currentStatus === k,
        label: v.label,
        attrs: `data-status="${k}"`,
      }),
    )
    .join('');

  const tagItems = allTagEntries()
    .map(([k, v]) => {
      const glyphRaw =
        TAG_GLYPHS[v.glyph] ||
        (v.color ? `<span class="patient-card__tag-dot" style="--tag-color:${escapeHtml(v.color)}"></span>` : '');
      const glyph =
        k === 'alerta' && glyphRaw
          ? `<span class="tag-glyph tag-glyph--pulse">${glyphRaw}<span class="tag-glyph__ping" aria-hidden="true"></span></span>`
          : glyphRaw;
      return menuCheckItem({
        checked: tagIsOn(k),
        label: v.label,
        glyph,
        attrs: `data-tag="${k}" aria-pressed="${tagIsOn(k) ? 'true' : 'false'}"`,
      });
    })
    .join('');

  const tn = Number(row.treatment_number) > 1 ? ` · T${row.treatment_number}` : '';

  root.innerHTML = `
    <div class="dropdown-backdrop" id="agenda-menu-backdrop">
      <div class="dropdown-menu patient-menu t-dropdown" data-origin="top-left" style="top:${Math.min(rect.bottom + 4, window.innerHeight - 420)}px;left:${Math.min(rect.left, window.innerWidth - 280)}px">
        <p class="dropdown-menu__title">${escapeHtml(row.name)}${tn}</p>

        <label class="dropdown-label">Estado del tratamiento</label>
        <div class="patient-menu-status-list">
          ${statusItems}
        </div>

        <button type="button" class="btn btn-ghost btn-block patient-menu-new-treatment" id="agenda-menu-new-treatment">
          + Añadir tratamiento
        </button>

        <div class="patient-menu-divider"></div>
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

        <label class="dropdown-label">Etiquetas</label>
        <div class="patient-menu-status-list" id="menu-tags">
          ${tagItems}
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelector('#agenda-menu-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'agenda-menu-backdrop') close();
  });

  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      if (status === currentStatus) return;
      if (status === 'en_tratamiento' && currentStatus !== 'en_tratamiento') {
        const allowed = await requireActivePatientSlot({ patientId: row.patient_id });
        if (!allowed) return;
      }
      currentStatus = status;
      paintChecks(root, '[data-status]', 'status', status);
      await updateTreatmentStatus(row.treatment_id, status);
      onUpdated?.({ status });
    });
  });

  root.querySelectorAll('[data-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tag;
      if (selectedTags.has(key)) selectedTags.delete(key);
      else selectedTags.add(key);
      paintChecks(root, '[data-tag]', 'tag', (el) => tagIsOn(el.dataset.tag));
      await updateTreatmentTags(row.treatment_id, [...selectedTags]);
      onUpdated?.({ status: currentStatus });
    });
  });

  root.querySelector('#menu-convenio')?.addEventListener('change', async (e) => {
    const convenioVal = e.target.value || '';
    await updateTreatmentConvenio(row.treatment_id, convenioVal || null);
    onUpdated?.({ status: currentStatus });
  });

  root.querySelector('#agenda-menu-new-treatment')?.addEventListener('click', async () => {
    const allowed = await requireActivePatientSlot({ patientId: row.patient_id });
    if (!allowed) return;
    try {
      const newId = await createTreatment(row.patient_id);
      await copyModuleDataBetweenTreatments(row.treatment_id, newId, ['registro_inicial', 'motivo_consulta']);
      close();
      toast('Nuevo tratamiento creado');
      if (onNavigate) await openTreatmentWorkspace(newId, onNavigate);
      else onUpdated?.({ status: 'en_tratamiento' });
    } catch (err) {
      toast(err.message || 'No se pudo crear el tratamiento');
    }
  });
}
