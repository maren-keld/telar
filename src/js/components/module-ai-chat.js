/**
 * «Crear con IA»: chat que produce un módulo listo para la librería, sea un
 * cuestionario declarativo (schema 1) o una experiencia interactiva en HTML.
 *
 * No se envía nada de ninguna ficha: solo lo que el terapeuta escribe acá. Por
 * eso no pide el consentimiento de transferencia clínica.
 */
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  questionnaireItems,
  questionnaireMax,
  validateQuestionnaire,
} from '../../lib/questionnaire-schema.js';
import { cancelChatCompletion, chatCompletion, createAiRequest } from '../ai-client.js';
import { customModuleTypeId, newCustomModuleId, saveCustomModule } from '../custom-modules.js';
import { buildInteractiveDocument, interactiveModuleUrl } from '../modules/interactive-html.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';
import { animateAndRemove, playOverlayOpen } from '../transitions.js';
import { escapeHtml, toast } from '../utils.js';

const SYSTEM_PROMPT = `Eres un asistente que crea módulos clínicos para Telar, una app de psicología clínica en español de Chile.

Devuelves EXACTAMENTE UN bloque de código y nada de texto fuera de él, salvo una frase corta de introducción.

Opción A — cuestionario. Bloque \`\`\`json con esta forma (schema ${QUESTIONNAIRE_SCHEMA_VERSION}):
{
  "schema": ${QUESTIONNAIRE_SCHEMA_VERSION},
  "id": "slug-corto",
  "title": "Título del cuestionario",
  "subtitle": "N ítems · escala 0–3 · ventana temporal",
  "instructions": "Enunciado que lee el paciente",
  "lang": "es",
  "items": [{ "text": "Ítem 1" }, { "text": "Ítem inverso", "reverse": true }],
  "options": [{ "v": 0, "label": "Nunca" }, { "v": 3, "label": "Siempre" }],
  "scoring": {
    "kind": "sum",
    "reverseMax": 3,
    "bands": [{ "max": 5, "label": "Bajo", "cls": "ok", "text": "Interpretación" }],
    "cutoff": { "value": 6, "label": "Punto de corte" },
    "subscales": [{ "id": "a", "label": "Subescala A", "items": [0, 1] }]
  },
  "attribution": { "authors": "Quién lo escribió", "license": "Uso clínico" }
}
Reglas: "kind" puede ser "sum", "mean" o "count-threshold"; con "count-threshold" hace falta "itemThresholds" con un umbral por ítem ({"gte":2} o {"lte":1}). Si hay ítems con "reverse" es obligatorio "scoring.reverseMax". Los índices de "subscales" e "items" son base 0. Un ítem puede ser deslizador: { "text": "...", "kind": "slider", "min": 0, "max": 10 }.
No copies escalas con copyright (PHQ-9, GAD-7, AQ, RAADS y similares): esas ya vienen en Telar o requieren licencia.

Opción B — experiencia interactiva. Bloque \`\`\`html con un fragmento autocontenido (puedes usar <style> y <script> inline). No hay internet dentro del módulo: nada de CDN, fuentes remotas ni fetch. Para guardar en la ficha del paciente usa el puente que Telar inyecta:
  Telar.load()            → datos guardados antes, o null
  Telar.save(datos)       → guarda progreso
  Telar.done('resumen')   → marca completado con un resumen de texto
  Telar.resize(altura)    → ajusta la altura visible

Elige la opción que mejor calce con lo que pide el terapeuta. Escribe todo en español de Chile, en segunda persona y sin tecnicismos innecesarios.`;

function extractBlock(text) {
  const json = text.match(/```json\s*([\s\S]*?)```/i);
  if (json) return { kind: 'questionnaire', code: json[1].trim() };
  const html = text.match(/```html\s*([\s\S]*?)```/i);
  if (html) return { kind: 'interactive', code: html[1].trim() };
  const any = text.match(/```\s*([\s\S]*?)```/);
  if (any) {
    const code = any[1].trim();
    return { kind: code.startsWith('{') ? 'questionnaire' : 'interactive', code };
  }
  return null;
}

