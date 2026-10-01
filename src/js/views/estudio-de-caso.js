import { STUDY_AI_REQUESTS, resourceDetailSpec } from '../study-ai-ui.js';
import { visibleStudyAxes } from '../components/workspace-customize.js';
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
  reorderCaseStudyElements,
  STATUS_LABELS,
  statusLabelFor,
  recommendedModulesForElement,
} from '../case-study-model.js';
import { analysisCategoriesForElement } from '../case-study-analysis.js';
import {
  elementInAxis,
  libraryItemsForAxis,
  libraryPresetFor,
  libraryTitleForAxis,
  namedSupportPeople,
  summaryDotsForAxis,
} from '../case-study-catalog.js';
import { loadCaseStudy, onCaseStudyChanged, saveCaseStudy } from '../case-study-store.js';
import { getModule, getSessionsWithModules, isSessionDone, saveModuleData } from '../db.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { notifySaveError } from '../save-status.js';
import { queuedPersist } from '../autobind.js';
import { getCustomModuleByType, moduleDisplayLabel, moduleLabelFor, resolveQuestionnaireDef } from '../custom-modules.js';
import { renderWorkspaceScores, usedScoreTests } from '../components/workspace-scores.js';
import { computeVitalRisk, vitalRiskOrbHtml } from '../vital-risk.js';
import { applyModuleSearch } from '../components/module-selector.js';
import { openAddModuleSessionModal } from '../components/add-module-session-modal.js';
import { AFFILIATIONS, DOMAINS, genogramHtml } from '../modules/redes-apoyo.js';
import { CATEGORIES } from '../module-categories.js';
import { eedDefenseScore } from '../eed-defense-score.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { buildReadableText } from '../readable-text.js';

const INTERVENTION_MODULE_TYPES = new Set(
  CATEGORIES.filter((category) => ['tcc', 'significado', 'intervencion'].includes(category.id))
    .flatMap((category) => category.types),
);
const QUANTITATIVE_MODULE_TYPES = new Set(
  (CATEGORIES.find((category) => category.id === 'pruebas')?.types || []).filter(
    (type) => type !== 'medicion_cualitativa',
  ),
);

const LIST_FIELDS = [
  {
    key: 'manifestations',
    label: 'Manifestaciones',
    checkable: false,
    placeholder: 'Manifestación clínica…',
  },
  { key: 'indicators', label: 'Indicadores', checkable: true, placeholder: 'Indicador observable…' },
  { key: 'objectives', label: 'Objetivos', checkable: true, placeholder: 'Objetivo terapéutico…' },
];

const STATUS_ICONS = {
  present: '<g class="estudio-ready-motion"><path d="m12 2 3 2 3.6.4.4 3.6 2 4-2 3-.4 3.6-3.6.4-3 2-3-2-3.6-.4-.4-3.6-2-3 2-4 .4-3.6L9 4z" fill="currentColor" stroke="none"/><path d="m8 12 2.5 2.5 5-5" stroke="var(--bg-card, white)"/></g>',
  developing: '<circle cx="12" cy="12" r="9"/><g class="estudio-progress-motion"><path d="M12 12V6a6 6 0 016 6z" fill="currentColor" stroke="none"/></g>',
  unknown: '<path d="M5 3h9a2 2 0 012 2v6M5 3a2 2 0 00-2 2v14a2 2 0 002 2h7M6 7h7M6 11h5"/><g class="estudio-review-motion"><circle cx="16" cy="16" r="4"/><path d="m19 19 3 3"/></g>',
};

function localTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
            ${selected ? `<span class="estudio-status__label">${escapeHtml(label)}</span>` : ''}
          </button>`;
        })
        .join('')}
    </div>`;
}

