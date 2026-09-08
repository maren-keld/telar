/**
 * Parseo y cierre de experiencias interactivas generadas por IA.
 * El modelo a veces omite las vallas ```html, entrega un documento completo
 * o deja <style> sin cerrar: si el cierre de Telar queda después de </html>,
 * WebKit muestra el CSS como texto.
 */

function looksLikeHtml(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /<(?:!doctype|html|head|body|div|section|article|main|style|script|button|form|svg|canvas)\b/i.test(
    text,
  );
}

function fromFirstTag(value) {
  const text = String(value || '').trim();
  const idx = text.search(/<(?:!doctype|html|style|div|section|article|main|form)\b/i);
  return idx >= 0 ? text.slice(idx).trim() : text;
}

export function extractInteractiveHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const fencedHtml = raw.match(/```html\s*([\s\S]*?)```/i);
  if (fencedHtml?.[1]?.trim()) return fencedHtml[1].trim();

  const fencedAny = raw.match(/```(?!json)\s*([\s\S]*?)```/i);
  if (fencedAny?.[1]?.trim() && looksLikeHtml(fencedAny[1])) return fencedAny[1].trim();

  const unclosed = raw.match(/```html\s*([\s\S]+)/i);
  if (unclosed?.[1]?.trim()) {
    const body = unclosed[1].replace(/```\s*$/, '').trim();
    if (looksLikeHtml(body)) return body;
  }

  const stripped = fromFirstTag(raw);
  return looksLikeHtml(stripped) ? stripped : '';
}

export function closeDanglingMarkup(html) {
  let source = String(html || '');
  const count = (re) => (source.match(re) || []).length;
  const extraStyle = count(/<style\b/gi) - count(/<\/style>/gi);
  if (extraStyle > 0) source += '</style>'.repeat(extraStyle);
  const extraScript = count(/<script\b/gi) - count(/<\/script>/gi);
  if (extraScript > 0) source += '</script>'.repeat(extraScript);
  return source;
}

/** Deja un fragmento (style + markup). Sin doctype/html/head/body. */
export function unwrapInteractiveDocument(html) {
  let source = String(html || '').trim();
  if (!source) return '';

  const styles = [];
  const scripts = [];
  const head = source.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (head) {
    for (const match of head[1].matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)) styles.push(match[0]);
    for (const match of head[1].matchAll(/<script\b[\s\S]*?<\/script>/gi)) scripts.push(match[0]);
  }

  const body = source.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) {
    return closeDanglingMarkup(`${styles.join('\n')}\n${body[1]}\n${scripts.join('\n')}`.trim());
  }

  if (/<!doctype|<html[\s>]/i.test(source)) {
    source = source
      .replace(/<!doctype[^>]*>/i, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/i, '')
      .replace(/<\/?(html|head|body)[^>]*>/gi, '')
      .trim();
    return closeDanglingMarkup(`${styles.join('\n')}\n${source}\n${scripts.join('\n')}`.trim());
  }

  return closeDanglingMarkup(source);
}

const CLOSE_CSS = `.telar-closebar{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;padding:12px 14px;background:#fff;border-top:1px solid #e6e8ee;font-family:system-ui,-apple-system,sans-serif}
.telar-closebar button{background:#1a1d24;color:#fff;border:0;border-radius:10px;padding:10px 14px;font:inherit;cursor:pointer}`;

const CLOSE_MARKUP = `<div class="telar-closebar" data-telar-closebar>
  <button type="button" id="telar-finish">Registrar y terminar</button>
</div>
<script data-telar-close="1">
(function () {
  var btn = document.getElementById('telar-finish');
  if (!btn || !window.Telar) return;
  btn.addEventListener('click', function () {
    var payload = {};
    document.querySelectorAll('input, select, textarea, [data-telar-value]').forEach(function (el, i) {
      var key = el.getAttribute('data-telar-value') || el.name || el.id || ('campo_' + (i + 1));
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) payload[key] = el.value || true;
      } else if (el.getAttribute && el.hasAttribute('data-telar-value')) {
        payload[key] = el.textContent || el.getAttribute('data-telar-value');
      } else {
        payload[key] = el.value;
      }
    });
    try { Telar.save(payload); } catch (e) {}
    Telar.done('Experiencia completada');
  });
})();
</script>`;

function stripTelarClose(source) {
  return String(source || '')
    .replace(/<style data-telar-close="1">[\s\S]*?<\/style>/gi, '')
    .replace(/<div class="telar-closebar"[^>]*>[\s\S]*?<\/div>\s*<script data-telar-close="1">[\s\S]*?<\/script>/gi, '')
    .trim();
}

/**
 * Si la IA no llamó Telar.done, añade un cierre que guarda controles y marca
 * la actividad como respondida. Siempre deja un fragmento, nunca un </html>
 * suelto: si no, el CSS del cierre se ve como texto en la vista previa.
 */
export function ensureInteractiveCloseable(html) {
  let source = stripTelarClose(unwrapInteractiveDocument(html));
  if (!source) return source;
  if (/\bTelar\.done\s*\(/.test(source)) return source;
  return `<style data-telar-close="1">${CLOSE_CSS}</style>\n${source}\n${CLOSE_MARKUP}`;
}
