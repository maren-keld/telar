/**
 * Vista workspace · Estudio de caso
 * Ejes → elementos en filas (manifestaciones, indicadores, objetivos, evidencia + notas).
 */
import {
  CASE_STUDY_AXES,
  ESTUDIO_NAV,
  SUPPORT_NETWORK_KIND,
  emptyCaseStudyElement,
  normalizeCaseStudyData,
  normalizeCaseStudyElement,
  STATUS_LABELS,
  suggestedModulesForAxis,
} from '../case-study-model.js';
import {
  elementInAxis,
  libraryItemsForAxis,
  libraryTitleForAxis,
  namedSupportPeople,
  summaryDotsForAxis,
} from '../case-study-catalog.js';
import { loadCaseStudy, onCaseStudyChanged, saveCaseStudy } from '../case-study-store.js';
import { getSessionsWithModules } from '../db.js';
import { escapeHtml, toast } from '../utils.js';
import { notifySaveError } from '../save-status.js';
import { queuedPersist } from '../autobind.js';
import { listAddableModuleOptions } from '../workspace-index-mode.js';
import { moduleLabelFor } from '../custom-modules.js';
import { renderWorkspaceScores } from '../components/workspace-scores.js';
import { bindToolsActions, toolsItemsHtml } from '../components/workspace-tools-menu.js';
import { applyModuleSearch } from '../components/module-selector.js';
import { genogramHtml } from '../modules/redes-apoyo.js';

const LIST_FIELDS = [
  {
    key: 'manifestations',
    label: 'Manifestaciones',
    checkable: false,
    placeholder: 'Manifestación clínica…',
  },
  { key: 'indicators', label: 'Indicadores', checkable: true, placeholder: 'Indicador observable…' },
  { key: 'objectives', label: 'Objetivos', checkable: true, placeholder: 'Objetivo terapéutico…' },
  { key: 'evidence', label: 'Evidencia', checkable: false, placeholder: 'Evidencia o fuente…' },
];

const ELEMENT_ICONS = [
  '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
  '<path d="M12 3l2.2 6.6H21l-5.4 4 2.1 6.4L12 16.8 6.3 20l2.1-6.4L3 9.6h6.8z"/>',
  '<path d="M12 21s7-4.4 7-11a7 7 0 10-14 0c0 6.6 7 11 7 11z"/>',
  '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5V3h8v2"/>',
  '<circle cx="12" cy="8" r="3"/><path d="M5 20v-1a7 7 0 0114 0v1"/>',
  '<path d="M4 19V5l8-2 8 2v14l-8 2-8-2z"/><path d="M12 3v18"/>',
  '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  '<path d="M5 12h14M12 5l7 7-7 7"/>',
];

const STATUS_ICONS = {
  present: '<circle cx="12" cy="12" r="8"/><path d="M8 12.2l2.4 2.4L16 9"/>',
  developing: '<path d="M12 20V10"/><path d="M12 10c2-3 4-4 6-4-1 3-3 5-6 6"/><path d="M12 10c-2-3-4-4-6-4 1 3 3 5 6 6"/>',
  unknown: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.8-1.5 1.2-1.5 2.5"/><path d="M12 17h.01"/>',
};

function iconSvg(paths, className = 'estudio-element__glyph') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function iconForElement(id, axis) {
  let n = 0;
  const key = String(id || axis || '');
  for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i) * (i + 1)) % ELEMENT_ICONS.length;
  const axisShift = { problem: 0, resource: 1, defense: 2, risk: 3, other: 4 }[axis] || 0;
  return iconSvg(ELEMENT_ICONS[(n + axisShift) % ELEMENT_ICONS.length]);
}

export function statusToggleHtml(status) {
  const current = STATUS_LABELS[status] ? status : 'unknown';
  return `
    <div class="estudio-status" data-field="status" data-status="${current}" role="group" aria-label="Estado del elemento">
      ${['present', 'developing', 'unknown']
        .map((id) => {
          const selected = id === current;
          return `<button type="button" class="estudio-status__btn${selected ? ' is-selected' : ''}" data-status-set="${id}" title="${escapeHtml(STATUS_LABELS[id])}" aria-label="${escapeHtml(STATUS_LABELS[id])}" aria-pressed="${selected ? 'true' : 'false'}">
            ${iconSvg(STATUS_ICONS[id], 'estudio-status__glyph')}
            ${selected ? '<span class="estudio-status__check" aria-hidden="true">✓</span>' : ''}
          </button>`;
        })
        .join('')}
    </div>`;
}

