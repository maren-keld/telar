import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

export async function renderDiagnostico(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const view = data.view || 'matriz';
  const query = data.query || '';
  const problems = Array.isArray(data.problems) ? data.problems : defaultProblems();

  host.innerHTML = `
    <div class="card dx-card-wrap">
      <div class="dx-head">
        <h2 class="module-title" style="margin:0">Diagnósticos</h2>
        <div class="dx-actions">
          <button type="button" class="btn btn-ghost" title="Ayuda" disabled>?</button>
        </div>
      </div>

      <div class="dx-tabs" data-no-autobind>
        <button type="button" class="dx-tab ${view === 'matriz' ? 'active' : ''}" data-view="matriz">Matriz de Problemas</button>
        <button type="button" class="dx-tab ${view === 'personalizado' ? 'active' : ''}" data-view="personalizado">Personalizado</button>
      </div>

      <div class="dx-search">
        <span>🔎</span>
        <input name="query" value="${escapeHtml(query)}" placeholder="Búsqueda" form="dx-form" />
      </div>

      <form id="dx-form">
        <input type="hidden" name="view" value="${escapeHtml(view)}" />
        <div class="dx-matrix">
          <div class="dx-matrix__head">
            <span class="dx-matrix__head-assign" title="Asignar al tratamiento"></span>
            <span>Problema</span>
            <span>Indicadores</span>
            <span>Objetivo</span>
          </div>
          <div class="dx-matrix__body" id="dx-rows">
            ${problems.map((p, i) => problemRowHtml(p, i)).join('')}
          </div>
        </div>
        <button type="button" class="btn btn-ghost dx-add" id="dx-add-problem" title="Crear problema">+ Crear problema</button>
      </form>
    </div>
  `;

  const form = host.querySelector('#dx-form');
  const persist = async () => {
    const fd = collectFormData(form);
    const next = { view: fd.view || 'matriz', query: fd.query || '', problems: parseProblemsFromForm(fd) };
    await syncModuleReadableText(moduleRow, next, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  host.querySelector('.dx-search input')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    host.querySelectorAll('.dx-matrix__row').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.hidden = q.length > 0 && !text.includes(q);
    });
  });

  host.querySelectorAll('.dx-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.querySelectorAll('.dx-tab').forEach((b) => b.classList.toggle('active', b === btn));
      form.querySelector('[name="view"]').value = btn.dataset.view;
      persist();
    });
  });

  host.querySelector('#dx-add-problem')?.addEventListener('click', () => {
    const idx = host.querySelectorAll('.dx-matrix__row').length;
    host.querySelector('#dx-rows')?.insertAdjacentHTML(
      'beforeend',
      problemRowHtml({ name: '', assigned: false, indicators: [], objectives: [] }, idx),
    );
    host.querySelector(`[name="p_${idx}_name"]`)?.focus();
    persist();
    bindDynamicActions(host, persist);
    bindAssignChecks(host);
  });

  bindDynamicActions(host, persist);
  bindAssignChecks(host);
}

function bindAssignChecks(host) {
  host.querySelectorAll('.dx-assign input[type="checkbox"]').forEach((cb) => {
    if (cb.dataset.bound === '1') return;
    cb.dataset.bound = '1';
    cb.addEventListener('change', () => {
      cb.closest('.dx-matrix__row')?.classList.toggle('dx-matrix__row--off', !cb.checked);
    });
  });
}

function defaultProblems() {
  return [
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
}

function parseProblemsFromForm(fd) {
  const problems = [];
  for (let i = 0; i < 200; i++) {
    if (!(`p_${i}_name` in fd)) break;
    const p = {
      name: fd[`p_${i}_name`] || '',
      assigned: fd[`p_${i}_assigned`] === 'on' || fd[`p_${i}_assigned`] === true || fd[`p_${i}_assigned`] === 'true',
      indicators: [],
      objectives: [],
    };
    for (let j = 0; j < 200; j++) {
      const k = `p_${i}_ind_${j}`;
      if (!(k in fd)) break;
      const v = fd[k];
      if (v) p.indicators.push(v);
    }
    for (let j = 0; j < 200; j++) {
      const k = `p_${i}_obj_${j}`;
      if (!(k in fd)) break;
      const v = fd[k];
      if (v) p.objectives.push(v);
    }
    problems.push(p);
  }
  return problems;
}

function bindDynamicActions(host, persist) {
  host.querySelectorAll('[data-add-ind]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const i = btn.dataset.i;
      const wrap = host.querySelector(`#ind-wrap-${i}`);
      const count = wrap.querySelectorAll('input').length;
      wrap.insertAdjacentHTML('beforeend', `<input name="p_${i}_ind_${count}" placeholder="Indicador" />`);
      wrap.querySelector(`input[name="p_${i}_ind_${count}"]`)?.focus();
      persist();
    });
  });
  host.querySelectorAll('[data-add-obj]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const i = btn.dataset.i;
      const wrap = host.querySelector(`#obj-wrap-${i}`);
      const count = wrap.querySelectorAll('input').length;
      wrap.insertAdjacentHTML('beforeend', `<input name="p_${i}_obj_${count}" placeholder="Objetivo" />`);
      wrap.querySelector(`input[name="p_${i}_obj_${count}"]`)?.focus();
      persist();
    });
  });
  host.querySelectorAll('[data-del-problem]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      if (!confirm('¿Eliminar problema?')) return;
      host.querySelector(`#dx-row-${btn.dataset.i}`)?.remove();
      toast('Problema eliminado');
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
        <div class="dx-problem-row">
          <input name="p_${i}_name" value="${escapeHtml(p.name || '')}" placeholder="Problema" />
          <button type="button" class="btn btn-ghost dx-del" data-del-problem data-i="${i}" title="Eliminar problema">×</button>
        </div>
      </div>
      <div class="dx-matrix__cell">
        <div class="dx-card" id="ind-card-${i}">
          <div class="dx-card__list" id="ind-wrap-${i}">
            ${inds.map((t, j) => `<input name="p_${i}_ind_${j}" value="${escapeHtml(t)}" placeholder="Indicador" />`).join('')}
          </div>
          <button type="button" class="btn btn-secondary dx-add-small" data-add-ind data-i="${i}" title="Añadir indicador">Añadir indicador +</button>
        </div>
      </div>
      <div class="dx-matrix__cell">
        <div class="dx-card" id="obj-card-${i}">
          <div class="dx-card__list" id="obj-wrap-${i}">
            ${objs.map((t, j) => `<input name="p_${i}_obj_${j}" value="${escapeHtml(t)}" placeholder="Objetivo" />`).join('')}
          </div>
          <button type="button" class="btn btn-secondary dx-add-small" data-add-obj data-i="${i}" title="Añadir objetivo">Añadir objetivo +</button>
        </div>
      </div>
    </div>
  `;
}
