import { bindAutoSave, collectFormData } from '../autobind.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { ICON_CLOSE, ICON_SEARCH } from '../icons.js';
import { getHiddenDxProblemNames, hideDxProblemName } from '../profile.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const BUILTIN_PROBLEMS = [
  {
    name: 'TDAH en adultos',
    assigned: false,
    indicators: ['ASRS Parte A ≥4/6', 'Dificultades sostenidas de atención e impulsividad'],
    objectives: ['Mejorar autorregulación atencional', 'Implementar estrategias compensatorias'],
  },
  {
    name: 'Estrés postraumático',
    assigned: false,
    indicators: ['PCL-5 ≥31 o IES-R ≥33', 'Intrusiones, evitación o hiperactivación'],
    objectives: ['Reducir síntomas de impacto traumático', 'Fortalecer regulación emocional'],
  },
  {
    name: 'Estrés alto',
    assigned: false,
    indicators: ['Puntaje moderado o alto en dimensión de estrés en DASS-21'],
    objectives: ['Reducir niveles de estrés'],
  },
  {
    name: 'Ansiedad alta',
    assigned: false,
    indicators: [
      'Puntaje moderado o alto en dimensión de ansiedad en DASS-21',
      'Percepción de ansiedad alta',
      'Preocupaciones que afectan la vida cotidiana',
    ],
    objectives: ['Reducir niveles de ansiedad'],
  },
  {
    name: 'Estado de ánimo bajo',
    assigned: false,
    indicators: [
      'Puntaje moderado o alto en dimensión de depresión en DASS-21',
      'Percepción de ánimo bajo',
    ],
    objectives: ['Mejorar estado de ánimo'],
  },
  {
    name: 'Toma de decisiones',
    assigned: false,
    indicators: ['Dificultad para la toma de decisiones'],
    objectives: ['Mejorar las habilidades para la toma de decisiones'],
  },
  {
    name: 'Duelo extendido',
    assigned: false,
    indicators: ['Duración prolongada de los síntomas de duelo', 'Deterioro en las actividades diarias'],
    objectives: ['Procesar y aceptar la pérdida'],
  },
  {
    name: 'Suicidalidad',
    assigned: false,
    indicators: [
      'Expresiones verbales de desesperanza o inutilidad',
      'Establecer un plan suicida',
      'Intentos previos recientes',
      'Búsqueda de aislamiento',
    ],
    objectives: [
      'Estar libre de pensamientos suicidas',
      'Conocer habilidades de afrontamiento para manejar pensamientos suicidas',
    ],
  },
  {
    name: 'Pensamientos recurrentes',
    assigned: false,
    indicators: ['Pensamientos/compulsiones obsesivas', 'Deterioro en las actividades diarias'],
    objectives: ['Reducir pensamientos obsesivos o compulsivos', 'Aumentar flexibilidad cognitiva'],
  },
  {
    name: 'Fobia específica',
    assigned: false,
    indicators: [
      'Evitación persistente del objeto temido',
      'Respuesta inmediata de miedo o ansiedad ante la exposición',
      'Duración de síntomas por 6 meses o más',
    ],
    objectives: [
      'Reducir o eliminar el miedo o la ansiedad',
      'Aumentar gradualmente la exposición al objeto temido',
      'Desarrollar habilidades de afrontamiento para manejar y reducir el miedo',
    ],
  },
];

const BUILTIN_NAMES = new Set(BUILTIN_PROBLEMS.map((p) => p.name));

function normalizeView(view) {
  if (view === 'conceptualizacion' || view === 'personalizado' || view === 'matriz') return view;
  return 'matriz';
}

function normalizeItem(item) {
  if (typeof item === 'string') return { text: item, checked: false };
  return { text: String(item?.text ?? ''), checked: Boolean(item?.checked) };
}

function normalizeProblem(p) {
  return {
    name: p.name || '',
    assigned: Boolean(p.assigned),
    indicators: (Array.isArray(p.indicators) ? p.indicators : []).map(normalizeItem),
    objectives: (Array.isArray(p.objectives) ? p.objectives : []).map(normalizeItem),
  };
}

function defaultProblems() {
  const hidden = new Set(getHiddenDxProblemNames());
  return BUILTIN_PROBLEMS.filter((p) => !hidden.has(p.name)).map((p) =>
    normalizeProblem({
      ...p,
      indicators: [...p.indicators],
      objectives: [...p.objectives],
    }),
  );
}

