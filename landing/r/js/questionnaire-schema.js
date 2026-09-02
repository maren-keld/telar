/**
 * Cuestionarios declarativos (schema 1) — puntuación pura, sin DOM.
 *
 * El mismo archivo lo usan la app de escritorio (renderer genérico, PDF, texto
 * para IA) y la página web del paciente cuando el módulo se comparte por enlace,
 * así que no puede importar nada del resto del proyecto.
 *
 * Forma de una definición:
 * {
 *   schema: 1,
 *   id: 'gad7',
 *   title: 'GAD-7 — Ansiedad generalizada',
 *   subtitle: '7 ítems · escala 0–3 · últimas 2 semanas.',
 *   instructions: 'Durante las últimas 2 semanas, ¿con qué frecuencia…?',
 *   lang: 'es',
 *   items: [{ text, reverse?, subscale? } | 'texto'],
 *   // Un ítem puede ser deslizador continuo en vez de opciones discretas:
 *   //   { text, kind: 'slider', min: 0, max: 10, step: 1, minLabel?, maxLabel? }
 *   options: [{ v: 0, label: 'Para nada' }, …],
 *   perItemOptions?: { 3: [{ v, label }, …] },   // override por índice de ítem
 *   scoring: {
 *     kind: 'sum' | 'mean' | 'count-threshold',
 *     reverseMax?: 5,                            // ítem inverso: reverseMax - v
 *     itemThresholds?: [3, { lte: 1 }, …],       // solo count-threshold
 *     subscales?: [{ id, label, items: [0, 2], kind?: 'sum' | 'mean' }],
 *     max?: 21,
 *     bands: [{ max: 4, label: 'Mínima', cls? }],
 *     cutoff?: { value: 10, label: 'Depresión probable' },
 *   },
 *   riskItems?: [{ index: 8, gte?: 1, message: 'Ideación de muerte' }],
 *   attribution: { authors, year?, license, source?, note? },
 * }
 */

export const QUESTIONNAIRE_SCHEMA_VERSION = 1;

export const SCORING_KINDS = ['sum', 'mean', 'count-threshold'];

/* ------------------------------ helpers ------------------------------- */

/** Normaliza `items` para aceptar strings sueltos además de objetos. */
export function questionnaireItems(def) {
  return (def?.items || []).map((item, idx) =>
    typeof item === 'string' ? { text: item, index: idx } : { ...item, index: idx },
  );
}

/** Opciones aplicables a un ítem (con override por índice). Vacío en deslizadores. */
export function optionsForItem(def, index) {
  const items = def?.items || [];
  const item = items[index];
  if (item && typeof item === 'object' && item.kind === 'slider') return [];
  const override = def?.perItemOptions?.[index] ?? def?.perItemOptions?.[String(index)];
  return override || def?.options || [];
}

/** Rango de un ítem deslizador. */
export function sliderRange(item) {
  return {
    min: typeof item?.min === 'number' ? item.min : 0,
    max: typeof item?.max === 'number' ? item.max : 10,
    step: typeof item?.step === 'number' ? item.step : 1,
  };
}

function itemMaxValue(def, item) {
  if (item.kind === 'slider') return sliderRange(item).max;
  return optionsForItem(def, item.index).reduce((m, o) => Math.max(m, Number(o.v) || 0), 0);
}

