import { bindAutoSave, collectFormData, queuedPersist } from '../autobind.js';
import { getSpaceChecks } from '../db.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { ICON_CLOSE } from '../icons.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { notifySaveError, workspaceAutoSaveStatus } from '../save-status.js';

export const FORMULATION_AXES = [
  { id: 'problem', label: 'Problemas', addLabel: 'Añadir problema' },
  { id: 'resource', label: 'Recursos y factores protectores', addLabel: 'Añadir recurso' },
  { id: 'defense', label: 'Defensas psíquicas', addLabel: 'Añadir defensa' },
  { id: 'risk', label: 'Vulnerabilidades / riesgo clínico', addLabel: 'Añadir vulnerabilidad' },
];

const AXIS_BY_ID = Object.fromEntries(FORMULATION_AXES.map((axis) => [axis.id, axis]));
const PROFILE_AXIS_MAP = { fortalezas: 'resource', defensas: 'defense', riesgos: 'risk' };
const VIEW_ALIASES = {
  matriz: 'board',
  personalizado: 'summary',
  conceptualizacion: 'summary',
  board: 'board',
  summary: 'summary',
};

const STATUS_LABELS = {
  active: 'Activo',
  in_progress: 'En curso',
  graduated: 'Graduado',
  restratified: 'Reestratificado',
};

const STATUS_OPTIONS = {
  problem: ['active', 'in_progress', 'graduated'],
  resource: ['active', 'in_progress', 'graduated'],
  defense: ['active', 'in_progress', 'graduated'],
  risk: ['active', 'in_progress', 'restratified'],
};

export const DX_HELP_MESSAGE =
  'Formulación reúne 4 ejes del caso: problemas, recursos, defensas psíquicas y vulnerabilidades/riesgo. La unidad de trabajo es cada elemento del tablero.';

function normalizeView(view) {
  return VIEW_ALIASES[view] || 'board';
}

function normalizeAxis(axis) {
  return AXIS_BY_ID[axis] ? axis : 'problem';
}

function itemText(item) {
  return typeof item === 'string' ? item : item?.text;
}

function normalizeItem(item, { checkable = true } = {}) {
  return {
    text: String(itemText(item) ?? '').trim(),
    checked: checkable ? Boolean(item?.checked) : false,
  };
}

function normalizeItems(items, opts) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeItem(item, opts));
}

