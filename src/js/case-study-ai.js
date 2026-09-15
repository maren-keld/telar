import { confirmClinicalAiSend } from './ai-clinical-send.js';
import { chatCompletion } from './ai-client.js';
import { emptyCaseStudyElement, normalizeCaseStudyData } from './case-study-model.js';
import { loadCaseStudy, saveCaseStudy } from './case-study-store.js';
import { getSessionsWithModules } from './db.js';
import { buildReadableText } from './readable-text.js';
import { parseJsonSafe } from './utils.js';

const ALLOWED_AXES = new Set(['problem', 'resource', 'defense', 'risk']);
const SOURCE_TYPES = new Set(['registro_inicial', 'motivo_consulta']);

export function caseStudyAiSourceText(sessions = []) {
  return sessions.flatMap((session) => (session.modules || [])
    .filter((module) => SOURCE_TYPES.has(module.module_type))
    .map((module) => {
      const data = parseJsonSafe(module.data, {});
      const text = (buildReadableText(module.module_type, data) || data?.readable_text || data?.text || '').trim();
      if (!text) return '';
      const label = module.module_type === 'motivo_consulta' ? 'Anamnesis' : 'Registro inicial';
      return `### Sesión ${session.number || 'sin número'} · ${label}\n${text}`;
    }))
    .filter(Boolean)
    .join('\n\n');
}

export function parseCaseStudyAiResult(raw) {
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
    return parsed.elements || parsed.ejes || parsed.axes || [];
  } catch {
    return [];
  }
}

const AXIS_ALIASES = new Map([
  ['problem', 'problem'], ['problems', 'problem'], ['problema', 'problem'], ['problemas', 'problem'],
  ['resource', 'resource'], ['resources', 'resource'], ['recurso', 'resource'], ['recursos', 'resource'],
  ['factor protector', 'resource'], ['factores protectores', 'resource'],
  ['defense', 'defense'], ['defensa', 'defense'], ['defensas', 'defense'],
  ['risk', 'risk'], ['riesgo', 'risk'], ['riesgos', 'risk'],
]);

function cleanEvidence(value) {
  return (Array.isArray(value) ? value : [])
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => ({ text, checked: false }));
}

function uniqueItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.text || '').trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Adds evidence only; never replaces the clinician's existing case formulation. */
export function mergeCaseStudyAiElements(caseStudy, rows = []) {
  const next = normalizeCaseStudyData(caseStudy);
  let added = 0;
  let changed = 0;
  for (const row of rows) {
    const axis = AXIS_ALIASES.get(String(row?.axis || row?.eje || '').trim().toLocaleLowerCase()) || '';
    const title = String(row?.title || '').trim();
    if (!ALLOWED_AXES.has(axis) || !title || /^red de apoyo$/iu.test(title)) continue;
    const manifestations = cleanEvidence(row.manifestations || row.manifestaciones || row.evidence || row.evidencia);
    const indicators = cleanEvidence(row.indicators || row.indicadores);
    if (!manifestations.length && !indicators.length) continue;
    const found = next.elements.find((element) =>
      element.axis === axis && element.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    if (found) {
      const nextManifestations = uniqueItems([...(found.manifestations || []), ...manifestations]);
      const nextIndicators = uniqueItems([...(found.indicators || []), ...indicators]);
      if (nextManifestations.length !== (found.manifestations || []).length || nextIndicators.length !== (found.indicators || []).length) changed += 1;
      found.manifestations = nextManifestations;
      found.indicators = nextIndicators;
      continue;
    }
    const element = emptyCaseStudyElement(axis, title);
    element.status = ['present', 'developing', 'unknown'].includes(row.status) ? row.status : 'unknown';
    element.manifestations = manifestations;
    element.indicators = indicators;
    next.elements.push(element);
    added += 1;
    changed += 1;
  }
  return { caseStudy: normalizeCaseStudyData(next), added, changed };
}

export async function autoCompleteCaseStudyWithAi(treatmentId) {
  const sessions = await getSessionsWithModules(treatmentId);
  const sourceText = caseStudyAiSourceText(sessions);
  if (!sourceText) throw new Error('Completa Registro inicial o Anamnesis antes de autocompletar los ejes.');

  await confirmClinicalAiSend({
    contextText: sourceText,
    purpose: 'Autocompletar ejes del estudio de caso',
  });
  const { text } = await chatCompletion({
    maxTokens: 1800,
    messages: [
      {
        role: 'system',
        content: `Eres un asistente clínico de apoyo. Extrae elementos para el estudio de caso SOLO desde el texto proporcionado. No diagnostiques, no inventes, no completes vacíos y no menciones OASIS ni ODSIS. Devuelve SOLO JSON válido con esta forma: {"elements":[{"axis":"problem|resource|defense|risk","title":"nombre breve","status":"present|developing|unknown","manifestations":["frase breve y fiel al texto"],"indicators":["frase breve y fiel al texto"]}]}. Incluye máximo 3 elementos por eje. Cada elemento debe tener al menos una manifestación o indicador con una frase atribuible al contexto. Si no hay evidencia suficiente, devuelve un arreglo vacío.`,
      },
      { role: 'user', content: sourceText },
    ],
  });
  const rows = parseCaseStudyAiResult(text);
  if (!rows.length) throw new Error('La IA no encontró evidencia suficiente para añadir ejes.');
  const merged = mergeCaseStudyAiElements(await loadCaseStudy(treatmentId), rows);
  if (!merged.changed) throw new Error('No hubo evidencia nueva suficiente para actualizar los ejes.');
  return { ...merged, sessions, sourceText, saved: await saveCaseStudy(treatmentId, merged.caseStudy) };
}
