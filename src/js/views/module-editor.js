/**
 * Editor de módulos a pantalla completa (no popup).
 * Canvas tipo módulo Telar a la izquierda; riel de tabs a la derecha.
 */
import {
  CUSTOM_ITEM_TYPES,
  isValidItemType,
  itemTypeNeedsOptions,
} from '../custom-module-items.js';
import {
  customModuleTypeId,
  getCustomModule,
  newCustomModuleId,
  saveCustomModule,
} from '../custom-modules.js';
import { cancelChatCompletion, chatCompletion, createAiRequest } from '../ai-client.js';
import { ICON_BACK, ICON_DOWNLOAD, ICON_LINK, ICON_REFRESH, ICON_SEND, ICON_SWAP } from '../icons.js';
import { ensureInteractiveCloseable } from '../interactive-experience.js';
import {
  GROK_REASONING_EFFORT,
  INTERACTIVE_EDIT_SYSTEM,
  QUESTIONNAIRE_EDIT_SYSTEM,
  buildInteractiveEditUserMessage,
  buildQuestionnaireEditUserMessage,
  looksLikeInteractivePrompt,
  moduleAiPurpose,
  shouldUseGrokForModule,
} from '../module-ai-route.js';
import {
  AUDIENCE_OPTIONS,
  EDITOR_CATEGORIES,
  EDITOR_KINDS,
  EDITOR_WHERES,
  buildCustomModuleRecord,
  canSwitchModuleKind,
  collectQuestionsFrom,
  parseAiModuleReply,
  rememberPendingCustomModuleType,
} from '../module-editor-model.js';
import { enablePointerSortable } from '../pointer-sortable.js';
import { buildInteractiveDocument, interactiveModuleUrl } from '../modules/interactive-html.js';
import { loadProfile } from '../profile.js';
import { getInvoke, isTauriApp, pickCodepenZip, pickPdfFile } from '../tauri-bridge.js';
import { ditherOrbMarkup, mountDitherOrb } from '../dither-orb.js';
import { escapeHtml, toast } from '../utils.js';

const ITEM_TYPE_OPTIONS = Object.entries(CUSTOM_ITEM_TYPES)
  .map(([value, def]) => `<option value="${value}">${def.label}</option>`)
  .join('');

const ITEM_PLACEHOLDERS = {
  radio: 'Pregunta (una sola respuesta)',
  checkbox: 'Pregunta (varias respuestas)',
  text: 'Pregunta',
  scale: 'Qué se puntúa de 0 a 10',
  task: 'Describe el ejercicio o la tarea para entre sesiones',
  info: 'Indicación para el paciente',
};

const DUAL_SYSTEM = `Eres un asistente que crea módulos clínicos para Telar, en español de Chile.

Devuelves EXACTAMENTE UN bloque de código y nada de texto fuera de él, salvo una frase corta.

Elige la opción que mejor calce con lo que pide el terapeuta.

Opción A — cuestionario. Bloque \`\`\`json con esta forma:
{
  "questions": [
    { "text": "Enunciado", "type": "text" },
    { "text": "Elige una", "type": "radio", "options": ["Nunca", "A veces", "Siempre"] },
    { "text": "Marca las que apliquen", "type": "checkbox", "options": ["A", "B"] },
    { "text": "Del 0 al 10, intensidad", "type": "scale" },
    { "text": "Ejercicio o tarea", "type": "task" },
    { "text": "Indicación para el paciente", "type": "info" }
  ]
}
Tipos válidos: text, radio (opción única, con options), checkbox (opción múltiple, con options), scale (0–10), task, info.

Opción B — experiencia interactiva. Bloque \`\`\`html con un FRAGMENTO compacto: <style>, markup y <script> al final. Sin <!doctype>, sin <html>, sin <head> y sin <body>. Cierra <style> y <script>. Sin CDN ni fetch. CSS mínimo.
Viewport: vive DENTRO de un módulo Telar (~680×360), centrada como tarjeta. No uses 100vh, 100vw ni height:100% en el root.
Navegación: NUNCA uses <form> para pasar de paso. Siguiente / Atrás / Comenzar: type="button". Un paso a la vez. En el último: Telar.save(datos) y Telar.done('resumen breve').

El título del módulo Telar lo pone el terapeuta: no lo reescribas ni pongas un H1 enorme con el nombre del módulo.
Si piden un cambio, reescribe el bloque completo ya corregido.`;