function makeId() {
  return `fx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStatus(axis, status) {
  const allowed = STATUS_OPTIONS[axis] || STATUS_OPTIONS.problem;
  if (allowed.includes(status)) return status;
  return axis === 'risk' ? 'active' : 'in_progress';
}

export function normalizeFormulationElement(raw = {}, fallbackAxis = 'problem') {
  const axis = normalizeAxis(raw.axis || fallbackAxis);
  return {
    id: String(raw.id || makeId()),
    axis,
    title: String(raw.title || raw.name || '').trim(),
    status: normalizeStatus(axis, raw.status),
    manifestations: normalizeItems(raw.manifestations, { checkable: false }),
    indicators: normalizeItems(raw.indicators),
    objectives: normalizeItems(raw.objectives),
    evidence: normalizeItems(raw.evidence || raw.evidenceRefs, { checkable: false }),
    notes: String(raw.notes || '').trim(),
  };
}

function uniqueByAxisTitle(elements) {
  const seen = new Set();
  return elements.filter((element) => {
    const key = `${element.axis}::${element.title.trim().toLowerCase()}`;
    if (!element.title) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legacyProblemToElement(rawProblem = {}) {
  return normalizeFormulationElement(
    {
      axis: 'problem',
      title: rawProblem.name || rawProblem.text || '',
      status: rawProblem.assigned ? 'active' : 'in_progress',
      indicators: rawProblem.indicators,
      objectives: rawProblem.objectives,
    },
    'problem',
  );
}

async function loadProfileSeeds(treatmentId) {
  if (!treatmentId) return {};
  const seeds = {};
  await Promise.all(
    Object.entries(PROFILE_AXIS_MAP).map(async ([category, axis]) => {
      const rows = await getSpaceChecks(treatmentId, category);
      seeds[axis] = (rows || [])
        .filter((row) => Number(row.checked) === 1)
        .map((row) => normalizeFormulationElement({ axis, title: row.label, status: 'active' }, axis));
    }),
  );
  return seeds;
}

export function legacyProblemsFromFormulation(formulation) {
  return (formulation?.elements || [])
    .filter((element) => element.axis === 'problem')
    .map((element) => ({
      name: element.title || '',
      assigned: Boolean(element.title?.trim()),
      indicators: element.indicators || [],
      objectives: element.objectives || [],
    }));
}

export function normalizeFormulationData(data = {}, profileSeeds = {}) {
  const structured = data.structured || {};
  const raw = data.formulation || {};
  const hasNativeFormulation = Array.isArray(raw.elements) && raw.elements.length > 0;

  const legacyElements = [
    ...((Array.isArray(data.problems) ? data.problems : []).map(legacyProblemToElement)),
    ...(profileSeeds.resource || []),
    ...(profileSeeds.defense || []),
    ...(profileSeeds.risk || []),
  ];

  const elements = uniqueByAxisTitle(
    hasNativeFormulation ? raw.elements.map((element) => normalizeFormulationElement(element)) : legacyElements,
  );

  const selectedAxis = normalizeAxis(raw.selectedAxis || elements[0]?.axis || 'problem');
  const selectedElementId = elements.some((element) => element.id === raw.selectedElementId)
    ? raw.selectedElementId
    : elements.find((element) => element.axis === selectedAxis)?.id || elements[0]?.id || '';

  return {
    version: 1,
    selectedAxis,
    selectedElementId,
    nominalDiagnosis: String(raw.nominalDiagnosis || data.custom_diagnosis || '').trim(),
    caseSummary: String(raw.caseSummary || '').trim(),
    elements,
    structured: {
      hipotesis: String(structured.hipotesis || structured.dx_notes || '').trim(),
      factores_mantenedores: String(structured.factores_mantenedores || '').trim(),
      recursos: String(structured.recursos || '').trim(),
      comorbidities: String(structured.comorbidities || '').trim(),
      trauma_events: String(structured.trauma_events || '').trim(),
      medication: String(structured.medication || '').trim(),
      dx_notes: String(structured.dx_notes || '').trim(),
    },
  };
}

function formulationCount(formulation, axisId = null) {
  const elements = formulation?.elements || [];
  return axisId ? elements.filter((element) => element.axis === axisId).length : elements.length;
}

function itemRowsHtml(listName, items, placeholder, { checkable = true } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item, idx) => itemRowHtml(`${listName}_${idx}`, item, placeholder, { checkable, index: idx, listName }))
    .join('');
}

function itemRowHtml(name, item, placeholder, { checkable = true, index = 0, listName = '' } = {}) {
  const normalized = normalizeItem(item, { checkable });
  return `
    <div class="dx-item-row${checkable ? '' : ' dx-item-row--plain'}">
      ${
        checkable
          ? `<label class="dx-item-check" title="Marcar como revisado">
        <input type="checkbox" name="${name}_checked" ${normalized.checked ? 'checked' : ''} />
      </label>`
          : ''
      }
      <textarea name="${name}" rows="2" class="dx-item-text" placeholder="${escapeHtml(placeholder)}">${escapeHtml(normalized.text)}</textarea>
      <button type="button" class="btn btn-ghost dx-item-del" data-del-list-item="${escapeHtml(listName)}" data-item-index="${index}" title="Eliminar fila" aria-label="Eliminar fila">${ICON_CLOSE}</button>
    </div>`;
}

function activeElementFor(formulation, activeElementId, activeAxis) {
  return (
    formulation.elements.find((element) => element.id === activeElementId) ||
    formulation.elements.find((element) => element.axis === activeAxis) ||
    formulation.elements[0] ||
    null
  );
}

function statusOptionsHtml(axis, currentStatus) {
  return (STATUS_OPTIONS[axis] || STATUS_OPTIONS.problem)
    .map(
      (status) =>
        `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${escapeHtml(STATUS_LABELS[status])}</option>`,
    )
    .join('');
}

function axisItemsHtml(formulation, activeAxis, activeElementId) {
  return FORMULATION_AXES.map((axis) => {
    const elements = formulation.elements.filter((element) => element.axis === axis.id);
    return `
      <section class="dx-axis">
        <div class="dx-axis__top">
          <button type="button" class="dx-axis__title${activeAxis === axis.id ? ' is-active' : ''}" data-axis="${axis.id}">
            <span>${escapeHtml(axis.label)}</span>
            <span class="dx-axis__badge">${elements.length}</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm dx-axis__add" data-add-axis="${axis.id}">+ Elemento</button>
        </div>
        <div class="dx-axis__list">
          ${
            elements.length
              ? elements
                  .map(
                    (element) => `
              <button type="button" class="dx-axis__item${element.id === activeElementId ? ' is-active' : ''}" data-select-element="${element.id}" data-axis="${axis.id}">
                <strong>${escapeHtml(element.title || 'Elemento sin título')}</strong>
                <span class="dx-axis__status">${escapeHtml(STATUS_LABELS[element.status] || STATUS_LABELS.in_progress)}</span>
              </button>`,
                  )
                  .join('')
              : `<p class="dx-axis__empty">Sin elementos en este eje.</p>`
          }
        </div>
      </section>`;
  }).join('');
}

function focusEmptyHtml(activeAxis) {
  const axis = AXIS_BY_ID[activeAxis] || AXIS_BY_ID.problem;
  return `
    <div class="dx-focus dx-focus--empty">
      <p class="dx-focus__eyebrow">${escapeHtml(axis.label)}</p>
      <h3 class="dx-focus__empty-title">Elige o crea un elemento</h3>
      <p class="dx-focus__empty-copy">Cada eje reúne elementos concretos de trabajo. Empieza creando uno en el índice de la izquierda y luego completa manifestaciones, indicadores, objetivos y evidencia.</p>
      <button type="button" class="btn btn-primary" data-add-axis="${axis.id}">${escapeHtml(axis.addLabel)}</button>
    </div>`;
}

function focusElementHtml(element) {
  const axis = AXIS_BY_ID[element.axis] || AXIS_BY_ID.problem;
  return `
    <form id="dx-form-board" class="dx-focus" data-element-id="${escapeHtml(element.id)}">
      <div class="dx-focus__head">
        <div class="dx-focus__head-main">
          <p class="dx-focus__eyebrow">${escapeHtml(axis.label)}</p>
          <input
            type="text"
            name="element_title"
            class="dx-focus__title"
            value="${escapeHtml(element.title)}"
            placeholder="Nombre del elemento en trabajo"
            autocomplete="off"
          />
        </div>
        <div class="dx-focus__controls">
          <label class="dx-focus__field">
            <span>Eje</span>
            <select name="element_axis">
              ${FORMULATION_AXES.map(
                (item) =>
                  `<option value="${item.id}" ${item.id === element.axis ? 'selected' : ''}>${escapeHtml(item.label)}</option>`,
              ).join('')}
            </select>
          </label>
          <label class="dx-focus__field">
            <span>Estado</span>
            <select name="element_status">
              ${statusOptionsHtml(element.axis, element.status)}
            </select>
          </label>
          <button type="button" class="btn btn-ghost dx-focus__delete" data-delete-element="${escapeHtml(element.id)}" title="Eliminar elemento" aria-label="Eliminar elemento">${ICON_CLOSE}</button>
        </div>
      </div>

      <div class="dx-focus__grid">
        <section class="dx-focus__section">
          <div class="dx-focus__section-head">
            <div>
              <h3 class="dx-focus__section-title">Manifestaciones</h3>
              <p class="dx-focus__section-copy">Cómo aparece esto en la vida del paciente.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-add-list-item="manifestations">+ Fila</button>
          </div>
          <div class="dx-card__list">
            ${itemRowsHtml('manifestation', element.manifestations, 'Cómo se manifiesta…', { checkable: false })}
          </div>
        </section>

        <section class="dx-focus__section">
          <div class="dx-focus__section-head">
            <div>
              <h3 class="dx-focus__section-title">Indicadores</h3>
              <p class="dx-focus__section-copy">Qué observar para verificar cambio o seguimiento.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-add-list-item="indicators">+ Fila</button>
          </div>
          <div class="dx-card__list">
            ${itemRowsHtml('indicator', element.indicators, 'Cómo se verifica…')}
          </div>
        </section>
      </div>

      <div class="dx-focus__grid">
        <section class="dx-focus__section">
          <div class="dx-focus__section-head">
            <div>
              <h3 class="dx-focus__section-title">Objetivos</h3>
              <p class="dx-focus__section-copy">Hacia dónde mover este elemento.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-add-list-item="objectives">+ Fila</button>
          </div>
          <div class="dx-card__list">
            ${itemRowsHtml('objective', element.objectives, 'Qué se quiere lograr…')}
          </div>
        </section>

        <section class="dx-focus__section">
          <div class="dx-focus__section-head">
            <div>
              <h3 class="dx-focus__section-title">Evidencia</h3>
              <p class="dx-focus__section-copy">Highlights, citas clínicas o hallazgos que sostienen este foco.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-add-list-item="evidence">+ Fila</button>
          </div>
          <div class="dx-card__list">
            ${itemRowsHtml('evidence', element.evidence, 'Qué evidencia lo sostiene…', { checkable: false })}
          </div>
        </section>
      </div>

      <label class="dx-custom-label dx-focus__notes">
        <span>Notas del elemento</span>
        <textarea name="element_notes" rows="4" class="dx-custom-input" placeholder="Contexto clínico, matices o decisiones de trabajo…">${escapeHtml(element.notes || '')}</textarea>
      </label>
    </form>`;
}

function summaryFormHtml(formulation, activeView) {
  return `
    <form id="dx-form-summary" class="dx-summary-form" ${activeView === 'summary' ? '' : 'hidden'}>
      <input type="hidden" name="view" value="${escapeHtml(activeView)}" />
      <div class="dx-structured__grid dx-summary-grid">
        <label class="dx-structured__field dx-structured__field--wide">
          <span>Hipótesis diagnóstica nominal (opcional)</span>
          <textarea name="nominal_diagnosis" rows="2" placeholder="CIE/DSM u otra etiqueta clínica, si ayuda">${escapeHtml(formulation.nominalDiagnosis || '')}</textarea>
        </label>
        <label class="dx-structured__field dx-structured__field--wide">
          <span>Hipótesis</span>
          <textarea name="structured_hipotesis" rows="3" placeholder="Qué está pasando y por qué ahora">${escapeHtml(formulation.structured.hipotesis || '')}</textarea>
        </label>
        <label class="dx-structured__field">
          <span>Factores mantenedores</span>
          <textarea name="structured_factores_mantenedores" rows="3" placeholder="Qué sostiene el problema o el riesgo">${escapeHtml(formulation.structured.factores_mantenedores || '')}</textarea>
        </label>
        <label class="dx-structured__field">
          <span>Recursos</span>
          <textarea name="structured_recursos" rows="3" placeholder="Fortalezas, redes y apoyos relevantes">${escapeHtml(formulation.structured.recursos || '')}</textarea>
        </label>
        <label class="dx-structured__field">
          <span>Comorbilidades</span>
          <textarea name="structured_comorbidities" rows="3" placeholder="Si aporta al caso, anota aquí">${escapeHtml(formulation.structured.comorbidities || '')}</textarea>
        </label>
        <label class="dx-structured__field">
          <span>Eventos traumáticos / antecedentes</span>
          <textarea name="structured_trauma_events" rows="3" placeholder="Antecedentes relevantes para el caso">${escapeHtml(formulation.structured.trauma_events || '')}</textarea>
        </label>
        <label class="dx-structured__field">
          <span>Medicación psicotrópica</span>
          <textarea name="structured_medication" rows="3" placeholder="Psiquiatría, fármacos o coordinación médica">${escapeHtml(formulation.structured.medication || '')}</textarea>
        </label>
        <label class="dx-structured__field dx-structured__field--wide">
          <span>Síntesis clínica</span>
          <textarea name="case_summary" rows="6" placeholder="Resumen clínico breve del caso">${escapeHtml(formulation.caseSummary || formulation.structured.dx_notes || '')}</textarea>
        </label>
      </div>
    </form>`;
}

function boardPanelHtml(formulation, activeAxis, activeElementId, activeView) {
  const current = activeElementFor(formulation, activeElementId, activeAxis);
  return `
    <section class="dx-panel" id="dx-panel-board" ${activeView === 'board' ? '' : 'hidden'}>
      <div class="dx-board">
        <aside class="dx-axis-nav">
          ${axisItemsHtml(formulation, activeAxis, current?.id || '')}
        </aside>
        <div class="dx-board__focus">
          ${current ? focusElementHtml(current) : focusEmptyHtml(activeAxis)}
        </div>
      </div>
    </section>`;
}

function parseItemsFromForm(formData, prefix, { checkable = true } = {}) {
  const items = [];
  for (let i = 0; i < 200; i++) {
    const key = `${prefix}_${i}`;
    if (!(key in formData)) break;
    const text = String(formData[key] || '').trim();
    const checked = checkable && Boolean(formData[`${key}_checked`]);
    if (text || checked) items.push({ text, checked });
  }
  return items;
}

function meaningfulFormulationElement(element) {
  if (!element) return false;
  return Boolean(
    element.title ||
      element.notes ||
      element.manifestations?.length ||
      element.indicators?.length ||
      element.objectives?.length ||
      element.evidence?.length,
  );
}

export async function renderDiagnostico(host, moduleRow, ctx = {}) {
  const data = parseJsonSafe(moduleRow.data, {});
  const treatmentId = ctx?.treatment?.id || null;
  let activeView = normalizeView(data.view);
  let formulation = normalizeFormulationData(data, await loadProfileSeeds(treatmentId));
  let activeAxis = formulation.selectedAxis || formulation.elements[0]?.axis || 'problem';
  let activeElementId =
    formulation.selectedElementId ||
    formulation.elements.find((element) => element.axis === activeAxis)?.id ||
    formulation.elements[0]?.id ||
    '';

  const syncStateFromDom = () => {
    const summaryForm = host.querySelector('#dx-form-summary');
    if (summaryForm) {
      const fd = collectFormData(summaryForm);
      formulation.nominalDiagnosis = String(fd.nominal_diagnosis || '').trim();
      formulation.caseSummary = String(fd.case_summary || '').trim();
      formulation.structured = {
        hipotesis: String(fd.structured_hipotesis || '').trim(),
        factores_mantenedores: String(fd.structured_factores_mantenedores || '').trim(),
        recursos: String(fd.structured_recursos || '').trim(),
        comorbidities: String(fd.structured_comorbidities || '').trim(),
        trauma_events: String(fd.structured_trauma_events || '').trim(),
        medication: String(fd.structured_medication || '').trim(),
        dx_notes: String(fd.case_summary || '').trim(),
      };
    }

    const focusForm = host.querySelector('#dx-form-board');
    const current = activeElementFor(formulation, activeElementId, activeAxis);
    if (focusForm && current) {
      const fd = collectFormData(focusForm);
      current.title = String(fd.element_title || '').trim();
      current.axis = normalizeAxis(fd.element_axis || current.axis);
      current.status = normalizeStatus(current.axis, fd.element_status);
      current.manifestations = parseItemsFromForm(fd, 'manifestation', { checkable: false });
      current.indicators = parseItemsFromForm(fd, 'indicator');
      current.objectives = parseItemsFromForm(fd, 'objective');
      current.evidence = parseItemsFromForm(fd, 'evidence', { checkable: false });
      current.notes = String(fd.element_notes || '').trim();
      activeAxis = current.axis;
    }

    formulation.selectedAxis = activeAxis;
    formulation.selectedElementId = activeElementId;
  };

  const buildPayload = () => {
    syncStateFromDom();
    const cleaned = formulation.elements.map((element) => normalizeFormulationElement(element, element.axis));
    return {
      view: activeView,
      custom_diagnosis: formulation.nominalDiagnosis,
      structured: { ...formulation.structured },
      problems: legacyProblemsFromFormulation({ elements: cleaned }),
      formulation: {
        version: 1,
        selectedAxis: activeAxis,
        selectedElementId: activeElementId,
        nominalDiagnosis: formulation.nominalDiagnosis,
        caseSummary: formulation.caseSummary,
        elements: cleaned,
      },
    };
  };

  const persistRaw = async () => {
    await syncModuleReadableText(moduleRow, buildPayload(), 'completado');
  };
  const persist = queuedPersist(persistRaw, notifySaveError);

  const paint = ({ focusSelector = '' } = {}) => {
    const totalCount = formulationCount(formulation);
    host.innerHTML = `
      <div class="card dx-card-wrap">
        <div class="dx-head">
          <div class="dx-head__meta">
            <h2 class="module-title">Formulación</h2>
            <p class="dx-head__lede">Tablero clínico por 4 ejes: problemas, recursos, defensas y vulnerabilidades/riesgo.</p>
          </div>
        </div>

        <div class="dx-tabs" data-no-autobind>
          <button type="button" class="dx-tab ${activeView === 'board' ? 'active' : ''}" data-view="board">
            Tablero
            <span class="dx-tab__badge">${totalCount}</span>
          </button>
          <button type="button" class="dx-tab ${activeView === 'summary' ? 'active' : ''}" data-view="summary">Resumen clínico</button>
        </div>

        ${boardPanelHtml(formulation, activeAxis, activeElementId, activeView)}
        ${summaryFormHtml(formulation, activeView)}
      </div>`;

    const summaryForm = host.querySelector('#dx-form-summary');
    const focusForm = host.querySelector('#dx-form-board');
    if (summaryForm) bindAutoSave(summaryForm, persistRaw, workspaceAutoSaveStatus());
    if (focusForm) bindAutoSave(focusForm, persistRaw, workspaceAutoSaveStatus());

    host.querySelectorAll('.dx-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        activeView = normalizeView(btn.dataset.view);
        paint();
        void persist();
      });
    });

    host.querySelectorAll('[data-axis]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        activeAxis = normalizeAxis(btn.dataset.axis);
        activeElementId =
          formulation.elements.find((element) => element.axis === activeAxis)?.id ||
          formulation.elements[0]?.id ||
          '';
        paint();
      });
    });

    host.querySelectorAll('[data-select-element]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        activeAxis = normalizeAxis(btn.dataset.axis);
        activeElementId = btn.dataset.selectElement || '';
        paint();
      });
    });

    host.querySelectorAll('[data-add-axis]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        const axis = normalizeAxis(btn.dataset.addAxis);
        const next = normalizeFormulationElement({ axis, status: 'active' }, axis);
        formulation.elements.push(next);
        activeAxis = axis;
        activeElementId = next.id;
        activeView = 'board';
        paint({ focusSelector: '[name="element_title"]' });
        void persist();
      });
    });

    focusForm?.querySelector('[name="element_axis"]')?.addEventListener('change', () => {
      syncStateFromDom();
      paint();
      void persist();
    });

    host.querySelectorAll('[data-add-list-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        const current = activeElementFor(formulation, activeElementId, activeAxis);
        if (!current) return;
        const key = btn.dataset.addListItem;
        const checkable = key === 'indicators' || key === 'objectives';
        current[key] = [...(current[key] || []), normalizeItem({}, { checkable })];
        const prefixMap = {
          manifestations: 'manifestation',
          indicators: 'indicator',
          objectives: 'objective',
          evidence: 'evidence',
        };
        const idx = current[key].length - 1;
        paint({ focusSelector: `[name="${prefixMap[key]}_${idx}"]` });
      });
    });

    host.querySelectorAll('[data-del-list-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncStateFromDom();
        const current = activeElementFor(formulation, activeElementId, activeAxis);
        if (!current) return;
        const key = btn.dataset.delListItem;
        const idx = Number(btn.dataset.itemIndex);
        if (!key || Number.isNaN(idx)) return;
        current[key] = (current[key] || []).filter((_, rowIdx) => rowIdx !== idx);
        paint();
        void persist();
      });
    });

    host.querySelector('[data-delete-element]')?.addEventListener('click', async () => {
      syncStateFromDom();
      const current = activeElementFor(formulation, activeElementId, activeAxis);
      if (!current) return;
      const ok = await openConfirmModal({
        title: '¿Eliminar elemento de la formulación?',
        message: `Se quitará «${current.title || 'este elemento'}» del eje ${AXIS_BY_ID[current.axis]?.label || 'actual'}.`,
        confirmLabel: 'Eliminar elemento',
      });
      if (!ok) return;
      formulation.elements = formulation.elements.filter((element) => element.id !== current.id);
      const next = formulation.elements.find((element) => element.axis === current.axis) || formulation.elements[0] || null;
      activeAxis = next?.axis || current.axis;
      activeElementId = next?.id || '';
      paint();
      toast('Elemento eliminado de la formulación');
      await persist();
    });

    if (focusSelector) host.querySelector(focusSelector)?.focus();
  };

  const current = activeElementFor(formulation, activeElementId, activeAxis);
  if (current) {
    activeAxis = current.axis;
    activeElementId = current.id;
  }
  formulation.elements = formulation.elements
    .sort((a, b) => {
      const axisDiff =
        FORMULATION_AXES.findIndex((axis) => axis.id === a.axis) -
        FORMULATION_AXES.findIndex((axis) => axis.id === b.axis);
      if (axisDiff !== 0) return axisDiff;
      return (a.title || '').localeCompare(b.title || '', 'es');
    })
    .map((element) => normalizeFormulationElement(element, element.axis));
  formulation.elements = formulation.elements.filter((element, idx, list) => {
    if (meaningfulFormulationElement(element)) return true;
    return element.id === activeElementId || list.length === 1;
  });
  paint();
}
