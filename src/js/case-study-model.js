/**
 * Modelo clínico compartido: Estudio de caso (full) ↔ Perfil rail (lite).
 * Un solo documento por tratamiento; Perfil proyecta ejes resource/defense/risk.
 */

export const CASE_STUDY_AXES = [
  { id: 'problem', label: 'Problemas', addLabel: 'Añadir problema', nav: true },
  { id: 'resource', label: 'Factores protectores', addLabel: 'Añadir factor protector', nav: true },
  { id: 'defense', label: 'Defensas psíquicas', addLabel: 'Añadir defensa', nav: true },
  { id: 'risk', label: 'Riesgos', addLabel: 'Añadir riesgo', nav: true },
  { id: 'other', label: 'Otros', addLabel: 'Añadir elemento', nav: true },
];

const AXIS_NAV = (id) => {
  const axis = CASE_STUDY_AXES.find((a) => a.id === id);
  return { id, label: axis.label, kind: 'axis' };
};

export const ESTUDIO_NAV = [
  { id: 'summary', label: 'Resumen', kind: 'page' },
  AXIS_NAV('problem'),
  AXIS_NAV('resource'),
  AXIS_NAV('defense'),
  AXIS_NAV('risk'),
  { id: 'scores', label: 'Puntajes', kind: 'page' },
  { id: 'docs', label: 'Documentación', kind: 'page' },
  AXIS_NAV('other'),
];

export const SUPPORT_NETWORK_TITLE = 'Red de apoyo (emocional)';
export const SUPPORT_NETWORK_KIND = 'support_network';

const AXIS_BY_ID = Object.fromEntries(CASE_STUDY_AXES.map((axis) => [axis.id, axis]));

/** Perfil lite ↔ ejes del estudio */
export const PROFILE_AXIS_MAP = {
  fortalezas: 'resource',
  defensas: 'defense',
  riesgos: 'risk',
};

export const AXIS_PROFILE_MAP = {
  resource: 'fortalezas',
  defense: 'defensas',
  risk: 'riesgos',
};

const STATUS_OPTIONS = {
  problem: ['present', 'developing', 'unknown'],
  resource: ['present', 'developing', 'unknown'],
  defense: ['present', 'developing', 'unknown'],
  risk: ['present', 'developing', 'unknown'],
  other: ['present', 'developing', 'unknown'],
};

export const STATUS_LABELS = {
  present: 'Presente',
  developing: 'Desarrollar',
  unknown: 'Desconocido',
};

const LEGACY_STATUS = {
  active: 'present',
  in_progress: 'developing',
  graduated: 'present',
  restratified: 'present',
};

function itemText(item) {
  return typeof item === 'string' ? item : item?.text;
}

function normalizeItem(item, { checkable = true } = {}) {
  return {
    text: String(itemText(item) ?? '').trim(),
    checked: checkable ? Boolean(item?.checked) : false,
  };
}

function normalizeItems(items, opts) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeItem(item, opts));
}

export function makeCaseStudyId(prefix = 'cs') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAxis(axis) {
  return AXIS_BY_ID[axis] ? axis : 'problem';
}

function normalizeStatus(axis, status) {
  const allowed = STATUS_OPTIONS[normalizeAxis(axis)] || STATUS_OPTIONS.problem;
  const mapped = LEGACY_STATUS[status] || status;
  if (allowed.includes(mapped)) return mapped;
  return 'unknown';
}

