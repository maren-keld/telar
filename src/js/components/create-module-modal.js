import {
  CUSTOM_ITEM_TYPES,
  isValidItemType,
  itemTypeNeedsOptions,
} from '../custom-module-items.js';
import { customModuleTypeId, newCustomModuleId, saveCustomModule } from '../custom-modules.js';
import { playOverlayOpen, animateAndRemove } from '../transitions.js';
import { buildInteractiveDocument, interactiveModuleUrl } from '../modules/interactive-html.js';
import { getInvoke, isTauriApp, pickCodepenZip } from '../tauri-bridge.js';

function newQuestion(index) {
  return {
    id: `q${index}`,
    text: '',
    type: 'checkbox',
    options: [''],
  };
}

const ITEM_TYPE_OPTIONS = Object.entries(CUSTOM_ITEM_TYPES)
  .map(([value, def]) => `<option value="${value}">${def.label}</option>`)
  .join('');

const ITEM_PLACEHOLDERS = {
  checkbox: 'Pregunta',
  text: 'Pregunta',
  scale: 'Qué se puntúa de 0 a 10',
  task: 'Ejercicio o tarea para entre sesiones',
  info: 'Indicación para el paciente',
};

export function openCreateModuleModal({ onCreated, module: existing } = {}) {
  const isEdit = Boolean(existing?.id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop create-module-overlay';
  overlay.innerHTML = `
    <div class="modal card create-module-modal" role="dialog" aria-labelledby="create-module-title">
      <header class="create-module-modal__head">
        <h2 id="create-module-title">${isEdit ? 'Editar módulo' : 'Nuevo módulo'}</h2>
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
        <div class="cm-tabs" role="tablist">
          <button type="button" class="cm-tab is-active" data-tab="questionnaire" role="tab">Cuestionario</button>
          <button type="button" class="cm-tab" data-tab="interactive" role="tab">Experiencia interactiva</button>
        </div>
        <div data-panel="questionnaire">
          <div id="cm-questions"></div>
          <button type="button" class="btn btn-dashed btn-block" id="cm-add-question">+ Agregar ítem (pregunta, ejercicio o indicación)</button>
        </div>
        <div data-panel="interactive" hidden>
          <p class="cm-interactive__intro">
            Pega acá los tres paneles de tu pen. Telar los junta en un solo archivo y lo corre aislado,
            sin internet: si el pen usa librerías por CDN, hay que pegar su código en el panel de JS.
            Para guardar datos en la ficha del paciente usa <code>Telar.save(datos)</code> y
            <code>Telar.done('resumen')</code>.
          </p>
          <div class="cm-interactive__grid">
            <label class="create-module-field">
              <span class="create-module-field__label">HTML</span>
              <textarea id="cm-html" class="input cm-code" rows="8" spellcheck="false" placeholder="&lt;div class=&quot;escena&quot;&gt;…&lt;/div&gt;"></textarea>
            </label>
            <label class="create-module-field">
              <span class="create-module-field__label">CSS</span>
              <textarea id="cm-css" class="input cm-code" rows="6" spellcheck="false" placeholder=".escena { … }"></textarea>
            </label>
            <label class="create-module-field">
              <span class="create-module-field__label">JS</span>
              <textarea id="cm-js" class="input cm-code" rows="8" spellcheck="false" placeholder="// Telar.save({ paso: 1 })"></textarea>
            </label>
          </div>
          <div class="cm-interactive__preview-head">
            <button type="button" class="btn btn-ghost btn-sm" id="cm-import-zip">Importar .zip de CodePen</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cm-preview">Ver vista previa</button>
            <span class="cm-interactive__note" id="cm-preview-note"></span>
          </div>
          <iframe
            class="cm-interactive__preview"
            id="cm-preview-frame"
            title="Vista previa"
            sandbox="allow-scripts allow-forms"
            referrerpolicy="no-referrer"
            hidden></iframe>
        </div>
      </div>
      <footer class="create-module-modal__foot">
        <button type="button" class="btn btn-ghost" id="cm-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="cm-save">${isEdit ? 'Guardar cambios' : 'Guardar módulo'}</button>
      </footer>
    </div>`;

  document.body.appendChild(overlay);
  playOverlayOpen(overlay);

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
        <select class="input cm-question__type" data-field="type" title="Tipo de ítem">
          ${ITEM_TYPE_OPTIONS}
        </select>
        <button type="button" class="cm-question__remove" title="Eliminar ítem" aria-label="Eliminar ítem">×</button>
      </div>
      <div class="cm-question__options" data-options></div>
      <p class="cm-question__hint" data-hint hidden></p>`;
    questionsEl.appendChild(block);

    const textInput = block.querySelector('[data-field="text"]');
    const typeSel = block.querySelector('[data-field="type"]');
    const optionsWrap = block.querySelector('[data-options]');
    const hintEl = block.querySelector('[data-hint]');
    textInput.value = q.text || '';
    typeSel.value = isValidItemType(q.type) ? q.type : 'checkbox';

    const syncTypeUi = () => {
      const type = typeSel.value;
      textInput.placeholder = ITEM_PLACEHOLDERS[type] || `Pregunta ${questionCount}`;
      if (hintEl) {
        const hints = {
          scale: 'El paciente responde con una escala 0–10 en la sesión.',
          task: 'Aparece como tarea con casilla de «hecho» y espacio para comentar cómo fue.',
          info: 'Solo texto informativo: no pide respuesta.',
        };
        hintEl.textContent = hints[type] || '';
        hintEl.hidden = !hints[type];
      }
    };

    const renderOptions = (seedOptions = null) => {
      if (!itemTypeNeedsOptions(typeSel.value)) {
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

    typeSel.addEventListener('change', () => {
      syncTypeUi();
      renderOptions();
    });
    block.querySelector('.cm-question__remove')?.addEventListener('click', () => {
      block.remove();
      if (!questionsEl.querySelector('.cm-question')) addQuestion();
    });
    syncTypeUi();
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

  /* --- pestañas: cuestionario simple o experiencia interactiva --- */
  let activeTab = existing?.kind === 'interactive' ? 'interactive' : 'questionnaire';

  const setTab = (tab) => {
    activeTab = tab;
    overlay.querySelectorAll('.cm-tab').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    overlay.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  };

  overlay.querySelectorAll('.cm-tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  const htmlEl = overlay.querySelector('#cm-html');
  const cssEl = overlay.querySelector('#cm-css');
  const jsEl = overlay.querySelector('#cm-js');
  if (existing?.kind === 'interactive') {
    htmlEl.value = existing.source?.html ?? existing.html ?? '';
    cssEl.value = existing.source?.css ?? '';
    jsEl.value = existing.source?.js ?? '';
  }
  setTab(activeTab);

  /** Junta los tres paneles en un solo documento, como hace CodePen al exportar. */
  const assembleHtml = () => {
    const css = cssEl.value.trim();
    const js = jsEl.value.trim();
    return [
      css ? `<style>\n${css}\n</style>` : '',
      htmlEl.value.trim(),
      js ? `<script>\n${js}\n</script>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const previewFrame = overlay.querySelector('#cm-preview-frame');
  const previewNote = overlay.querySelector('#cm-preview-note');
  const previewId = `preview-${newCustomModuleId()}`;

  overlay.querySelector('#cm-import-zip')?.addEventListener('click', async () => {
    try {
      const path = await pickCodepenZip();
      if (!path) return;
      const { files } = await getInvoke()('codepen_zip_read', { path });
      const pick = (ext) => Object.entries(files).find(([name]) => name.endsWith(ext))?.[1] || '';
      const html = pick('.html');
      // El index.html del export ya enlaza style.css y script.js: se queda solo el body.
      const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
      htmlEl.value = body.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '').trim();
      cssEl.value = pick('.css').trim();
      jsEl.value = pick('.js').trim();
      const cdn = [...html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
      previewNote.textContent = cdn.length
        ? `Ojo: el pen carga ${cdn[0]} desde internet y acá no hay red. Pega su código en el panel JS.`
        : 'Listo: revisa los tres paneles y guarda.';
    } catch (err) {
      console.error(err);
      previewNote.textContent = err.message || 'No se pudo leer el .zip.';
    }
  });

  overlay.querySelector('#cm-preview')?.addEventListener('click', async () => {
    const assembled = assembleHtml();
    if (!assembled) {
      previewNote.textContent = 'Pega algo de HTML primero.';
      return;
    }
    if (!isTauriApp()) {
      previewNote.textContent = 'La vista previa solo funciona en la app de escritorio.';
      return;
    }
    try {
      const doc = buildInteractiveDocument(assembled, {
        title: overlay.querySelector('#cm-title')?.value?.trim() || 'Vista previa',
        initialData: null,
      });
      await getInvoke()('interactive_module_set', { id: previewId, html: doc });
      previewFrame.hidden = false;
      previewFrame.src = interactiveModuleUrl(previewId);
      previewNote.textContent = '';
    } catch (err) {
      console.error(err);
      previewNote.textContent = 'No se pudo generar la vista previa.';
    }
  });

  const close = () => {
    if (isTauriApp()) {
      try {
        getInvoke()('interactive_module_clear', { id: previewId }).catch(() => {});
      } catch {
        /* la app puede no tener el comando en versiones viejas */
      }
    }
    void animateAndRemove(overlay);
  };

  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('#cm-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#cm-add-question')?.addEventListener('click', () => addQuestion());

  overlay.querySelector('#cm-save')?.addEventListener('click', async () => {
    const title = overlay.querySelector('#cm-title')?.value?.trim();
    if (!title) {
      overlay.querySelector('#cm-title')?.focus();
      return;
    }
    const instructions = overlay.querySelector('#cm-instructions')?.value?.trim() || '';

    if (activeTab === 'interactive') {
      const html = assembleHtml();
      if (!html) {
        htmlEl.focus();
        return;
      }
      const id = existing?.id || newCustomModuleId();
      const def = {
        id,
        kind: 'interactive',
        title,
        instructions,
        html,
        source: { html: htmlEl.value, css: cssEl.value, js: jsEl.value },
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await saveCustomModule(def);
      close();
      onCreated?.({ def, moduleType: customModuleTypeId(id) });
      return;
    }

    const questions = [];
    overlay.querySelectorAll('.cm-question').forEach((block, i) => {
      const text = block.querySelector('[data-field="text"]')?.value?.trim();
      const rawType = block.querySelector('[data-field="type"]')?.value;
      const type = isValidItemType(rawType) ? rawType : 'checkbox';
      if (!text) return;
      const q = { id: block.dataset.qid || `q${i + 1}`, text, type, options: [] };
      if (itemTypeNeedsOptions(type)) {
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
    await saveCustomModule(def);
    close();
    onCreated?.({ def, moduleType: customModuleTypeId(id) });
  });

  overlay.querySelector('#cm-title')?.focus();
}
