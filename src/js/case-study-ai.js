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
  const rowsFrom = (parsed) => {
    if (Array.isArray(parsed)) return parsed;
    return parsed?.elements || parsed?.ejes || parsed?.axes || parsed?.items || [];
  };
  try {
    return rowsFrom(JSON.parse(cleaned));
  } catch { /* Intenta rescatar JSON rodeado por explicación. */ }
  const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((index) => index >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start < 0 || end <= start) return [];
  try {
    return rowsFrom(JSON.parse(cleaned.slice(start, end + 1)));
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
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => typeof item === 'object'
      ? String(item?.text || item?.frase || item?.quote || item?.evidence || '').trim()
      : String(item || '').trim())
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
    const title = String(row?.title || row?.titulo || row?.name || row?.nombre || '').trim();
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

const FALLBACK_RULES = [
  { axis: 'risk', title: 'Riesgo suicida', pattern: /suicid|quitarme la vida|matarme|no quiero vivir/iu },
  { axis: 'risk', title: 'Consumo de cannabis', pattern: /marihu|cannabis|fumar(?:me)? un pito|adicci[oó]n/iu },
  { axis: 'risk', title: 'Agresividad e impulsividad', pattern: /agresiv|ira|exploto|explosiv|violencia|golpear/iu },
  { axis: 'problem', title: 'Alteraciones del sueño', pattern: /duermo|dormir|despierto|sueño|insomnio/iu },
  { axis: 'problem', title: 'Celos y desconfianza', pattern: /celo|desconfianza|me paso .*pel[ií]culas/iu },
  { axis: 'problem', title: 'Estrés laboral', pattern: /despido|trabajo|compañer[oa]s?|turno|7x7|3 de noche/iu },
  { axis: 'defense', title: 'Evitación', pattern: /evitar|me cuesta social|soledad|estar tranquilo/iu },
  { axis: 'defense', title: 'Sensibilidad interpersonal', pattern: /palabra me afecta|me afecta mucho|arrastro cosas/iu },
  { axis: 'resource', title: 'Motivación de cambio', pattern: /me gustar[ií]a|quiero (?:ser|controlar)|necesito saber|tratarme/iu },
  { axis: 'resource', title: 'Conducta prosocial', pattern: /ayudar|buen coraz[oó]n|apoyar/iu },
];

/** Respaldo literal: organiza frases guardadas cuando el proveedor devuelve JSON vacío o inválido. */
export function fallbackCaseStudyRows(sourceText) {
  const fragments = String(sourceText || '')
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((line) => line.replace(/^#+\s*[^\n]*$/u, '').replace(/^[\p{L} /-]+:\s*/u, '').trim())
    .filter((line) => line.length >= 12 && !/^sesi[oó]n\b/iu.test(line));
  const rows = [];
  const perAxis = new Map();
  for (const fragment of fragments) {
    const rule = FALLBACK_RULES.find(({ pattern }) => pattern.test(fragment));
    if (!rule || (perAxis.get(rule.axis) || 0) >= 3) continue;
    if (rows.some((row) => row.axis === rule.axis && row.title === rule.title)) {
      const row = rows.find((candidate) => candidate.axis === rule.axis && candidate.title === rule.title);
      if (row.manifestations.length < 3) row.manifestations.push(fragment);
      continue;
    }
    rows.push({ axis: rule.axis, title: rule.title, status: 'unknown', manifestations: [fragment], indicators: [] });
    perAxis.set(rule.axis, (perAxis.get(rule.axis) || 0) + 1);
  }
  if (!rows.length && fragments[0]) {
    rows.push({ axis: 'problem', title: 'Motivo principal', status: 'unknown', manifestations: [fragments[0]], indicators: [] });
  }
  return rows;
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
  const current = await loadCaseStudy(treatmentId);
  const rows = parseCaseStudyAiResult(text);
  // Complementa siempre con evidencia literal estable: la respuesta del modelo
  // puede ser breve, pero no puede borrar ni sustituir la formulación existente.
  let merged = mergeCaseStudyAiElements(current, rows);
  const literal = mergeCaseStudyAiElements(merged.caseStudy, fallbackCaseStudyRows(sourceText));
  merged = {
    caseStudy: literal.caseStudy,
    added: merged.added + literal.added,
    changed: merged.changed + literal.changed,
  };
  if (!merged.changed) throw new Error('No hubo evidencia nueva suficiente para actualizar los ejes.');
  return { ...merged, sessions, sourceText, saved: await saveCaseStudy(treatmentId, merged.caseStudy) };
}
