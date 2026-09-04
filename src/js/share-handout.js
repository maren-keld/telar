/**
 * Traduce un handout TCC/narrativa a lo que viaja en el enlace del paciente.
 * Sin aciertos de quiz ni metadatos internos: el clínico los ve en la ficha.
 */

function str(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function mapOptions(list) {
  return (list || [])
    .map((o) => ({ v: String(o?.v ?? ''), label: str(o?.label) }))
    .filter((o) => o.v && o.label);
}

/**
 * @param {object|null|undefined} def `tccHandoutDef(type)`
 * @returns {object|null}
 */
export function toShareHandout(def) {
  if (!def || typeof def !== 'object') return null;

  const sections = (def.sections || [])
    .map((s) => {
      if (!s?.key || !str(s.title)) return null;
      const type = s.type === 'radio' || s.type === 'number' ? s.type : 'text';
      const item = { key: String(s.key), title: str(s.title), type };
      if (str(s.hint)) item.hint = str(s.hint);
      if (type === 'text') {
        const rows = Number(s.rows);
        item.rows = Number.isFinite(rows) ? Math.min(Math.max(rows, 2), 12) : 4;
      }
      if (type === 'number') {
        item.min = typeof s.min === 'number' ? s.min : 0;
        item.max = typeof s.max === 'number' ? s.max : 100;
      }
      if (type === 'radio') {
        item.options = mapOptions(s.options);
        if (!item.options.length) return null;
      }
      return item;
    })
    .filter(Boolean);

  const quiz = (def.quiz || [])
    .map((q) => {
      const options = mapOptions(q?.options);
      if (!q?.key || !str(q.prompt) || !options.length) return null;
      return { key: String(q.key), prompt: str(q.prompt), options };
    })
    .filter(Boolean);

  if (!sections.length && !quiz.length) return null;

  const activityGroups = (def.activityGroups || [])
    .map((g) => ({
      title: str(g?.title),
      items: (g?.items || []).map((item) => str(item)).filter(Boolean),
    }))
    .filter((g) => g.items.length);

  return {
    title: str(def.title, 'Tarea'),
    subtitle: str(def.subtitle),
    intro: str(def.intro),
    warning: str(def.warning),
    activityGroups,
    sections,
    quiz,
  };
}

export function handoutStorage(handout) {
  return {
    kind: 'handout',
    keys: (handout?.sections || []).map((s) => s.key),
    quizKeys: (handout?.quiz || []).map((q) => q.key),
  };
}

function pickStringMap(source, allowed) {
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const v = source[key];
    if (v == null) out[key] = '';
    else out[key] = String(v);
  }
  return out;
}

/**
 * Vuelve a los campos que guarda el módulo (`tcc-generic` / ABC / plan).
 * @param {{ keys?: string[], quizKeys?: string[] }} storage
 * @param {{ fields?: object, quiz?: object }} response
 */
export function patchFromHandoutResponse(storage, response) {
  const keys = storage?.keys || [];
  const quizKeys = storage?.quizKeys || [];
  const patch = pickStringMap(response?.fields, keys);
  if (quizKeys.length) {
    const quiz = pickStringMap(response?.quiz, quizKeys);
    if (Object.keys(quiz).length) patch.quiz = quiz;
  }
  return patch;
}