export function selectElementStatus(wrap, status) {
  wrap.dataset.status = status;
  wrap.querySelectorAll('[data-status-set]').forEach((b) => {
    const on = b.dataset.statusSet === wrap.dataset.status;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('.estudio-status__check')?.remove();
    b.querySelector('.estudio-status__label')?.remove();
    if (on) b.insertAdjacentHTML('beforeend', `<span class="estudio-status__label">${escapeHtml(b.getAttribute('aria-label'))}</span>`);
  });
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
      <textarea rows="1" class="estudio-item-text" data-list="${listKey}" data-index="${index}" data-field="text"
        placeholder="${escapeHtml(placeholder)}">${text}</textarea>
      <button type="button" class="btn btn-ghost estudio-item-remove" data-remove-item data-list="${listKey}" data-index="${index}" title="Quitar" aria-label="Quitar">×</button>
    </div>`;
}

export function eedDefenseScoreHtml(element, data) {
  if (element?.axis !== 'defense') return '';
  const result = eedDefenseScore(element.title, data);
  if (result.score === null) {
    const text = result.total ? 'Sin respuesta' : 'Sin reactivo específico';
    return `<span class="estudio-defense-score estudio-defense-score--empty">${text}</span>`;
  }
  const score = result.score.toFixed(1).replace('.', ',');
  const detail = `Intensidad descriptiva: ${score} de 5. Promedio de los reactivos ${result.itemNumbers.join(', ')}; ${result.answered}/${result.total} respondidos. No es un nivel de gravedad ni una subescala validada.`;
  const dots = Array.from({ length: 5 }, (_, index) =>
    `<i class="${index < Math.round(result.score) ? 'is-filled' : ''}"></i>`).join('');
  return `<span class="estudio-defense-score estudio-defense-score--${result.group}" title="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}"><span class="estudio-defense-score__dots" aria-hidden="true">${dots}</span><strong>${score}/5</strong>${result.answered < result.total ? '<small>parcial</small>' : ''}</span>`;
}

function activityRowHtml(activity, index, sessions, element = null) {
  const session = (sessions || []).find((row) => String(row.id) === String(activity.sessionId));
  const module = session?.modules?.find((row) => String(row.id) === String(activity.moduleId))
    || session?.modules?.find((row) => row.module_type === activity.moduleType);
  const label = module
    ? moduleDisplayLabel(module.module_type, parseJsonSafe(module.data, {}))
    : moduleLabelFor(activity.moduleType);
  const defenseScore = activity.moduleType === 'eed'
    ? eedDefenseScoreHtml(element, parseJsonSafe(module?.data, {})) : '';
  return `
    <div class="estudio-activity-row" data-activity-index="${index}" data-module-id="${escapeHtml(activity.moduleId || module?.id || '')}" data-module-type="${escapeHtml(activity.moduleType || '')}" data-session-id="${escapeHtml(activity.sessionId || '')}" ${activity.directAssignment ? 'data-direct-assignment' : ''}>
      <button type="button" class="estudio-module-link" data-jump-element-module><strong>${escapeHtml(label)}</strong>${defenseScore}${session ? `<span class="estudio-module-link__session">· Sesión ${session.number}</span>` : ''}</button>
      <button type="button" class="btn btn-ghost" ${activity.directAssignment ? 'data-remove-assignment' : 'data-remove-activity'} title="Quitar">×</button>
    </div>`;
}

function linkedModuleRows(element, sessions, allowedTypes) {
  return (sessions || []).flatMap((session) =>
    (session.modules || [])
      .filter((module) => {
        if (!allowedTypes.has(module.module_type)) return false;
        const data = parseJsonSafe(module.data, {});
        return (data.elementIds || []).map(String).includes(String(element.id));
      })
      .map((module) => ({
        moduleType: module.module_type,
        moduleId: String(module.id),
        sessionId: String(session.id),
        directAssignment: true,
      })),
  );
}

function uniqueModuleRows(rows, sessions) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const session = sessions.find((entry) => String(entry.id) === String(row.sessionId));
    const moduleId = row.moduleId || session?.modules?.find((entry) => entry.module_type === row.moduleType)?.id;
    const key = moduleId ? `module:${moduleId}` : `${row.sessionId || ''}:${row.moduleType || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Registros cualitativos guardados en los módulos vinculados a este elemento. */
export function qualitativeEvolutionHtml(element, sessions = []) {
  const types = new Set(['medicion_cualitativa', ...CATEGORIES.filter((category) => category.id !== 'pruebas').flatMap((category) => category.types)]);
  const legacyLinks = [...(element.activities || []), ...(element.qualitativeEvidence || [])];
  const modules = sessions.flatMap((session) => (session.modules || []).flatMap((module) => {
    const data = parseJsonSafe(module.data, {});
    const linked = (data.elementIds || []).map(String).includes(String(element.id))
      || legacyLinks.some((link) => link.moduleId ? String(link.moduleId) === String(module.id) : link.moduleType === module.module_type && String(link.sessionId) === String(session.id));
    if (!linked) return [];
    const custom = getCustomModuleByType(module.module_type);
    const definition = resolveQuestionnaireDef(custom);
    const customItems = [...(custom?.questions || []), ...(definition?.items || []), ...(definition?.sections || []).flatMap((section) => section.items || [])];
    const hasQualitativeFields = customItems.some((item) => ['text', 'textarea', 'task'].includes(item.type || item.kind));
    if (!types.has(module.module_type) && !hasQualitativeFields) return [];
    const text = module.module_type === 'medicion_cualitativa'
      ? String(data.note || '').trim() : buildReadableText(module.module_type, data);
    const date = data.date || session.date || session.scheduled_at || '';
    return [`<section class="estudio-evolution-module" data-module-id="${escapeHtml(module.id)}" data-module-type="${escapeHtml(module.module_type)}" data-session-id="${escapeHtml(session.id)}">
      <button type="button" class="estudio-module-link" data-jump-element-module><strong>${escapeHtml(moduleDisplayLabel(module.module_type, data))}</strong><span>· Sesión ${escapeHtml(session.number)}</span></button>
      ${date ? `<time>${escapeHtml(date)}</time>` : ''}
      <div class="estudio-evolution-module__text">${text ? escapeHtml(text) : '<span class="estudio-element__empty">Sin registro cualitativo aún.</span>'}</div>
    </section>`];
  }));
  const legacy = (element.qualitativeEvidence || []).filter((row) => row.text).map((row) => `<p class="estudio-evolution-note"><time>${escapeHtml(row.date)}</time>${escapeHtml(row.text)}</p>`);
  return [...modules, ...legacy].join('');
}

function elementRowHtml(element, axis, sessions) {
  const isNetwork = element.kind === SUPPORT_NETWORK_KIND;
  const catalog = !isNetwork ? libraryItemsForAxis(axis).find((item) => item.title === element.title) : null;
  const bundled = Boolean(element.bundled || catalog);
  const catalogDesc = catalog?.description || '';
  const hasNotes = Boolean((element.notes || '').trim());
  const suggested = recommendedModulesForElement(axis, element.title);

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

  const directQuantitative = linkedModuleRows(element, sessions, QUANTITATIVE_MODULE_TYPES);
  const directInterventions = linkedModuleRows(element, sessions, INTERVENTION_MODULE_TYPES);
  const linkedEvaluationTypes = new Set(directQuantitative.map((row) => row.moduleType));
  const linkedInterventionTypes = new Set(directInterventions.map((row) => row.moduleType));
  const suggestions = {
    evaluation: suggested.evaluation.filter((type) => !linkedEvaluationTypes.has(type)),
    intervention: suggested.intervention.filter((type) => !linkedInterventionTypes.has(type)),
  };
  const activities = uniqueModuleRows([
    ...(element.activities || []).filter((row) => INTERVENTION_MODULE_TYPES.has(row.moduleType)),
    ...directInterventions,
  ], sessions);
  // Conserva lecturas cualitativas heredadas y las notas ya guardadas en el caso.
  const evidenceBlock = isNetwork ? '' : `
    <section class="estudio-element__field" data-field-block="evidence">
      <header class="estudio-element__field-head">
        <h4 class="estudio-element__field-title">Evaluación cualitativa</h4>
        <div class="estudio-element__field-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-add-qualitative data-element-id="${escapeHtml(element.id)}">+ Añadir</button>
        </div>
      </header>
      <div class="estudio-element__evidence-list" data-list-host="qualitativeEvidence">
        <p class="estudio-element__subheading">En uso</p>
        ${sessions.flatMap((session) => (session.modules || []).filter((module) => module.module_type === 'medicion_cualitativa' && (parseJsonSafe(module.data, {}).elementIds || []).map(String).includes(String(element.id))).map((module, index) => activityRowHtml({ moduleType: module.module_type, moduleId: module.id, sessionId: session.id }, index, sessions).replace('data-activity-index', 'data-qualitative-index').replace('data-remove-activity', 'data-remove-qualitative'))).join('') || '<p class="estudio-element__empty">Aún no hay evaluaciones cualitativas en uso.</p>'}
      </div>
    </section>`;
  const quantitativeEvidence = uniqueModuleRows([
    ...(element.quantitativeEvidence || []),
    ...directQuantitative,
  ], sessions);
  const quantitativeBlock = isNetwork ? '' : `
      <section class="estudio-element__field" data-field-block="quantitative">
      <header class="estudio-element__field-head">
        <h4 class="estudio-element__field-title">Evaluación cuantitativa</h4>
        <button type="button" class="btn btn-ghost btn-sm" data-add-quantitative data-element-id="${escapeHtml(element.id)}">+ Añadir</button>
      </header>
      <div class="estudio-element__module-group">
        <p class="estudio-element__subheading">Sugeridos</p>
        ${suggestions.evaluation.length ? `<div class="estudio-suggested-modules">${suggestions.evaluation.map((type) => `<span class="estudio-module-link">${escapeHtml(moduleLabelFor(type))}</span>`).join('')}</div>` : '<p class="estudio-element__empty">Sin sugerencias específicas para este elemento.</p>'}
      </div>
      <div class="estudio-element__module-group">
        <p class="estudio-element__subheading">En uso</p>
        <div class="estudio-quantitative-list">${quantitativeEvidence.map((row, i) => activityRowHtml(row, i, sessions, element).replace('data-activity-index', 'data-quantitative-index').replace('data-remove-activity', 'data-remove-quantitative')).join('') || '<p class="estudio-element__empty">Aún no hay evaluaciones cuantitativas en uso.</p>'}</div>
      </div>
    </section>`;
  const activityBlock = isNetwork
    ? ''
    : `
      <section class="estudio-element__field">
        <header class="estudio-element__field-head">
        <h4 class="estudio-element__field-title">Intervenciones${hintButton(fieldHintFor(axis, 'activities'))}</h4>
        <button type="button" class="btn btn-ghost btn-sm" data-add-activity data-element-id="${escapeHtml(element.id)}">+ Añadir</button>
        </header>
        <div class="estudio-element__module-group">
          <p class="estudio-element__subheading">Sugeridos</p>
          ${suggestions.intervention.length ? `<div class="estudio-suggested-modules">${suggestions.intervention.map((type) => `<span class="estudio-module-link">${escapeHtml(moduleLabelFor(type))}</span>`).join('')}</div>` : '<p class="estudio-element__empty">Sin sugerencias específicas para este elemento.</p>'}
        </div>
        <div class="estudio-element__module-group">
          <p class="estudio-element__subheading">En uso</p>
          <div class="estudio-activity-list">
            ${activities.map((row, i) => activityRowHtml(row, i, sessions)).join('') || '<p class="estudio-element__empty">Aún no hay intervenciones en uso.</p>'}
          </div>
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
        ${resourceDetailSpec(element) ? `<section class="estudio-element__field"><header class="estudio-element__field-head"><h4 class="estudio-element__field-title">${resourceDetailSpec(element).label}</h4></header><textarea class="estudio-element__notes estudio-resource-input" rows="3" data-resource-details placeholder="${resourceDetailSpec(element).placeholder}">${escapeHtml((element.resourceDetails || []).map((row) => row.text).join('\n'))}</textarea></section>` : ''}
        ${lists}
        ${quantitativeBlock}
        ${evidenceBlock}
        ${activityBlock}
        ${isNetwork ? '' : `<section class="estudio-element__field estudio-element__evolution">
          <header class="estudio-element__field-head"><h4 class="estudio-element__field-title">Evolución</h4>
            <div class="estudio-evolution-chips"><button type="button" class="estudio-evolution-chip is-active" data-evolution-tab="quantitative">Cuantitativa</button><button type="button" class="estudio-evolution-chip" data-evolution-tab="qualitative">Cualitativa</button></div>
          </header>
          <div data-evolution-content="quantitative">${(element.quantitativeEvidence || []).length ? 'Cargando gráficos cuantitativos…' : '<p class="estudio-element__empty">Selecciona pruebas de Telar como evidencia cuantitativa.</p>'}</div>
          <div data-evolution-content="qualitative" hidden>${qualitativeEvolutionHtml(element, sessions) || '<p class="estudio-element__empty">Aún no hay módulos cualitativos asociados.</p>'}</div>
        </section>`}
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

function resourceBranchesHtml(element) {
  if (element.axis !== 'resource') return '';
  const rows = element.kind === SUPPORT_NETWORK_KIND
    ? (element.people || []).filter((person) => person.name?.trim() && !/^fallecid[oa]$/i.test(String(person.domain || '').trim())).slice(0, 3).map((person) => ({ text: person.name }))
    : resourceDetailSpec(element) ? element.resourceDetails || [] : [];
  const items = rows.filter((row) => row.text?.trim());
  return items.length ? `<ul class="estudio-resource-branches">${items.map((row) => `<li>${escapeHtml(row.text)}</li>`).join('')}</ul>` : '';
}

function axisNavHtml(caseStudy, selectedNav, sessions, selectedElementId = '') {
  const tests = usedScoreTests(sessions);
  return ESTUDIO_NAV.filter((item) => item.kind !== 'axis' || visibleStudyAxes().some((axis) => axis.id === item.id)).map((item) => {
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
          <button type="button" class="estudio-axis-nav__child${item.id === selectedNav && el.id === selectedElementId ? ' is-active' : ''}" data-nav="${item.id}" data-focus-element="${escapeHtml(el.id)}">
            <span class="estudio-score-dot estudio-score-dot--${escapeHtml(tone)} estudio-score-dot--${escapeHtml(status)}${suicidePulse}" aria-hidden="true"></span>
            <span class="estudio-axis-nav__child-label">${escapeHtml(el.title)}</span>
            <span class="estudio-axis-nav__child-status" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}">
              ${iconSvg(STATUS_ICONS[status] || STATUS_ICONS.unknown, 'estudio-axis-nav__status-glyph')}
            </span>
          </button>${resourceBranchesHtml(el)}`;
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
  const rows = visibleStudyAxes().map((axis) => {
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

export function studyAiCardHtml(caseStudy) {
  const problems = (caseStudy.elements || []).filter((el) => el.axis === 'problem' && el.title.trim());
  const actions = [
    { id: 'analysis', title: 'Analizar el caso con IA', art: '<rect x="30" y="14" width="65" height="94" rx="12" fill="#f5c385" transform="rotate(-12 62 61)"/><rect x="74" y="37" width="67" height="92" rx="12" fill="#b8ced5" transform="rotate(9 107 83)"/><path d="M49 41h25M47 53h31M92 66h26M90 79h30M88 92h20" stroke="#263c57" stroke-width="3" stroke-linecap="round"/><circle cx="123" cy="34" r="17" fill="#b4b2d7"/>' },
    { id: 'prioritize', title: 'Priorizar problemas', art: '<rect x="29" y="75" width="36" height="49" rx="9" fill="#b8ced5"/><rect x="74" y="48" width="36" height="76" rx="9" fill="#b4b2d7"/><rect x="119" y="22" width="36" height="102" rx="9" fill="#f5c385"/><path d="m41 50 35-20 29 6 27-24m-13 1 13-1-1 13" fill="none" stroke="#f8e4bc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'program', title: 'Generar programa de tratamiento', art: '<rect x="27" y="24" width="126" height="99" rx="13" fill="#b8ced5"/><path d="M27 49h126" stroke="#51466d" stroke-width="2"/><circle cx="41" cy="37" r="3" fill="#51466d"/><circle cx="52" cy="37" r="3" fill="#51466d"/><rect x="42" y="64" width="31" height="22" rx="5" fill="#f5c385"/><rect x="81" y="64" width="54" height="22" rx="5" fill="#b4b2d7"/><path d="M43 100h69M43 110h43" stroke="#51466d" stroke-width="3" stroke-linecap="round"/>' },
    { id: 'resources', title: 'Analizar factores protectores', art: '<path d="M95 124V61m0 34L58 71m37 9 33-29" fill="none" stroke="#b8ced5" stroke-width="4" stroke-linecap="round"/><path d="M94 69C65 52 65 21 92 17c25 17 22 39 2 52Z" fill="#f5c385"/><path d="M64 79C36 83 23 57 37 39c25-3 38 16 27 40Z" fill="#b4b2d7"/><path d="M119 64c-9-25 8-43 33-37 10 24-4 42-33 37Z" fill="#b8ced5"/><circle cx="144" cy="97" r="14" fill="#f5c385"/>' },
  ];
  return `<div class="estudio-ai-actions">${actions.map(({ id, title, art }) => `
    <button type="button" class="estudio-ai-action estudio-ai-action--${id}" data-study-ai="${id}" ${id === 'prioritize' && problems.length < 2 ? 'disabled title="Añade al menos dos problemas"' : ''}>
      <span class="estudio-ai-action__copy"><span class="estudio-ai-action__title">${title}</span><span class="estudio-ai-action__arrow" aria-hidden="true">${iconSvg('<path d="M4 12h16m-6-6 6 6-6 6"/>')}</span></span>
      <svg class="estudio-ai-action__art" viewBox="0 0 170 130" fill="none" aria-hidden="true">${art}</svg>
    </button>`).join('')}</div>`;
}

function protectiveFactorsCardHtml(caseStudy) {
  const library = libraryItemsForAxis('resource');
  const elements = (caseStudy.elements || []).filter((element) => element.axis === 'resource' && element.title?.trim());
  const libraryTitles = new Set(library.map((item) => item.title.trim().toLocaleLowerCase()));
  const customTitles = new Set(elements
    .filter((element) => element.kind !== SUPPORT_NETWORK_KIND && !libraryTitles.has(element.title.trim().toLocaleLowerCase()))
    .map((element) => element.title.trim().toLocaleLowerCase()));
  const total = library.length + 1 + customTitles.size; // Biblioteca + red de apoyo + factores personalizados.
  const present = elements.filter((element) => element.status === 'present');
  const count = Math.min(present.length, total);
  const pct = total ? Math.round((count / total) * 100) : 0;
  const names = present.slice(0, 3).map((element) => element.title);
  return `<article class="estudio-summary-card card estudio-summary-card--resources" aria-label="Factores protectores: ${count} de ${total} presentes">
    <h3 class="estudio-summary-card__title">Factores protectores</h3>
    <div class="estudio-resources__count"><strong>${count}<span>/${total}</span></strong><span>presentes</span></div>
    <div class="estudio-resources__meter" role="img" aria-label="${pct}% de los factores están presentes"><span style="width:${pct}%"></span></div>
    <ul class="estudio-resources__list">${names.map((name) => `<li>${escapeHtml(name)}</li>`).join('') || '<li class="is-empty">Aún no hay factores presentes</li>'}</ul>
    <span class="estudio-resources__more">${present.length > names.length ? `+${present.length - names.length} más` : 'Recursos de la persona'}</span>
  </article>`;
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
      <div class="estudio-evolution-chips"><button type="button" class="estudio-evolution-chip is-active" data-summary-evolution="quantitative">Cuantitativa</button><button type="button" class="estudio-evolution-chip" data-summary-evolution="qualitative">Cualitativa</button></div>
      <div class="estudio-resumen-scores" id="estudio-resumen-scores"></div>
    </article>`;
}

export function summaryHtml(caseStudy, sessions, vital) {
  const people = namedSupportPeople(caseStudy);
  const axisCards = visibleStudyAxes().filter((axis) => axis.id !== 'other').map((axis) => {
    const els = (caseStudy.elements || []).filter(
      (el) => el.axis === axis.id && el.title,
    );
    return `<section class="estudio-axis-matrix card">
      <h3 class="estudio-summary-card__title">${escapeHtml(axis.label)}</h3>
      <div class="estudio-axis-matrix__head"><span>Elemento</span><span>Análisis por categoría</span></div>
      ${els.map((el) => {
        const categories = analysisCategoriesForElement(el, sessions);
        const tone = summaryDotsForAxis({ elements: [el] }, axis.id)[0]?.tone || 'muted';
        const status = statusLabelFor(el.axis, el.status);
        return `<div class="estudio-axis-matrix__row">
          <div><span class="estudio-axis-matrix__element"><span class="estudio-score-dot estudio-score-dot--${escapeHtml(tone)}"></span><span><span>${escapeHtml(el.title)}</span>${resourceBranchesHtml(el)}<small class="estudio-element-status estudio-element-status--${escapeHtml(el.status || 'unknown')}">${iconSvg(STATUS_ICONS[el.status] || STATUS_ICONS.unknown, 'estudio-element-status__glyph')}${escapeHtml(status)}</small></span></span></div>
          <div class="estudio-axis-matrix__recommendations">
            ${categories.map((category) => `<section class="estudio-axis-matrix__group"><strong>${escapeHtml(category.label)}</strong><div>${category.values.map((value) => `<span class="estudio-summary-chip">${escapeHtml(category.kind === 'text' ? value : moduleLabelFor(value) || value)}</span>`).join('')}</div></section>`).join('')}
          </div>
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
        ${studyAiCardHtml(caseStudy)}
        <div class="estudio-summary__metrics">
          ${vitalRiskOrbHtml(vital, escapeHtml)}
          ${protectiveFactorsCardHtml(caseStudy)}
        </div>
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
      const evidenceInputs = [...article.querySelectorAll('.estudio-evidence-row')];
      const qualitativeEvidence = evidenceInputs.length ? evidenceInputs.map((row) => ({
        date: row.querySelector('[data-evidence-date]')?.value || localTodayISO(),
        text: row.querySelector('[data-evidence-text]')?.value || '',
      })) : prev.qualitativeEvidence || [];
      const quantitativeEvidence = prev.quantitativeEvidence || [];
      const people = [...article.querySelectorAll('.estudio-support-person')].map((block) => ({
        name: block.querySelector('[data-support-field="name"]')?.value || '',
        gender: '',
        relation: block.querySelector('[data-support-field="relation"]')?.value || 'Otro',
        domain: block.querySelector('[data-support-field="domain"]')?.value || 'Armonía',
        notes: block.querySelector('[data-support-field="notes"]')?.value || '',
      }));
      const hiddenLegacyActivities = (prev.activities || []).filter((row) => !INTERVENTION_MODULE_TYPES.has(row.moduleType));
      const activities = [...hiddenLegacyActivities, ...[...article.querySelectorAll('.estudio-activity-list .estudio-activity-row:not([data-direct-assignment])')].map((row) => ({
        moduleType: row.dataset.moduleType || '',
        moduleId: row.dataset.moduleId || '',
        sessionId: row.dataset.sessionId || '',
      }))];
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
          resourceDetails: article.querySelector('[data-resource-details]') ? article.querySelector('[data-resource-details]').value.split('\n').map((text) => ({ text: text.trim() })).filter((row) => row.text) : prev.resourceDetails,
          activities,
          qualitativeEvidence,
          quantitativeEvidence,
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
      selectedElementId: axisElements.some((el) => el.id === caseStudy.selectedElementId)
        ? caseStudy.selectedElementId
        : axisElements[0]?.id || caseStudy.selectedElementId,
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
  let navAbortController;

  const navHost = () => leftHost.querySelector('#estudio-axis-nav') || leftHost;

  const refreshAxisNav = () => {
    navHost().innerHTML = `
      <div class="estudio-axis-nav" role="navigation" aria-label="Estudio de caso">
        ${axisNavHtml(caseStudy, selectedNav, sessions, caseStudy.selectedElementId)}
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
      centerHost.closest('#workspace-center-scroll')?.scrollTo({ top: 0 });
      centerHost.querySelector('[data-library-search]')?.focus({ preventScroll: true });
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
          <button type="button" class="btn btn-secondary btn-sm estudio-case__add" data-add-element data-open-library>+ Añadir</button>
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
        <button type="button" class="btn btn-secondary btn-block estudio-add-axis" data-add-element data-open-library>+ Añadir</button>
      </div>`;

    bindCenter();
    centerHost.querySelectorAll('.estudio-element').forEach((article) => {
      const element = caseStudy.elements.find((row) => row.id === article.dataset.elementId);
      const host = article.querySelector('[data-evolution-content="quantitative"]');
      const types = (element?.quantitativeEvidence || []).map((row) => row.moduleType);
      if (host && types.length) {
        void renderWorkspaceScores(host, treatmentId, types, { expandAll: true }).catch((err) => {
          host.textContent = err?.message || 'No se pudieron cargar los gráficos.';
        });
      }
    });
  };

  selectNav = async (nextNav, { focusElementId = '' } = {}) => {
    if (!nextNav) return;
    const sameNav = nextNav === selectedNav;
    if (centerHost.querySelector('.estudio-element')) caseStudy = collectLive();
    selectedNav = nextNav;
    pickerOpen = false;
    caseStudy.selectedNav = selectedNav;
    const meta = ESTUDIO_NAV.find((n) => n.id === selectedNav);
    if (meta?.kind === 'axis') {
      caseStudy.selectedAxis = selectedNav;
      const axisElements = caseStudy.elements.filter((el) => el.axis === selectedNav);
      caseStudy.selectedElementId = focusElementId ||
        (axisElements.some((el) => el.id === caseStudy.selectedElementId)
          ? caseStudy.selectedElementId
          : axisElements[0]?.id || '');
    } else if (focusElementId) {
      caseStudy.selectedElementId = focusElementId;
    }
    suppressRemotePaint = true;
    try {
      caseStudy = await saveCaseStudy(treatmentId, caseStudy);
    } finally {
      suppressRemotePaint = false;
    }
    if (sameNav) refreshAxisNav();
    else await paint();
    if (focusElementId) {
      requestAnimationFrame(() => scrollToElement(focusElementId));
    } else {
      scrollCenterTop();
    }
  };

  const bindModuleNavigation = () => {
    centerHost.querySelectorAll('[data-jump-element-module]').forEach((button) => {
      if (button.dataset.navigationBound) return;
      button.dataset.navigationBound = 'true';
      button.addEventListener('click', async () => {
        const row = button.closest('[data-module-id]');
        const session = sessions.find((entry) => String(entry.id) === String(row?.dataset.sessionId));
        const module = session?.modules?.find((entry) => String(entry.id) === String(row?.dataset.moduleId))
          || session?.modules?.find((entry) => entry.module_type === row?.dataset.moduleType);
        if (!module || !session) { toast('Ese módulo ya no está en el tratamiento.'); return; }
        await persist();
        await toolsOpts.onJumpToModule?.({ moduleId: module.id, sessionId: session.id, moduleType: module.module_type });
      });
    });
  };

  bindSummaryNav = () => {
    bindModuleNavigation();
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
    centerHost.querySelectorAll('[data-summary-evolution]').forEach((btn) => {
      btn.addEventListener('click', () => {
        centerHost.querySelectorAll('[data-summary-evolution]').forEach((tab) => tab.classList.toggle('is-active', tab === btn));
        const host = centerHost.querySelector('#estudio-resumen-scores');
        if (!host) return;
        if (btn.dataset.summaryEvolution === 'qualitative') {
          const elements = (caseStudy.elements || []).map((element) => ({
            element,
            content: qualitativeEvolutionHtml(element, sessions),
          })).filter((entry) => entry.content);
          host.innerHTML = elements.map(({ element, content }) => `<section class="estudio-summary-evolution-item"><h4>${escapeHtml(element.title)}</h4>${content}</section>`).join('') || '<p class="estudio-element__empty">Aún no hay módulos cualitativos asociados.</p>';
          bindModuleNavigation();
        } else {
          const types = [...new Set(sessions.flatMap((s) => (s.modules || []).map((m) => m.module_type)))];
          void renderWorkspaceScores(host, treatmentId, types, { expandAll: true, tabbed: true });
        }
      });
    });
    centerHost.querySelectorAll('[data-study-ai]').forEach((button) => button.addEventListener('click', async () => {
      const task = button.dataset.studyAi;
      const { question, instructions } = STUDY_AI_REQUESTS[task];
      await toolsOpts.onAskStudyAi?.(question, { instructions, task });
    }));
  };

  if (!leftHost.dataset.estudioNavBound) {
    leftHost.dataset.estudioNavBound = '1';
    navAbortController = new AbortController();
    const { signal } = navAbortController;
    let elementDrag = null;
    let justDraggedAt = 0;
    leftHost.addEventListener('click', async (e) => {
      if (Date.now() - justDraggedAt < 400) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const btn = e.target.closest('[data-nav]');
      if (!btn || !leftHost.contains(btn)) return;
      e.preventDefault();
      const focusId = btn.dataset.focusElement || '';
      await selectNav(btn.dataset.nav, { focusElementId: focusId });
    }, { signal });
    leftHost.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.estudio-axis-nav__child[data-focus-element]');
      if (!row || e.button !== 0) return;
      elementDrag = { row, startX: e.clientX, startY: e.clientY, active: false, target: null };
    }, { signal });
    document.addEventListener('pointermove', (e) => {
      if (!elementDrag) return;
      if (!elementDrag.active) {
        if (Math.abs(e.clientX - elementDrag.startX) + Math.abs(e.clientY - elementDrag.startY) < 5) return;
        elementDrag.active = true;
        elementDrag.row.classList.add('is-reordering');
        document.body.classList.add('is-dragging-module');
      }
      e.preventDefault();
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.estudio-axis-nav__child[data-focus-element]');
      leftHost.querySelectorAll('.estudio-axis-nav__child.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
      if (target && target.dataset.nav === elementDrag.row.dataset.nav && target !== elementDrag.row) {
        target.classList.add('is-drop-target');
        elementDrag.target = target;
      } else {
        elementDrag.target = null;
      }
    }, { signal });
    document.addEventListener('pointerup', async (e) => {
      if (!elementDrag) return;
      const { row, active, target } = elementDrag;
      elementDrag = null;
      row.classList.remove('is-reordering');
      leftHost.querySelectorAll('.estudio-axis-nav__child.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
      document.body.classList.remove('is-dragging-module');
      if (!active || !target) return;
      e.preventDefault();
      justDraggedAt = Date.now();
      const rect = target.getBoundingClientRect();
      caseStudy = collectLive();
      caseStudy.elements = reorderCaseStudyElements(caseStudy.elements, row.dataset.nav, row.dataset.focusElement, target.dataset.focusElement, e.clientY >= rect.top + rect.height / 2);
      suppressRemotePaint = true;
      try {
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      } finally {
        suppressRemotePaint = false;
      }
      await paint();
    }, { signal });
    document.addEventListener('pointercancel', () => {
      elementDrag?.row.classList.remove('is-reordering');
      elementDrag = null;
      document.body.classList.remove('is-dragging-module');
    }, { signal });
    const centerScroll = centerHost.closest('#workspace-center-scroll');
    centerScroll?.addEventListener('scroll', () => {
      const articles = [...centerHost.querySelectorAll('.estudio-element[data-element-id]')];
      if (!articles.length) return;
      const top = centerScroll.getBoundingClientRect().top + 80;
      const current = [...articles].reverse().find((article) => article.getBoundingClientRect().top <= top) || articles[0];
      const id = current.dataset.elementId;
      if (caseStudy.selectedElementId === id) return;
      caseStudy.selectedElementId = id;
      navHost().querySelectorAll('.estudio-axis-nav__child[data-focus-element]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.focusElement === id);
      });
    }, { signal, passive: true });
  }

  bindCenter = () => {
    bindModuleNavigation();
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
        selectElementStatus(wrap, btn.dataset.statusSet);
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

    centerHost.querySelectorAll('[data-remove-evidence]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const article = btn.closest('.estudio-element');
        const el = caseStudy.elements.find((row) => row.id === article?.dataset.elementId);
        if (!el) return;
        const index = Number(btn.closest('[data-evidence-index]')?.dataset.evidenceIndex);
        el.qualitativeEvidence = (el.qualitativeEvidence || []).filter((_, i) => i !== index);
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-remove-quantitative], [data-remove-qualitative], [data-remove-activity], [data-remove-assignment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.estudio-activity-row');
        const elementId = btn.closest('.estudio-element')?.dataset.elementId;
        if (!row || !elementId) return;
        const label = row.querySelector('.estudio-module-link strong')?.textContent || moduleLabelFor(row.dataset.moduleType);
        const ok = await openConfirmModal({
          title: '¿Quitar módulo del elemento?',
          message: `¿Estás seguro de quitar «${label}» de este elemento? El módulo y sus registros seguirán disponibles en Programa.`,
          confirmLabel: 'Quitar módulo',
        });
        if (!ok) return;
        caseStudy = collectLive();
        const element = caseStudy.elements.find((entry) => entry.id === elementId);
        if (!element) return;
        const matches = (link) => link.moduleId ? String(link.moduleId) === String(row.dataset.moduleId)
          : link.moduleType === row.dataset.moduleType && String(link.sessionId) === String(row.dataset.sessionId);
        element.activities = (element.activities || []).filter((link) => !matches(link));
        element.quantitativeEvidence = (element.quantitativeEvidence || []).filter((link) => !matches(link));
        element.qualitativeEvidence = (element.qualitativeEvidence || []).filter((link) => !matches(link));
        suppressRemotePaint = true;
        try {
          if (row.dataset.moduleId) {
            const module = await getModule(row.dataset.moduleId);
            if (module) {
              const data = parseJsonSafe(module.data, {});
              await saveModuleData(module.id, {
                ...data,
                elementIds: (data.elementIds || []).filter((id) => String(id) !== String(elementId)),
                excludedElementIds: [...new Set([...(data.excludedElementIds || []).map(String), String(elementId)])],
              }, module.status || 'pendiente');
            }
          }
          caseStudy = await saveCaseStudy(treatmentId, caseStudy);
          sessions = await getSessionsWithModules(treatmentId);
        } finally { suppressRemotePaint = false; }
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-evolution-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.closest('.estudio-element__evolution');
        section?.querySelectorAll('[data-evolution-tab]').forEach((tab) => tab.classList.toggle('is-active', tab === btn));
        section?.querySelectorAll('[data-evolution-content]').forEach((panel) => { panel.hidden = panel.dataset.evolutionContent !== btn.dataset.evolutionTab; });
        if (btn.dataset.evolutionTab === 'quantitative') {
          const article = btn.closest('.estudio-element');
          const host = article?.querySelector('[data-evolution-content="quantitative"]');
          const element = caseStudy.elements.find((row) => row.id === article?.dataset.elementId);
          const types = (element?.quantitativeEvidence || []).map((row) => row.moduleType);
          if (host && types.length) void renderWorkspaceScores(host, treatmentId, types, { expandAll: true });
        }
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
        const added = await openAddModuleSessionModal({
          treatmentId,
          allowedCategoryIds: ['tcc', 'significado', 'intervencion'],
          presetType: recommendedModulesForElement(selectedNav, caseStudy.elements.find((el) => el.id === btn.dataset.elementId)?.title || '').intervention[0] || '',
        });
        if (!added?.moduleType) return;
        caseStudy = collectLive();
        const el = caseStudy.elements.find((row) => row.id === btn.dataset.elementId);
        if (!el) return;
        // La asignación vive en elementIds del módulo; no duplicamos una segunda
        // referencia en activities.
        const attachedModule = await getModule(added.moduleId);
        const attachedData = JSON.parse(attachedModule?.data || '{}');
        await saveModuleData(added.moduleId, { ...attachedData, elementIds: [...new Set([...(attachedData.elementIds || []), el.id])], excludedElementIds: (attachedData.excludedElementIds || []).filter((id) => String(id) !== String(el.id)) }, attachedModule?.status || 'pendiente');
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

    centerHost.querySelectorAll('[data-add-qualitative]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const element = caseStudy.elements.find((el) => el.id === btn.dataset.elementId);
        const added = await openAddModuleSessionModal({ treatmentId, allowedCategoryIds: ['pruebas'], presetType: 'medicion_cualitativa', associatedElementId: element?.id || '' });
        if (!added?.moduleId || added.moduleType !== 'medicion_cualitativa' || !element) return;
        const module = await getModule(added.moduleId);
        const data = JSON.parse(module?.data || '{}');
        await saveModuleData(added.moduleId, { ...data, elementIds: [...new Set([...(data.elementIds || []), element.id])], excludedElementIds: (data.excludedElementIds || []).filter((id) => String(id) !== String(element.id)) }, module?.status || 'pendiente');
        sessions = await getSessionsWithModules(treatmentId);
        await paint();
      });
    });

    centerHost.querySelectorAll('[data-add-quantitative]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const element = caseStudy.elements.find((el) => el.id === btn.dataset.elementId);
        const added = await openAddModuleSessionModal({
          treatmentId,
          allowedCategoryIds: ['pruebas'],
          allowCustomModules: true,
          presetType: recommendedModulesForElement(selectedNav, element?.title || '').evaluation[0] || '',
          associatedElementId: element?.id || '',
        });
        if (!added?.moduleType) return;
        caseStudy = collectLive();
        const el = caseStudy.elements.find((row) => row.id === btn.dataset.elementId);
        if (!el) return;
        if (!(el.quantitativeEvidence || []).some((row) => row.moduleType === added.moduleType && String(row.sessionId) === String(added.sessionId || ''))) {
          el.quantitativeEvidence = [...(el.quantitativeEvidence || []), { moduleType: added.moduleType, sessionId: String(added.sessionId || ''), moduleId: String(added.moduleId || '') }];
        }
        const attachedModule = await getModule(added.moduleId);
        const attachedData = JSON.parse(attachedModule?.data || '{}');
        await saveModuleData(added.moduleId, { ...attachedData, elementIds: [...new Set([...(attachedData.elementIds || []), el.id])], excludedElementIds: (attachedData.excludedElementIds || []).filter((id) => String(id) !== String(el.id)) }, attachedModule?.status || 'pendiente');
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

  const onPreferences = async () => {
    if (centerHost.querySelector('.estudio-element')) caseStudy = await saveCaseStudy(treatmentId, collectLive());
    if (!visibleStudyAxes().some((axis) => axis.id === selectedNav) && !['summary', 'scores'].includes(selectedNav)) selectedNav = 'summary';
    await paint();
  };
  document.addEventListener('telar:study-preferences', onPreferences);
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
      document.removeEventListener('telar:study-preferences', onPreferences);
      stop();
      navAbortController?.abort();
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
