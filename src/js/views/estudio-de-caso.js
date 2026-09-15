/**
 * Vista workspace · Estudio de caso
 * Ejes → elementos en filas (manifestaciones, indicadores, objetivos, evidencia + notas).
 */
import {
  CASE_STUDY_AXES,
  ESTUDIO_NAV,
  SUPPORT_NETWORK_KIND,
  customPlaceholderForAxis,
  emptyCaseStudyElement,
  fieldHintFor,
  normalizeCaseStudyData,
  normalizeCaseStudyElement,
  STATUS_LABELS,
  statusLabelFor,
  suggestedModulesForElement,
} from '../case-study-model.js';
import {
  elementInAxis,
  libraryItemsForAxis,
  libraryPresetFor,
  libraryTitleForAxis,
  namedSupportPeople,
  summaryDotsForAxis,
} from '../case-study-catalog.js';
import { loadCaseStudy, onCaseStudyChanged, saveCaseStudy } from '../case-study-store.js';
import { getSessionsWithModules, isSessionDone } from '../db.js';
import { escapeHtml, toast } from '../utils.js';
import { notifySaveError } from '../save-status.js';
import { queuedPersist } from '../autobind.js';
import { moduleLabelFor } from '../custom-modules.js';
import { renderWorkspaceScores, usedScoreTests } from '../components/workspace-scores.js';
import { computeVitalRisk, vitalRiskOrbHtml } from '../vital-risk.js';
import { applyModuleSearch } from '../components/module-selector.js';
import { openAddModuleSessionModal } from '../components/add-module-session-modal.js';
import { estudioRelationForModule } from '../case-study-catalog.js';
import { AFFILIATIONS, DOMAINS, genogramHtml } from '../modules/redes-apoyo.js';

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

const STATUS_ICONS = {
  present: '<circle cx="12" cy="12" r="8"/><path d="M8 12.2l2.4 2.4L16 9"/>',
  developing: '<path d="M12 20V10"/><path d="M12 10c2-3 4-4 6-4-1 3-3 5-6 6"/><path d="M12 10c-2-3-4-4-6-4 1 3 3 5 6 6"/>',
  unknown: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.8-1.5 1.2-1.5 2.5"/><path d="M12 17h.01"/>',
};

function iconSvg(paths, className = 'estudio-status__glyph') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function hintButton(text) {
  const copy = String(text || '').trim();
  if (!copy) return '';
  return `<button type="button" class="estudio-field-hint" data-tooltip="${escapeHtml(copy)}" aria-label="${escapeHtml(copy)}">?</button>`;
}

