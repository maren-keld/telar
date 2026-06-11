import { customModuleTypeId, newCustomModuleId, saveCustomModule } from '../custom-modules.js';

function newQuestion(index) {
  return {
    id: `q${index}`,
    text: '',
    type: 'checkbox',
    options: [''],
  };
}

export function openCreateModuleModal({ onCreated, module: existing } = {}) {
  const isEdit = Boolean(existing?.id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop create-module-overlay';
  overlay.innerHTML = `
    <div class="modal card create-module-modal" role="dialog" aria-labelledby="create-module-title">
      <header class="create-module-modal__head">
        <h2 id="create-module-title">${isEdit ? 'Editar módulo' : 'Cuestionario'}</h2>
        <button type="button" class="modal-close" aria-label="Cerrar">×</button>
      </header>
      <div class="create-module-modal__body">
        <label class="create-module-field create-module-field--indications">
          <span class="create-module-field__icon" aria-hidden="true">ⓘ</span>
          <input type="text" id="cm-instructions" class="input" placeholder="Indicaciones" />
        </label>
        <label class="create-module-field">
          <span class="create-module-field__label">Nombre del módulo</span>
          <input type="text" id="cm-title" class="input" placeholder="Ej. Cuestionario de sesión" required />
        </label>
        <div id="cm-questions"></div>
        <button type="button" class="btn btn-dashed btn-block" id="cm-add-question">+ Agregar pregunta</button>
      </div>
      <footer class="create-module-modal__foot">
        <button type="button" class="btn btn-ghost" id="cm-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="cm-save">${isEdit ? 'Guardar cambios' : 'Guardar módulo'}</button>
      </footer>
    </div>`;

  document.body.appendChild(overlay);

  const questionsEl = overlay.querySelector('#cm-questions');
  let questionCount = 0;

  const addQuestion = (initial = null) => {
    questionCount += 1;
    const q = initial || newQuestion(questionCount);
    const block = document.createElement('div');
    block.className = 'cm-question';
    block.dataset.qid = q.id || `q${questionCount}`;
    block.innerHTML = `
      <div class="cm-question__row">
        <span class="cm-question__drag" aria-hidden="true">⠿</span>
        <input type="text" class="input cm-question__text" placeholder="Pregunta ${questionCount}" data-field="text" />
        <select class="input cm-question__type" data-field="type" title="Tipo de pregunta">
          <option value="checkbox">Opción múltiple</option>
          <option value="text">Texto libre</option>
        </select>
        <button type="button" class="cm-question__remove" title="Eliminar pregunta" aria-label="Eliminar pregunta">×</button>
      </div>
      <div class="cm-question__options" data-options></div>`;
    questionsEl.appendChild(block);

    const textInput = block.querySelector('[data-field="text"]');
    const typeSel = block.querySelector('[data-field="type"]');
    const optionsWrap = block.querySelector('[data-options]');
    textInput.value = q.text || '';
    typeSel.value = q.type || 'checkbox';

    const renderOptions = (seedOptions = null) => {
      if (typeSel.value === 'text') {
        optionsWrap.innerHTML = '';
        optionsWrap.hidden = true;
        return;
      }
      optionsWrap.hidden = false;
      optionsWrap.innerHTML = `
        <div class="cm-options-list"></div>
        <button type="button" class="btn btn-ghost btn-sm cm-add-option">+ Añadir opción</button>`;
      const list = optionsWrap.querySelector('.cm-options-list');
      const addOpt = (value = '') => {
        const row = document.createElement('div');
        row.className = 'cm-option-row';
        row.innerHTML = `
          <span class="cm-option-check" aria-hidden="true">☐</span>
          <input type="text" class="input" placeholder="Opción" data-option />
          <button type="button" class="cm-option-remove" aria-label="Quitar opción">×</button>`;
        const optInput = row.querySelector('[data-option]');
        if (optInput) optInput.value = value;
        row.querySelector('.cm-option-remove')?.addEventListener('click', () => row.remove());
        list.appendChild(row);
      };
      const opts = Array.isArray(seedOptions) && seedOptions.length ? seedOptions : [''];
      opts.forEach((opt) => addOpt(opt));
      optionsWrap.querySelector('.cm-add-option')?.addEventListener('click', () => addOpt());
    };

    typeSel.addEventListener('change', () => renderOptions());
    block.querySelector('.cm-question__remove')?.addEventListener('click', () => {
      block.remove();
      if (!questionsEl.querySelector('.cm-question')) addQuestion();
    });
    renderOptions(q.type === 'checkbox' ? q.options : null);
  };

  if (isEdit && existing.questions?.length) {
    existing.questions.forEach((q) => addQuestion(q));
  } else {
    addQuestion();
  }

  if (isEdit) {
    overlay.querySelector('#cm-instructions').value = existing.instructions || '';
    overlay.querySelector('#cm-title').value = existing.title || '';
  }

  const close = () => overlay.remove();

  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('#cm-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#cm-add-question')?.addEventListener('click', () => addQuestion());

  overlay.querySelector('#cm-save')?.addEventListener('click', () => {
    const title = overlay.querySelector('#cm-title')?.value?.trim();
    if (!title) {
      overlay.querySelector('#cm-title')?.focus();
      return;
    }
    const instructions = overlay.querySelector('#cm-instructions')?.value?.trim() || '';
    const questions = [];
    overlay.querySelectorAll('.cm-question').forEach((block, i) => {
      const text = block.querySelector('[data-field="text"]')?.value?.trim();
      const type = block.querySelector('[data-field="type"]')?.value || 'checkbox';
      if (!text) return;
      const q = { id: block.dataset.qid || `q${i + 1}`, text, type, options: [] };
      if (type === 'checkbox') {
        block.querySelectorAll('[data-option]').forEach((inp) => {
          const v = inp.value?.trim();
          if (v) q.options.push(v);
        });
        if (!q.options.length) q.options = ['Opción 1'];
      }
      questions.push(q);
    });
    if (!questions.length) return;

    const id = existing?.id || newCustomModuleId();
    const def = {
      id,
      title,
      instructions,
      questions,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    saveCustomModule(def);
    close();
    onCreated?.({ def, moduleType: customModuleTypeId(id) });
  });

  overlay.querySelector('#cm-title')?.focus();
}