export function normalizeCaseStudyElement(raw = {}, fallbackAxis = 'problem') {
  const axis = normalizeAxis(raw.axis || fallbackAxis);
  const kind =
    raw.kind === SUPPORT_NETWORK_KIND ||
    String(raw.title || raw.name || '').trim().toLowerCase() === SUPPORT_NETWORK_TITLE.toLowerCase()
      ? SUPPORT_NETWORK_KIND
      : 'standard';
  return {
    id: String(raw.id || makeCaseStudyId()),
    axis: kind === SUPPORT_NETWORK_KIND ? 'resource' : axis,
    kind,
    title:
      kind === SUPPORT_NETWORK_KIND
        ? SUPPORT_NETWORK_TITLE
        : String(raw.title || raw.name || '').trim(),
    status: normalizeStatus(kind === SUPPORT_NETWORK_KIND ? 'resource' : axis, raw.status),
    manifestations: normalizeItems(raw.manifestations, { checkable: false }),
    indicators: normalizeItems(raw.indicators),
    objectives: normalizeItems(raw.objectives),
    evidence: normalizeItems(raw.evidence || raw.evidenceRefs, { checkable: false }),
    notes: String(raw.notes || '').trim(),
    people: (Array.isArray(raw.people) ? raw.people : []).map(normalizeSupportPerson),
    activities: (Array.isArray(raw.activities) ? raw.activities : [])
      .map((row) => ({
        moduleType: String(row.moduleType || row.type || '').trim(),
        sessionId: row.sessionId != null && row.sessionId !== '' ? String(row.sessionId) : '',
      }))
      .filter((row) => row.moduleType),
  };
}

