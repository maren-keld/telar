/**
 * QA-012 — Techo de tokens para respuestas largas en Bitácora.
 */
import { AI_QUICK_PROMPTS } from './ai-actions.js';

const LONG_FORM_RE =
  /\b(an[aá]lisis del caso|an[aá]lisis de caso|revisi[oó]n del tratamiento|programa de tratamiento|generar tratamiento|qu[eé] programa)\b/i;

/** Chips y preguntas clínicas largas necesitan más tokens que una consulta corta. */
export function bitacoraMaxTokens(question, { local = false } = {}) {
  const q = String(question || '').trim();
  const chipIds = new Set(['analisis', 'programa']);
  const fromChip = AI_QUICK_PROMPTS.some(
    (p) => chipIds.has(p.id) && (q === p.prompt || q.startsWith(p.prompt.slice(0, 40))),
  );
  const longForm = fromChip || LONG_FORM_RE.test(q) || q.length > 400;
  if (longForm) return local ? 3200 : 4000;
  return local ? 2000 : 2800;
}
