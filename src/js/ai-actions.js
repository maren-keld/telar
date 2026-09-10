/**
 * Acciones aplicables propuestas por la IA.
 *
 * La IA puede cerrar su respuesta con un bloque cercado `telar-plan` o
 * `telar-module`. Aquí se parsean, se validan contra el catálogo real de
 * módulos y se aplican al tratamiento. El bloque se conserva en el contenido
 * de la nota (persiste sin migración de esquema) y se oculta al renderizar.
 */
import { isLicensePendingModule } from './license-pending-modules.js';
import { categoryLabel } from './module-categories.js';
import { getModuleDefs } from './config.js';
import { CUSTOM_ITEM_TYPES, isValidItemType, itemTypeNeedsOptions } from './custom-module-items.js';
import {
  customModuleTypeId,
  isCustomModuleType,
  moduleLabelFor,
  newCustomModuleId,
  resolveModuleDef,
  saveCustomModule,
} from './custom-modules.js';
import { addModuleToSession, execute, getSessions, getTreatmentModules } from './db.js';
import { moduleLabelI18n } from './i18n.js';
import { escapeHtml } from './utils.js';

/**
 * La IA a veces envuelve URLs en markdown [url](url) o mete un aside en *cursiva*.
 * El panel no parsea links: hay que dejar texto listo para copiar.
 */
export function normalizeAiDisplayText(text) {
  let out = String(text || '');
  out = out.replace(/^\s*Email para el paciente:\s*/i, '');
  out = out.replace(/\[([^\]]+)\]\s*\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    const a = String(label || '').trim();
    const b = String(url || '').trim();
    if (!b) return a;
    if (!a || a === b || /^https?:\/\//i.test(a)) return b;
    return `${a} ${b}`;
  });
  out = out.replace(/<(https?:\/\/[^>\s]+)>/g, '$1');
  out = out.replace(/^\*([^*\n]+)\*\s*$/gm, '$1');
  out = out.replace(/^_([^_\n]+)_\s*$/gm, '$1');
  return out;
}

/** Cierre opcional: los modelos cortan el JSON al llegar al tope de tokens. */
const ACTION_BLOCK_RE =
  /```[ \t]*(?:json[ \t]+)?telar-(plan|module)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/gi;
const APPLIED_MARKER_RE = /<!--\s*telar-action-applied:(\d+)\s*-->/gi;
const DISMISSED_MARKER_RE = /<!--\s*telar-action-dismissed:(\d+)\s*-->/gi;

/** Módulos que la IA no debe proponer (placeholders, uso interno o licencia pendiente). */
const NON_PROPOSABLE = new Set(['selector_modulo']);

export function listProposableModules() {
  const defs = getModuleDefs();
  return Object.entries(defs)
    .filter(([id]) => !NON_PROPOSABLE.has(id) && !isLicensePendingModule(id))
    .map(([id, def]) => ({
      id,
      label: moduleLabelI18n(id, def.label) || def.label || id,
      category: def.category || 'otros',
    }));
}

/** Catálogo compacto para el prompt: la IA solo puede citar estos ids. */
export function buildModuleCatalogText() {
  const byCategory = new Map();
  for (const mod of listProposableModules()) {
    if (!byCategory.has(mod.category)) byCategory.set(mod.category, []);
    byCategory.get(mod.category).push(`${mod.label} [${mod.id}]`);
  }
  return [...byCategory.entries()]
    .map(([cat, items]) => `- ${categoryLabel(cat)}: ${items.join(', ')}`)
    .join('\n');
}

const REF_DOC_EXCERPT = 3500;

/** Texto para el prompt: nombres de archivos y extractos si hay texto. */
export function formatReferenceDocsForPrompt(docs) {
  if (!Array.isArray(docs) || !docs.length) return '';
  const blocks = docs.map((d) => {
    const name = String(d?.name || 'documento').trim() || 'documento';
    const text = String(d?.text || '').trim();
    if (text) {
      const excerpt = text.length > REF_DOC_EXCERPT ? `${text.slice(0, REF_DOC_EXCERPT)}\n[…]` : text;
      return `### ${name}\n${excerpt}`;
    }
    return `### ${name}\n(Archivo adjunto sin texto extraíble. Cítalo por este nombre si el clínico lo menciona.)`;
  });
  return `DOCUMENTOS DE REFERENCIA DEL TRATAMIENTO
El clínico adjuntó estos archivos. Úsalos si aportan al caso. Si los citas, ponlos en Bibliografía con el nombre exacto del archivo.

${blocks.join('\n\n')}`;
}

