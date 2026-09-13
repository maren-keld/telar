/**
 * Modelo clínico compartido: Estudio de caso (full) ↔ Perfil rail (lite).
 * Un solo documento por tratamiento; Perfil proyecta ejes resource/defense/risk.
 */

export const CASE_STUDY_AXES = [
  { id: 'problem', label: 'Problemas', addLabel: 'Añadir problema' },
  { id: 'resource', label: 'Recursos / factores protectores', addLabel: 'Añadir recurso' },
  { id: 'defense', label: 'Defensas psíquicas', addLabel: 'Añadir defensa' },
  { id: 'risk', label: 'Vulnerabilidades / riesgo', addLabel: 'Añadir vulnerabilidad' },
  { id: 'other', label: 'Otros', addLabel: 'Añadir elemento' },
];

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
  problem: ['active', 'in_progress', 'graduated'],
  resource: ['active', 'in_progress', 'graduated'],
  defense: ['active', 'in_progress', 'graduated'],
  risk: ['active', 'in_progress', 'restratified'],
  other: ['active', 'in_progress', 'graduated'],
};

export const STATUS_LABELS = {
  active: 'Activo',
  in_progress: 'En curso',
  graduated: 'Graduado',
  restratified: 'Reestratificado',
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
  const allowed = STATUS_OPTIONS[axis] || STATUS_OPTIONS.problem;
  if (allowed.includes(status)) return status;
  return axis === 'risk' ? 'active' : 'in_progress';
}

export function normalizeCaseStudyElement(raw = {}, fallbackAxis = 'problem') {
  const axis = normalizeAxis(raw.axis || fallbackAxis);
  return {
    id: String(raw.id || makeCaseStudyId()),
    axis,
    title: String(raw.title || raw.name || '').trim(),
    status: normalizeStatus(axis, raw.status),
    manifestations: normalizeItems(raw.manifestations, { checkable: false }),
    indicators: normalizeItems(raw.indicators),
    objectives: normalizeItems(raw.objectives),
    evidence: normalizeItems(raw.evidence || raw.evidenceRefs, { checkable: false }),
    notes: String(raw.notes || '').trim(),
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

  const elements = uniqueByAxisTitle(
    hasNative ? raw.elements.map((el) => normalizeCaseStudyElement(el)) : legacyElements,
  );

  const selectedAxis = normalizeAxis(raw.selectedAxis || elements[0]?.axis || 'problem');
  const selectedElementId = elements.some((el) => el.id === raw.selectedElementId)
    ? raw.selectedElementId
    : elements.find((el) => el.axis === selectedAxis)?.id || elements[0]?.id || '';

  const supportPeople = (
    Array.isArray(raw.supportPeople)
      ? raw.supportPeople
      : Array.isArray(legacy.supportPeople)
        ? legacy.supportPeople
        : []
  ).map(normalizeSupportPerson);

  return {
    version: 1,
    selectedAxis,
    selectedElementId,
    elements,
    supportPeople,
  };
}

export function emptyCaseStudyElement(axis = 'problem', title = '') {
  return normalizeCaseStudyElement({ axis, title, status: 'active' }, axis);
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