function itemRowHtml(prefix, item, placeholder) {
  const { text, checked } = normalizeItem(item);
  return `
    <div class="dx-item-row">
      <label class="dx-item-check" title="Marcar como revisado">
        <input type="checkbox" name="${prefix}_checked" ${checked ? 'checked' : ''} />
      </label>
      <textarea name="${prefix}" rows="2" class="dx-item-text" placeholder="${escapeHtml(placeholder)}">${escapeHtml(text)}</textarea>
    </div>`;
}

export async function renderDiagnostico(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const view = normalizeView(data.view);
  const query = data.query || '';
  const structured = data.structured || {};
  const customDiagnosis = data.custom_diagnosis || '';
  const rawProblems = Array.isArray(data.problems) && data.problems.length ? data.problems : defaultProblems();
  const problems = rawProblems.map(normalizeProblem);
  const assignedCount = problems.filter((p) => p.assigned).length;

  host.innerHTML = `
    <div class="card dx-card-wrap">
      <div class="dx-head">
        <h2 class="module-title" style="margin:0">Diagnósticos</h2>
        <div class="dx-actions">
          <button type="button" class="btn btn-ghost" title="Ayuda" disabled>?</button>
        </div>
      </div>

      <div class="dx-tabs" data-no-autobind>
        <button type="button" class="dx-tab ${view === 'matriz' ? 'active' : ''}" data-view="matriz">
          Matriz de Problemas
          <span class="dx-tab__badge" id="dx-assigned-count">${assignedCount}</span>
        </button>
        <button type="button" class="dx-tab ${view === 'conceptualizacion' ? 'active' : ''}" data-view="conceptualizacion">Conceptualización TDAH</button>
        <button type="button" class="dx-tab ${view === 'personalizado' ? 'active' : ''}" data-view="personalizado">Personalizado</button>
      </div>

      <form id="dx-form">
        <input type="hidden" name="view" value="${escapeHtml(view)}" />

        <section class="dx-panel" id="dx-panel-conceptualizacion" ${view === 'conceptualizacion' ? '' : 'hidden'}>
          <h3 class="dx-structured__title">Conceptualización TDAH / trauma</h3>
          <div class="dx-structured__grid">
            <label class="dx-structured__field">
              <span>Comorbilidades</span>
              <textarea name="structured_comorbidities" rows="2" placeholder="p. ej. ansiedad, TEPT, consumo">${escapeHtml(structured.comorbidities || '')}</textarea>
            </label>
            <label class="dx-structured__field">
              <span>Eventos traumáticos / antecedentes</span>
              <textarea name="structured_trauma_events" rows="2" placeholder="Eventos relevantes, edad, contexto">${escapeHtml(structured.trauma_events || '')}</textarea>
            </label>
            <label class="dx-structured__field">
              <span>Medicación psicotrópica</span>
              <textarea name="structured_medication" rows="2" placeholder="Fármaco, dosis, adherencia">${escapeHtml(structured.medication || '')}</textarea>
            </label>
            <label class="dx-structured__field dx-structured__field--wide">
              <span>Notas clínicas estructuradas</span>
              <textarea name="structured_dx_notes" rows="3" placeholder="Hipótesis, factores mantenedores, recursos">${escapeHtml(structured.dx_notes || '')}</textarea>
            </label>
          </div>
        </section>

        <section class="dx-panel" id="dx-panel-personalizado" ${view === 'personalizado' ? '' : 'hidden'}>
          <label class="dx-custom-label">
            <span>Diagnóstico personalizado</span>
            <textarea name="custom_diagnosis" rows="10" class="dx-custom-input" placeholder="Escriba aquí el diagnóstico o formulación clínica personalizada…">${escapeHtml(customDiagnosis)}</textarea>
          </label>
        </section>
      </form>

      <form id="dx-form-matrix" class="dx-form-matrix" ${view === 'matriz' ? '' : 'hidden'}>
        <input type="hidden" name="view" value="${escapeHtml(view)}" />
        <div class="dx-search" data-no-autobind>
          <span class="dx-search__icon" aria-hidden="true">${ICON_SEARCH}</span>
          <input name="query" value="${escapeHtml(query)}" placeholder="Búsqueda" autocomplete="off" />
        </div>
        <div class="dx-matrix-panel">
          <div class="dx-matrix__head">
            <span class="dx-matrix__head-assign" title="Asignar al tratamiento"></span>
            <span>Problema</span>
            <span>Indicadores</span>
            <span>Objetivo</span>
            <span class="dx-matrix__head-del" aria-hidden="true"></span>
          </div>
          <div class="dx-matrix-scroll">
            <div class="dx-matrix__body" id="dx-rows">
              ${problems.map((p, i) => problemRowHtml(p, i)).join('')}
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-ghost dx-add" id="dx-add-problem" title="Crear problema">+ Crear problema</button>
      </form>
    </div>
  `;

  const structForm = host.querySelector('#dx-form');
  const matrixForm = host.querySelector('#dx-form-matrix');

  const buildPayload = () => {
    const sfd = collectFormData(structForm);
    const mfd = matrixForm ? collectFormData(matrixForm) : {};
    return {
      view: normalizeView(sfd.view || mfd.view || view),
      query: mfd.query || '',
      custom_diagnosis: sfd.custom_diagnosis || '',
      structured: {
        comorbidities: sfd.structured_comorbidities || '',
        trauma_events: sfd.structured_trauma_events || '',
        medication: sfd.structured_medication || '',
        dx_notes: sfd.structured_dx_notes || '',
      },
      problems: matrixForm ? parseProblemsFromForm(mfd) : problems,
    };
  };

  const persist = async () => {
    await syncModuleReadableText(moduleRow, buildPayload(), 'completado');
  };

  const updateAssignedCount = () => {
    const n = host.querySelectorAll('.dx-assign input[type="checkbox"]:checked').length;
    const badge = host.querySelector('#dx-assigned-count');
    if (badge) badge.textContent = String(n);
  };

  const applyMatrixSearch = (raw) => {
    const q = String(raw || '').trim().toLowerCase();
    host.querySelectorAll('.dx-matrix__row').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.classList.toggle('dx-matrix__row--hidden', q.length > 0 && !text.includes(q));
    });
  };

  bindAutoSave(structForm, persist, workspaceAutoSaveStatus());
  bindAutoSave(matrixForm, persist, workspaceAutoSaveStatus());

  const setView = (nextView) => {
    const v = normalizeView(nextView);
    host.querySelectorAll('.dx-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    structForm.querySelector('[name="view"]').value = v;
    matrixForm?.querySelector('[name="view"]')?.setAttribute('value', v);
    host.querySelector('#dx-panel-conceptualizacion').hidden = v !== 'conceptualizacion';
    host.querySelector('#dx-panel-personalizado').hidden = v !== 'personalizado';
    if (matrixForm) matrixForm.hidden = v !== 'matriz';
  };

  matrixForm?.querySelector('.dx-search input')?.addEventListener('input', (e) => {
    applyMatrixSearch(e.target.value);
  });

  if (query) applyMatrixSearch(query);

  host.querySelectorAll('.dx-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setView(btn.dataset.view);
      persist();
    });
  });

  host.querySelector('#dx-add-problem')?.addEventListener('click', () => {
    const idx = host.querySelectorAll('.dx-matrix__row').length;
    host.querySelector('#dx-rows')?.insertAdjacentHTML(
      'beforeend',
      problemRowHtml(normalizeProblem({ name: '', assigned: false, indicators: [], objectives: [] }), idx),
    );
    host.querySelector(`[name="p_${idx}_name"]`)?.focus();
    bindDynamicActions(host, persist, updateAssignedCount);
    bindAssignChecks(host, updateAssignedCount);
    persist();
  });

  bindDynamicActions(host, persist, updateAssignedCount);
  bindAssignChecks(host, updateAssignedCount);
  updateAssignedCount();
}

