/**
 * El editor de módulos habla siempre con Grok.
 * Las iteraciones reenvían el HTML completo para poder cambiar CSS, fondo, pasos.
 */

export const GROK_REASONING_EFFORT = 'medium';

const INTERACTIVE_RE =
  /html|codepen|\.css|javascript|interacti|juego|respiraci|canvas|svg|animaci|bot[oó]n|pasos|tarjeta|experiencia|arrastr|mindfulness visual|click|toque|colorido/i;
const QUESTIONNAIRE_RE =
  /cuestionario|escala|ítems?|items?|likert|\bgad\b|\bphq\b|\bpcl\b|puntua|0\s*[–-]\s*3|registro de pensamientos/i;

export function looksLikeInteractivePrompt(prompt = '') {
  const text = String(prompt || '');
  if (QUESTIONNAIRE_RE.test(text) && !INTERACTIVE_RE.test(text)) return false;
  return INTERACTIVE_RE.test(text);
}

/**
 * El editor de módulos habla siempre con Grok (purpose modules).
 * Mistral se queda corto en las iteraciones de HTML.
 */
export function shouldUseGrokForModule() {
  return true;
}

/** `purpose: 'modules'` en chatCompletion → Grok. */
export function moduleAiPurpose() {
  return 'modules';
}

function innerText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Esqueleto para que Mistral edite sin tragarse 4k de CSS. */
export function summarizeInteractiveHtml(html, maxChars = 1600) {
  const source = String(html || '');
  if (!source.trim()) return '(aún no hay experiencia)';

  const stepAttrs = [...source.matchAll(/data-step=["']?([^"'>\s]+)/gi)].map((m) => m[1]);
  const stepClasses = (source.match(/class=["'][^"']*\bstep\b[^"']*/gi) || []).length;
  const headings = [...source.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map((m) => innerText(m[1]))
    .filter(Boolean)
    .slice(0, 8);
  const buttons = [...source.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((m) => innerText(m[1]))
    .filter(Boolean)
    .slice(0, 12);
  const ids = [...source.matchAll(/\bid=["']([^"']+)/gi)].map((m) => m[1]).slice(0, 16);
  const styleBlock = source.match(/<style[^>]*>[\s\S]*?<\/style>/i)?.[0] || '';
  const markup = source
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);

  const lines = [
    'Resumen de la experiencia actual. No reenvío CSS ni JS completos; reconstruye el fragmento coherente con esto.',
    `- Pasos data-step: ${stepAttrs.join(', ') || 'ninguno'} · bloques .step ≈ ${stepClasses}`,
    `- Títulos: ${headings.join(' · ') || '—'}`,
    `- Botones: ${buttons.join(' · ') || '—'}`,
    `- ids: ${ids.join(', ') || '—'}`,
    `- Largo del <style>: ${styleBlock.length} caracteres`,
    `- Markup recortado: ${markup || '—'}`,
  ];
  return lines.join('\n').slice(0, maxChars);
}

export const INTERACTIVE_EDIT_SYSTEM = `Corrige una experiencia interactiva clínica para Telar (español de Chile).

Tienes el HTML/CSS/JS actual completo. Devuelve SOLO un bloque \`\`\`html\`\`\` con el FRAGMENTO ya corregido: <style>, markup y <script> al final. Sin <!doctype>, sin <html>, sin <head>, sin <body>. Sin CDN ni fetch. Conserva Telar.save / Telar.done. Viewport compacto (~680×360), centrado, sin 100vh.

Aplica el pedido del terapeuta (colores, fondo, pasos, botones) y reescribe el fragmento completo. Si piden un color de fondo, ponlo en html y body para que llene el iframe, no solo una tarjeta interior.`;

export function buildInteractiveEditUserMessage(prompt, html) {
  return `Pedido: ${String(prompt || '').trim()}

HTML actual. Reescríbelo completo ya corregido:
\`\`\`html
${String(html || '').trim()}
\`\`\``;
}

export const QUESTIONNAIRE_EDIT_SYSTEM = `Corrige un cuestionario clínico para Telar (español de Chile).

Devuelve SOLO un bloque \`\`\`json\`\`\` con esta forma:
{ "questions": [ { "text": "Enunciado", "type": "text|radio|checkbox|scale|task|info", "options": ["..."] } ] }
radio = opción única; checkbox = opción múltiple; ambos llevan options. Aplica el pedido y reescribe el listado completo. No devuelvas HTML.`;

export function buildQuestionnaireEditUserMessage(prompt, questions = []) {
  return `Pedido: ${String(prompt || '').trim()}

Ítems actuales:
${JSON.stringify({ questions }, null, 2)}`;
}
