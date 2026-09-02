/**
 * Experiencias interactivas: HTML/CSS/JS del terapeuta (típicamente traído de
 * CodePen) corriendo dentro de un iframe aislado.
 *
 * El documento se sirve desde Rust por el esquema `telar-mod://` porque la CSP
 * de la app prohíbe scripts inline; ese esquema tiene su propia CSP permisiva y
 * sin red. La comunicación con Telar es por `postMessage` a través de
 * `window.Telar`.
 */
import { getModule } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { getCustomModuleByType } from '../custom-modules.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';

const DEFAULT_HEIGHT = 540;
const MAX_HEIGHT = 1400;

const BRIDGE_MARKER = '__telar_bridge__';

function bridgeScript(initialData) {
  const initial = JSON.stringify(initialData ?? null);
  return `<script data-telar-bridge="1">
(function () {
  var initial = ${initial};
  function post(kind, payload) {
    try {
      parent.postMessage({ ${BRIDGE_MARKER}: 1, kind: kind, payload: payload }, '*');
    } catch (e) {
      /* el host puede haberse cerrado */
    }
  }
  window.Telar = {
    /** Datos guardados en una visita anterior (o null). */
    load: function () { return initial; },
    /** Guarda el progreso en la ficha del paciente. */
    save: function (data) { post('save', data); },
    /** Marca la experiencia como completada, con un resumen para la ficha. */
    done: function (summary) { post('done', summary); },
    /** Ajusta la altura visible del módulo. */
    resize: function (height) { post('resize', Number(height) || 0); }
  };
  window.addEventListener('load', function () {
    post('resize', document.documentElement.scrollHeight);
  });
})();
</script>`;
}

const CONTENT_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval' telar-mod: blob: data:; " +
  "style-src 'unsafe-inline' telar-mod: data:; " +
  "img-src telar-mod: data: blob:; " +
  "media-src telar-mod: data: blob:; " +
  "font-src telar-mod: data:; " +
  "connect-src 'none'; " +
  "frame-src 'none'";

/**
 * Ensambla el documento completo que se sirve al iframe: CSP propia, bridge y
 * el HTML del terapeuta tal cual lo pegó.
 */
export function buildInteractiveDocument(html, { title = 'Experiencia', initialData } = {}) {
  const source = String(html || '');
  const head = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${CONTENT_CSP}" />
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}</style>
${bridgeScript(initialData)}`;

  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head([^>]*)>/i, `<head$1>\n${head}\n`);
    }
    return source.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${head}\n</head>\n`);
  }

  return `<!doctype html>
<html lang="es">
<head>
${head}
</head>
<body>
${source}
</body>
</html>`;
}

function interactiveUrl(id) {
  const convert = window.__TAURI_INTERNALS__?.convertFileSrc;
  if (typeof convert === 'function') return convert(id, 'telar-mod');
  return `telar-mod://localhost/${encodeURIComponent(id)}`;
}

const activeListeners = new Map();

/** Suelta el listener de mensajes al desmontar el módulo. */
export function teardownInteractiveHtml(moduleId) {
  const key = String(moduleId ?? 'all');
  if (key === 'all') {
    for (const off of activeListeners.values()) off();
    activeListeners.clear();
    return;
  }
  activeListeners.get(key)?.();
  activeListeners.delete(key);
}

export async function renderInteractiveHtml(host, moduleRow) {
  const mod = getCustomModuleByType(moduleRow.module_type);
  if (!mod?.html) {
    host.innerHTML = `<div class="card"><p class="text-muted">Esta experiencia interactiva ya no está en tu librería. Si venía de un pack, vuelve a importarlo.</p></div>`;
    return;
  }

  const data = parseJsonSafe(moduleRow.data, {});
  const doc = buildInteractiveDocument(mod.html, {
    title: mod.title,
    initialData: data.payload ?? null,
  });
  const contentId = `${mod.id}-${moduleRow.id}`;

  host.innerHTML = `
    <div class="card interactive-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">${escapeHtml(mod.title)}</h2>
          ${mod.instructions ? `<p class="module-card-head__sub">${escapeHtml(mod.instructions)}</p>` : ''}
        </div>
        ${data.completed_at ? '<div class="badge badge--ok module-card-head__badge">Completada</div>' : ''}
      </div>
      <div class="interactive-module__frame-wrap">
        <iframe
          class="interactive-module__frame"
          id="interactive-frame-${moduleRow.id}"
          title="${escapeHtml(mod.title)}"
          sandbox="allow-scripts allow-forms allow-pointer-lock"
          referrerpolicy="no-referrer"
          height="${DEFAULT_HEIGHT}"></iframe>
      </div>
      <p class="interactive-module__note" id="interactive-note-${moduleRow.id}"></p>
    </div>`;

  const frame = host.querySelector(`#interactive-frame-${moduleRow.id}`);
  const note = host.querySelector(`#interactive-note-${moduleRow.id}`);

  if (!isTauriApp()) {
    note.textContent = 'Las experiencias interactivas solo corren en la app de escritorio Telar.';
    frame.remove();
    return;
  }

  try {
    await getInvoke()('interactive_module_set', { id: contentId, html: doc });
  } catch (e) {
    console.error(e);
    note.textContent = 'No se pudo preparar la experiencia. Reinstala la última versión de Telar.';
    frame.remove();
    return;
  }

  const persist = async (payload, { completed = false } = {}) => {
    const fresh = await getModule(moduleRow.id);
    const next = { payload };
    if (completed) next.completed_at = new Date().toISOString();
    await syncModuleReadableText(fresh || moduleRow, next, completed ? 'completado' : 'pendiente');
  };

  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    const msg = event.data;
    if (!msg || msg[BRIDGE_MARKER] !== 1) return;
    if (msg.kind === 'resize') {
      const h = Math.min(Math.max(Number(msg.payload) || DEFAULT_HEIGHT, 240), MAX_HEIGHT);
      frame.height = String(h);
      return;
    }
    if (msg.kind === 'save') {
      void persist(msg.payload).catch((e) => console.error(e));
      return;
    }
    if (msg.kind === 'done') {
      const summary = typeof msg.payload === 'string' ? msg.payload : '';
      void (async () => {
        const fresh = await getModule(moduleRow.id);
        await syncModuleReadableText(
          fresh || moduleRow,
          { summary, completed_at: new Date().toISOString() },
          'completado',
        );
        toast('Experiencia completada');
      })().catch((e) => console.error(e));
    }
  };

  window.addEventListener('message', onMessage);
  teardownInteractiveHtml(moduleRow.id);
  activeListeners.set(String(moduleRow.id), () => {
    window.removeEventListener('message', onMessage);
    getInvoke()('interactive_module_clear', { id: contentId }).catch(() => {});
  });

  frame.src = interactiveUrl(contentId);
}
