import { TREATMENT_STATUS, TREATMENT_TAG_DEFS } from '../config.js';
import { openAgendaCardMenu } from '../components/agenda-menu.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { createTreatment, getAgendaGroups, upsertPatient } from '../db.js';
import { TAG_GLYPHS } from '../glyphs.js';
import { ICON_MORE_VERT } from '../icons.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { requireActivePatientSlot } from '../plan-limits.js';
import { toast } from '../utils.js';
import { escapeHtml } from '../utils.js';

function tagChip(tagKey) {
  const def = TREATMENT_TAG_DEFS[tagKey];
  if (!def) return '';
  const glyph = TAG_GLYPHS[def.glyph] || '';
  const icon =
    tagKey === 'alerta'
      ? `<span class="tag-glyph tag-glyph--pulse">${glyph}<span class="tag-glyph__ping" aria-hidden="true"></span></span>`
      : glyph;
  return `<span class="patient-card__tag patient-card__tag--${escapeHtml(tagKey)}">${icon}<span>${escapeHtml(def.label)}</span></span>`;
}

function tagBadges(row) {
  const tags = row.tags || [];
  const parts = [];
  const showAlerta = row.clinical_alert || tags.includes('alerta');
  if (showAlerta) parts.push(tagChip('alerta'));
  for (const t of tags) {
    if (t === 'alerta') continue;
    const def = TREATMENT_TAG_DEFS[t];
    if (def) parts.push(tagChip(t));
  }
  return parts.join('');
}

function patientCard(row, statusKey) {
  const n = Number(row.treatment_number);
  const tn =
    n > 1
      ? `<span class="patient-card__tn" title="Tratamiento ${n}">T${n}</span>`
      : '';
  const quiet = [row.convenio_name ? `<span class="badge badge--info">${escapeHtml(row.convenio_name)}</span>` : '', tagBadges(row)]
    .join('')
    .trim();
  const meta = quiet ? `<div class="patient-card__meta">${quiet}</div>` : '';
  return `
    <div class="patient-card" data-treatment-id="${row.treatment_id}" data-status="${escapeHtml(statusKey)}">
      <div class="patient-card__body">
        <div class="patient-card__main">
          <strong data-sensitive>${escapeHtml(row.name)}</strong>
          ${tn}
        </div>
        ${meta}
      </div>
      <button type="button" class="patient-card__menu" data-menu aria-label="Opciones del tratamiento" title="Opciones del tratamiento">${ICON_MORE_VERT}</button>
    </div>`;
}

export function treatmentSectionHtml(statusKey, rows, collapsed = false) {
  const meta = TREATMENT_STATUS[statusKey] || { label: statusKey };
  const body =
    rows.map((row) => patientCard(row, statusKey)).join('') ||
    '<p class="text-muted reportes-empty">Sin pacientes en esta sección.</p>';
  return `
    <section class="section-accordion" data-status="${statusKey}">
      <div class="section-accordion__head" data-toggle-section role="button" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span class="section-accordion__chev" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
        <h2>${meta.label}</h2>
        <span class="section-accordion__count">${rows.length}</span>
      </div>
      <div class="section-accordion__body" ${collapsed ? 'hidden' : ''}>${body}</div>
    </section>`;
}

export async function renderTreatments(container, { search = '', onNavigate, expandStatus = null }) {
  const groups = await getAgendaGroups(search);
  const order = ['en_tratamiento', 'en_pausa', 'completado', 'abandonado', 'archivado'];
  const totalPatients = order.reduce((n, k) => n + (groups[k] || []).length, 0);
  const sectionsHtml = totalPatients
    ? order
        .filter((k) => (groups[k] || []).length > 0)
        .map((k) => treatmentSectionHtml(k, groups[k] || [], k === 'archivado' && expandStatus !== 'archivado'))
        .join('')
    : `<div class="agenda-empty card">
        <p class="agenda-empty__title">Sin pacientes añadidos aún</p>
        <p class="agenda-empty__sub text-muted">Pulsa <strong>Añadir tratamiento</strong> para crear tu primer paciente.</p>
      </div>`;

  container.innerHTML = `
    ${renderAppSidebar('treatments')}
    <div class="app-main" id="patients">
      <div class="app-content">
        <div class="toolbar">
          <div class="search-bar">
            <input type="search" id="agenda-search" placeholder="Buscar por nombre, RUT o teléfono" value="${escapeHtml(search)}" />
          </div>
          <button class="btn btn-primary" id="btn-add-treatment" title="Crear paciente y nuevo tratamiento">Añadir tratamiento</button>
        </div>
        <div id="agenda-sections">
          ${sectionsHtml}
        </div>
      </div>
    </div>`;

  const currentSearch = () => container.querySelector('#agenda-search')?.value || '';
  const rerender = (detail = {}) =>
    renderTreatments(container, {
      search: currentSearch(),
      onNavigate,
      expandStatus: detail.status || null,
    });

  container.querySelector('#agenda-search')?.addEventListener('input', (e) => {
    onNavigate({ view: 'treatments', search: e.target.value });
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
      if (row) void openAgendaCardMenu(btn, row, { onUpdated: (detail) => void rerender(detail), onNavigate });
    });
  });

  container.querySelectorAll('[data-toggle-section]').forEach((head) => {
    head.addEventListener('click', () => {
      const body = head.parentElement.querySelector('.section-accordion__body');
      const chev = head.querySelector('.section-accordion__chev');
      const hidden = body.hasAttribute('hidden');
      if (hidden) body.removeAttribute('hidden');
      else body.setAttribute('hidden', '');
      head.setAttribute('aria-expanded', hidden ? 'true' : 'false');
      if (chev) chev.textContent = hidden ? '▾' : '▸';
    });
  });

  bindAppSidebar(container, { onNavigate });

  container.querySelector('#btn-add-treatment')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-add-treatment');
    if (btn?.disabled) return;
    btn.disabled = true;
    const labelPrev = btn.textContent;
    btn.textContent = 'Creando…';
    try {
      const allowed = await requireActivePatientSlot();
      if (!allowed) return;
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
    } finally {
      btn.disabled = false;
      btn.textContent = labelPrev;
    }
  });
}