const PATIENT_EMAIL_TEMPLATE = `Cuando SÍ te pidan un correo al paciente, escribe SOLO el cuerpo listo para copiar. Sin asunto, sin título tipo «Email para el paciente», sin # markdown, sin asteriscos, sin cursiva, sin Bibliografía, sin bloques telar-plan, sin ids entre corchetes.
Nunca uses markdown de enlace [texto](url). Escribe la URL cruda una sola vez, en la misma línea que el nombre: 1.1 GAD-7 https://telarapp.cl/r/...
Estructura:

Hola {primer nombre},

{1 o 2 frases cercanas. Sin jerga.}

1 🗒️ Cuestionarios
Tienes que ir accediendo a cada enlace, e ir respondiendo los ítems. Las respuestas me llegan solamente a mí y las revisaremos la próxima reunión:

1.1 Nombre https://telarapp.cl/r/...
(Solo cuestionarios con URL en «Enlaces y tareas». Si no hay ninguno, omite la sección 1.)

2 📋 Tareas

2.1 Refuerza lo que conversamos en la sesión:
   - 2 a 4 líneas concretas de lo trabajado. Sin diagnosticar.

2.2 Realizar este módulo de actividades y casos prácticos:

Nombre: https://...
(Si dice «sin enlace aún», nombra el módulo y no inventes URL.)

3 ⏱️ Horarios
Si el contexto trae horas, lístalas. Si no: «Si necesitas coordinar un horario, avísame y lo vemos.» Nunca inventes días, horas, secretarias ni WhatsApp.

Cierre corto + «Atentamente,» + nombre de IDENTIDAD + «Psicólogo» o «Psicóloga» (si no hay género: «Psicoterapeuta»).
Usa los enlaces literales del contexto. Cada URL una vez, sin corchetes ni paréntesis extra.`;

/** True si el clínico pidió redactar un correo al paciente (texto libre o chip «Generar emails»). */
export function userAskedForPatientEmail(question) {
  const q = String(question || '').trim();
  if (!q) return false;
  if (/\bEMAIL AL PACIENTE\b/.test(q)) return true;
  const mentionsMail = /\b(e-?mails?|correos?)\b/i.test(q);
  if (!mentionsMail) return false;
  if (/\bno\s+(me\s+)?(des|quiero|pidas?|redactes?)\b.{0,24}\b(e-?mails?|correos?)\b/i.test(q)) {
    return false;
  }
  if (/[¿?]/.test(q) && !/\b(redacta|genera|escribe|arma|prepara)\b/i.test(q)) return false;
  return (
    /\b(redacta|genera|escribe|arma|prepara|haz(?:me)?|dame|quiero|necesito|m[aá]nd(?:a|ame))\b.{0,48}\b(e-?mails?|correos?)\b/i.test(
      q,
    ) ||
    /\b(e-?mails?|correos?)\b.{0,48}\b(paciente|consultante|post-sesi[oó]n|post\s+sesi[oó]n)\b/i.test(q)
  );
}

