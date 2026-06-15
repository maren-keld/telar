import { TREATMENT_STATUS, TREATMENT_TAG_DEFS } from '../config.js';
import { openAgendaCardMenu } from '../components/agenda-menu.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { createTreatment, getAgendaGroups, upsertPatient } from '../db.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { toast } from '../utils.js';
import { escapeHtml } from '../utils.js';

function tagBadges(row) {
  const tags = row.tags || [];
  return tags
    .map((t) => {
      const def = TREATMENT_TAG_DEFS[t];
      return def ? `<span class="badge badge--tag">${escapeHtml(def.label)}</span>` : '';
    })
    .join('');
}

function patientCard(row) {
  const badges = [
    `<span class="badge">Tratamiento ${row.treatment_number}</span>`,
    row.convenio_name ? `<span class="badge badge--info">${escapeHtml(row.convenio_name)}</span>` : '',
    tagBadges(row),
  ].join('');
  return `
    <div class="patient-card" data-treatment-id="${row.treatment_id}">
      <div class="patient-card__body">
        <strong data-sensitive>${escapeHtml(row.name)}</strong>
        <div class="patient-card__meta">${badges}</div>
      </div>
      <button type="button" class="patient-card__menu" data-menu aria-label="Opciones del tratamiento" title="Opciones del tratamiento">⋯</button>
    </div>`;
}

function section(statusKey, rows, collapsed = false) {
  const meta = TREATMENT_STATUS[statusKey] || { label: statusKey };
  const body = collapsed
    ? ''
    : rows.map(patientCard).join('') || '<p class="text-muted">Sin pacientes</p>';
  return `
    <section class="section-accordion" data-status="${statusKey}">
      <div class="section-accordion__head" data-toggle-section>
        <span>${collapsed ? '▸' : '▾'}</span>
        <h2>${meta.label}</h2>
        <span class="section-accordion__count">${rows.length}</span>
      </div>
      <div class="section-accordion__body" ${collapsed ? 'hidden' : ''}>${body}</div>
    </section>`;
}

export async function renderAgenda(container, { search = '', onNavigate }) {
  const groups = await getAgendaGroups(search);
  const order = ['en_tratamiento', 'en_pausa', 'completado', 'abandonado', 'archivado'];

  container.innerHTML = `
    ${renderAppSidebar('agenda')}
    <div class="app-main" id="patients">
      <div class="app-content">
        <div class="toolbar">
          <div class="search-bar">
            <span>🔍</span>
            <input type="search" id="agenda-search" placeholder="Buscar por nombre, RUT o teléfono" value="${escapeHtml(search)}" />
          </div>
          <button class="btn btn-primary" id="btn-add-treatment" title="Crear paciente y nuevo tratamiento">Añadir tratamiento</button>
        </div>
        <div id="agenda-sections">
          ${order
            .filter((k) => (groups[k] || []).length > 0)
            .map((k) => section(k, groups[k] || [], k === 'archivado'))
            .join('')}
        </div>
      </div>
    </div>`;

  const rerender = () => onNavigate({ view: 'agenda', search: container.querySelector('#agenda-search')?.value || '' });

  container.querySelector('#agenda-search')?.addEventListener('input', (e) => {
    onNavigate({ view: 'agenda', search: e.target.value });
  });

  container.querySelectorAll('.patient-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-menu]')) return;
      openTreatmentWorkspace(el.dataset.treatmentId, onNavigate);
    });
  });

  container.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.patient-card');
      const treatmentId = Number(card.dataset.treatmentId);
      let row;
      for (const list of Object.values(groups)) {
        row = list.find((r) => r.treatment_id === treatmentId);
        if (row) break;
      }
      if (row) void openAgendaCardMenu(btn, row, { onUpdated: rerender });
    });
  });

  container.querySelectorAll('[data-toggle-section]').forEach((head) => {
    head.addEventListener('click', () => {
      const body = head.parentElement.querySelector('.section-accordion__body');
      const hidden = body.hasAttribute('hidden');
      if (hidden) body.removeAttribute('hidden');
      else body.setAttribute('hidden', '');
      head.querySelector('span').textContent = hidden ? '▾' : '▸';
    });
  });

  bindAppSidebar(container, { onNavigate });

  container.querySelector('#btn-add-treatment')?.addEventListener('click', async () => {
    try {
      const patientId = await upsertPatient({
        name: 'Paciente sin nombre',
        id_number: '',
        gender: 'femenino',
        occupations: [],
      });
      const treatmentId = await createTreatment(patientId);
      toast('Tratamiento creado');
      await openTreatmentWorkspace(treatmentId, onNavigate);
    } catch (err) {
      toast(err.message || 'No se pudo crear el tratamiento');
    }
  });
}
