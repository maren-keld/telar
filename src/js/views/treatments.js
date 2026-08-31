import { TREATMENT_STATUS } from '../config.js';
import { openAgendaCardMenu } from '../components/agenda-menu.js';
import { openTagPicker } from '../components/tag-picker.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { createTreatment, getAgendaGroups, upsertPatient } from '../db.js';
import { allTagDefs } from '../custom-tags.js';
import { ICON_MORE_VERT } from '../icons.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { requireActivePatientSlot } from '../plan-limits.js';
import { toast } from '../utils.js';
import { escapeHtml } from '../utils.js';

function convenioChip(row) {
  if (!row.convenio_name) return '';
  return `<span class="badge badge--info patient-card__convenio">${escapeHtml(row.convenio_name)}</span>`;
}

function alertaTooltip(row) {
  const reasons = (row.clinical_alert_reasons || []).filter(Boolean);
  if (reasons.length) return reasons.join('. ');
  if (row.clinical_alert || (row.tags || []).includes('alerta')) {
    return 'Marcado en alerta por el profesional.';
  }
  return '';
}

function tagChip(tagKey, { tooltip } = {}) {
  const def = allTagDefs()[tagKey];
  if (!def) return '';
  const color = def.color || '#64748b';
  const pulse =
    tagKey === 'alerta'
      ? `<span class="patient-card__tag-dot tag-glyph--pulse" style="--tag-color:${escapeHtml(color)}"><span class="tag-glyph__ping" aria-hidden="true"></span></span>`
      : `<span class="patient-card__tag-dot" style="--tag-color:${escapeHtml(color)}"></span>`;
  const tip = tooltip
    ? ` data-tooltip="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}"`
    : '';
  return `<span class="patient-card__tag patient-card__tag--${escapeHtml(tagKey)}"${tip}>${pulse}<span>${escapeHtml(def.label)}</span></span>`;
}

export function tagPillsHtml(row) {
  const tags = row.tags || [];
  const parts = [];
  const showAlerta = row.clinical_alert || tags.includes('alerta');
  if (showAlerta) parts.push(tagChip('alerta', { tooltip: alertaTooltip(row) }));
  for (const t of tags) {
    if (t === 'alerta') continue;
    parts.push(tagChip(t));
  }
  return parts.filter(Boolean).join('');
}

function patientCard(row, statusKey) {
  const n = Number(row.treatment_number);
  const tn =
    n > 1
      ? `<span class="patient-card__tn" title="Tratamiento ${n}">T${n}</span>`
      : '';
  return `
    <div class="patient-card" data-treatment-id="${row.treatment_id}" data-status="${escapeHtml(statusKey)}">
      <div class="patient-card__body">
        <div class="patient-card__main">
          <strong data-sensitive>${escapeHtml(row.name)}</strong>
          ${tn}
          <div class="patient-card__tags">
            ${convenioChip(row)}
            ${tagPillsHtml(row)}
            <button type="button" class="tag-add-btn" data-tag-picker aria-haspopup="dialog" aria-label="Añadir o quitar etiquetas" title="Etiquetas">+ Etiqueta</button>
          </div>
        </div>
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

function refreshCardTags(card, row) {
  const wrap = card.querySelector('.patient-card__tags');
  const addBtn = wrap?.querySelector('[data-tag-picker]');
  if (!wrap || !addBtn) return;
  wrap.querySelectorAll('.patient-card__tag, .patient-card__convenio').forEach((el) => el.remove());
  addBtn.insertAdjacentHTML('beforebegin', `${convenioChip(row)}${tagPillsHtml(row)}`);
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
      if (e.target.closest('[data-menu], [data-tag-picker]')) return;
      openTreatmentWorkspace(el.dataset.treatmentId, onNavigate);
    });
  });

  container.querySelectorAll('[data-tag-picker]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.patient-card');
      const treatmentId = Number(card?.dataset.treatmentId);
      if (!card || !treatmentId) return;
      let row;
      for (const list of Object.values(groups)) {
        row = list.find((r) => r.treatment_id === treatmentId);
        if (row) break;
      }
      if (!row) return;
      void openTagPicker(btn, row, {
        onChange: () => refreshCardTags(card, row),
      });
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