export function buildAiSystemPrompt(context, { practitioner, referenceDocs, email } = {}) {
  const name = String(practitioner?.name || '').trim();
  const gender = practitioner?.grammaticalGender;
  const genderLine =
    gender === 'm'
      ? 'El profesional es hombre: usa masculino (quedo atento, atento a lo que necesites).'
      : gender === 'f'
        ? 'La profesional es mujer: usa femenino (quedo atenta, atenta a lo que necesites).'
        : 'No asumas el género del profesional. Evita «atento/atenta»; usa «Quedo disponible» o «Cualquier cosa que necesites, escríbeme».';
  const signLine = name
    ? `El profesional se llama ${name}. Usa ese nombre SOLO al firmar un email al paciente cuando te lo pidan. En el resto de respuestas no lo nombres ni escribas «para ti, ${name}».`
    : 'Si no conoces el nombre del profesional, firma emails solo con «Psicoterapeuta» — nunca con [Tu nombre].';
  const docsBlock = formatReferenceDocsForPrompt(referenceDocs);
  const emailBlock = email
    ? `\nEMAIL AL PACIENTE\n${PATIENT_EMAIL_TEMPLATE}\n`
    : `\nEMAIL AL PACIENTE
No redactes un email, ni un ejemplo de email, ni expliques la política de emails, salvo que te pidan explícitamente un correo al paciente (o el chip «Generar emails»).
`;
  const finalRule = email
    ? `REGLA FINAL
Escribe SOLO el email al paciente, con la estructura de EMAIL AL PACIENTE. Sin bibliografía, sin análisis clínico extra, sin protocolos.`
    : `REGLA FINAL
Responde solo lo preguntado. Sin email de muestra, sin bibliografía de relleno, sin tutear al profesional por su nombre, sin protocolos de varias fases salvo que los pidan.`;

  return `Eres un asistente clínico de apoyo al psicoterapeuta. Español de Chile. Corto y concreto.

POSICIÓN
- Apoyas al psicoterapeuta. No diagnosticas, no prescribes, no sustituyes el juicio clínico.
- Puedes rechazar la premisa si hay fallo lógico, dato inventado o pedido que exceda la ficha.
- No adules ni confirmes por cortesía. Si la hipótesis es débil, dilo.
- No simules alianza, empatía terapéutica ni “estar con” el profesional o el paciente.
- Distingue hecho de la ficha, inferencia y especulación. Lo que no esté en el contexto, no lo inventes (nombres extra, violencia, sustancias, diagnósticos, horarios).
- Prefiere una pregunta precisa a un plan largo cuando falte información.

LARGO
- Responde lo que preguntaron. Por defecto: 1 párrafo o hasta 8 líneas.
- No escribas ensayos, ni 3 enfoques, ni «resumen de acciones», ni meta-explicaciones sobre cómo funcionas.
- Programa, plan de sesiones o módulo nuevo: ahí sí puedes extendarte y usar En Telar / Fuera de Telar.
- Una mención al pasar (p. ej. terapia de pareja) no es un pedido de protocolo.

IDENTIDAD DEL PROFESIONAL
${signLine}
${genderLine}

FORMATO
- Evita listas con asteriscos; usa numeración o texto corrido.
- En Telar / Fuera de Telar: SOLO cuando propongas qué hacer ahora (módulos o sesión). Encabezados literales:
  "En Telar:" para lo que se registra en módulos de la app.
  "Fuera de Telar:" para sesión presencial, material impreso, derivaciones o coordinación.
- Al citar un módulo de Telar escribe una sola vez su etiqueta y su id entre corchetes, por ejemplo: GAD-7 [gad7]. No repitas la etiqueta ni el id. Usa solo ids del catálogo. En emails al paciente escribe solo la etiqueta visible, nunca el id.
${emailBlock}
BIBLIOGRAFÍA
- Omite Bibliografía salvo que te pidan fuentes, evidencia o un protocolo.
- Si la incluyes: encabezado literal "Bibliografía" y 2 a 4 fuentes reales. Formato: Autor (año). Título. Revista o editorial.
- Si usaste un documento de referencia del tratamiento, cítalo con el nombre exacto del archivo.
- No inventes DOI, URLs ni artículos inexistentes. Prefiere APA, NICE, OMS, Beck, Linehan, Barlow, DSM-5-TR, CIE-11.
- Nunca en emails al paciente ni en bloques telar-plan / telar-module.

MÓDULOS DISPONIBLES EN TELAR
${buildModuleCatalogText()}

CÓMO ARMAR UN PROGRAMA
- Las escalas subjetivas de ánimo y ansiedad van de 1 a 100. Nunca las interpretes como 0–10 ni inventes un ejemplo si el contexto trae el número.
- registro_inicial y motivo_consulta son de la sesión 1, una sola vez por tratamiento. Nunca los pongas en sesión 2 o posteriores. Si ya están en el contexto del caso, no los vuelvas a citar.
- nota_sesion es registro libre de una hora de seguimiento o acompañamiento (conceptualización). Puede ir en cualquier sesión, una vez por sesión. No sustituye escalas ni formulación. No es tarea entre sesiones.
- Los ids tcc_* son habilidades y tareas entre sesiones. Asigna cada uno como máximo UNA vez, salvo registros reiterables: tcc_registro_pensamientos, tcc_experimento, tcc_monitoreo_actividades. Excepciones: tcc_plan_seguridad es encuadre de riesgo (conceptualización, no tarea ni psicoeducación); tcc_autoconceptos es trabajo de identidad EN sesión, no handout TCC.
- Los ids sig_* y tcc_autoconceptos se trabajan EN sesión (categoría Narrativa). No los trates como handout TCC. sig_felt_sense sí puede repetirse; el resto de narrativa, una vez y se reabre.
- Si un handout ya está en el caso (aparece en el contexto), no lo vuelvas a proponer salvo los reiterables.

MÓDULOS NUEVOS (telar-module)
Redacta ítems genéricos y reutilizables, pensados para la variable clínica (ansiedad, evitación, pánico…), no para la anécdota del caso.
NUNCA incluyas datos del paciente ni ejemplos tomados del relato (nombres, lugares, personas concretas, «el guardia», «el humo», medicamentos específicos, frases textuales). Los ejemplos deben ser abstractos: «una situación laboral estresante», no el detalle de ESTE caso.

ACCIONES APLICABLES
Si el usuario pide un programa o plan de tratamiento, termina tu respuesta con un bloque compacto (JSON en una sola línea si puedes). Nunca dejes el JSON a la vista: el sistema lo convierte en un diálogo «¿Aplico esto?».
\`\`\`telar-plan
{"label":"Nombre del programa","sessions":[{"label":"Evaluación inicial","modules":["gad7","dass21"]}]}
\`\`\`
Si el usuario pide un módulo, cuestionario o registro que no existe en el catálogo, termina con:
\`\`\`telar-module
{"title":"Nombre del módulo","instructions":"Para qué sirve","questions":[{"text":"Enunciado","type":"text"}]}
\`\`\`
Tipos de ítem válidos: "text", "radio" (opción única, requiere "options"), "checkbox" (opción múltiple, requiere "options"), "scale" (0–10), "task" (ejercicio entre sesiones), "info" (indicación sin respuesta).
En "text"/"radio"/"checkbox"/"scale" el campo "text" es un enunciado corto (una línea). En "task" e "info" puedes usar markdown ligero (**negrita**, *cursiva*) y saltos de línea para el cuerpo del ejercicio.
No inventes ids que no estén en el catálogo. Máximo 12 sesiones en el JSON. No incluyas ningún bloque si el usuario no pidió un programa ni un módulo.
${docsBlock ? `\n${docsBlock}\n` : ''}
${finalRule}

Contexto del caso:

${context}`;
}