function bindAssignChecks(host, updateAssignedCount) {
  host.querySelectorAll('.dx-assign input[type="checkbox"]').forEach((cb) => {
    if (cb.dataset.bound === '1') return;
    cb.dataset.bound = '1';
    cb.addEventListener('change', () => {
      cb.closest('.dx-matrix__row')?.classList.toggle('dx-matrix__row--off', !cb.checked);
      updateAssignedCount?.();
    });
  });
}

function parseProblemsFromForm(fd) {
  const parsed = [];
  for (let i = 0; i < 200; i++) {
    if (!(`p_${i}_name` in fd)) break;
    const p = {
      name: fd[`p_${i}_name`] || '',
      assigned: fd[`p_${i}_assigned`] === 'on' || fd[`p_${i}_assigned`] === true || fd[`p_${i}_assigned`] === 'true',
      indicators: [],
      objectives: [],
    };
    for (let j = 0; j < 200; j++) {
      const key = `p_${i}_ind_${j}`;
      if (!(key in fd)) break;
      const text = fd[key] || '';
      const checked = fd[`${key}_checked`] === 'on' || fd[`${key}_checked`] === true;
      if (text.trim() || checked) p.indicators.push({ text, checked });
    }
    for (let j = 0; j < 200; j++) {
      const key = `p_${i}_obj_${j}`;
      if (!(key in fd)) break;
      const text = fd[key] || '';
      const checked = fd[`${key}_checked`] === 'on' || fd[`${key}_checked`] === true;
      if (text.trim() || checked) p.objectives.push({ text, checked });
    }
    parsed.push(p);
  }
  return parsed;
}

