/**
 * Acciones aplicables propuestas por la IA.
 *
 * La IA puede cerrar su respuesta con un bloque cercado `telar-plan` o
 * `telar-module`. Aquí se parsean, se validan contra el catálogo real de
 * módulos y se aplican al tratamiento. El bloque se conserva en el contenido
 * de la nota (persiste sin migración de esquema) y se oculta al renderizar.
 */
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

/** Cierre opcional: los modelos cortan el JSON al llegar al tope de tokens. */
const ACTION_BLOCK_RE =
  /```[ \t]*(?:json[ \t]+)?telar-(plan|module)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/gi;
const APPLIED_MARKER_RE = /<!--\s*telar-action-applied:(\d+)\s*-->/gi;

/** Módulos que la IA no debe proponer (placeholders o de uso interno). */
const NON_PROPOSABLE = new Set(['selector_modulo']);

export function listProposableModules() {
  const defs = getModuleDefs();
  return Object.entries(defs)
    .filter(([id]) => !NON_PROPOSABLE.has(id))
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

export function buildAiSystemPrompt(context, { practitioner } = {}) {
  const name = String(practitioner?.name || '').trim();
  const gender = practitioner?.grammaticalGender;
  const genderLine =
    gender === 'm'
      ? 'El profesional es hombre: usa masculino (quedo atento, atento a lo que necesites).'
      : gender === 'f'
        ? 'La profesional es mujer: usa femenino (quedo atenta, atenta a lo que necesites).'
        : 'No asumas el género del profesional. Evita «atento/atenta»; usa «Quedo disponible» o «Cualquier cosa que necesites, escríbeme».';
  const signLine = name
    ? `El profesional se llama ${name}. En emails y textos al paciente fírmalos con ese nombre. Nunca uses placeholders como [Tu nombre], «Tu nombre» ni iniciales inventadas.`
    : 'Si no conoces el nombre del profesional, firma solo con «Psicoterapeuta» — nunca con [Tu nombre].';

  return `Eres un asistente clínico de apoyo al psicoterapeuta. Responde de forma concisa y fundamentada, en español de Chile.

IDENTIDAD DEL PROFESIONAL
${signLine}
${genderLine}

FORMATO
- Evita listas con asteriscos; usa numeración o texto corrido.
- Cuando propongas intervenciones, separa siempre con estos dos encabezados literales:
  "En Telar:" para lo que se registra en módulos de la app.
  "Fuera de Telar:" para lo que ocurre en sesión presencial, material impreso, derivaciones o coordinación.
- Al citar un módulo de Telar escribe una sola vez su etiqueta y su id entre corchetes, por ejemplo: GAD-7 [gad7]. No repitas la etiqueta ni el id. Usa solo ids del catálogo.

MÓDULOS DISPONIBLES EN TELAR
${buildModuleCatalogText()}

CÓMO ARMAR UN PROGRAMA
- Las escalas subjetivas de ánimo y ansiedad van de 1 a 100. Nunca las interpretes como 0–10 ni inventes un ejemplo si el contexto trae el número.
- Los ids tcc_* son habilidades y tareas entre sesiones. Asigna cada uno como máximo UNA vez, salvo registros reiterables: tcc_registro_pensamientos, tcc_experimento, tcc_monitoreo_actividades. Excepciones: tcc_plan_seguridad es encuadre de riesgo (conceptualización, no tarea ni psicoeducación); tcc_autoconceptos es trabajo de identidad EN sesión, no handout TCC.
- Los ids sig_* y tcc_autoconceptos se trabajan EN sesión. No los trates como handout TCC. sig_felt_sense sí puede repetirse; el resto de significado, una vez y se reabre.
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
Tipos de ítem válidos: "text", "checkbox" (requiere "options"), "scale" (0–10), "task" (ejercicio entre sesiones), "info" (indicación sin respuesta).
En "text"/"checkbox"/"scale" el campo "text" es un enunciado corto (una línea). En "task" e "info" puedes usar markdown ligero (**negrita**, *cursiva*) y saltos de línea para el cuerpo del ejercicio.
No inventes ids que no estén en el catálogo. Máximo 12 sesiones en el JSON. No incluyas ningún bloque si el usuario no pidió un programa ni un módulo.

Contexto del caso:

${context}`;
}

/** Prompts sugeridos del dock. `hint` va en el tooltip; `prompt` se pega al input. */
export const AI_QUICK_PROMPTS = [
  {
    id: 'programa',
    label: 'Sugerir programa',
    hint: 'Propone un plan por sesiones con módulos de Telar, sin repetir handouts.',
    prompt:
      '¿Qué programa de tratamiento sugieres para este caso? Indica número de sesiones y qué módulos de Telar usar en cada una. No repitas handouts: cada uno se entrega una sola vez como tarea entre sesiones.',
  },
  {
    id: 'email',
    label: 'Generar email',
    hint: 'Redacta el correo post-sesión: resumen, tarea de la semana y firma del profesional.',
    prompt:
      'Redacta el cuerpo de un email para enviar al paciente después de la sesión de hoy: resumen breve de lo trabajado, elementos a reforzar durante la semana y qué módulos debe traer resueltos para la próxima sesión. Tono cercano y profesional, sin jerga técnica. Firma con el nombre del profesional (el que aparece en IDENTIDAD).',
  },
  {
    id: 'modulo',
    label: 'Módulo a medida',
    hint: 'Diseña un cuestionario o ejercicio nuevo para el foco de este caso.',
    prompt:
      'Propón un módulo nuevo (preguntas y ejercicios) para trabajar el foco principal de este caso entre sesiones. Ítems genéricos, sin ejemplos tomados del relato de este paciente.',
  },
  {
    id: 'resumen',
    label: 'Resumen del caso',
    hint: 'Sintetiza hipótesis diagnóstica, focos de trabajo y señales de alerta.',
    prompt: 'Resume el caso: hipótesis diagnóstica, focos de trabajo y señales de alerta a vigilar.',
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
    const i = placeholders.length;
    placeholders.push({
      id,
      label,
      html: `<button type="button" class="ai-mod-tag" data-module-type="${escapeHtml(id)}">${escapeHtml(label)}</button>`,
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

function sanitizePlan(raw) {
  const known = new Set(listProposableModules().map((m) => m.id));
  const sessions = [];
  const unknown = new Set();
  const seenHomework = new Set();
  (Array.isArray(raw?.sessions) ? raw.sessions : []).forEach((s, i) => {
    const modules = [];
    (Array.isArray(s?.modules) ? s.modules : []).forEach((id) => {
      const modId = String(id || '').trim();
      if (!modId) return;
      if (!known.has(modId)) {
        unknown.add(modId);
        return;
      }
      if (isHomeworkHandout(modId) && seenHomework.has(modId)) return;
      if (isHomeworkHandout(modId)) seenHomework.add(modId);
      modules.push(modId);
    });
    sessions.push({
      label: String(s?.label || `Sesión ${i + 1}`).trim(),
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
  let source = String(rawContent).replace(APPLIED_MARKER_RE, (_match, index) => {
    applied.add(Number(index));
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
    .trim();

  actions.forEach((action, index) => {
    action.applied = applied.has(index);
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
          <section class="ai-dialog${action.applied ? ' ai-dialog--applied' : ''}" data-ai-action="plan" data-note-id="${noteId}" data-action-index="${idx}">
            <p class="ai-dialog__ask">${action.applied ? 'Programa aplicado al tratamiento actual' : '¿Aplico este programa al tratamiento actual?'}</p>
            <p class="ai-dialog__summary">${escapeHtml(plan.label)} · ${plan.sessions.length} sesiones</p>
            <ol class="ai-action__sessions">${rows}</ol>
            ${warn}
            ${plan.truncated ? '<p class="ai-action__warn">La IA cortó el listado; esto es lo que alcanzó a generar.</p>' : ''}
            <div class="ai-dialog__foot">
              ${action.applied ? appliedActionHtml() : `
                <button type="button" class="btn btn-primary btn-sm" data-ai-apply>Aplicar</button>
                <button type="button" class="btn btn-ghost btn-sm" data-ai-dismiss>Ahora no</button>
              `}
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
        <section class="ai-dialog${action.applied ? ' ai-dialog--applied' : ''}" data-ai-action="module" data-note-id="${noteId}" data-action-index="${idx}">
          <p class="ai-dialog__ask">${action.applied ? 'Módulo creado en Telar' : '¿Creo este módulo en tu Telar?'}</p>
          <p class="ai-dialog__summary">${escapeHtml(mod.title)}</p>
          ${mod.instructions ? `<p class="ai-action__desc">${escapeHtml(mod.instructions)}</p>` : ''}
          <ul class="ai-action__items">${preview}${more}</ul>
          <p class="ai-action__meta">${escapeHtml(itemTypeSummary(mod.questions))}</p>
          <div class="ai-dialog__foot">
            ${action.applied ? appliedActionHtml() : `
              <button type="button" class="btn btn-primary btn-sm" data-ai-apply>Crear módulo</button>
              <button type="button" class="btn btn-ghost btn-sm" data-ai-dismiss>Ahora no</button>
            `}
          </div>
        </section>`;
    })
    .join('');
}

function appliedActionHtml() {
  return `<span class="ai-dialog__applied" role="status">
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.7 5.7 8.5 14l-4.2-4.2" />
    </svg>
    Aplicado
  </span>`;
}

export function markAiActionApplied(rawContent, actionIndex) {
  const source = String(rawContent);
  const marker = `<!-- telar-action-applied:${Number(actionIndex)} -->`;
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
  saveCustomModule(def);

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