/** Prompts sugeridos del dock. `hint` va en el tooltip; `prompt` se pega al input. */
export const AI_QUICK_PROMPTS = [
  {
    id: 'analisis',
    label: 'Análisis del caso',
    hint: 'Revisa el tratamiento completo: orientación clínica, hipótesis, focos y cómo va el proceso.',
    prompt:
      'Haz un análisis del caso y una revisión del tratamiento hasta ahora: orientación clínica, hipótesis de trabajo, focos, lo que ya se hizo, qué falta y señales de alerta. Es una lectura de conjunto, no un resumen corto.',
  },
  {
    id: 'programa',
    label: 'Generar tratamiento',
    hint: 'Propone un plan por sesiones con módulos de Telar, sin repetir handouts.',
    prompt:
      '¿Qué programa de tratamiento sugieres para este caso? Indica número de sesiones y qué módulos de Telar usar en cada una. No repitas handouts: cada uno se entrega una sola vez como tarea entre sesiones.',
  },
  {
    id: 'email',
    label: 'Generar emails',
    hint: 'Redacta el correo post-sesión: cuestionarios, tareas de la semana, horarios y firma.',
    prompt:
      'Redacta el email post-sesión para el paciente con la estructura de EMAIL AL PACIENTE: saludo, 1 cuestionarios con sus enlaces reales (URL cruda, una vez, sin markdown), 2 tareas (refuerzo + módulos), 3 horarios solo si están en el contexto, cierre y firma. Tono cercano y profesional, sin jerga técnica. Sin título ni notas internas.',
  },
];

function sanitizeQuestions(rawQuestions) {
  const questions = [];
  (Array.isArray(rawQuestions) ? rawQuestions : []).forEach((raw, i) => {
    const text = String(raw?.text || '').trim();
    if (!text) return;
    const type = isValidItemType(raw?.type) ? raw.type : 'text';
    const q = { id: `q${i + 1}`, text, type, options: [] };
    if (itemTypeNeedsOptions(type)) {
      q.options = (Array.isArray(raw.options) ? raw.options : [])
        .map((o) => String(o || '').trim())
        .filter(Boolean);
      if (!q.options.length) q.options = ['Sí', 'No'];
    }
    questions.push(q);
  });
  return questions;
}

const MODULE_REF_RE = /[ \t]*\[([a-z0-9_]{3,40})\]/g;