function bindDynamicActions(host, persist, updateAssignedCount) {
  host.querySelectorAll('[data-add-ind]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const i = btn.dataset.i;
      const wrap = host.querySelector(`#ind-wrap-${i}`);
      const count = wrap.querySelectorAll('.dx-item-row').length;
      wrap.insertAdjacentHTML('beforeend', itemRowHtml(`p_${i}_ind_${count}`, {}, 'Indicador'));
      wrap.querySelector(`textarea[name="p_${i}_ind_${count}"]`)?.focus();
      persist();
    });
  });
  host.querySelectorAll('[data-add-obj]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const i = btn.dataset.i;
      const wrap = host.querySelector(`#obj-wrap-${i}`);
      const count = wrap.querySelectorAll('.dx-item-row').length;
      wrap.insertAdjacentHTML('beforeend', itemRowHtml(`p_${i}_obj_${count}`, {}, 'Objetivo'));
      wrap.querySelector(`textarea[name="p_${i}_obj_${count}"]`)?.focus();
      persist();
    });
  });
  host.querySelectorAll('[data-del-problem]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const row = host.querySelector(`#dx-row-${btn.dataset.i}`);
      const name = row?.querySelector(`[name="p_${btn.dataset.i}_name"]`)?.value?.trim() || 'este problema';
      const ok = await openConfirmModal({
        title: '¿Eliminar problema de la matriz?',
        message:
          `Se quitará «${name}» de la matriz de este tratamiento. No se modificarán otros tratamientos ya creados, pero el problema no aparecerá en tratamientos nuevos. ¿Está seguro/a?`,
        confirmLabel: 'Eliminar de la matriz',
      });
      if (!ok) return;
      if (BUILTIN_NAMES.has(name)) hideDxProblemName(name);
      row?.remove();
      updateAssignedCount?.();
      toast('Problema eliminado de la matriz');
      persist();
    });
  });
}

function problemRowHtml(p, i) {
  const inds = Array.isArray(p.indicators) ? p.indicators : [];
  const objs = Array.isArray(p.objectives) ? p.objectives : [];
  const assigned = Boolean(p.assigned);
  return `
    <div class="dx-matrix__row${assigned ? '' : ' dx-matrix__row--off'}" id="dx-row-${i}">
      <div class="dx-matrix__cell dx-matrix__cell--assign">
        <label class="dx-assign" title="Asignar este problema al tratamiento">
          <input type="checkbox" name="p_${i}_assigned" ${assigned ? 'checked' : ''} />
        </label>
      </div>
      <div class="dx-matrix__cell dx-matrix__cell--problem">
        <input name="p_${i}_name" value="${escapeHtml(p.name || '')}" placeholder="Problema" />
      </div>
      <div class="dx-matrix__cell">
        <div class="dx-card" id="ind-card-${i}">
          <div class="dx-card__list" id="ind-wrap-${i}">
            ${inds.map((t, j) => itemRowHtml(`p_${i}_ind_${j}`, t, 'Indicador')).join('')}
          </div>
          <button type="button" class="btn btn-secondary dx-add-small" data-add-ind data-i="${i}" title="Añadir indicador">Añadir indicador +</button>
        </div>
      </div>
      <div class="dx-matrix__cell">
        <div class="dx-card" id="obj-card-${i}">
          <div class="dx-card__list" id="obj-wrap-${i}">
            ${objs.map((t, j) => itemRowHtml(`p_${i}_obj_${j}`, t, 'Objetivo')).join('')}
          </div>
          <button type="button" class="btn btn-secondary dx-add-small" data-add-obj data-i="${i}" title="Añadir objetivo">Añadir objetivo +</button>
        </div>
      </div>
      <div class="dx-matrix__cell dx-matrix__cell--delete">
        <button type="button" class="btn btn-ghost dx-del" data-del-problem data-i="${i}" title="Eliminar problema" aria-label="Eliminar problema">${ICON_CLOSE}</button>
      </div>
    </div>
  `;
}