const INTERACTIVE_ONLY_SYSTEM = `Crea o corrige una experiencia interactiva clínica para Telar, en español de Chile.

Devuelve SOLO un bloque \`\`\`html\`\`\` con un FRAGMENTO compacto: <style>, markup y <script> al final. Sin <!doctype>, sin <html>, sin <head> y sin <body>. Cierra <style> y <script>. Nada fuera del bloque. Sin CDN ni fetch. CSS mínimo, sin comentarios.

Viewport: la experiencia vive DENTRO de un módulo Telar estándar (~680×360). Va CENTRADA en ese recuadro, como una tarjeta, no estirada a los lados ni hasta abajo. No uses 100vh, 100vw ni height:100% en el root. Un bloque compacto en el medio. El título del módulo Telar lo pone el terapeuta: no lo reescribas ni pongas un H1 enorme con el nombre del módulo.

Navegación:
- NUNCA uses <form> para pasar de un paso a otro. Siguiente / Atrás / Comenzar: type="button".
- Un paso a la vez (.step o [data-step]). No recargues la página.
- En el último paso: Telar.save(datos) y Telar.done('resumen breve').

Si piden un color de fondo, ponlo en html y body (o un wrapper a 100%) para que se vea en la vista previa del editor, no solo en una tarjeta chica.

Este módulo YA es una experiencia interactiva: no devuelvas un cuestionario JSON.`;

function newQuestion(index) {
  return { id: `q${index}`, text: '', type: 'checkbox', options: [''] };
}

function fileNameFromPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  return decodeURIComponent(p.split('/').pop() || 'archivo.pdf');
}

function selectField(id, label, options, selected) {
  return `<label class="create-module-field">
    <span class="create-module-field__label">${escapeHtml(label)}</span>
    <select class="input" id="${escapeHtml(id)}">
      ${options
        .map((opt) => {
          const isSel = opt.id === selected ? ' selected' : '';
          return `<option value="${escapeHtml(opt.id)}"${isSel}>${escapeHtml(opt.label)}</option>`;
        })
        .join('')}
    </select>
  </label>`;
}