/** Nombre corto de un módulo, sin subtítulos tras guion largo ni paréntesis. */
function shortModuleLabel(id) {
  return String(moduleLabelFor(id) || '')
    .split(/[—(]/)[0]
    .trim();
}

/**
 * Convierte las citas `[gad7]` del prompt en algo legible: si la etiqueta ya
 * está en la frase, borra el id; si no, la añade. Los ids inventados se van.
 */
export function humanizeModuleRefs(text = '') {
  const known = new Set(listProposableModules().map((m) => m.id));
  return String(text).replace(MODULE_REF_RE, (_match, id, offset, whole) => {
    if (!known.has(id)) return '';
    const short = shortModuleLabel(id);
    if (!short) return '';
    // Si el nombre ya aparece en la misma línea, el id solo estorba.
    const line = whole.slice(whole.lastIndexOf('\n', offset) + 1, offset).toLowerCase();
    if (line.includes(short.toLowerCase())) return '';
    return ` ${short}`;
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WRAP_OR_BREAK = '(?:\\s|&nbsp;|<br\\s*/?>|</?(?:em|strong)>)*';

function collapseAdjacentSameModuleTags(html) {
  const tag =
    '<button type="button" class="ai-mod-tag" data-module-type="([^"]+)">([^<]*)</button>';
  const ign = WRAP_OR_BREAK;
  let out = String(html);
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(
      new RegExp(`(${tag})${ign}<button type="button" class="ai-mod-tag" data-module-type="\\2">[^<]*</button>`, 'gi'),
      '$1',
    );
    out = out.replace(
      new RegExp(
        `(${tag})${ign}\\3${ign}<button type="button" class="ai-mod-tag" data-module-type="\\2">[^<]*</button>`,
        'gi',
      ),
      '$1',
    );
  }
  return out;
}

/**
 * Convierte ids de módulo (`tcc_sesgos`, `[gad7]`) en botones-tag con el nombre.
 * Recibe HTML ya escapado.
 */
export function markupModuleRefs(html = '') {
  const mods = listProposableModules()
    .map((m) => ({
      id: m.id,
      label: shortModuleLabel(m.id) || m.label || m.id,
    }))
    .filter((m) => m.id)
    .sort((a, b) => b.id.length - a.id.length);
  if (!mods.length) return html;

  const placeholders = [];
  const stash = (id, label) => {
    const clean = String(label || '').trim();
    if (!clean) return '';
    const i = placeholders.length;
    placeholders.push({
      id,
      label: clean,
      html: `<button type="button" class="ai-mod-tag" data-module-type="${escapeHtml(id)}">${escapeHtml(clean)}</button>`,
    });
    return `%%TELARMOD${i}%%`;
  };

  let out = String(html);
  for (const m of mods) {
    const idRe = escapeRegExp(m.id);
    const labelRe = escapeRegExp(m.label);
    const wrappedLabel = `(?:<(?:em|strong)>)?${labelRe}(?:</(?:em|strong)>)?`;
    out = out.replace(
      new RegExp(`${wrappedLabel}${WRAP_OR_BREAK}\\[${idRe}\\]`, 'gi'),
      () => stash(m.id, m.label),
    );
    out = out.replace(new RegExp(`\\[${idRe}\\]`, 'g'), () => stash(m.id, m.label));
  }
  for (const m of mods) {
    const idRe = escapeRegExp(m.id);
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_%])${idRe}(?![A-Za-z0-9_%])`, 'g'), () =>
      stash(m.id, m.label),
    );
  }

  for (let i = 0; i < placeholders.length; i++) {
    const lab = escapeRegExp(placeholders[i].label);
    const wrapped = `(?:<(?:em|strong)>)?${lab}(?:</(?:em|strong)>)?`;
    out = out.replace(new RegExp(`${wrapped}${WRAP_OR_BREAK}%%TELARMOD${i}%%`, 'gi'), `%%TELARMOD${i}%%`);
  }

  out = out.replace(
    new RegExp(`(%%TELARMOD\\d+%%)(?:${WRAP_OR_BREAK}%%TELARMOD\\d+%%)+`, 'gi'),
    (chunk) => {
      const idxs = [...chunk.matchAll(/TELARMOD(\d+)/g)].map((m) => Number(m[1]));
      const kept = [];
      const seen = new Set();
      for (const i of idxs) {
        const id = placeholders[i]?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        kept.push(`%%TELARMOD${i}%%`);
      }
      return kept.join(' ');
    },
  );

  out = out.replace(/%%TELARMOD(\d+)%%/g, (_m, n) => placeholders[Number(n)]?.html || '');
  return collapseAdjacentSameModuleTags(out);
}

function tryParseJson(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    /* truncated or wrapped */
  }
  const start = s.indexOf('{');
  if (start < 0) return null;
  const body = s.slice(start);
  for (const extra of ['', '}', ']}', '"]}', '"}]}', ']}]}', '"]}]}']) {
    try {
      return JSON.parse(body + extra);
    } catch {
      /* next */
    }
  }
  return recoverPlanFromPartial(body);
}

/** Recupera sesiones ya cerradas cuando el JSON se corta a mitad. */
function recoverPlanFromPartial(body) {
  const sessions = [];
  const re =
    /"label"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"modules"\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body))) {
    const modules = m[2]
      .split(',')
      .map((x) => x.replace(/["'\s]/g, ''))
      .filter(Boolean);
    sessions.push({ label: JSON.parse(`"${m[1]}"`), modules });
  }
  if (!sessions.length) return null;
  const firstLabel = body.match(/"label"\s*:\s*"((?:\\.|[^"\\])*)"/);
  return {
    label: firstLabel ? JSON.parse(`"${firstLabel[1]}"`) : 'Programa sugerido por IA',
    sessions,
    truncated: true,
  };
}

function ingestParsed(kind, parsed, actions) {
  if (!parsed || typeof parsed !== 'object') return;
  if (kind === 'plan' || Array.isArray(parsed.sessions)) {
    const plan = sanitizePlan(parsed);
    if (plan) {
      if (parsed.truncated) plan.truncated = true;
      actions.push({ type: 'plan', plan });
    }
    return;
  }
  const title = String(parsed?.title || '').trim();
  const questions = sanitizeQuestions(parsed?.questions);
  if (title && questions.length) {
    actions.push({
      type: 'module',
      module: {
        title,
        instructions: String(parsed?.instructions || '').trim(),
        questions,
      },
    });
  }
}

/** Ficha de ingreso: solo sesión 1, nunca otra vez. */
const INTAKE_ONCE = new Set(['registro_inicial', 'motivo_consulta']);

/** Quita el «Sesión N:» del label si el UI ya muestra el número. */
export function cleanSessionLabel(raw, i) {
  const fallback = `Sesión ${i + 1}`;
  let label = String(raw || fallback).trim();
  label = label.replace(/^(?:sesión|session)\s*\d+\s*[:.\-–—]?\s*/i, '').trim();
  return label || fallback;
}

function sanitizePlan(raw) {
  const known = new Set(listProposableModules().map((m) => m.id));
  const sessions = [];
  const unknown = new Set();
  const seenHomework = new Set();
  const seenIntake = new Set();
  (Array.isArray(raw?.sessions) ? raw.sessions : []).forEach((s, i) => {
    const modules = [];
    (Array.isArray(s?.modules) ? s.modules : []).forEach((id) => {
      const modId = String(id || '').trim();
      if (!modId) return;
      if (!known.has(modId)) {
        unknown.add(modId);
        return;
      }
      if (INTAKE_ONCE.has(modId)) {
        if (i > 0 || seenIntake.has(modId)) return;
        seenIntake.add(modId);
      }
      if (isHomeworkHandout(modId) && seenHomework.has(modId)) return;
      if (isHomeworkHandout(modId)) seenHomework.add(modId);
      modules.push(modId);
    });
    sessions.push({
      label: cleanSessionLabel(s?.label, i),
      modules,
    });
  });
  if (!sessions.length) return null;
  return {
    label: String(raw?.label || 'Programa sugerido por IA').trim(),
    sessions,
    unknownModules: [...unknown],
  };
}

/** Tareas entre sesiones de una sola entrega. No incluye encuadre de riesgo ni significado. */
export function isHomeworkHandout(type) {
  const id = String(type || '');
  if (id === 'tcc_plan_seguridad' || id === 'tcc_autoconceptos') return false;
  if (id.startsWith('sig_')) return false;
  if (!id.startsWith('tcc_')) return false;
  const def = resolveModuleDef(id);
  return def?.oncePerTreatment !== false;
}

/**
 * Separa el texto legible de las acciones aplicables.
 * @returns {{ text: string, actions: Array<object> }}
 */
export function parseAiActions(rawContent = '') {
  const actions = [];
  const applied = new Set();
  const dismissed = new Set();
  let source = String(rawContent)
    .replace(APPLIED_MARKER_RE, (_match, index) => {
      applied.add(Number(index));
      return '';
    })
    .replace(DISMISSED_MARKER_RE, (_match, index) => {
      dismissed.add(Number(index));
      return '';
    });
  let text = source.replace(ACTION_BLOCK_RE, (_match, kind, body) => {
    ingestParsed(String(kind).toLowerCase(), tryParseJson(body), actions);
    return '';
  });

  if (!actions.length) {
    const naked = text.match(/\{[\s\S]*"sessions"\s*:\s*\[[\s\S]*/);
    if (naked) {
      ingestParsed('plan', tryParseJson(naked[0]), actions);
      if (actions.length) {
        text = text.replace(naked[0], '');
      }
    }
  }

  text = text
    .replace(/```[ \t]*(?:json[ \t]+)?telar-(?:plan|module)[\s\S]*?(?:```|$)/gi, '')
    .replace(/```[\s\S]*$/g, '')
    .replace(/^\s*Programa ajustado\s*\(JSON\)\s*:?\s*$/gim, '')
    .replace(/`{1,3}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  actions.forEach((action, index) => {
    action.applied = applied.has(index);
    action.dismissed = !action.applied && dismissed.has(index);
  });
  return { text: text.trim(), actions };
}

function itemTypeSummary(questions) {
  const counts = new Map();
  for (const q of questions) {
    const label = CUSTOM_ITEM_TYPES[q.type]?.label || q.type;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, n]) => `${n} × ${label.toLowerCase()}`).join(' · ');
}

/** HTML de las cards accionables que acompañan una respuesta de IA. */
export function aiActionsHtml(actions, noteId) {
  if (!actions?.length) return '';
  return actions
    .map((action, idx) => {
      if (action.type === 'plan') {
        const { plan } = action;
        const rows = plan.sessions
          .map(
            (s, i) => `
            <li class="ai-action__session">
              <span class="ai-action__session-num">${i + 1}</span>
              <span class="ai-action__session-body">
                <span class="ai-action__session-label">${escapeHtml(s.label)}</span>
                <span class="ai-action__session-mods">${
                  s.modules.length
                    ? s.modules.map((m) => escapeHtml(moduleLabelFor(m))).join(' · ')
                    : 'Sin módulos — sesión de conversación'
                }</span>
              </span>
            </li>`,
          )
          .join('');
        const warn = plan.unknownModules.length
          ? `<p class="ai-action__warn">Se ignoraron módulos que no existen en tu Telar: ${escapeHtml(plan.unknownModules.join(', '))}.</p>`
          : '';
        return `
          <section class="ai-dialog${dialogStateClass(action)}" data-ai-action="plan" data-note-id="${noteId}" data-action-index="${idx}">
            <p class="ai-dialog__ask">¿Aplico este programa al tratamiento actual?</p>
            <p class="ai-dialog__summary">${escapeHtml(plan.label)} · ${plan.sessions.length} sesiones</p>
            <ol class="ai-action__sessions">${rows}</ol>
            ${warn}
            ${plan.truncated ? '<p class="ai-action__warn">El modelo local se quedó corto (límite de tokens). Esto es lo que alcanzó a armar; puedes aplicarlo o pedir el programa de nuevo.</p>' : ''}
            <div class="ai-dialog__foot">
              ${actionChoiceHtml(action, 'Aplicar')}
            </div>
          </section>`;
      }

      const { module: mod } = action;
      const preview = mod.questions
        .slice(0, 6)
        .map(
          (q) => `
          <li class="ai-action__item ai-action__item--${escapeHtml(q.type)}">
            <span class="ai-action__item-type">${escapeHtml(CUSTOM_ITEM_TYPES[q.type]?.label || q.type)}</span>
            <span class="ai-action__item-text">${escapeHtml(q.text)}</span>
          </li>`,
        )
        .join('');
      const more =
        mod.questions.length > 6
          ? `<li class="ai-action__item ai-action__item--more">+ ${mod.questions.length - 6} ítems más</li>`
          : '';
      return `
        <section class="ai-dialog${dialogStateClass(action)}" data-ai-action="module" data-note-id="${noteId}" data-action-index="${idx}">
          <p class="ai-dialog__ask">¿Creo este módulo en tu Telar?</p>
          <p class="ai-dialog__summary">${escapeHtml(mod.title)}</p>
          ${mod.instructions ? `<p class="ai-action__desc">${escapeHtml(mod.instructions)}</p>` : ''}
          <ul class="ai-action__items">${preview}${more}</ul>
          <p class="ai-action__meta">${escapeHtml(itemTypeSummary(mod.questions))}</p>
          <div class="ai-dialog__foot">
            ${actionChoiceHtml(action, 'Crear módulo')}
          </div>
        </section>`;
    })
    .join('');
}

function dialogStateClass(action) {
  if (action.applied) return ' ai-dialog--applied';
  if (action.dismissed) return ' ai-dialog--dismissed';
  return '';
}

function actionChoiceHtml(action, applyLabel) {
  const decided = Boolean(action.applied || action.dismissed);
  const applyCls = action.applied ? ' is-chosen' : '';
  const dismissCls = action.dismissed ? ' is-chosen' : '';
  const disabled = decided ? ' disabled' : '';
  return `
    <button type="button" class="btn btn-primary btn-sm${applyCls}" data-ai-apply${disabled}>${escapeHtml(applyLabel)}</button>
    <button type="button" class="btn btn-ghost btn-sm${dismissCls}" data-ai-dismiss${disabled}>Ahora no</button>`;
}

export function markAiActionApplied(rawContent, actionIndex) {
  const source = String(rawContent);
  const marker = `<!-- telar-action-applied:${Number(actionIndex)} -->`;
  return source.includes(marker) ? source : `${source.trimEnd()}\n${marker}`;
}

export function markAiActionDismissed(rawContent, actionIndex) {
  const source = String(rawContent);
  const marker = `<!-- telar-action-dismissed:${Number(actionIndex)} -->`;
  return source.includes(marker) ? source : `${source.trimEnd()}\n${marker}`;
}

const SELECTOR_TYPE = 'selector_modulo';

/**
 * Resuelve qué filas de `session_modules` hay que insertar, sin tocar la DB.
 *
 * Se calcula en memoria porque `db_execute` es un comando síncrono de Tauri:
 * una llamada por módulo (con sus chequeos de duplicados) bloquea el hilo
 * principal y la ventana se congela a mitad de «Aplicando…».
 */
export function planModuleInserts(specs, sessionIds, existingModules = []) {
  const bySession = new Map();
  const inTreatment = new Set();

  const entryFor = (sessionId) => {
    const key = String(sessionId);
    if (!bySession.has(key)) bySession.set(key, { types: new Set(), maxOrder: -1 });
    return bySession.get(key);
  };

  for (const mod of existingModules) {
    const entry = entryFor(mod.session_id);
    entry.types.add(mod.module_type);
    entry.maxOrder = Math.max(entry.maxOrder, Number(mod.sort_order) || 0);
    inTreatment.add(mod.module_type);
  }

  const rows = [];
  let skipped = 0;

  specs.forEach((spec, i) => {
    const sessionId = sessionIds[i];
    if (!sessionId) return;
    const entry = entryFor(sessionId);

    const add = (type) => {
      entry.maxOrder += 1;
      entry.types.add(type);
      inTreatment.add(type);
      rows.push({ sessionId, type, sortOrder: entry.maxOrder });
    };

    for (const type of Array.isArray(spec?.modules) ? spec.modules : []) {
      const def = resolveModuleDef(type);
      if ((!def && !isCustomModuleType(type)) || type === SELECTOR_TYPE) {
        skipped += 1;
        continue;
      }
      if (!def?.allowMultipleInSession && entry.types.has(type)) {
        skipped += 1;
        continue;
      }
      if (def?.oncePerTreatment && inTreatment.has(type)) {
        skipped += 1;
        continue;
      }
      if (isHomeworkHandout(type) && inTreatment.has(type)) {
        skipped += 1;
        continue;
      }
      add(type);
    }

    // Placeholder para que el terapeuta siga añadiendo módulos a mano.
    if (!entry.types.has(SELECTOR_TYPE)) add(SELECTOR_TYPE);
  });

  return { rows, skipped };
}

/**
 * Crea sesiones y añade módulos según el plan propuesto. Append-only:
 * reutiliza sesiones existentes y nunca borra módulos ya registrados.
 */
export async function applyAiPlan(treatmentId, plan) {
  const specs = Array.isArray(plan?.sessions) ? plan.sessions : [];
  if (!specs.length) throw new Error('El plan no trae sesiones que aplicar.');

  let sessions = await getSessions(treatmentId);

  const missing = specs.length - sessions.length;
  if (missing > 0) {
    const nextNumber = sessions.reduce((max, s) => Math.max(max, Number(s.number) || 0), 0) + 1;
    const params = [];
    const tuples = Array.from({ length: missing }, (_, i) => {
      params.push(treatmentId, nextNumber + i);
      return `(?, ?, 'programada')`;
    });
    await execute(
      `INSERT INTO sessions (treatment_id, number, status) VALUES ${tuples.join(', ')}`,
      params,
    );
    sessions = await getSessions(treatmentId);
  }

  const existing = await getTreatmentModules(treatmentId);
  const { rows, skipped } = planModuleInserts(
    specs,
    specs.map((_, i) => sessions[i]?.id),
    existing,
  );

  if (rows.length) {
    const params = [];
    const tuples = rows.map((r) => {
      params.push(r.sessionId, r.type, r.sortOrder);
      return `(?, ?, ?, 'pendiente', '{}')`;
    });
    await execute(
      `INSERT INTO session_modules (session_id, module_type, sort_order, status, data)
       VALUES ${tuples.join(', ')}`,
      params,
    );
  }

  return {
    sessionsCreated: Math.max(0, missing),
    modulesAdded: rows.filter((r) => r.type !== SELECTOR_TYPE).length,
    modulesSkipped: skipped,
  };
}

/**
 * Guarda el módulo propuesto en «Mis módulos» y lo añade a la última sesión
 * para que quede visible de inmediato.
 */
export async function applyAiModule(treatmentId, moduleSpec) {
  const id = newCustomModuleId();
  const def = {
    id,
    title: moduleSpec.title,
    instructions: moduleSpec.instructions || '',
    questions: moduleSpec.questions,
    createdAt: new Date().toISOString(),
    createdByAi: true,
  };
  await saveCustomModule(def);

  const moduleType = customModuleTypeId(id);
  const sessions = await getSessions(treatmentId);
  const target = sessions[sessions.length - 1];
  let sessionNumber = null;
  if (target) {
    try {
      await addModuleToSession(target.id, moduleType, treatmentId);
      sessionNumber = target.number;
    } catch {
      /* la definición queda guardada aunque no se pueda añadir a la sesión */
    }
  }
  return { def, moduleType, sessionNumber };
}