function uniqueByAxisTitle(elements) {
  const seen = new Set();
  return elements.filter((element) => {
    const key = `${element.axis}::${element.title.trim().toLowerCase()}`;
    if (!element.title) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legacyProblemToElement(rawProblem = {}) {
  return normalizeCaseStudyElement(
    {
      axis: 'problem',
      title: rawProblem.name || rawProblem.text || '',
      status: rawProblem.assigned ? 'active' : 'in_progress',
      indicators: rawProblem.indicators,
      objectives: rawProblem.objectives,
    },
    'problem',
  );
}

function normalizeSupportPerson(raw = {}) {
  return {
    name: String(raw.name || '').trim(),
    gender: String(raw.gender || '').trim(),
    relation: String(raw.relation || 'Otro').trim() || 'Otro',
    domain: String(raw.domain || 'Armonía').trim() || 'Armonía',
    notes: String(raw.notes || '').trim(),
  };
}

/**
 * @param {object} data — JSON persistido o parcial
 * @param {object} [profileSeeds] — { resource|defense|risk: elements[] } desde Perfil checked
 * @param {object} [legacy] — { problems, formulation, supportPeople }
 */
export function normalizeCaseStudyData(data = {}, profileSeeds = {}, legacy = {}) {
  const raw = data?.elements ? data : data?.formulation || data || {};
  const hasNative = Array.isArray(raw.elements) && raw.elements.length > 0;

  const legacyElements = [
    ...((Array.isArray(legacy.problems) ? legacy.problems : []).map(legacyProblemToElement)),
    ...(Array.isArray(legacy.formulation?.elements)
      ? legacy.formulation.elements.map((el) => normalizeCaseStudyElement(el))
      : []),
    ...(profileSeeds.resource || []),
    ...(profileSeeds.defense || []),
    ...(profileSeeds.risk || []),
  ];

  const supportPeople = (
    Array.isArray(raw.supportPeople)
      ? raw.supportPeople
      : Array.isArray(legacy.supportPeople)
        ? legacy.supportPeople
        : []
  ).map(normalizeSupportPerson);

  let nextElements = uniqueByAxisTitle(
    hasNative ? raw.elements.map((el) => normalizeCaseStudyElement(el)) : legacyElements,
  );
  if (!nextElements.some((el) => el.kind === SUPPORT_NETWORK_KIND)) {
    nextElements = [
      ...nextElements,
      normalizeCaseStudyElement({
        axis: 'resource',
        kind: SUPPORT_NETWORK_KIND,
        title: SUPPORT_NETWORK_TITLE,
        people: supportPeople,
        status: 'active',
      }),
    ];
  } else if (supportPeople.length) {
    nextElements = nextElements.map((el) => {
      if (el.kind !== SUPPORT_NETWORK_KIND || el.people.length) return el;
      return { ...el, people: supportPeople };
    });
  }

  const selectedAxis = normalizeAxis(raw.selectedAxis || nextElements[0]?.axis || 'problem');
  const selectedElementId = nextElements.some((el) => el.id === raw.selectedElementId)
    ? raw.selectedElementId
    : nextElements.find((el) => el.axis === selectedAxis)?.id || nextElements[0]?.id || '';

  const network = nextElements.find((el) => el.kind === SUPPORT_NETWORK_KIND);

  return {
    version: 1,
    selectedAxis,
    selectedNav: ESTUDIO_NAV.some((item) => item.id === raw.selectedNav)
      ? raw.selectedNav
      : 'summary',
    selectedElementId,
    elements: nextElements,
    supportPeople: network?.people?.length ? network.people : supportPeople,
  };
}

export function emptyCaseStudyElement(axis = 'problem', title = '') {
  return normalizeCaseStudyElement({ axis, title, status: 'unknown' }, axis);
}

export function profileSeedsFromChecks(checksByCategory = {}) {
  const seeds = { resource: [], defense: [], risk: [] };
  for (const [category, axis] of Object.entries(PROFILE_AXIS_MAP)) {
    const rows = checksByCategory[category] || [];
    seeds[axis] = rows
      .filter((row) => Number(row.checked) === 1)
      .map((row) => emptyCaseStudyElement(axis, row.label));
  }
  return seeds;
}

/** Lite: títulos activos por categoría de Perfil (resource/defense/risk). */
export function profileLiteFromCaseStudy(caseStudy) {
  const out = { fortalezas: [], defensas: [], riesgos: [] };
  for (const el of caseStudy?.elements || []) {
    const category = AXIS_PROFILE_MAP[el.axis];
    if (!category || !el.title.trim()) continue;
    if (el.kind === SUPPORT_NETWORK_KIND) continue;
    out[category].push(el.title.trim());
  }
  return out;
}

/**
 * Marcar/desmarcar un ítem de Perfil sobre el mismo modelo (sin segundo store).
 * checked=true → asegura elemento con ese título; false → lo quita del eje.
 */
export function applyProfileCheckToCaseStudy(caseStudy, category, label, checked) {
  const axis = PROFILE_AXIS_MAP[category];
  if (!axis) return caseStudy;
  const title = String(label || '').trim();
  if (!title) return caseStudy;

  const next = {
    ...caseStudy,
    elements: [...(caseStudy.elements || [])],
  };
  const idx = next.elements.findIndex(
    (el) => el.axis === axis && el.title.trim().toLowerCase() === title.toLowerCase(),
  );

  if (checked) {
    if (idx < 0) {
      const el = emptyCaseStudyElement(axis, title);
      next.elements.push(el);
      next.selectedAxis = axis;
      next.selectedElementId = el.id;
    }
  } else if (idx >= 0) {
    const removed = next.elements[idx];
    next.elements.splice(idx, 1);
    if (next.selectedElementId === removed.id) {
      next.selectedElementId =
        next.elements.find((el) => el.axis === axis)?.id || next.elements[0]?.id || '';
    }
  }
  return normalizeCaseStudyData(next);
}

export function statusesForAxis(axis) {
  return STATUS_OPTIONS[normalizeAxis(axis)] || STATUS_OPTIONS.problem;
}

export const AXIS_MODULE_HINTS = {
  problem: ['gad7', 'dass21', 'tcc_abc', 'tcc_preocupaciones', 'tcc_registro_pensamientos'],
  resource: ['tcc_gratitud', 'tcc_activacion', 'rosenberg', 'tcc_autoconceptos'],
  defense: ['eed', 'tcc_sesgos', 'tcc_socratico', 'tcc_flexibilidad'],
  risk: ['tcc_plan_seguridad', 'tcc_estres', 'pcl5', 'tcc_exposicion'],
  other: ['nota_sesion', 'tcc_prevencion_recaida'],
};

export function suggestedModulesForAxis(axis) {
  return AXIS_MODULE_HINTS[normalizeAxis(axis)] || AXIS_MODULE_HINTS.other;
}

const FIELD_HINTS = {
  manifestations: {
    problem: 'Cómo se expresa en la clínica. Ej.: inquietud motora, rumiación al acostarse.',
    resource: 'Cómo se nota este recurso en la vida cotidiana. Ej.: pide ayuda cuando se desborda.',
    defense: 'Cómo aparece esta defensa en sesión o en la vida. Ej.: ríe al hablar de temas dolorosos.',
    risk: 'Cómo se manifiesta este riesgo. Ej.: evita salir después de las 18 h.',
    other: 'Cómo se observa este elemento. Ej.: lo menciona en cada sesión.',
  },
  indicators: {
    problem: 'Señales observables o puntajes asociados. Ej.: GAD-7 ≥10, evita reuniones de equipo.',
    resource: 'Cómo se comprueba que está activo. Ej.: 3 contactos de apoyo en la semana.',
    defense: 'Señales de que opera. Ej.: EED alto en desadaptativas, cambia de tema al hablar del trauma.',
    risk: 'Señales o puntajes de alarma. Ej.: PCL-5 ≥31, ideación pasiva en la semana.',
    other: 'Cómo se verifica. Ej.: aparece en notas de 3 sesiones seguidas.',
  },
  objectives: {
    problem: 'Qué se busca trabajar. Ej.: reducir ansiedad anticipatoria en 8 semanas.',
    resource: 'Cómo sostener o fortalecer el recurso. Ej.: practicar autocuidado 3 veces por semana.',
    defense: 'Hacia dónde orientar la defensa. Ej.: pasar de negación a supresión flexible.',
    risk: 'Qué se busca contener. Ej.: plan de seguridad actualizado y contactos identificables.',
    other: 'Qué se quiere aclarar o registrar. Ej.: hipótesis de trabajo revisada en sesión 4.',
  },
  evidence: {
    problem: 'Avances o fuentes, con fecha. Ej.: 12/09 — GAD-7 bajó de 14 a 9.',
    resource: 'Situaciones observadas, con fecha. Ej.: 08/09 — pidió ayuda en una crisis.',
    defense: 'Ejemplos en sesión, con fecha. Ej.: 05/09 — pudo nombrar el afecto sin intelectualizar.',
    risk: 'Cambios o persistencia, con fecha. Ej.: 10/09 — no hubo ideación en 14 días.',
    other: 'Notas o fuentes, con fecha. Ej.: 03/09 — relato de contexto laboral.',
  },
  activities: {
    problem: 'Módulos o tareas a trabajar en sesión. Ej.: GAD-7 en la sesión 3.',
    resource: 'Módulos o prácticas que activan el recurso. Ej.: registro de gratitud en sesión 4.',
    defense: 'Módulos para explorar la defensa. Ej.: EED en sesión 2.',
    risk: 'Módulos de evaluación o contención. Ej.: plan de seguridad en sesión 1.',
    other: 'Módulos o tareas asociadas. Ej.: nota de sesión para registrar el contexto.',
  },
};

export function fieldHintFor(axis, fieldKey) {
  const byAxis = FIELD_HINTS[fieldKey];
  if (!byAxis) return '';
  return byAxis[normalizeAxis(axis)] || byAxis.other || '';
}

export function customPlaceholderForAxis(axis) {
  return (
    {
      problem: 'Problema personalizado',
      resource: 'Recurso o factor protector personalizado',
      defense: 'Defensa personalizada',
      risk: 'Vulnerabilidad o riesgo personalizado',
      other: 'Elemento personalizado',
    }[normalizeAxis(axis)] || 'Recurso o vulnerabilidad personalizada'
  );
}