function isBlank(v) {
  return v === null || v === undefined || v === '';
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Valor del ítem ya corregido por inversión. */
function itemValue(def, item, raw) {
  const n = toNumber(raw);
  if (n === null) return null;
  const reverseMax = def?.scoring?.reverseMax;
  if (item.reverse && typeof reverseMax === 'number') return reverseMax - n;
  return n;
}

/** Un ítem de tipo count-threshold puntúa 1 o 0. */
function thresholdScore(threshold, raw) {
  const n = toNumber(raw);
  if (n === null) return null;
  if (typeof threshold === 'number') return n >= threshold ? 1 : 0;
  if (threshold && typeof threshold === 'object') {
    if (typeof threshold.gte === 'number' && n < threshold.gte) return 0;
    if (typeof threshold.lte === 'number' && n > threshold.lte) return 0;
    if (typeof threshold.gte !== 'number' && typeof threshold.lte !== 'number') return 0;
    return 1;
  }
  return 0;
}

function bandFor(bands, total) {
  if (!bands?.length || total === null) return null;
  return bands.find((b) => total <= b.max) || bands[bands.length - 1];
}

function roundTo(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Techo teórico de la escala si la definición no lo declara. */
export function questionnaireMax(def) {
  const declared = def?.scoring?.max;
  if (typeof declared === 'number') return declared;
  const items = questionnaireItems(def);
  const kind = def?.scoring?.kind || 'sum';
  if (kind === 'count-threshold') return items.length;
  const perItemMax = items.reduce((acc, item) => acc + itemMaxValue(def, item), 0);
  if (kind === 'mean') {
    return items.length ? roundTo(perItemMax / items.length) : 0;
  }
  return perItemMax;
}

/* ------------------------------ scoring ------------------------------- */

function scoreSubscale(def, sub, answers) {
  const items = questionnaireItems(def);
  let sum = 0;
  let count = 0;
  let max = 0;
  for (const idx of sub.items || []) {
    const item = items[idx];
    if (!item) continue;
    max += itemMaxValue(def, item);
    const v = itemValue(def, item, answers?.[idx]);
    if (v === null) continue;
    sum += v;
    count += 1;
  }
  const kind = sub.kind || def?.scoring?.kind || 'sum';
  const total = kind === 'mean' ? (count ? roundTo(sum / count) : null) : count ? sum : null;
  return {
    id: sub.id,
    label: sub.label || sub.id,
    total,
    answered: count,
    itemCount: (sub.items || []).length,
    max: typeof sub.max === 'number' ? sub.max : kind === 'mean' ? null : max,
    aboveCutoff: typeof sub.cutoff === 'number' && total !== null ? total >= sub.cutoff : null,
    cutoff: typeof sub.cutoff === 'number' ? sub.cutoff : null,
  };
}

/**
 * Puntúa un cuestionario.
 * @param {object} def Definición schema 1.
 * @param {Array<number|string|null>} answers Respuestas por índice de ítem.
 * @returns {null|object} `null` si no hay ninguna respuesta.
 */
export function scoreQuestionnaire(def, answers) {
  const items = questionnaireItems(def);
  if (!items.length) return null;
  const scoring = def.scoring || { kind: 'sum' };
  const kind = scoring.kind || 'sum';

  let sum = 0;
  let answeredCount = 0;
  let positives = 0;

  items.forEach((item, idx) => {
    const raw = answers?.[idx];
    if (isBlank(raw)) return;
    if (kind === 'count-threshold') {
      const score = thresholdScore(scoring.itemThresholds?.[idx], raw);
      if (score === null) return;
      answeredCount += 1;
      positives += score;
      sum += score;
      return;
    }
    const v = itemValue(def, item, raw);
    if (v === null) return;
    answeredCount += 1;
    sum += v;
  });

  if (!answeredCount) return null;

  const total = kind === 'mean' ? roundTo(sum / answeredCount) : sum;
  const band = bandFor(scoring.bands, total);
  const cutoff = scoring.cutoff;
  const subscales = (scoring.subscales || []).map((sub) => scoreSubscale(def, sub, answers));

  const riskFlags = (def.riskItems || [])
    .map((risk) => {
      const raw = answers?.[risk.index];
      if (isBlank(raw)) return null;
      const n = toNumber(raw);
      if (n === null) return null;
      const min = typeof risk.gte === 'number' ? risk.gte : 1;
      if (n < min) return null;
      return { index: risk.index, score: n, message: risk.message };
    })
    .filter(Boolean);

  return {
    total,
    max: questionnaireMax(def),
    answered: answeredCount,
    itemCount: items.length,
    complete: answeredCount === items.length,
    positives: kind === 'count-threshold' ? positives : null,
    label: band?.label || '',
    cls: band?.cls || '',
    bandText: band?.text || '',
    cutoff: typeof cutoff?.value === 'number' ? cutoff.value : null,
    cutoffLabel: cutoff?.label || '',
    aboveCutoff: typeof cutoff?.value === 'number' ? total >= cutoff.value : null,
    subscales,
    riskFlags,
  };
}

/** Texto plano para `readable_text`, PDF y contexto de IA. */
export function questionnaireReadable(def, data) {
  const answers = Array.isArray(data?.answers) ? data.answers : [];
  const s = scoreQuestionnaire(def, answers);
  if (!s) return '';
  const lines = [];
  const totalLabel = def.scoring?.kind === 'mean' ? 'Media' : 'Total';
  const maxPart = s.max ? `/${s.max}` : '';
  lines.push(`${totalLabel}: ${s.total}${maxPart}${s.label ? ` (${s.label})` : ''}`);
  if (s.positives !== null) {
    lines.push(`Ítems positivos: ${s.positives}/${s.itemCount}`);
  }
  if (s.aboveCutoff === true) {
    lines.push(`Sobre el punto de corte (≥${s.cutoff})${s.cutoffLabel ? ` — ${s.cutoffLabel}` : ''}.`);
  } else if (s.aboveCutoff === false) {
    lines.push(`Bajo el punto de corte (≥${s.cutoff}).`);
  }
  for (const sub of s.subscales) {
    if (sub.total === null) continue;
    lines.push(`${sub.label}: ${sub.total}${sub.max ? `/${sub.max}` : ''}`);
  }
  for (const risk of s.riskFlags) {
    lines.push(`ALERTA ítem ${risk.index + 1}: ${risk.message} (respuesta ${risk.score}).`);
  }
  if (s.bandText) lines.push(s.bandText);
  if (!s.complete) lines.push(`(${s.answered}/${s.itemCount} ítems respondidos)`);
  if (data?.notes?.trim?.()) lines.push(`Notas: ${data.notes.trim()}`);
  return lines.join('\n');
}

/** Respuestas vacías del largo correcto. */
export function emptyAnswers(def) {
  return Array(questionnaireItems(def).length).fill(null);
}

/* ---------------------------- validación ------------------------------ */

/**
 * Valida una definición antes de guardarla (importación de packs y chatbot).
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateQuestionnaire(def) {
  const errors = [];
  if (!def || typeof def !== 'object') {
    return { ok: false, errors: ['La definición no es un objeto.'] };
  }
  if (def.schema !== QUESTIONNAIRE_SCHEMA_VERSION) {
    errors.push(`schema debe ser ${QUESTIONNAIRE_SCHEMA_VERSION}.`);
  }
  if (!String(def.title || '').trim()) errors.push('Falta title.');
  const items = questionnaireItems(def);
  if (!items.length) errors.push('Falta items (al menos uno).');
  items.forEach((item, idx) => {
    if (!String(item.text || '').trim()) errors.push(`El ítem ${idx + 1} no tiene texto.`);
    if (item.kind !== 'slider' && !optionsForItem(def, idx).length) {
      errors.push(`El ítem ${idx + 1} no tiene opciones.`);
    }
  });
  const scoring = def.scoring;
  if (!scoring || typeof scoring !== 'object') {
    errors.push('Falta scoring.');
  } else {
    const kind = scoring.kind || 'sum';
    if (!SCORING_KINDS.includes(kind)) {
      errors.push(`scoring.kind debe ser uno de: ${SCORING_KINDS.join(', ')}.`);
    }
    if (kind === 'count-threshold' && (scoring.itemThresholds || []).length !== items.length) {
      errors.push('scoring.itemThresholds debe tener un umbral por ítem.');
    }
    if (items.some((i) => i.reverse) && typeof scoring.reverseMax !== 'number') {
      errors.push('Hay ítems inversos pero falta scoring.reverseMax.');
    }
    for (const band of scoring.bands || []) {
      if (typeof band?.max !== 'number') errors.push('Cada banda necesita max numérico.');
    }
    for (const sub of scoring.subscales || []) {
      if (!Array.isArray(sub?.items) || !sub.items.length) {
        errors.push(`La subescala «${sub?.id || sub?.label || '?'}» no tiene ítems.`);
      }
      for (const idx of sub?.items || []) {
        if (!items[idx]) errors.push(`La subescala «${sub.id}» apunta al ítem inexistente ${idx}.`);
      }
    }
  }
  for (const risk of def.riskItems || []) {
    if (!items[risk?.index]) errors.push(`riskItems apunta al ítem inexistente ${risk?.index}.`);
  }
  return { ok: errors.length === 0, errors };
}
