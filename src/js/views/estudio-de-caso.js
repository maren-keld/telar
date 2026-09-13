/**
 * Vista workspace · Estudio de caso
 * Ejes → elementos en filas (manifestaciones, indicadores, objetivos, evidencia + notas).
 */
import {
  CASE_STUDY_AXES,
  emptyCaseStudyElement,
  normalizeCaseStudyData,
  normalizeCaseStudyElement,
  statusesForAxis,
  STATUS_LABELS,
} from '../case-study-model.js';
import { loadCaseStudy, onCaseStudyChanged, saveCaseStudy } from '../case-study-store.js';
import { escapeHtml } from '../utils.js';
import { notifySaveError } from '../save-status.js';
import { queuedPersist } from '../autobind.js';

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

function elementRowHtml(element, axis) {
  const statusOpts = statusesForAxis(axis)
    .map(
      (id) =>
        `<option value="${id}" ${element.status === id ? 'selected' : ''}>${escapeHtml(STATUS_LABELS[id] || id)}</option>`,
    )
    .join('');
  const lists = LIST_FIELDS.map((field) => {
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

  const hasNotes = Boolean((element.notes || '').trim());

  return `
    <article class="estudio-element" data-element-id="${escapeHtml(element.id)}">
      <header class="estudio-element__head">
        <input type="text" class="estudio-element__title" data-field="title" value="${escapeHtml(element.title)}" placeholder="Título del elemento…" />
        <select class="estudio-element__status" data-field="status" aria-label="Estado">${statusOpts}</select>
        <button type="button" class="btn btn-ghost estudio-element__notes-toggle${hasNotes ? ' is-active' : ''}" data-toggle-notes title="Notas">✎</button>
        <button type="button" class="btn btn-ghost estudio-element__delete" data-delete-element title="Eliminar elemento" aria-label="Eliminar">×</button>
      </header>
      <div class="estudio-element__stacks">
        ${lists}
      </div>
      <div class="estudio-element__notes-wrap" data-notes-wrap ${hasNotes ? '' : 'hidden'}>
        <label class="estudio-element__notes-label">Notas</label>
        <textarea class="estudio-element__notes" data-field="notes" rows="3" placeholder="Notas clínicas de este elemento…">${escapeHtml(element.notes || '')}</textarea>
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

function axisNavHtml(caseStudy, selectedAxis) {
  return CASE_STUDY_AXES.map((axis) => {
    const count = (caseStudy.elements || []).filter((el) => el.axis === axis.id).length;
    const active = axis.id === selectedAxis;
    return `
      <button type="button" class="estudio-axis-nav__item${active ? ' is-active' : ''}" data-axis="${axis.id}">
        <span class="estudio-axis-nav__label">${escapeHtml(axis.label)}</span>
        <span class="estudio-axis-nav__count">${count}</span>
      </button>`;
  }).join('');
}

/**
 * @param {HTMLElement} leftHost — scroll del left sidebar
 * @param {HTMLElement} centerHost — #center-modules
 */
export async function mountEstudioDeCaso({ leftHost, centerHost, treatmentId }) {
  let caseStudy = await loadCaseStudy(treatmentId);
  let selectedAxis = caseStudy.selectedAxis || 'problem';

  const collectLive = () => {
    const axisElements = [];
    centerHost.querySelectorAll('.estudio-element').forEach((article) => {
      const id = article.dataset.elementId;
      const prev = (caseStudy.elements || []).find((el) => el.id === id) || { axis: selectedAxis };
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
      axisElements.push(
        normalizeCaseStudyElement({
          ...prev,
          id,
          axis: selectedAxis,
          title: article.querySelector('[data-field="title"]')?.value || '',
          status: article.querySelector('[data-field="status"]')?.value || prev.status,
          notes: article.querySelector('[data-field="notes"]')?.value || '',
          ...lists,
        }),
      );
    });
    const otherElements = (caseStudy.elements || []).filter((el) => el.axis !== selectedAxis);
    let supportPeople = caseStudy.supportPeople || [];
    if (selectedAxis === 'other') {
      supportPeople = [...centerHost.querySelectorAll('.estudio-support-person')].map((block) => ({
        name: block.querySelector('[data-support-field="name"]')?.value || '',
        gender: '',
        relation: block.querySelector('[data-support-field="relation"]')?.value || 'Otro',
        domain: block.querySelector('[data-support-field="domain"]')?.value || 'Armonía',
        notes: block.querySelector('[data-support-field="notes"]')?.value || '',
      }));
    }
    return normalizeCaseStudyData({
      ...caseStudy,
      selectedAxis,
      selectedElementId: axisElements[0]?.id || caseStudy.selectedElementId,
      elements: [...otherElements, ...axisElements],
      supportPeople,
    });
  };

  const persist = queuedPersist(async () => {
    caseStudy = await saveCaseStudy(treatmentId, collectLive());
  }, notifySaveError);

  let bindLeft;
  let bindCenter;

  const paint = () => {
    const axisMeta = CASE_STUDY_AXES.find((a) => a.id === selectedAxis) || CASE_STUDY_AXES[0];
    const elements = (caseStudy.elements || []).filter((el) => el.axis === selectedAxis);

    leftHost.innerHTML = `
      <div class="estudio-axis-nav" role="navigation" aria-label="Ejes del caso">
        <p class="estudio-axis-nav__eyebrow">Estudio de caso</p>
        ${axisNavHtml(caseStudy, selectedAxis)}
      </div>`;

    const redesBlock =
      selectedAxis === 'other'
        ? `
      <section class="estudio-redes">
        <header class="estudio-redes__head">
          <div>
            <h3 class="estudio-redes__title">Redes de apoyo</h3>
            <p class="estudio-redes__copy">Herramienta del eje Otros (ya no se agrega al programa).</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-add-support>+ Persona</button>
        </header>
        <div class="estudio-redes__list">
          ${
            (caseStudy.supportPeople || []).map((p, i) => supportPersonHtml(p, i)).join('') ||
            '<p class="estudio-element__empty">Sin personas aún.</p>'
          }
        </div>
      </section>`
        : '';

    centerHost.innerHTML = `
      <div class="estudio-case" data-treatment-id="${treatmentId}">
        <header class="estudio-case__head">
          <div>
            <p class="estudio-case__eyebrow">Estudio de caso</p>
            <h2 class="estudio-case__title">${escapeHtml(axisMeta.label)}</h2>
          </div>
          <button type="button" class="btn btn-secondary" data-add-element>${escapeHtml(axisMeta.addLabel)}</button>
        </header>
        <div class="estudio-case__rows">
          ${
            elements.map((el) => elementRowHtml(el, selectedAxis)).join('') ||
            `<p class="estudio-case__empty">Sin elementos en este eje. Añade el primero para trabajar manifestaciones, indicadores, objetivos y evidencia.</p>`
          }
        </div>
        ${redesBlock}
      </div>`;

    bindCenter();
    bindLeft();
  };

  bindLeft = () => {
    leftHost.querySelectorAll('[data-axis]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        selectedAxis = btn.dataset.axis;
        caseStudy.selectedAxis = selectedAxis;
        paint();
      });
    });
  };

  bindCenter = () => {
    const onEdit = () => {
      void persist();
    };

    centerHost.querySelector('[data-add-element]')?.addEventListener('click', async () => {
      caseStudy = collectLive();
      const el = emptyCaseStudyElement(selectedAxis, '');
      caseStudy.elements = [...(caseStudy.elements || []), el];
      caseStudy.selectedElementId = el.id;
      caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      paint();
      centerHost.querySelector(`[data-element-id="${el.id}"] [data-field="title"]`)?.focus();
    });

    centerHost.querySelectorAll('[data-add-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const list = btn.dataset.list;
        const id = btn.dataset.elementId;
        const el = caseStudy.elements.find((row) => row.id === id);
        if (!el) return;
        el[list] = [...(el[list] || []), { text: '', checked: false }];
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        paint();
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
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        paint();
      });
    });

    centerHost.querySelectorAll('[data-delete-element]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const id = btn.closest('.estudio-element')?.dataset.elementId;
        caseStudy.elements = (caseStudy.elements || []).filter((el) => el.id !== id);
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        paint();
      });
    });

    centerHost.querySelectorAll('[data-toggle-notes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.estudio-element')?.querySelector('[data-notes-wrap]');
        if (!wrap) return;
        wrap.hidden = !wrap.hidden;
        btn.classList.toggle('is-active', !wrap.hidden);
        if (!wrap.hidden) wrap.querySelector('textarea')?.focus();
      });
    });

    centerHost.querySelector('[data-add-support]')?.addEventListener('click', async () => {
      caseStudy = collectLive();
      caseStudy.supportPeople = [
        ...(caseStudy.supportPeople || []),
        { name: '', gender: '', relation: 'Otro', domain: 'Armonía', notes: '' },
      ];
      caseStudy = await saveCaseStudy(treatmentId, caseStudy);
      paint();
    });

    centerHost.querySelectorAll('[data-delete-support]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        caseStudy = collectLive();
        const index = Number(btn.closest('.estudio-support-person')?.dataset.supportIndex);
        caseStudy.supportPeople = (caseStudy.supportPeople || []).filter((_, i) => i !== index);
        caseStudy = await saveCaseStudy(treatmentId, caseStudy);
        paint();
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

  paint();

  const stop = onCaseStudyChanged(async ({ treatmentId: tid }) => {
    if (Number(tid) !== Number(treatmentId)) return;
    if (centerHost.contains(document.activeElement)) return;
    caseStudy = await loadCaseStudy(treatmentId);
    selectedAxis = caseStudy.selectedAxis || selectedAxis;
    paint();
  });

  return {
    unmount() {
      stop();
      leftHost.innerHTML = '';
      centerHost.innerHTML = '';
    },
    async flush() {
      caseStudy = await saveCaseStudy(treatmentId, collectLive());
    },
  };
}