function itemRowHtml(listKey, item, index, { checkable, placeholder }) {
  const text = escapeHtml(item?.text || '');
  const checked = item?.checked ? 'checked' : '';
  return `
    <div class="estudio-item-row${checkable ? '' : ' estudio-item-row--plain'}">
      ${
        checkable
          ? `<label class="estudio-item-check" title="Marcar">
              <input type="checkbox" data-list="${listKey}" data-index="${index}" data-field="checked" ${checked} />
            </label>`
          : ''
      }
      <input type="text" class="estudio-item-text" data-list="${listKey}" data-index="${index}" data-field="text"
        value="${text}" placeholder="${escapeHtml(placeholder)}" />
      <button type="button" class="btn btn-ghost estudio-item-remove" data-remove-item data-list="${listKey}" data-index="${index}" title="Quitar" aria-label="Quitar">×</button>
    </div>`;
}

function activityRowHtml(activity, index, sessions, suggestions) {
  const options = listAddableModuleOptions();
  return `
    <div class="estudio-activity-row" data-activity-index="${index}">
      <select data-activity-field="moduleType" aria-label="Módulo">
        <option value="">Módulo…</option>
        ${options
          .map(
            (opt) =>
              `<option value="${escapeHtml(opt.type)}" ${activity.moduleType === opt.type ? 'selected' : ''}>${escapeHtml(opt.label)}${suggestions.includes(opt.type) ? ' · relacionado' : ''}</option>`,
          )
          .join('')}
      </select>
      <select data-activity-field="sessionId" aria-label="Sesión">
        <option value="">Sesión…</option>
        ${(sessions || [])
          .map(
            (s) =>
              `<option value="${s.id}" ${String(activity.sessionId) === String(s.id) ? 'selected' : ''}>Sesión ${s.number}</option>`,
          )
          .join('')}
      </select>
      <button type="button" class="btn btn-ghost" data-remove-activity title="Quitar">×</button>
    </div>`;
}

function elementRowHtml(element, axis, sessions) {
  const isNetwork = element.kind === SUPPORT_NETWORK_KIND;
  const hasNotes = Boolean((element.notes || '').trim());
  const suggestions = suggestedModulesForAxis(axis);

  const lists = isNetwork
    ? ''
    : LIST_FIELDS.map((field) => {
        const items = element[field.key] || [];
        return `
      <section class="estudio-element__field" data-field-block="${field.key}">
        <header class="estudio-element__field-head">
          <h4 class="estudio-element__field-title">${escapeHtml(field.label)}</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-add-item data-list="${field.key}" data-element-id="${escapeHtml(element.id)}">+ Añadir</button>
        </header>
        <div class="estudio-element__field-list" data-list-host="${field.key}">
          ${
            items.map((item, i) => itemRowHtml(field.key, item, i, field)).join('') ||
            `<p class="estudio-element__empty">Sin ${escapeHtml(field.label.toLowerCase())} aún.</p>`
          }
        </div>
      </section>`;
      }).join('');

  const peopleBlock = isNetwork
    ? `
      <section class="estudio-element__field">
        <header class="estudio-element__field-head">
          <h4 class="estudio-element__field-title">Personas</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-add-support>+ Persona</button>
        </header>
        <div class="estudio-redes__list">
          ${(element.people || []).map((p, i) => supportPersonHtml(p, i)).join('') || '<p class="estudio-element__empty">Sin personas aún.</p>'}
        </div>
      </section>`
    : '';

  const activities = element.activities || [];
  const activityBlock = isNetwork
    ? ''
    : `
      <section class="estudio-element__field">
        <header class="estudio-element__field-head">
          <h4 class="estudio-element__field-title">Actividades</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-add-activity data-element-id="${escapeHtml(element.id)}">+ Actividad</button>
        </header>
        <p class="estudio-element__hint">Módulos relacionados: ${suggestions.map((t) => escapeHtml(moduleLabelFor(t))).join(' · ')}</p>
        <div class="estudio-activity-list">
          ${
            activities.map((row, i) => activityRowHtml(row, i, sessions, suggestions)).join('') ||
            '<p class="estudio-element__empty">Sin actividades aún.</p>'
          }
        </div>
      </section>`;

  return `
    <article class="estudio-element card" data-element-id="${escapeHtml(element.id)}" data-kind="${escapeHtml(element.kind || 'standard')}">
      <header class="estudio-element__head">
        <span class="estudio-element__icon" aria-hidden="true">${iconForElement(element.id, axis)}</span>
        <input type="text" class="estudio-element__title" data-field="title" value="${escapeHtml(element.title)}" placeholder="Título del elemento…" ${isNetwork ? 'readonly' : ''} />
        ${statusToggleHtml(element.status)}
        ${isNetwork ? '' : `<button type="button" class="btn btn-ghost estudio-element__delete" data-delete-element title="Eliminar elemento" aria-label="Eliminar">×</button>`}
      </header>
      <div class="estudio-element__notes-wrap" data-notes-wrap>
        <textarea class="estudio-element__notes" data-field="notes" rows="${hasNotes ? 3 : 2}" placeholder="Notas clínicas de este elemento…">${escapeHtml(element.notes || '')}</textarea>
      </div>
      <div class="estudio-element__stacks">
        ${peopleBlock}
        ${lists}
        ${activityBlock}
      </div>
    </article>`;
}