function questionnairePreviewHtml(def) {
  const items = questionnaireItems(def);
  const shown = items.slice(0, 6);
  const opts = (def.options || []).map((o) => o.label).join(' · ');
  return `
    <h4 class="ai-module__preview-title">${escapeHtml(def.title || 'Cuestionario')}</h4>
    <p class="ai-module__preview-meta">${items.length} ${items.length === 1 ? 'ítem' : 'ítems'} · puntaje máximo ${questionnaireMax(def)}${
      def.scoring?.cutoff?.value ? ` · corte ≥${def.scoring.cutoff.value}` : ''
    }</p>
    ${opts ? `<p class="ai-module__preview-meta">Opciones: ${escapeHtml(opts)}</p>` : ''}
    <ol class="ai-module__preview-items">
      ${shown.map((it) => `<li>${escapeHtml(it.text)}${it.reverse ? ' <em>(inverso)</em>' : ''}</li>`).join('')}
    </ol>
    ${items.length > shown.length ? `<p class="ai-module__preview-meta">…y ${items.length - shown.length} más.</p>` : ''}`;
}

export function openModuleAiChat({ onCreated } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop ai-module-overlay';
  overlay.innerHTML = `
    <div class="modal card ai-module-modal" role="dialog" aria-labelledby="ai-module-title">
      <header class="create-module-modal__head">
        <h2 id="ai-module-title">Crear módulo con IA</h2>
        <button type="button" class="modal-close" aria-label="Cerrar">×</button>
      </header>
      <div class="ai-module-modal__body">
        <p class="ai-module__intro">
          Describe el módulo que necesitas. Puede ser un cuestionario con puntaje o una experiencia
          interactiva para enviarle al paciente. Solo se manda a la IA lo que escribas acá: ninguna
          ficha ni dato de paciente.
        </p>
        <div class="ai-module__log" id="ai-module-log" aria-live="polite"></div>
        <div class="ai-module__preview" id="ai-module-preview" hidden></div>
        <label class="create-module-field">
          <span class="create-module-field__label">Qué necesitas</span>
          <textarea id="ai-module-prompt" class="input" rows="3" placeholder="Ej. un registro semanal de sobrecarga sensorial, 8 ítems de 0 a 4, con subescalas de ruido y luz"></textarea>
        </label>
      </div>
      <footer class="create-module-modal__foot">
        <button type="button" class="btn btn-ghost" id="ai-module-cancel">Cerrar</button>
        <button type="button" class="btn btn-secondary" id="ai-module-save" disabled>Guardar en librería</button>
        <button type="button" class="btn btn-primary" id="ai-module-send">Generar</button>
      </footer>
    </div>`;

  document.body.appendChild(overlay);
  playOverlayOpen(overlay);

  const logEl = overlay.querySelector('#ai-module-log');
  const previewEl = overlay.querySelector('#ai-module-preview');
  const promptEl = overlay.querySelector('#ai-module-prompt');
  const sendBtn = overlay.querySelector('#ai-module-send');
  const saveBtn = overlay.querySelector('#ai-module-save');

  /** Historial completo: la IA necesita el contexto para corregir su propia salida. */
  const history = [{ role: 'system', content: SYSTEM_PROMPT }];
  let candidate = null;
  let request = null;
  const previewId = `ai-preview-${newCustomModuleId()}`;

  const appendLog = (role, text) => {
    const row = document.createElement('div');
    row.className = `ai-module__msg ai-module__msg--${role}`;
    row.textContent = text;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
    return row;
  };

  const close = () => {
    if (request) cancelChatCompletion(request);
    if (isTauriApp()) {
      try {
        getInvoke()('interactive_module_clear', { id: previewId }).catch(() => {});
      } catch {
        /* comando ausente en versiones viejas */
      }
    }
    void animateAndRemove(overlay);
  };

  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('#ai-module-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const showQuestionnaire = (def) => {
    previewEl.hidden = false;
    previewEl.innerHTML = questionnairePreviewHtml(def);
  };

  const showInteractive = async (html, title) => {
    previewEl.hidden = false;
    previewEl.innerHTML = `
      <h4 class="ai-module__preview-title">${escapeHtml(title)}</h4>
      <iframe class="cm-interactive__preview" title="Vista previa" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>`;
    if (!isTauriApp()) return;
    const doc = buildInteractiveDocument(html, { title, initialData: null });
    await getInvoke()('interactive_module_set', { id: previewId, html: doc });
    previewEl.querySelector('iframe').src = interactiveModuleUrl(previewId);
  };

  const handleReply = async (text) => {
    const block = extractBlock(text);
    if (!block) {
      appendLog('assistant', text || 'La IA no devolvió ningún módulo. Prueba pidiéndolo de nuevo con más detalle.');
      return;
    }

    if (block.kind === 'questionnaire') {
      let def;
      try {
        def = JSON.parse(block.code);
      } catch (err) {
        appendLog('error', `El JSON que devolvió no se puede leer (${err.message}). Escribe «corrígelo» y lo intenta de nuevo.`);
        return;
      }
      const res = validateQuestionnaire(def);
      if (!res.ok) {
        appendLog('error', `El cuestionario tiene problemas: ${res.errors.join(' ')} Escribe «corrígelo» para que lo arregle.`);
        history.push({
          role: 'user',
          content: `La definición no pasó la validación de Telar: ${res.errors.join(' ')}. Devuélvela corregida.`,
        });
        return;
      }
      candidate = { kind: 'questionnaire', def };
      appendLog('assistant', `Listo: «${def.title}», ${questionnaireItems(def).length} ítems. Revisa la vista previa y guárdalo.`);
      showQuestionnaire(def);
      saveBtn.disabled = false;
      return;
    }

    const title = text.match(/^\s*#{0,3}\s*(.{3,80}?)\s*$/m)?.[1] || 'Experiencia interactiva';
    const cdn = [...block.code.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
    candidate = { kind: 'interactive', html: block.code, title };
    appendLog(
      'assistant',
      cdn.length
        ? `Generada, pero carga ${cdn[0]} desde internet y dentro de Telar no hay red. Pídele que lo reescriba sin librerías externas.`
        : 'Experiencia generada. Pruébala en la vista previa y guárdala si te sirve.',
    );
    await showInteractive(block.code, title);
    saveBtn.disabled = false;
  };

  const send = async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      promptEl.focus();
      return;
    }
    history.push({ role: 'user', content: prompt });
    appendLog('user', prompt);
    promptEl.value = '';
    sendBtn.disabled = true;
    saveBtn.disabled = true;
    const pending = appendLog('assistant', 'Generando…');
    request = createAiRequest();
    try {
      const { text } = await chatCompletion({ messages: history, maxTokens: 4000, request });
      pending.remove();
      history.push({ role: 'assistant', content: text });
      await handleReply(text);
    } catch (err) {
      pending.remove();
      if (!/cancelado/i.test(err.message || '')) appendLog('error', err.message);
    } finally {
      request = null;
      sendBtn.disabled = false;
    }
  };

  sendBtn.addEventListener('click', () => void send());
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!candidate) return;
    const id = newCustomModuleId();
    const mod =
      candidate.kind === 'questionnaire'
        ? {
            id,
            kind: 'questionnaire',
            title: candidate.def.title,
            category: 'pruebas',
            def: candidate.def,
            defs: { es: candidate.def },
            createdAt: new Date().toISOString(),
            createdByAi: true,
          }
        : {
            id,
            kind: 'interactive',
            title: candidate.title,
            instructions: '',
            html: candidate.html,
            createdAt: new Date().toISOString(),
            createdByAi: true,
          };
    try {
      await saveCustomModule(mod);
      toast(`«${mod.title}» guardado en tu librería`);
      close();
      onCreated?.({ def: mod, moduleType: customModuleTypeId(id) });
    } catch (err) {
      console.error(err);
      appendLog('error', err.message || 'No se pudo guardar el módulo.');
    }
  });

  promptEl.focus();
}
