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
import { ensureInteractiveCloseable, unwrapInteractiveDocument } from '../interactive-experience.js';
import { isColorTheme, themeCssVars } from '../module-themes.js';
import { syncModuleReadableText } from '../readable-text.js';
import { getCustomModuleByType } from '../custom-modules.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { ICON_REFRESH } from '../icons.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';

const DEFAULT_HEIGHT = 360;

const STAGE_CSS = `html,body{margin:0;padding:0;height:100%;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;box-sizing:border-box}
body{min-height:100%;display:flex;align-items:center;justify-content:center;overflow:auto}
.telar-stage{width:min(100%,480px);max-width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box}
.telar-stage>*{max-width:100%;box-sizing:border-box}`;

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
  function harden() {
    document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    document.querySelectorAll('button').forEach(function (el) {
      if (el.id === 'telar-finish') return;
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (!type || type === 'submit') el.setAttribute('type', 'button');
    });
    document.querySelectorAll('input[type="submit"]').forEach(function (el) {
      if (el.id === 'telar-finish') return;
      el.setAttribute('type', 'button');
    });
    var selectors = ['[data-step]', '.step', '.screen', '.slide', '[data-page]', 'form > fieldset', 'form > section', 'main > section', '.pregunta', '.panel'];
    var steps = [];
    for (var s = 0; s < selectors.length; s++) {
      var found = document.querySelectorAll(selectors[s]);
      if (found.length >= 2) { steps = Array.prototype.slice.call(found); break; }
    }
    if (steps.length < 2) {
      var form = document.querySelector('form');
      if (form) {
        var kids = Array.prototype.filter.call(form.children, function (el) {
          var tag = el.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'BR') return false;
          if (el.id === 'telar-finish' || (el.classList && el.classList.contains('telar-closebar'))) return false;
          return true;
        });
        if (kids.length >= 2) steps = kids;
      }
    }
    if (steps.length < 2) return;
    function isOn(el) {
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
      if (el.classList.contains('is-hidden') || el.classList.contains('hidden')) return false;
      if ((el.style && el.style.display) === 'none') return false;
      return true;
    }
    function show(n) {
      if (n < 0 || n >= steps.length) return;
      steps.forEach(function (el, idx) {
        var on = idx === n;
        el.hidden = !on;
        el.style.display = on ? '' : 'none';
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      try { if (window.Telar && Telar.resize) Telar.resize(document.documentElement.scrollHeight); } catch (err) {}
    }
    var vis = [];
    steps.forEach(function (el, idx) { if (isOn(el)) vis.push(idx); });
    if (vis.length !== 1) show(0);
    function navDir(el) {
      var t = ((el.textContent || el.value || '') + ' ' + (el.getAttribute('aria-label') || ''))
        .replace(/\\s+/g, ' ').trim().toLowerCase();
      if (/(siguiente|continuar|comenzar|empezar|adelante|\\bnext\\b)/.test(t)) return 1;
      if (/(atrás|atras|anterior|volver|\\bback\\b)/.test(t)) return -1;
      return 0;
    }
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button, input[type="button"], [role="button"], a[href="#"]') : null;
      if (!btn || btn.id === 'telar-finish') return;
      var dir = navDir(btn);
      if (!dir) return;
      var before = steps.map(isOn).join(',');
      setTimeout(function () {
        if (before !== steps.map(isOn).join(',')) return;
        var cur = 0;
        var now = [];
        steps.forEach(function (el, idx) { if (isOn(el)) now.push(idx); });
        if (now.length === 1) cur = now[0];
        show(cur + dir);
      }, 0);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', harden);
  else harden();
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
export function buildInteractiveDocument(html, { title = 'Experiencia', initialData, theme } = {}) {
  const source = unwrapInteractiveDocument(html);
  const palette = isColorTheme(theme)
    ? `<style data-telar-theme="${escapeHtml(theme)}">:root{${themeCssVars(theme)}}body{background:var(--telar-paper);color:var(--telar-ink);}</style>`
    : '';
  const head = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${CONTENT_CSP}" />
<title>${escapeHtml(title)}</title>
<style>${STAGE_CSS}</style>
${palette}
${bridgeScript(initialData)}`;

  return `<!doctype html>
<html lang="es">
<head>
${head}
</head>
<body>
<div class="telar-stage">
${source}
</div>
</body>
</html>`;
}

export function interactiveModuleUrl(id) {
  const convert = window.__TAURI_INTERNALS__?.convertFileSrc;
  if (typeof convert === 'function') return convert(id, 'telar-mod');
  return `telar-mod://localhost/${encodeURIComponent(id)}`;
}

const activeListeners = new Map();

/**
 * Suelta el listener de mensajes al desmontar el módulo.
 * `keepDoc`: no borres el HTML del esquema telar-mod:// — hace falta al re-pintar
 * la ficha (p. ej. acaba de llegar la respuesta del enlace) porque el set nuevo
 * usa el mismo id y un clear tardío deja el iframe en «Módulo no encontrado».
 */
export function teardownInteractiveHtml(moduleId, { keepDoc = false } = {}) {
  const key = String(moduleId ?? 'all');
  if (key === 'all') {
    for (const off of activeListeners.values()) off({ keepDoc });
    activeListeners.clear();
    return;
  }
  activeListeners.get(key)?.({ keepDoc });
  activeListeners.delete(key);
}

export async function renderInteractiveHtml(host, moduleRow) {
  const mod = getCustomModuleByType(moduleRow.module_type);
  if (!mod?.html) {
    host.innerHTML = `<div class="card"><p class="text-muted">Esta experiencia interactiva ya no está en tu librería. Si venía de un pack, vuelve a importarlo.</p></div>`;
    return;
  }

  const data = parseJsonSafe(moduleRow.data, {});
  const contentId = `${mod.id}-${moduleRow.id}`;
  /* Re-bind del mismo módulo: suelta el listener viejo sin borrar el doc. */
  teardownInteractiveHtml(moduleRow.id, { keepDoc: true });

  const doc = buildInteractiveDocument(ensureInteractiveCloseable(mod.html), {
    title: mod.title,
    initialData: data.payload ?? null,
    theme: mod.theme,
  });

  const theme = String(mod.theme || '').trim();
  const themeAttr = theme && theme !== 'clinico' ? ` data-theme="${escapeHtml(theme)}"` : '';

  host.innerHTML = `
    <div class="card interactive-module"${themeAttr}>
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">${escapeHtml(mod.title)}</h2>
          ${mod.instructions ? `<p class="module-card-head__sub">${escapeHtml(mod.instructions)}</p>` : ''}
        </div>
      </div>
      <div class="interactive-module__frame-wrap">
        <button type="button" class="interactive-module__reload" title="Recargar experiencia" aria-label="Recargar experiencia">${ICON_REFRESH}</button>
        <iframe
          class="interactive-module__frame"
          id="interactive-frame-${moduleRow.id}"
          title="${escapeHtml(mod.title)}"
          sandbox="allow-scripts allow-forms allow-pointer-lock"
          referrerpolicy="no-referrer"
          height="${DEFAULT_HEIGHT}"></iframe>
      </div>
      ${
        data.summary
          ? `<p class="interactive-module__summary">${escapeHtml(data.summary)}</p>`
          : ''
      }
      <p class="interactive-module__note" id="interactive-note-${moduleRow.id}"></p>
    </div>`;

  const frame = host.querySelector(`#interactive-frame-${moduleRow.id}`);
  const note = host.querySelector(`#interactive-note-${moduleRow.id}`);

  if (!isTauriApp()) {
    note.textContent = 'Las experiencias interactivas solo corren en la app de escritorio Telar.';
    frame.remove();
    host.querySelector('.interactive-module__reload')?.remove();
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
      return;
    }
    if (msg.kind === 'save') {
      void persist(msg.payload).catch((e) => console.error(e));
      return;
    }
    if (msg.kind === 'done') {
      const raw = msg.payload;
      const summary = typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : '';
      const extra = raw && typeof raw === 'object' ? { payload: raw } : {};
      void (async () => {
        const fresh = await getModule(moduleRow.id);
        await syncModuleReadableText(
          fresh || moduleRow,
          { summary, completed_at: new Date().toISOString(), ...extra },
          'completado',
        );
        toast('Experiencia completada');
      })().catch((e) => console.error(e));
    }
  };

  window.addEventListener('message', onMessage);
  activeListeners.set(String(moduleRow.id), ({ keepDoc = false } = {}) => {
    window.removeEventListener('message', onMessage);
    if (keepDoc) return;
    getInvoke()('interactive_module_clear', { id: contentId }).catch(() => {});
  });

  let rev = 0;
  const loadFrame = () => {
    rev += 1;
    frame.src = `${interactiveModuleUrl(contentId)}?r=${rev}`;
  };
  host.querySelector('.interactive-module__reload')?.addEventListener('click', loadFrame);
  loadFrame();
}