function supportPersonHtml(person, index) {
  const hasNotes = Boolean((person.notes || '').trim());
  return `
    <div class="estudio-support-person" data-support-index="${index}">
      <div class="estudio-support-row">
        <input type="text" data-support-field="name" value="${escapeHtml(person.name || '')}" placeholder="Nombre" data-sensitive />
        <input type="text" data-support-field="relation" value="${escapeHtml(person.relation || '')}" placeholder="Relación" />
        <input type="text" data-support-field="domain" value="${escapeHtml(person.domain || '')}" placeholder="Dominio" />
        <button type="button" class="btn btn-ghost${hasNotes ? ' is-active' : ''}" data-toggle-support-notes title="Notas">✎</button>
        <button type="button" class="btn btn-ghost" data-delete-support title="Eliminar">×</button>
      </div>
      <div class="estudio-support-notes" ${hasNotes ? '' : 'hidden'}>
        <textarea data-support-field="notes" rows="3" placeholder="Notas sobre esta persona…">${escapeHtml(person.notes || '')}</textarea>
      </div>
    </div>`;
}

function axisNavHtml(caseStudy, selectedNav) {
  return ESTUDIO_NAV.map((item) => {
    const count =
      item.kind === 'axis'
        ? (caseStudy.elements || []).filter((el) => el.axis === item.id && el.kind !== SUPPORT_NETWORK_KIND && el.title).length
        : '';
    const active = item.id === selectedNav;
    return `
      <button type="button" class="estudio-axis-nav__item${active ? ' is-active' : ''}" data-nav="${item.id}">
        <span class="estudio-axis-nav__label">${escapeHtml(item.label)}</span>
        ${item.kind === 'axis' ? `<span class="estudio-axis-nav__count">${count}</span>` : ''}
      </button>`;
  }).join('');
}

export function summaryScorecardHtml(caseStudy) {
  const rows = CASE_STUDY_AXES.map((axis) => {
    const dots = summaryDotsForAxis(caseStudy, axis.id);
    return `
      <div class="estudio-scorecard__row">
        <span class="estudio-scorecard__label">${escapeHtml(axis.label)}</span>
        <span class="estudio-scorecard__dots" aria-label="${escapeHtml(axis.label)}">
          ${
            dots
              .map(
                (dot) =>
                  `<span class="estudio-score-dot estudio-score-dot--${escapeHtml(dot.tone)} estudio-score-dot--${escapeHtml(dot.status)}" title="${escapeHtml(dot.title)}"></span>`,
              )
              .join('') || '<span class="estudio-scorecard__empty">sin elementos</span>'
          }
        </span>
      </div>`;
  }).join('');
  return `
    <article class="estudio-scorecard card">
      <h3 class="estudio-scorecard__title">Mapa del caso</h3>
      ${rows}
    </article>`;
}