export async function renderModuleEditor(container, {
  customModuleId = '',
  returnView = 'modules',
  treatmentId = '',
  sessionId = '',
  moduleId = '',
  onNavigate,
} = {}) {
  const existing = customModuleId ? getCustomModule(customModuleId) : null;
  const isEdit = Boolean(existing?.id);
  const draftId = existing?.id || newCustomModuleId();
  const profile = loadProfile();
  const initialKind = existing?.kind === 'interactive' ? 'interactive' : 'questionnaire';
  const initialCategory = existing?.category && existing.category !== 'custom' ? existing.category : 'tcc';
  const initialAudience = existing?.audience || 'todas';
  const initialWhere = existing?.where || 'entre_sesiones';

  container.innerHTML = `
    <div class="module-editor">
      <header class="module-editor__bar">
        <button type="button" class="module-editor__back" id="cm-back" aria-label="Volver">${ICON_BACK} Atrás</button>
        <p class="module-editor__status" id="cm-save-status" hidden></p>
      </header>
      <div class="module-editor__stage">
        <div class="module-editor__canvas">
          <article class="card module-editor__module${initialKind === 'questionnaire' ? ' is-questionnaire' : ''}">
            <div class="module-card-head">
              <div>
                <input type="text" class="module-editor__title" id="cm-title" placeholder="Nombre del módulo" value="${escapeHtml(existing?.title || '')}" />
                <p class="module-card-head__sub" id="cm-instructions-live"${existing?.instructions ? '' : ' hidden'}>${escapeHtml(existing?.instructions || '')}</p>
              </div>
              <div class="module-card-actions botonera-modules module-editor__sim" aria-hidden="true">
                <button type="button" class="module-print-btn" disabled tabindex="-1" title="Enviar al paciente por enlace">${ICON_LINK}</button>
                <button type="button" class="module-print-btn" disabled tabindex="-1" title="Descargar PDF del módulo">${ICON_DOWNLOAD}</button>
                <button type="button" class="module-print-btn" disabled tabindex="-1" title="Cambiar módulo">${ICON_SWAP}</button>
                <button type="button" class="module-delete-btn" disabled tabindex="-1" title="Eliminar módulo">×</button>
              </div>
            </div>
            <div class="module-editor__body" data-kind="${initialKind}">
              <div id="cm-questions-panel" ${initialKind === 'interactive' ? 'hidden' : ''}>
                <div id="cm-questions"></div>
                <button type="button" class="btn btn-dashed btn-block" id="cm-add-question">+ Agregar ítem (pregunta, ejercicio o indicación)</button>
              </div>
              <div class="module-editor__interactive" id="cm-interactive-panel" ${initialKind === 'questionnaire' ? 'hidden' : ''}>
                <div class="interactive-module__frame-wrap module-editor__preview-wrap">
                  <button type="button" class="interactive-module__reload" id="cm-reload-preview" hidden title="Recargar" aria-label="Recargar">${ICON_REFRESH}</button>
                  <iframe class="interactive-module__frame" id="cm-preview-frame" title="Vista previa" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" hidden></iframe>
                  <p class="module-editor__empty" id="cm-interactive-empty">La experiencia aparece acá adentro, al tamaño de un módulo Telar. Pídela en el chat.</p>
                </div>
              </div>
            </div>
          </article>
        </div>
        <aside class="module-editor__rail">
          <div class="module-editor__tabs" role="tablist">
            <button type="button" class="module-editor__tab is-active" data-rail="chat" role="tab">Asistente</button>
            <button type="button" class="module-editor__tab" data-rail="general" role="tab">General</button>
            <button type="button" class="module-editor__tab" data-rail="otros" role="tab">Otros</button>
          </div>
          <div class="module-editor__panels">
            <section data-rail-panel="chat">
              <div class="cm-interactive-chat module-editor__chat">
                <div class="cm-interactive-chat__log" id="cm-interactive-log" aria-live="polite">
                  <div class="module-editor__chat-empty" id="cm-chat-empty">
                    ${ditherOrbMarkup({ coreId: 'cm-chat-empty-orb', title: 'comienza a construir tus módulos con ia' })}
                  </div>
                </div>
                <form class="cm-interactive-chat__form" id="cm-interactive-form">
                  <div class="cm-interactive-chat__compose">
                    <textarea class="input" id="cm-interactive-prompt" rows="2" placeholder="Ej.: un registro de ánimo, o una tarjeta de respiración con cuatro pasos."></textarea>
                    <p class="cm-interactive-chat__thinking" id="cm-interactive-thinking" hidden aria-live="polite">
                      <span class="cm-interactive-chat__thinking-orb" id="cm-interactive-thinking-orb"></span>
                      <span class="cm-interactive-chat__thinking-label t-shimmer" id="cm-interactive-thinking-label" data-text="Pensando...">Pensando...</span>
                    </p>
                    <button type="submit" class="cm-interactive-chat__send" id="cm-interactive-submit" title="Enviar" aria-label="Enviar">
                      <span class="cm-interactive-chat__arrow-wrap">${ICON_SEND}</span>
                      <span class="cm-interactive-chat__stop-wrap" hidden><span class="cm-interactive-chat__stop"></span></span>
                    </button>
                  </div>
                </form>
              </div>
            </section>
            <section data-rail-panel="general" hidden>
              ${selectField('cm-kind', 'Tipo', EDITOR_KINDS, initialKind)}
              <label class="create-module-field">
                <span class="create-module-field__label">Descripción</span>
                <textarea class="input" id="cm-description" rows="6" placeholder="Qué hace este módulo, en una o dos frases.">${escapeHtml(existing?.description || '')}</textarea>
              </label>
              <label class="create-module-field">
                <span class="create-module-field__label">Autor</span>
                <input type="text" class="input" id="cm-author" placeholder="Quién lo escribió" value="${escapeHtml(existing?.author || profile.name || '')}" />
              </label>
              <label class="create-module-field">
                <span class="create-module-field__label">Indicaciones</span>
                <input type="text" class="input" id="cm-instructions" placeholder="Texto que lee el paciente bajo el título" value="${escapeHtml(existing?.instructions || '')}" />
              </label>
              ${selectField('cm-category', 'Función en la hora', EDITOR_CATEGORIES, initialCategory)}
              ${selectField('cm-audience', 'Edad', AUDIENCE_OPTIONS, initialAudience)}
              ${selectField('cm-where', 'Dónde ocurre', EDITOR_WHERES, initialWhere)}
            </section>
            <section data-rail-panel="otros" hidden>
              <p class="module-editor__otros-lead">Importar un CodePen o adjuntar un PDF para imprimir.</p>
              <button type="button" class="btn btn-secondary btn-block" id="cm-import-zip">Importar .zip de CodePen</button>
              <button type="button" class="btn btn-secondary btn-block" id="cm-attach-pdf">Adjuntar PDF imprimible</button>
              <p class="module-editor__pdf" id="cm-pdf-status">${
                existing?.pdfName
                  ? `PDF: ${escapeHtml(existing.pdfName)} <button type="button" class="btn btn-ghost btn-sm" id="cm-pdf-remove">Quitar</button>`
                  : 'Sin PDF adjunto.'
              }</p>
            </section>
          </div>
        </aside>
      </div>
    </div>`;

  const root = container.querySelector('.module-editor');
  const questionsEl = root.querySelector('#cm-questions');
  const previewFrame = root.querySelector('#cm-preview-frame');
  const reloadPreviewBtn = root.querySelector('#cm-reload-preview');
  const emptyEl = root.querySelector('#cm-interactive-empty');
  const chatEmptyEl = root.querySelector('#cm-chat-empty');
  const chatEmptyOrb = root.querySelector('#cm-chat-empty-orb');
  const interactiveLog = root.querySelector('#cm-interactive-log');
  const promptEl = root.querySelector('#cm-interactive-prompt');
  const thinkingEl = root.querySelector('#cm-interactive-thinking');
  const thinkingLabel = root.querySelector('#cm-interactive-thinking-label');
  const thinkingOrb = root.querySelector('#cm-interactive-thinking-orb');
  const submitBtn = root.querySelector('#cm-interactive-submit');
  const sendArrow = submitBtn?.querySelector('.cm-interactive-chat__arrow-wrap');
  const sendStop = submitBtn?.querySelector('.cm-interactive-chat__stop-wrap');
  const statusEl = root.querySelector('#cm-save-status');
  const pdfStatus = root.querySelector('#cm-pdf-status');

  let kind = initialKind;
  let interactiveHtml = existing?.kind === 'interactive' ? existing.html || '' : '';
  let pdfName = existing?.pdfName || '';
  let pdfPath = existing?.pdfPath || '';
  let questionCount = 0;
  const previewId = `preview-${draftId}`;
  let previewRev = 0;
  let interactiveRequest = null;
  let stopEmptyOrb = () => {};
  let interactiveChatLocked = false;
  const kindSelect = root.querySelector('#cm-kind');

  const hideChatEmpty = () => {
    if (chatEmptyEl) chatEmptyEl.hidden = true;
    stopEmptyOrb();
    stopEmptyOrb = () => {};
  };

  const syncKindLockUi = () => {
    const qOpt = kindSelect?.querySelector('option[value="questionnaire"]');
    if (qOpt) qOpt.disabled = interactiveChatLocked;
    if (kindSelect) {
      kindSelect.title = interactiveChatLocked
        ? 'Ya hablaste con la IA en modo experiencia interactiva; no se puede cambiar a cuestionario.'
        : '';
    }
  };

  const lockInteractiveKind = () => {
    interactiveChatLocked = true;
    syncKindLockUi();
  };

  const setKind = (next, { fromUser = false } = {}) => {
    const want = next === 'interactive' ? 'interactive' : 'questionnaire';
    if (fromUser && !canSwitchModuleKind(want, { interactiveChatLocked })) {
      if (kindSelect) kindSelect.value = 'interactive';
      toast('Este módulo ya es una experiencia interactiva. No se puede pasar a cuestionario.');
      return;
    }
    kind = want;
    if (kindSelect) kindSelect.value = kind;
    root.querySelector('#cm-questions-panel').hidden = kind !== 'questionnaire';
    root.querySelector('#cm-interactive-panel').hidden = kind !== 'interactive';
    const bodyEl = root.querySelector('.module-editor__body');
    if (bodyEl) bodyEl.dataset.kind = kind;
    root.querySelector('.module-editor__module')?.classList.toggle('is-questionnaire', kind === 'questionnaire');
    syncKindLockUi();
  };

  const setRail = (id) => {
    root.querySelectorAll('[data-rail]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.rail === id);
    });
    root.querySelectorAll('[data-rail-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.railPanel !== id;
    });
  };

  const renderPdfStatus = () => {
    if (!pdfStatus) return;
    if (!pdfName) {
      pdfStatus.innerHTML = 'Sin PDF adjunto.';
      return;
    }
    pdfStatus.innerHTML = `PDF: ${escapeHtml(pdfName)} <button type="button" class="btn btn-ghost btn-sm" id="cm-pdf-remove">Quitar</button>`;
    pdfStatus.querySelector('#cm-pdf-remove')?.addEventListener('click', () => {
      pdfName = '';
      pdfPath = '';
      renderPdfStatus();
    });
  };

  const addQuestion = (initial = null) => {
    questionCount += 1;
    const q = initial || newQuestion(questionCount);
    const block = document.createElement('div');
    block.className = 'cm-question';
    block.dataset.qid = q.id || `q${questionCount}`;
    block.innerHTML = `
      <div class="cm-question__toolbar">
        <span class="cm-question__drag" title="Arrastrar para reordenar" aria-hidden="true">⠿</span>
        <select class="input cm-question__type" data-field="type" title="Tipo de ítem">${ITEM_TYPE_OPTIONS}</select>
        <button type="button" class="cm-question__remove" title="Eliminar ítem" aria-label="Eliminar ítem">×</button>
      </div>
      <textarea class="input cm-question__text" rows="2" placeholder="Pregunta ${questionCount}" data-field="text"></textarea>
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
      textInput.rows = type === 'task' || type === 'info' ? 4 : 2;
      const hints = {
        radio: 'El paciente elige una sola opción.',
        checkbox: 'El paciente puede marcar varias opciones.',
        scale: 'El paciente responde con una escala 0–10 en la sesión.',
        task: 'Escribe acá el ejercicio. En sesión aparece con casilla de «hecho» y un comentario.',
        info: 'Solo texto informativo: no pide respuesta.',
      };
      hintEl.textContent = hints[type] || '';
      hintEl.hidden = !hints[type];
    };

    const renderOptions = (seedOptions = null) => {
      if (!itemTypeNeedsOptions(typeSel.value)) {
        optionsWrap.innerHTML = '';
        optionsWrap.hidden = true;
        return;
      }
      optionsWrap.hidden = false;
      const mark = typeSel.value === 'radio' ? '○' : '☐';
      optionsWrap.innerHTML = `
        <div class="cm-options-list"></div>
        <button type="button" class="btn btn-ghost btn-sm cm-add-option">+ Añadir opción</button>`;
      const list = optionsWrap.querySelector('.cm-options-list');
      const addOpt = (value = '') => {
        const row = document.createElement('div');
        row.className = 'cm-option-row';
        row.innerHTML = `
          <span class="cm-option-drag" title="Arrastrar" aria-hidden="true">⠿</span>
          <span class="cm-option-check" aria-hidden="true">${mark}</span>
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
      enablePointerSortable(list, '.cm-option-row', '.cm-option-drag');
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
    renderOptions(itemTypeNeedsOptions(q.type) ? q.options : null);
  };

  const applyQuestions = (questions) => {
    questionsEl.innerHTML = '';
    questionCount = 0;
    questions.forEach((q) => addQuestion(q));
    if (!questionsEl.querySelector('.cm-question')) addQuestion();
  };

  if (isEdit && existing.questions?.length) {
    existing.questions.forEach((q) => addQuestion(q));
  } else {
    addQuestion();
  }
  enablePointerSortable(questionsEl, '.cm-question', '.cm-question__drag');

  const appendInteractiveMessage = (role, text) => {
    hideChatEmpty();
    const line = document.createElement('p');
    line.className = `cm-interactive-chat__message cm-interactive-chat__message--${role}`;
    line.textContent = text;
    interactiveLog.appendChild(line);
    interactiveLog.scrollTop = interactiveLog.scrollHeight;
  };

  const renderInteractivePreview = async () => {
    if (!interactiveHtml) {
      if (previewFrame) previewFrame.hidden = true;
      if (reloadPreviewBtn) reloadPreviewBtn.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    previewFrame.hidden = false;
    if (reloadPreviewBtn) reloadPreviewBtn.hidden = false;
    const doc = buildInteractiveDocument(interactiveHtml, {
      title: root.querySelector('#cm-title')?.value?.trim() || 'Experiencia interactiva',
      initialData: null,
    });
    if (!isTauriApp()) {
      previewFrame.srcdoc = doc;
      return;
    }
    await getInvoke()('interactive_module_set', { id: previewId, html: doc });
    previewRev += 1;
    previewFrame.src = `${interactiveModuleUrl(previewId)}?r=${previewRev}`;
  };

  const collectRecord = () => {
    const title = root.querySelector('#cm-title')?.value?.trim() || '';
    return buildCustomModuleRecord({
      existing: existing || { id: draftId, createdAt: new Date().toISOString() },
      id: draftId,
      kind,
      title,
      description: root.querySelector('#cm-description')?.value || '',
      author: root.querySelector('#cm-author')?.value || '',
      instructions: root.querySelector('#cm-instructions')?.value || '',
      category: root.querySelector('#cm-category')?.value || '',
      audience: root.querySelector('#cm-audience')?.value || '',
      where: root.querySelector('#cm-where')?.value || '',
      html: interactiveHtml,
      questions: collectQuestionsFrom(root),
      pdfName,
      pdfPath,
    });
  };

  const persist = async ({ quiet = false } = {}) => {
    const record = collectRecord();
    if (!record.title) return null;
    if (kind === 'interactive') {
      if (!interactiveHtml) return null;
      record.html = ensureInteractiveCloseable(interactiveHtml);
    } else if (!record.questions.length) {
      return null;
    }
    await saveCustomModule(record);
    if (returnView === 'workspace') {
      rememberPendingCustomModuleType(customModuleTypeId(record.id));
    }
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'Guardado';
    }
    if (!quiet) toast('Módulo guardado');
    return record;
  };

  const goBack = async () => {
    abortInteractive();
    hideChatEmpty();
    const record = collectRecord();
    const hasContent = kind === 'interactive' ? Boolean(interactiveHtml) : record.questions.length;
    if (!record.title && hasContent) {
      toast('Ponle un nombre al módulo para guardarlo.');
      root.querySelector('#cm-title')?.focus();
      return;
    }
    if (record.title) await persist({ quiet: true });
    if (isTauriApp()) {
      getInvoke()('interactive_module_clear', { id: previewId }).catch(() => {});
    }
    const view = returnView === 'workspace' ? 'workspace' : 'modules';
    onNavigate({
      view,
      customModuleId: '',
      returnView: '',
      treatmentId: view === 'workspace' ? treatmentId : '',
      sessionId: view === 'workspace' ? sessionId : '',
      moduleId: view === 'workspace' ? moduleId : '',
    });
  };

  const thinkingCopy = (seconds, tick) => {
    const dots = '.'.repeat((tick % 3) + 1);
    if (seconds >= 20) return `Sigue generando (${seconds}s)${dots}`;
    if (seconds < 1) return `Pensando${dots}`;
    return seconds === 1 ? `Pensando por 1 segundo${dots}` : `Pensando por ${seconds} segundos${dots}`;
  };

  let thinkingTimer = null;
  let stopThinkOrb = () => {};

  const setThinking = (on) => {
    if (thinkingEl) thinkingEl.hidden = !on;
    if (promptEl) promptEl.hidden = on;
    submitBtn?.classList.toggle('cm-interactive-chat__send--stop', on);
    if (sendArrow) sendArrow.hidden = on;
    if (sendStop) sendStop.hidden = !on;
    if (submitBtn) {
      const label = on ? 'Detener' : 'Enviar';
      submitBtn.title = label;
      submitBtn.setAttribute('aria-label', label);
    }
    if (on) {
      if (kind === 'interactive') {
        if (previewFrame) previewFrame.hidden = true;
        if (reloadPreviewBtn) reloadPreviewBtn.hidden = true;
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = 'Generando la experiencia en este módulo…';
        }
      }
    } else if (!interactiveHtml && emptyEl) {
      emptyEl.textContent = 'La experiencia aparece acá adentro, al tamaño de un módulo Telar. Pídela en el chat.';
    }
  };

  const startThinking = () => {
    const started = Date.now();
    let tick = 0;
    if (thinkingLabel) {
      thinkingLabel.textContent = thinkingCopy(0, 0);
      thinkingLabel.dataset.text = thinkingLabel.textContent;
    }
    setThinking(true);
    stopThinkOrb();
    void import('../thinking-orb.js')
      .then(({ mountThinkingOrb }) => {
        if (!thinkingTimer) return;
        stopThinkOrb();
        stopThinkOrb = mountThinkingOrb(thinkingOrb, { state: 'composing', size: 22 });
      })
      .catch(() => {});
    thinkingTimer = setInterval(() => {
      tick += 1;
      const secs = Math.floor((Date.now() - started) / 1000);
      if (thinkingLabel) {
        thinkingLabel.textContent = thinkingCopy(secs, tick);
        thinkingLabel.dataset.text = thinkingLabel.textContent;
      }
    }, 400);
  };

  const stopThinking = () => {
    if (thinkingTimer) {
      clearInterval(thinkingTimer);
      thinkingTimer = null;
    }
    stopThinkOrb();
    stopThinkOrb = () => {};
    setThinking(false);
  };

  const abortInteractive = () => {
    if (!interactiveRequest) return;
    const request = interactiveRequest;
    request.aborted = true;
    interactiveRequest = null;
    stopThinking();
    void cancelChatCompletion(request);
  };

  const messagesForTurn = (prompt) => {
    if (interactiveHtml) {
      return [
        { role: 'system', content: INTERACTIVE_EDIT_SYSTEM },
        { role: 'user', content: buildInteractiveEditUserMessage(prompt, interactiveHtml) },
      ];
    }
    if (interactiveChatLocked || kind === 'interactive') {
      return [
        { role: 'system', content: INTERACTIVE_ONLY_SYSTEM },
        { role: 'user', content: prompt },
      ];
    }
    const currentQs = collectQuestionsFrom(root);
    if (currentQs.length) {
      return [
        { role: 'system', content: QUESTIONNAIRE_EDIT_SYSTEM },
        { role: 'user', content: buildQuestionnaireEditUserMessage(prompt, currentQs) },
      ];
    }
    if (looksLikeInteractivePrompt(prompt)) {
      return [
        { role: 'system', content: INTERACTIVE_ONLY_SYSTEM },
        { role: 'user', content: prompt },
      ];
    }
    return [
      { role: 'system', content: DUAL_SYSTEM },
      { role: 'user', content: prompt },
    ];
  };

  root.querySelectorAll('[data-rail]').forEach((btn) => {
    btn.addEventListener('click', () => setRail(btn.dataset.rail));
  });
  kindSelect?.addEventListener('change', () => setKind(kindSelect.value, { fromUser: true }));
  root.querySelector('#cm-add-question')?.addEventListener('click', () => addQuestion());
  root.querySelector('#cm-back')?.addEventListener('click', () => void goBack());
  reloadPreviewBtn?.addEventListener('click', () => void renderInteractivePreview());
  root.querySelector('#cm-instructions')?.addEventListener('input', () => {
    const live = root.querySelector('#cm-instructions-live');
    const text = root.querySelector('#cm-instructions')?.value?.trim() || '';
    if (!live) return;
    live.textContent = text;
    live.hidden = !text;
  });

  root.querySelector('#cm-import-zip')?.addEventListener('click', async () => {
    try {
      const path = await pickCodepenZip();
      if (!path) return;
      const { files } = await getInvoke()('codepen_zip_read', { path });
      const pick = (ext) => Object.entries(files).find(([name]) => name.endsWith(ext))?.[1] || '';
      const html = pick('.html');
      const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
      const css = pick('.css').trim();
      const js = pick('.js').trim();
      interactiveHtml = ensureInteractiveCloseable(
        [css ? `<style>${css}</style>` : '', body, js ? `<script>${js}</script>` : ''].filter(Boolean).join('\n'),
      );
      setKind('interactive');
      lockInteractiveKind();
      setRail('chat');
      await renderInteractivePreview();
      await persist({ quiet: true });
      toast('Experiencia importada');
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo leer el .zip.');
    }
  });

  root.querySelector('#cm-attach-pdf')?.addEventListener('click', async () => {
    try {
      const path = await pickPdfFile();
      if (!path) return;
      pdfPath = path;
      pdfName = fileNameFromPath(path);
      renderPdfStatus();
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo adjuntar el PDF.');
    }
  });

  promptEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    root.querySelector('#cm-interactive-form')?.requestSubmit();
  });

  root.querySelector('#cm-interactive-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (interactiveRequest) {
      abortInteractive();
      return;
    }
    const prompt = promptEl?.value?.trim();
    if (!prompt) return;
    if (kind === 'interactive') lockInteractiveKind();
    const iterating = Boolean(interactiveHtml);
    appendInteractiveMessage('user', prompt);
    promptEl.value = '';
    startThinking();
    const current = createAiRequest();
    interactiveRequest = current;
    try {
      const preferInteractive = interactiveChatLocked || kind === 'interactive' || looksLikeInteractivePrompt(prompt);
      const useGrok = shouldUseGrokForModule();
      const { text } = await chatCompletion({
        request: current,
        maxTokens: 4000,
        purpose: moduleAiPurpose(),
        reasoningEffort: useGrok ? GROK_REASONING_EFFORT : undefined,
        messages: messagesForTurn(prompt),
      });
      if (current.aborted) return;
      const parsed = parseAiModuleReply(text, { preferInteractive });
      if (!parsed) throw new Error('La IA no devolvió un módulo válido. Intenta describirlo de otra forma.');
      if (parsed.kind === 'interactive') {
        setKind('interactive');
        lockInteractiveKind();
        interactiveHtml = ensureInteractiveCloseable(parsed.html);
        appendInteractiveMessage(
          'assistant',
          iterating ? 'Listo. Actualicé la experiencia.' : 'Listo. Preparé una experiencia para revisar.',
        );
        if (promptEl) promptEl.placeholder = 'Pide un cambio: el botón Siguiente, otro paso, el tono…';
        await renderInteractivePreview();
      } else {
        setKind('questionnaire');
        interactiveHtml = '';
        applyQuestions(parsed.questions);
        appendInteractiveMessage(
          'assistant',
          `Listo. Armé ${parsed.questions.length} ${parsed.questions.length === 1 ? 'ítem' : 'ítems'} para revisar.`,
        );
        if (promptEl) promptEl.placeholder = 'Pide un cambio: otro ítem, el tipo de respuesta, el tono…';
      }
      await persist({ quiet: true });
    } catch (err) {
      if (current.aborted || /cancelado/i.test(err?.message || '')) return;
      console.error(err);
      appendInteractiveMessage('assistant', err.message || 'No se pudo crear la experiencia.');
    } finally {
      if (interactiveRequest === current) {
        interactiveRequest = null;
        stopThinking();
      }
    }
  });

  renderPdfStatus();
  if (interactiveHtml) {
    lockInteractiveKind();
    void renderInteractivePreview();
  }
  if (chatEmptyEl && !chatEmptyEl.hidden) {
    stopEmptyOrb = mountDitherOrb(chatEmptyOrb, { size: 108 });
  }
  promptEl?.focus();
}

/** Compat: el selector y la librería navegan al editor. */
export function openCreateModuleModal({
  onNavigate,
  module,
  returnView = 'modules',
  treatmentId = '',
  sessionId = '',
  moduleId = '',
} = {}) {
  if (!onNavigate) {
    throw new Error('El editor de módulos necesita onNavigate.');
  }
  onNavigate({
    view: 'module-editor',
    customModuleId: module?.id || '',
    returnView,
    treatmentId,
    sessionId,
    moduleId,
  });
}