function selectOptions(list, current) {
  const value = String(current || '').trim();
  const values = value && !list.includes(value) ? [...list, value] : list;
  return values
    .map((opt) => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
    .join('');
}

export function statusToggleHtml(status, axis = 'problem') {
  const current = STATUS_LABELS[status] ? status : 'unknown';
  return `
    <div class="estudio-status" data-field="status" data-status="${current}" role="group" aria-label="Estado del elemento">
      ${['present', 'developing', 'unknown']
        .map((id) => {
          const selected = id === current;
          const label = statusLabelFor(axis, id);
          return `<button type="button" class="estudio-status__btn${selected ? ' is-selected' : ''}" data-status-set="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${selected ? 'true' : 'false'}">
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

function activityRowHtml(activity, index, sessions) {
  const session = (sessions || []).find((row) => String(row.id) === String(activity.sessionId));
  return `
    <div class="estudio-activity-row" data-activity-index="${index}" data-module-type="${escapeHtml(activity.moduleType || '')}" data-session-id="${escapeHtml(activity.sessionId || '')}">
      <span class="estudio-module-link"><strong>${escapeHtml(moduleLabelFor(activity.moduleType))}</strong>${session ? ` · Sesión ${session.number}` : ''}</span>
      <button type="button" class="btn btn-ghost" data-remove-activity title="Quitar">×</button>
    </div>`;
}

function elementRowHtml(element, axis, sessions) {
  const isNetwork = element.kind === SUPPORT_NETWORK_KIND;
  const catalog = !isNetwork ? libraryItemsForAxis(axis).find((item) => item.title === element.title) : null;
  const bundled = Boolean(element.bundled || catalog);
  const catalogDesc = catalog?.description || '';
  const hasNotes = Boolean((element.notes || '').trim());
  const suggestions = suggestedModulesForElement(axis, element.title);

  const lists = isNetwork
    ? ''
    : LIST_FIELDS.map((field) => {
        const items = element[field.key] || [];
        const placeholder =
          field.key === 'evidence' ? 'Avance o fuente (con fecha)…' : field.placeholder;
        return `
      <section class="estudio-element__field" data-field-block="${field.key}">
        <header class="estudio-element__field-head">
          <h4 class="estudio-element__field-title">${escapeHtml(field.label)}${hintButton(fieldHintFor(axis, field.key))}</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-add-item data-list="${field.key}" data-element-id="${escapeHtml(element.id)}">+ Añadir</button>
        </header>
        <div class="estudio-element__field-list" data-list-host="${field.key}">
          ${
            items.map((item, i) => itemRowHtml(field.key, item, i, { ...field, placeholder })).join('') ||
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
          <h4 class="estudio-element__field-title">Módulos${hintButton(fieldHintFor(axis, 'activities'))}</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-add-activity data-element-id="${escapeHtml(element.id)}">+ Añadir módulo</button>
        </header>
        <p class="estudio-element__hint">Módulos relacionados: ${suggestions.map((t) => escapeHtml(moduleLabelFor(t))).join(' · ')}</p>
        <div class="estudio-activity-list">
          ${
            activities.map((row, i) => activityRowHtml(row, i, sessions)).join('') ||
            '<p class="estudio-element__empty">Sin módulos asociados aún.</p>'
          }
        </div>
      </section>`;

  return `
    <article class="estudio-element card" data-element-id="${escapeHtml(element.id)}" data-kind="${escapeHtml(element.kind || 'standard')}">
      <header class="estudio-element__head">
        ${
          bundled
            ? `<div class="estudio-element__bundled">
                <h3 class="estudio-element__title-static">${escapeHtml(element.title)}</h3>
                ${catalogDesc ? `<p class="estudio-element__catalog-desc">${escapeHtml(catalogDesc)}</p>` : ''}
              </div>`
            : `<input type="text" class="estudio-element__title" data-field="title" value="${escapeHtml(element.title)}" placeholder="Título del elemento…" ${isNetwork ? 'readonly' : ''} />`
        }
        ${statusToggleHtml(element.status, axis)}
        ${isNetwork ? '' : `<button type="button" class="btn btn-ghost estudio-element__delete" data-delete-element title="Eliminar elemento" aria-label="Eliminar">×</button>`}
      </header>
      <div class="estudio-element__notes-wrap" data-notes-wrap>
        <textarea class="estudio-element__notes" data-field="notes" rows="${hasNotes ? 4 : 3}" placeholder="Notas clínicas de este elemento…">${escapeHtml(element.notes || '')}</textarea>
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
        <select data-support-field="relation" aria-label="Parentesco" title="Parentesco">
          ${selectOptions(AFFILIATIONS, person.relation || 'Otro')}
        </select>
        <select data-support-field="domain" aria-label="Estado vincular" title="Estado vincular">
          ${selectOptions(DOMAINS, person.domain || 'Armonía')}
        </select>
        <button type="button" class="btn btn-ghost${hasNotes ? ' is-active' : ''}" data-toggle-support-notes title="Notas">✎</button>
        <button type="button" class="btn btn-ghost" data-delete-support title="Eliminar">×</button>
      </div>
      <div class="estudio-support-notes" ${hasNotes ? '' : 'hidden'}>
        <textarea data-support-field="notes" rows="5" placeholder="Notas sobre esta persona…">${escapeHtml(person.notes || '')}</textarea>
      </div>
    </div>`;
}

function axisNavHtml(caseStudy, selectedNav, sessions) {
  const tests = usedScoreTests(sessions);
  return ESTUDIO_NAV.map((item) => {
    const axisEls =
      item.kind === 'axis'
        ? (caseStudy.elements || []).filter((el) => el.axis === item.id && el.title)
        : [];
    const count = item.kind === 'axis' ? axisEls.length : '';
    const active = item.id === selectedNav;
    const children =
      item.id === 'scores'
        ? tests
            .map(
              (test) => `
          <button type="button" class="estudio-axis-nav__child" data-nav="scores">
            <span class="estudio-axis-nav__child-label">${escapeHtml(test.label)}</span>
          </button>`,
            )
            .join('')
        : axisEls
            .map((el) => {
              const tone = el.kind === SUPPORT_NETWORK_KIND
                ? 'green'
                : summaryDotsForAxis({ elements: [el] }, item.id)[0]?.tone || 'muted';
              const status = el.status || 'unknown';
              const statusLabel = statusLabelFor(item.id, status);
              const suicidePulse = item.id === 'problem' && /suicid/i.test(el.title || '') ? ' estudio-score-dot--suicidality' : '';
              return `
          <button type="button" class="estudio-axis-nav__child" data-nav="${item.id}" data-focus-element="${escapeHtml(el.id)}">
            <span class="estudio-score-dot estudio-score-dot--${escapeHtml(tone)} estudio-score-dot--${escapeHtml(status)}${suicidePulse}" aria-hidden="true"></span>
            <span class="estudio-axis-nav__child-label">${escapeHtml(el.title)}</span>
            <span class="estudio-axis-nav__child-status" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}">
              ${iconSvg(STATUS_ICONS[status] || STATUS_ICONS.unknown, 'estudio-axis-nav__status-glyph')}
            </span>
          </button>`;
            })
            .join('');
    return `
      <div class="estudio-axis-nav__block">
        <button type="button" class="estudio-axis-nav__item${active ? ' is-active' : ''}" data-nav="${item.id}">
          <span class="estudio-axis-nav__label">${escapeHtml(item.label)}</span>
          ${item.kind === 'axis' ? `<span class="estudio-axis-nav__count">${count}</span>` : ''}
        </button>
        ${children ? `<div class="estudio-axis-nav__children">${children}</div>` : ''}
      </div>`;
  }).join('');
}

export function summaryScorecardHtml(caseStudy) {
  // Retained for tests / callers; Resumen no longer shows "Mapa del caso".
  const rows = CASE_STUDY_AXES.map((axis) => {
    const dots = summaryDotsForAxis(caseStudy, axis.id);
    return `
      <div class="estudio-scorecard__row" role="button" tabindex="0" data-nav="${axis.id}">
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
        <button type="button" class="mod-selector-item estudio-library__item" data-pick-library-title="${escapeHtml(item.title)}" data-search="${escapeHtml(search)}" ${inUse ? 'disabled' : ''}>
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
        <input type="text" class="input" data-library-custom placeholder="${escapeHtml(customPlaceholderForAxis(axis))}" />
        <button type="button" class="btn btn-secondary" data-library-custom-add>Añadir</button>
      </div>
    </div>`;
}

function studyAiCardHtml() {
  // Reemplaza la antigua sessionsCardHtml: el acceso al estudio ocupa este espacio.
  return `
    <button type="button" class="estudio-summary-card card estudio-summary-card--study-ai" data-autocomplete-case-study>
      <span class="estudio-summary-card__eyebrow">Estudio de caso</span>
      <strong class="estudio-summary-card__study-title">Estudiar caso con IA</strong>
      <span class="estudio-summary-card__study-copy">Ordena la información clínica y propone ejes con evidencia de tu anamnesis.</span>
      <span class="estudio-summary-card__study-action">Comenzar análisis <span aria-hidden="true">→</span></span>
    </button>`;
}

// Compatibilidad con consumidores/tests antiguos: ya no se monta en el Resumen.
function sessionsCardHtml(sessions) {
  const total = (sessions || []).length;
  const done = (sessions || []).filter((s) => isSessionDone(s)).length;
  return `<article class="estudio-summary-card card estudio-summary-card--sessions"><h3>Sesiones</h3><p>${done} de ${total} completadas</p></article>`;
}

function scoreTabsHtml() {
  return `
    <article class="estudio-summary-card card estudio-summary-card--scores">
      <h3 class="estudio-summary-card__title">Evolución</h3>
      <div class="estudio-resumen-scores" id="estudio-resumen-scores"></div>
    </article>`;
}

function linkedModulesForElement(element, sessions) {
  const explicit = (element.activities || []).map((row) => row.moduleType).filter(Boolean);
  const fromProgram = (sessions || [])
    .flatMap((session) => session.modules || [])
    .filter((mod) => {
      const relation = estudioRelationForModule(mod.module_type);
      return relation && relation.axis === element.axis && (!relation.element || relation.element === element.title);
    })
    .map((mod) => mod.module_type);
  return [...new Set([...explicit, ...fromProgram])];
}

function summaryHtml(caseStudy, sessions, vital) {
  const people = namedSupportPeople(caseStudy);
  const axisCards = CASE_STUDY_AXES.filter((axis) => axis.id !== 'other').map((axis) => {
    const els = (caseStudy.elements || []).filter(
      (el) => el.axis === axis.id && el.title && el.kind !== SUPPORT_NETWORK_KIND,
    );
    return `<section class="estudio-axis-matrix card">
      <h3 class="estudio-summary-card__title">${escapeHtml(axis.label)}</h3>
      <div class="estudio-axis-matrix__head"><span>Elemento</span><span>Módulos del programa</span></div>
      ${els.map((el) => {
        const linked = linkedModulesForElement(el, sessions);
        const recommended = suggestedModulesForElement(axis.id, el.title).slice(0, 2);
        const tone = summaryDotsForAxis({ elements: [el] }, axis.id)[0]?.tone || 'muted';
        return `<div class="estudio-axis-matrix__row">
          <div><span class="estudio-score-dot estudio-score-dot--${escapeHtml(tone)}"></span>${escapeHtml(el.title)}</div>
          <div>${linked.length
            ? linked.map((type) => `<span class="estudio-summary-chip">${escapeHtml(moduleLabelFor(type))}</span>`).join('')
            : `<span class="estudio-axis-matrix__recommendation">Sugeridos: ${recommended.map((type) => escapeHtml(moduleLabelFor(type))).join(' · ')}</span>`}</div>
        </div>`;
      }).join('') || '<p class="estudio-element__empty">Sin elementos seleccionados.</p>'}
    </section>`;
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
      <div class="estudio-summary__top">
        ${studyAiCardHtml()}
        ${vitalRiskOrbHtml(vital, escapeHtml)}
      </div>
      ${scoreTabsHtml()}
      <div class="estudio-summary__axes">${axisCards}</div>
      ${geno}
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
        moduleType: row.dataset.moduleType || '',
        sessionId: row.dataset.sessionId || '',
      }));
      axisElements.push(
        normalizeCaseStudyElement({
          ...prev,
          id,
          axis: prev.axis || axisId,
          kind: article.dataset.kind,
          bundled: Boolean(prev.bundled),
          title: article.querySelector('[data-field="title"]')?.value || prev.title || '',
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

  const addElementWithTitle = async (title, { bundled = false } = {}) => {
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
    el.bundled = bundled || Boolean(libraryItemsForAxis(selectedNav).find((item) => item.title === name));
    const preset = libraryPresetFor(selectedNav, name);
    if (preset?.indicators?.length) {
      el.indicators = preset.indicators.map((text) => ({ text, checked: false }));
    }
    if (preset?.objectives?.length) {
      el.objectives = preset.objectives.map((text) => ({ text, checked: false }));
    }
    if (!bundled && !el.bundled) {
      try {
        const { addCustomCaseStudyElement } = await import('../case-study-custom-library.js');
        addCustomCaseStudyElement({ axis: selectedNav, title: name });
      } catch {
        /* ignore catalog write failures */
      }
    }
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
    centerHost.querySelector(`[data-element-id="${el.id}"] [data-field="title"], [data-element-id="${el.id}"] .estudio-element__notes`)?.focus();
  };

  let bindCenter;
  let bindSummaryNav;
  let selectNav;

  const navHost = () => leftHost.querySelector('#estudio-axis-nav') || leftHost;

  const refreshAxisNav = () => {
    navHost().innerHTML = `
      <div class="estudio-axis-nav" role="navigation" aria-label="Estudio de caso">
        ${axisNavHtml(caseStudy, selectedNav, sessions)}
      </div>`;
  };

  const scrollCenterTop = () => {
    const root = centerHost.closest('#workspace-center-scroll');
    if (root) root.scrollTop = 0;
    else centerHost.scrollTop = 0;
  };

  const scrollToElement = (elementId) => {
    if (!elementId) {
      scrollCenterTop();
      return;
    }
    const target = centerHost.querySelector(`[data-element-id="${CSS.escape(String(elementId))}"]`);
    const root = centerHost.closest('#workspace-center-scroll') || centerHost;
    if (!target) {
      scrollCenterTop();
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = root.scrollTop + (targetRect.top - rootRect.top) - 12;
    if (typeof root.scrollTo === 'function') {
      root.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    } else {
      root.scrollTop = Math.max(0, nextTop);
    }
  };

  const paint = async () => {
    const navMeta = ESTUDIO_NAV.find((n) => n.id === selectedNav) || ESTUDIO_NAV[0];
    refreshAxisNav();

    if (navMeta.id === 'summary') {
      const vital = computeVitalRisk({ sessions, caseStudy });
      centerHost.innerHTML = `<div class="estudio-case">${summaryHtml(caseStudy, sessions, vital)}</div>`;
      bindSummaryNav();
      const host = centerHost.querySelector('#estudio-resumen-scores');
      const moduleTypes = [...new Set(sessions.flatMap((s) => (s.modules || []).map((m) => m.module_type)))];
      if (host) {
        try {
          await renderWorkspaceScores(host, treatmentId, moduleTypes, { expandAll: true, tabbed: true });
        } catch (err) {
          host.innerHTML = `<p class="estudio-element__empty">${escapeHtml(err?.message || 'No se pudieron cargar los puntajes.')}</p>`;
        }
      }
      return;
    }

    if (navMeta.id === 'scores') {
      centerHost.innerHTML = `
        <div class="estudio-case">
          <header class="estudio-case__head">
            <div>
              <p class="estudio-case__eyebrow">Estudio de caso</p>
              <h2 class="estudio-case__title">Evolución</h2>
            </div>
          </header>
          <div class="estudio-scores-host" id="estudio-scores-host"></div>
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
            (selectedNav === 'other'
              ? `<div class="estudio-case__empty-state card estudio-bots-empty">
                  <p class="estudio-case__empty">Próximamente automatiza envío de emails, recordatorios, entre otros.</p>
                </div>`
              : `<div class="estudio-case__empty-state card">
                  <p class="estudio-case__empty">Sin elementos en este eje.</p>
                  <button type="button" class="btn btn-secondary" data-add-element data-open-library>Abrir librería</button>
                </div>`)
          }
        </div>
        ${selectedNav === 'other' ? '' : `<button type="button" class="btn btn-secondary btn-block estudio-add-axis" data-add-element data-open-library>+ ${escapeHtml(axisMeta.addLabel)}</button>`}
      </div>`;

    bindCenter();
  };

  selectNav = async (nextNav, { focusElementId = '' } = {}) => {
    if (!nextNav) return;
    const sameNav = nextNav === selectedNav;
    if (!sameNav) {
      if (centerHost.querySelector('.estudio-element')) {
        caseStudy = collectLive();
      }
      selectedNav = nextNav;
      pickerOpen = false;
      caseStudy.selectedNav = selectedNav;
      const meta = ESTUDIO_NAV.find((n) => n.id === selectedNav);
      if (meta?.kind === 'axis') caseStudy.selectedAxis = selectedNav;
      if (focusElementId) caseStudy.selectedElementId = focusElementId;
      suppressRemotePaint = true;
      try {
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      } finally {
        suppressRemotePaint = false;
      }
      await paint();
    } else if (focusElementId) {
      caseStudy.selectedElementId = focusElementId;
    }
    if (focusElementId) {
      requestAnimationFrame(() => scrollToElement(focusElementId));
    } else {
      scrollCenterTop();
    }
  };

  bindSummaryNav = () => {
    centerHost.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await selectNav(btn.dataset.nav);
      });
      btn.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        await selectNav(btn.dataset.nav);
      });
    });
    centerHost.querySelector('[data-autocomplete-case-study]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      const original = button.textContent;
      try {
        button.disabled = true;
        button.textContent = 'Analizando anamnesis…';
        const { autoCompleteCaseStudyWithAi } = await import('../case-study-ai.js');
        const result = await autoCompleteCaseStudyWithAi(treatmentId);
        caseStudy = result.saved;
        sessions = result.sessions;
        toast(`${result.changed} ${result.changed === 1 ? 'eje actualizado' : 'ejes actualizados'} con evidencia de anamnesis.`);
        await paint();
      } catch (err) {
        if (!/cancelado/i.test(err?.message || '')) toast(err?.message || 'No se pudieron completar los ejes.');
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  };

  if (!leftHost.dataset.estudioNavBound) {
    leftHost.dataset.estudioNavBound = '1';
    leftHost.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-nav]');
      if (!btn || !leftHost.contains(btn)) return;
      e.preventDefault();
      const focusId = btn.dataset.focusElement || '';
      await selectNav(btn.dataset.nav, { focusElementId: focusId });
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
        await addElementWithTitle(btn.dataset.pickLibraryTitle, { bundled: true });
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
        refreshAxisNav();
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
        const added = await openAddModuleSessionModal({ treatmentId });
        if (!added?.moduleType) return;
        caseStudy = collectLive();
        const el = caseStudy.elements.find((row) => row.id === btn.dataset.elementId);
        if (!el) return;
        el.activities = [
          ...(el.activities || []),
          { moduleType: added.moduleType, sessionId: String(added.sessionId || '') },
        ];
        el.status = 'developing';
        sessions = await getSessionsWithModules(treatmentId);
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