export function elementLibraryHtml(axis, caseStudy) {
  const items = libraryItemsForAxis(axis);
  const title = libraryTitleForAxis(axis);
  const list = items
    .map((item) => {
      const inUse = elementInAxis(caseStudy.elements, axis, item.title);
      const search = `${item.title} ${item.description}`.toLowerCase();
      return `
        <button type="button" class="mod-selector-item" data-pick-library-title="${escapeHtml(item.title)}" data-search="${escapeHtml(search)}" ${inUse ? 'disabled' : ''}>
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            ${item.description ? `<small class="estudio-library__desc">${escapeHtml(item.description)}</small>` : ''}
          </span>
          ${inUse ? '<span class="badge badge--info">En uso</span>' : ''}
        </button>`;
    })
    .join('');
  return `
    <div class="card module-selector-inline estudio-library" data-element-library>
      <div class="module-selector-head">
        <div class="module-selector-head__text">
          <h2 class="module-title">${escapeHtml(title)}</h2>
        </div>
        <button type="button" class="btn btn-ghost" data-close-library>Cerrar</button>
      </div>
      <div class="mod-selector-search-wrap">
        <input type="search" class="mod-selector-search input" data-library-search
          placeholder="Buscar elemento…" autocomplete="off" />
      </div>
      <div class="estudio-library__list" data-library-list>${list}</div>
      <div class="estudio-library__custom">
        <input type="text" class="input" data-library-custom placeholder="Título personalizado…" />
        <button type="button" class="btn btn-secondary" data-library-custom-add>Añadir</button>
      </div>
    </div>`;
}

function summaryHtml(caseStudy) {
  const people = namedSupportPeople(caseStudy);
  const axisCards = CASE_STUDY_AXES.map((axis) => {
    const els = (caseStudy.elements || []).filter(
      (el) => el.axis === axis.id && el.title && el.kind !== SUPPORT_NETWORK_KIND,
    );
    return `
      <article class="estudio-summary-card card">
        <h3 class="estudio-summary-card__title">${escapeHtml(axis.label)}</h3>
        <div class="estudio-summary-card__chips">
          ${
            els
              .map((el) => `<span class="estudio-summary-chip">${escapeHtml(el.title)}</span>`)
              .join('') || '<span class="estudio-element__empty">Sin elementos seleccionados.</span>'
          }
        </div>
      </article>`;
  }).join('');
  const geno = people.length
    ? `<article class="estudio-summary-card card estudio-summary-card--genogram">
        <h3 class="estudio-summary-card__title">Genograma</h3>
        ${genogramHtml(people)}
      </article>`
    : '';
  return `
    <div class="estudio-summary">
      <header class="estudio-case__head">
        <div>
          <p class="estudio-case__eyebrow">Estudio de caso</p>
          <h2 class="estudio-case__title">Resumen</h2>
        </div>
      </header>
      ${summaryScorecardHtml(caseStudy)}
      ${geno}
      <div class="estudio-summary__axes">${axisCards}</div>
    </div>`;
}

