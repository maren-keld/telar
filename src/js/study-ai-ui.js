/** Human-facing requests stay separate from the assistant's action protocol. */
export const STUDY_AI_REQUESTS = {
  analysis: { question: 'Analiza el caso', instructions: 'Analiza el caso completo: motivo de consulta, problemas, habilidades, factores protectores y riesgos. Distingue evidencia registrada, hipótesis y datos que falta confirmar. Revisa primero la seguridad y la suicidalidad cuando haya evidencia, aunque un puntaje global sea bajo. Este análisis puede superar el límite habitual de ocho líneas, manteniendo secciones breves. Explica tus sugerencias. Para cada elemento propuesto incluye un bloque ```telar-element con JSON {"axis":"problem|resource|skill|risk","title":"nombre","manifestations":["evidencia registrada"],"explanation":"justificación"}. No incorpores cambios automáticamente ni inventes evidencia.' },
  prioritize: { question: 'Prioriza los problemas del caso', instructions: 'Propón una priorización de TODOS los problemas registrados usando exclusivamente sus nombres exactos, sin añadir estados entre paréntesis. Primero aborda la seguridad: suicidalidad, autolesión y otros riesgos inmediatos tienen precedencia sobre síntomas y funcionamiento. Si la anamnesis señala suicidalidad sin un elemento registrado, empieza por explicar la necesidad de evaluar seguridad; no inventes un problema en el orden. No descartes riesgo por un puntaje bajo ni uses escalas para predecir suicidio. Explica evidencia, urgencia, preferencias y qué falta confirmar. Al final incluye un bloque ```telar-priority con JSON {"titles":["nombre exacto", "otro nombre exacto"]} con cada problema una sola vez. El profesional revisará el orden antes de aplicarlo.' },
  program: { question: 'Genera un programa de tratamiento', instructions: 'Genera un programa de tratamiento con sesiones y módulos de Telar. Explica por qué propones cada intervención y con qué problemas y habilidades se relaciona. Atiende primero la seguridad si hay evidencia de riesgo inmediato. Incluye el protocolo telar-plan para que el profesional pueda revisar e incorporar el programa.' },
  resources: { question: 'Analiza los factores protectores', instructions: 'Analiza los factores protectores registrados y sus evidencias. Solo Actividad física, Creatividad y Participación en comunidad tienen actividades concretas; Red de apoyo tiene personas. Distingue evidencia, hipótesis y datos por confirmar. Propón cómo fortalecerlos. Para cada elemento nuevo o evidencia nueva incluye un bloque ```telar-element con JSON {"axis":"resource","title":"nombre del factor","manifestations":["evidencia fiel al caso"],"explanation":"justificación"}. No inventes evidencia ni incorpores cambios automáticamente.' },
};

export function resourceDetailSpec(element) {
  if (element.axis !== 'resource') return null;
  const title = String(element.title || '').trim();
  if (/^creatividad$/i.test(title)) return { label: 'Actividades concretas', placeholder: 'Una por línea; por ejemplo, escribir o tocar guitarra' };
  if (/^actividad f[ií]sica$/i.test(title)) return { label: 'Actividades concretas', placeholder: 'Una por línea; por ejemplo, caminar, nadar o jugar fútbol' };
  if (/^participaci[oó]n en comunidad$/i.test(title)) return { label: 'Actividades concretas', placeholder: 'Una por línea; por ejemplo, coro de la iglesia o voluntariado vecinal' };
  return null;
}

export function normalizePriorityTitles(titles, elements) {
  const problems = elements.filter((el) => el.axis === 'problem' && el.title?.trim());
  const key = (text) => String(text).trim().toLocaleLowerCase();
  const names = new Map(problems.map((el) => [key(el.title), el.title]));
  const ordered = [];
  for (const title of titles || []) {
    const clean = String(title).replace(/\s*\((?:en desarrollo|explorando|gestionado|presente)\)\s*$/i, '');
    const exact = names.get(key(clean));
    if (exact && !ordered.includes(exact)) ordered.push(exact);
  }
  for (const el of problems) if (!ordered.includes(el.title)) ordered.push(el.title);
  // Known safety problems cannot be lost or pushed behind symptom management.
  return [...ordered.filter((title) => /suicid|autolesi[oó]n/i.test(title)), ...ordered.filter((title) => !/suicid|autolesi[oó]n/i.test(title))];
}

export function normalizePriorityResponse(text, elements) {
  return String(text).replace(/```[ \t]*(?:json[ \t]+)?telar-priority\s*([\s\S]*?)(?:```|$)/gi, (block, json) => {
    try {
      const value = JSON.parse(json);
      if (!Array.isArray(value.titles)) return block;
      value.titles = normalizePriorityTitles(value.titles, elements);
      return '```telar-priority\n' + JSON.stringify(value) + '\n```';
    } catch { return block; }
  });
}

/** Older notes may contain the full dashboard protocol as their source label. */
export function studyQuestionLabel(source) {
  const text = String(source || '');
  if (!/telar-(?:element|priority)|JSON/.test(text)) return text;
  if (text.startsWith('Analiza los factores protectores registrados')) return STUDY_AI_REQUESTS.resources.question;
  if (text.startsWith('Propón una priorización de los problemas registrados')) return STUDY_AI_REQUESTS.prioritize.question;
  return text;
}