export async function mountEstudioDeCaso({ leftHost, centerHost, treatmentId, toolsOpts = {} }) {
  let caseStudy = await loadCaseStudy(treatmentId);
  let selectedNav = 'summary';
  let pickerOpen = false;
  let suppressRemotePaint = false;
  let sessions = await getSessionsWithModules(treatmentId);

  const collectLive = () => {
    const navMeta = ESTUDIO_NAV.find((n) => n.id === selectedNav);
    const axisId = navMeta?.kind === 'axis' ? selectedNav : caseStudy.selectedAxis || 'problem';
    const axisElements = [];
    centerHost.querySelectorAll('.estudio-element').forEach((article) => {
      const id = article.dataset.elementId;
      const prev = (caseStudy.elements || []).find((el) => el.id === id) || { axis: axisId };
      const lists = {};
      for (const field of LIST_FIELDS) {
        const textInputs = [...article.querySelectorAll(`[data-list="${field.key}"][data-field="text"]`)];
        lists[field.key] = textInputs.map((input) => {
          const index = input.dataset.index;
          const check = article.querySelector(
            `[data-list="${field.key}"][data-index="${index}"][data-field="checked"]`,
          );
          return {
            text: input.value || '',
            checked: field.checkable ? Boolean(check?.checked) : false,
          };
        });
      }
      const people = [...article.querySelectorAll('.estudio-support-person')].map((block) => ({
        name: block.querySelector('[data-support-field="name"]')?.value || '',
        gender: '',
        relation: block.querySelector('[data-support-field="relation"]')?.value || 'Otro',
        domain: block.querySelector('[data-support-field="domain"]')?.value || 'Armonía',
        notes: block.querySelector('[data-support-field="notes"]')?.value || '',
      }));
      const activities = [...article.querySelectorAll('.estudio-activity-row')].map((row) => ({
        moduleType: row.querySelector('[data-activity-field="moduleType"]')?.value || '',
        sessionId: row.querySelector('[data-activity-field="sessionId"]')?.value || '',
      }));
      axisElements.push(
        normalizeCaseStudyElement({
          ...prev,
          id,
          axis: prev.axis || axisId,
          kind: article.dataset.kind,
          title: article.querySelector('[data-field="title"]')?.value || '',
          status: article.querySelector('[data-field="status"]')?.dataset.status || prev.status,
          notes: article.querySelector('[data-field="notes"]')?.value || '',
          people,
          activities,
          ...lists,
        }),
      );
    });
    const otherElements = (caseStudy.elements || []).filter((el) => el.axis !== selectedNav);
    const merged =
      navMeta?.kind === 'axis' && centerHost.querySelector('.estudio-element')
        ? [...otherElements, ...axisElements]
        : caseStudy.elements;
    const network = (merged || []).find((el) => el.kind === SUPPORT_NETWORK_KIND);
    return normalizeCaseStudyData({
      ...caseStudy,
      selectedAxis: navMeta?.kind === 'axis' ? selectedNav : caseStudy.selectedAxis,
      selectedNav,
      selectedElementId: axisElements[0]?.id || caseStudy.selectedElementId,
      elements: merged,
      supportPeople: network?.people || caseStudy.supportPeople,
    });
  };

  const persist = queuedPersist(async () => {
    suppressRemotePaint = true;
    try {
      caseStudy = await saveCaseStudy(treatmentId, collectLive());
    } finally {
      suppressRemotePaint = false;
    }
  }, notifySaveError);

  const addElementWithTitle = async (title) => {
    const name = String(title || '').trim();
    if (!name) {
      toast('Escribe un título o elige uno de la librería.');
      return;
    }
    if (centerHost.querySelector('.estudio-element')) caseStudy = collectLive();
    if (elementInAxis(caseStudy.elements, selectedNav, name)) {
      toast('Ese elemento ya está en este eje.');
      pickerOpen = false;
      await paint();
      return;
    }
    const el = emptyCaseStudyElement(selectedNav, name);
    caseStudy.elements = [...(caseStudy.elements || []), el];
    caseStudy.selectedElementId = el.id;
    caseStudy.selectedNav = selectedNav;
    pickerOpen = false;
    suppressRemotePaint = true;
    try {
      caseStudy = await saveCaseStudy(treatmentId, caseStudy);
    } finally {
      suppressRemotePaint = false;
    }
    await paint();
    centerHost.querySelector(`[data-element-id="${el.id}"] [data-field="title"]`)?.focus();
  };

  let bindCenter;

  const navHost = () => leftHost.querySelector('#estudio-axis-nav') || leftHost;

  const paint = async () => {
    const navMeta = ESTUDIO_NAV.find((n) => n.id === selectedNav) || ESTUDIO_NAV[0];
    navHost().innerHTML = `
      <div class="estudio-axis-nav" role="navigation" aria-label="Estudio de caso">
        <p class="estudio-axis-nav__eyebrow">Estudio de caso</p>
        ${axisNavHtml(caseStudy, selectedNav)}
      </div>`;

    if (navMeta.id === 'summary') {
      centerHost.innerHTML = `<div class="estudio-case">${summaryHtml(caseStudy)}</div>`;
      return;
    }

    if (navMeta.id === 'scores') {
      centerHost.innerHTML = `
        <div class="estudio-case">
          <header class="estudio-case__head">
            <div>
              <p class="estudio-case__eyebrow">Estudio de caso</p>
              <h2 class="estudio-case__title">Puntajes</h2>
            </div>
          </header>
          <div class="estudio-scores-host card" id="estudio-scores-host"></div>
        </div>`;
      const host = centerHost.querySelector('#estudio-scores-host');
      const moduleTypes = [...new Set(sessions.flatMap((s) => (s.modules || []).map((m) => m.module_type)))];
      if (host) {
        try {
          await renderWorkspaceScores(host, treatmentId, moduleTypes, { expandAll: true });
        } catch (err) {
          host.innerHTML = `<p class="estudio-element__empty">${escapeHtml(err?.message || 'No se pudieron cargar los puntajes.')}</p>`;
        }
      }
      return;
    }

    if (navMeta.id === 'docs') {
      centerHost.innerHTML = `
        <div class="estudio-case">
          <header class="estudio-case__head">
            <div>
              <p class="estudio-case__eyebrow">Estudio de caso</p>
              <h2 class="estudio-case__title">Documentación</h2>
            </div>
          </header>
          <div class="estudio-docs card" id="estudio-docs-host">${toolsItemsHtml()}</div>
        </div>`;
      bindToolsActions(centerHost.querySelector('#estudio-docs-host'), toolsOpts);
      return;
    }

    const axisMeta = CASE_STUDY_AXES.find((a) => a.id === selectedNav) || CASE_STUDY_AXES[0];
    const elements = (caseStudy.elements || []).filter((el) => el.axis === selectedNav);
    const visible = elements.filter((el) => el.kind === SUPPORT_NETWORK_KIND || el.title || el.kind === 'standard');

    if (pickerOpen) {
      centerHost.innerHTML = `
        <div class="estudio-case" data-treatment-id="${treatmentId}">
          <header class="estudio-case__head">
            <div>
              <p class="estudio-case__eyebrow">Estudio de caso</p>
              <h2 class="estudio-case__title">${escapeHtml(axisMeta.label)}</h2>
            </div>
          </header>
          ${elementLibraryHtml(selectedNav, caseStudy)}
        </div>`;
      bindCenter();
      return;
    }

    centerHost.innerHTML = `
      <div class="estudio-case" data-treatment-id="${treatmentId}">
        <header class="estudio-case__head">
          <div>
            <p class="estudio-case__eyebrow">Estudio de caso</p>
            <h2 class="estudio-case__title">${escapeHtml(axisMeta.label)}</h2>
          </div>
        </header>
        <div class="estudio-case__rows">
          ${
            visible.map((el) => elementRowHtml(el, selectedNav, sessions)).join('') ||
            `<div class="estudio-case__empty-state card">
              <p class="estudio-case__empty">Sin elementos en este eje.</p>
              <button type="button" class="btn btn-secondary" data-add-element data-open-library>Abrir librería</button>
            </div>`
          }
        </div>
        <button type="button" class="btn btn-secondary btn-block estudio-add-axis" data-add-element data-open-library>+ ${escapeHtml(axisMeta.addLabel)}</button>
      </div>`;

    bindCenter();
  };

  if (!leftHost.dataset.estudioNavBound) {
    leftHost.dataset.estudioNavBound = '1';
    leftHost.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-nav]');
      if (!btn || !leftHost.contains(btn)) return;
      e.preventDefault();
      const nextNav = btn.dataset.nav;
      if (!nextNav || nextNav === selectedNav) return;
      if (centerHost.querySelector('.estudio-element')) {
        caseStudy = collectLive();
      }
      selectedNav = nextNav;
      pickerOpen = false;
      caseStudy.selectedNav = selectedNav;
      const meta = ESTUDIO_NAV.find((n) => n.id === selectedNav);
      if (meta?.kind === 'axis') caseStudy.selectedAxis = selectedNav;
      suppressRemotePaint = true;
      try {
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      } finally {
        suppressRemotePaint = false;
      }
      await paint();
    });
  }

  bindCenter = () => {
    const onEdit = () => {
      void persist();
    };

    centerHost.querySelectorAll('[data-add-element], [data-open-library]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (centerHost.querySelector('.estudio-element')) caseStudy = collectLive();
        pickerOpen = true;
        await paint();
      });
    });

    const libraryList = centerHost.querySelector('[data-library-list]');
    const searchInput = centerHost.querySelector('[data-library-search]');
    if (libraryList && searchInput) {
      searchInput.addEventListener('input', () => applyModuleSearch(libraryList, searchInput.value));
    }

    centerHost.querySelector('[data-close-library]')?.addEventListener('click', async () => {
      pickerOpen = false;
      await paint();
    });

    centerHost.querySelectorAll('[data-pick-library-title]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await addElementWithTitle(btn.dataset.pickLibraryTitle);
      });
    });

    centerHost.querySelector('[data-library-custom-add]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = centerHost.querySelector('[data-library-custom]');
      await addElementWithTitle(input?.value);
    });

    centerHost.querySelectorAll('[data-status-set]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wrap = btn.closest('[data-field="status"]');
        if (!wrap) return;
        wrap.dataset.status = btn.dataset.statusSet;
        wrap.querySelectorAll('[data-status-set]').forEach((b) => {
          const on = b.dataset.statusSet === wrap.dataset.status;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          const check = b.querySelector('.estudio-status__check');
          if (on && !check) {
            b.insertAdjacentHTML('beforeend', '<span class="estudio-status__check" aria-hidden="true">✓</span>');
          } else if (!on && check) {
            check.remove();
          }
        });
        await persist();
      });
    });

    centerHost.querySelectorAll('[data-add-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const list = btn.dataset.list;
        const id = btn.dataset.elementId;
        const el = caseStudy.elements.find((row) => row.id === id);
        if (!el) return;
        el[list] = [...(el[list] || []), { text: '', checked: false }];
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-remove-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const article = btn.closest('.estudio-element');
        const el = caseStudy.elements.find((row) => row.id === article?.dataset.elementId);
        if (!el) return;
        const list = btn.dataset.list;
        const index = Number(btn.dataset.index);
        el[list] = (el[list] || []).filter((_, i) => i !== index);
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-delete-element]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const id = btn.closest('.estudio-element')?.dataset.elementId;
        caseStudy.elements = (caseStudy.elements || []).filter((el) => el.id !== id);
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-add-activity]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const el = caseStudy.elements.find((row) => row.id === btn.dataset.elementId);
        if (!el) return;
        const hint = suggestedModulesForAxis(el.axis)[0] || '';
        el.activities = [...(el.activities || []), { moduleType: hint, sessionId: String(sessions[0]?.id || '') }];
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-remove-activity]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const article = btn.closest('.estudio-element');
        const el = caseStudy.elements.find((row) => row.id === article?.dataset.elementId);
        if (!el) return;
        const index = Number(btn.closest('[data-activity-index]')?.dataset.activityIndex);
        el.activities = (el.activities || []).filter((_, i) => i !== index);
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelector('[data-add-support]')?.addEventListener('click', async () => {
      caseStudy = collectLive();
      const network = caseStudy.elements.find((el) => el.kind === SUPPORT_NETWORK_KIND);
      if (!network) return;
      network.people = [
        ...(network.people || []),
        { name: '', gender: '', relation: 'Otro', domain: 'Apoyo emocional', notes: '' },
      ];
      caseStudy.supportPeople = network.people;
      suppressRemotePaint = true;
      try {
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      } finally {
        suppressRemotePaint = false;
      }
      await paint();
    });

    centerHost.querySelectorAll('[data-delete-support]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const network = caseStudy.elements.find((el) => el.kind === SUPPORT_NETWORK_KIND);
        if (!network) return;
        const index = Number(btn.closest('.estudio-support-person')?.dataset.supportIndex);
        network.people = (network.people || []).filter((_, i) => i !== index);
        caseStudy.supportPeople = network.people;
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        } finally {
          suppressRemotePaint = false;
        }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-toggle-support-notes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.estudio-support-person')?.querySelector('.estudio-support-notes');
        if (!wrap) return;
        wrap.hidden = !wrap.hidden;
        btn.classList.toggle('is-active', !wrap.hidden);
      });
    });

    centerHost.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('change', onEdit);
      el.addEventListener('input', onEdit);
    });
  };

  await paint();

  const stop = onCaseStudyChanged(async ({ treatmentId: tid }) => {
    if (Number(tid) !== Number(treatmentId)) return;
    if (suppressRemotePaint) return;
    if (centerHost.contains(document.activeElement)) return;
    caseStudy = await loadCaseStudy(treatmentId);
    sessions = await getSessionsWithModules(treatmentId);
    await paint();
  });

  return {
    unmount() {
      stop();
      delete leftHost.dataset.estudioNavBound;
      leftHost.innerHTML = '';
      centerHost.innerHTML = '';
    },
    async flush() {
      if (centerHost.querySelector('.estudio-element')) {
        suppressRemotePaint = true;
        try {
          caseStudy = await saveCaseStudy(treatmentId, collectLive());
        } finally {
          suppressRemotePaint = false;
        }
      }
    },
  };
}
