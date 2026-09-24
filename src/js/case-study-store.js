/**
 * Persistencia del Estudio de caso — un documento por tratamiento.
 * Sync lite con treatment_space_checks (Perfil) sin duplicar el modelo clínico.
 */
import {
  applyProfileCheckToCaseStudy,
  CASE_STUDY_AXES,
  emptyCaseStudyElement,
  normalizeCaseStudyData,
  profileLiteFromCaseStudy,
  profileSeedsFromChecks,
  PROFILE_AXIS_MAP,
  recommendedModulesForElement,
} from './case-study-model.js';
import { estudioRelationForModule, libraryItemsForAxis } from './case-study-catalog.js';
import { execute, getSpaceChecks, getTreatmentModules, query, setSpaceCheck } from './db.js';
import { parseJsonSafe } from './utils.js';

const CHANGE_EVENT = 'telar:case-study-changed';

export function dispatchCaseStudyChanged(treatmentId) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, { detail: { treatmentId: Number(treatmentId) } }),
  );
}

export function onCaseStudyChanged(handler, { signal } = {}) {
  if (typeof document === 'undefined') return () => {};
  const listener = (e) => handler(e.detail || {});
  document.addEventListener(CHANGE_EVENT, listener, { signal });
  return () => document.removeEventListener(CHANGE_EVENT, listener);
}

async function loadLegacySeeds(treatmentId) {
  const modules = await getTreatmentModules(treatmentId);
  let problems = [];
  let formulation = null;
  let supportPeople = [];

  for (const mod of modules || []) {
    const data = parseJsonSafe(mod.data, {});
    if (mod.module_type === 'diagnostico') {
      if (Array.isArray(data.problems) && data.problems.length) problems = data.problems;
      if (data.formulation) formulation = data.formulation;
    }
    if (mod.module_type === 'redes_apoyo' && Array.isArray(data.people) && data.people.length) {
      supportPeople = data.people;
    }
  }
  return { problems, formulation, supportPeople };
}

async function loadProfileCheckMap(treatmentId) {
  const map = {};
  await Promise.all(
    Object.keys(PROFILE_AXIS_MAP).map(async (category) => {
      map[category] = await getSpaceChecks(treatmentId, category);
    }),
  );
  return map;
}

async function readCaseStudyRow(treatmentId) {
  const [row] = await query(`SELECT data FROM treatment_case_study WHERE treatment_id = ?`, [
    treatmentId,
  ]);
  return row?.data ? parseJsonSafe(row.data, null) : null;
}

/** Snapshot del estudio guardado para sugerencias de la librería, sin inicializar ni escribir datos. */
export async function readCaseStudySnapshot(treatmentId) {
  const stored = await readCaseStudyRow(treatmentId);
  return stored ? normalizeCaseStudyData(stored) : null;
}

/** Espejo lite → space_checks para PDF / alertas / UI Perfil existente. */
async function mirrorProfileLite(treatmentId, caseStudy) {
  const lite = profileLiteFromCaseStudy(caseStudy);
  for (const [category, titles] of Object.entries(lite)) {
    const existing = await getSpaceChecks(treatmentId, category);
    const want = new Set(titles.map((t) => t.toLowerCase()));
    const have = new Map(existing.map((r) => [String(r.label).toLowerCase(), r]));

    for (const title of titles) {
      const key = title.toLowerCase();
      const row = have.get(key);
      if (!row || Number(row.checked) !== 1) {
        await setSpaceCheck(treatmentId, category, title, true);
      }
    }
    for (const row of existing) {
      if (Number(row.checked) === 1 && !want.has(String(row.label).toLowerCase())) {
        // Solo apaga checks que vinieron del estudio (mismo label). No borra el label del catálogo.
        await setSpaceCheck(treatmentId, category, row.label, false);
      }
    }
  }
}

function moduleMatchesCaseStudyElement(moduleType, element) {
  const recommendation = recommendedModulesForElement(element.axis, element.title);
  if (recommendation.evaluation.includes(moduleType) || recommendation.intervention.includes(moduleType)) {
    return true;
  }
  const relation = estudioRelationForModule(moduleType);
  return relation?.axis === element.axis && relation?.element === element.title;
}

/** Repara asociaciones faltantes al incorporar un elemento después de su módulo. */
async function reconcileModuleElementLinks(treatmentId, elements = []) {
  const modules = await getTreatmentModules(treatmentId);
  await Promise.all(
    (modules || []).map(async (module) => {
      const data = parseJsonSafe(module.data, {});
      const elementIds = Array.isArray(data.elementIds) ? data.elementIds.map(String) : [];
      const missingIds = (elements || [])
        .filter((element) => element?.id && !elementIds.includes(String(element.id)))
        .filter((element) => moduleMatchesCaseStudyElement(module.module_type, element))
        .map((element) => String(element.id));
      if (!missingIds.length) return;
      await execute(
        `UPDATE session_modules SET data = ?, updated_at = datetime('now') WHERE id = ?`,
        [JSON.stringify({ ...data, elementIds: [...elementIds, ...missingIds] }), module.id],
      );
    }),
  );
}

export async function loadCaseStudy(treatmentId) {
  const stored = await readCaseStudyRow(treatmentId);
  const profileMap = await loadProfileCheckMap(treatmentId);
  const seeds = profileSeedsFromChecks(profileMap);
  const legacy = stored ? {} : await loadLegacySeeds(treatmentId);

  const caseStudy = normalizeCaseStudyData(stored || {}, seeds, legacy);

  // Si no había fila, persistir seed (incluye redes legacy bajo Otros / supportPeople).
  if (!stored) {
    await saveCaseStudy(treatmentId, caseStudy, { skipEvent: true, skipMirror: false });
  }
  await reconcileModuleElementLinks(treatmentId, caseStudy.elements);
  return caseStudy;
}

export async function saveCaseStudy(treatmentId, caseStudy, { skipEvent = false, skipMirror = false } = {}) {
  const normalized = normalizeCaseStudyData(caseStudy);
  await execute(
    `INSERT INTO treatment_case_study (treatment_id, data, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(treatment_id) DO UPDATE SET
       data = excluded.data,
       updated_at = datetime('now')`,
    [treatmentId, JSON.stringify(normalized)],
  );
  if (!skipMirror) {
    await mirrorProfileLite(treatmentId, normalized);
  }
  if (!skipEvent) dispatchCaseStudyChanged(treatmentId);
  return normalized;
}

/** Elementos de la librería que una incorporación de módulo debe asegurar. */
export function missingCaseStudyElementsForModule(moduleType, elements = []) {
  const existing = new Set(
    (elements || []).map((element) => `${element.axis}:${String(element.title || '').trim().toLocaleLowerCase()}`),
  );
  const candidates = CASE_STUDY_AXES
    .filter((axis) => axis.id !== 'other')
    .flatMap((axis) =>
      libraryItemsForAxis(axis.id).map((item) => ({ axis: axis.id, title: item.title })),
    );
  const relation = estudioRelationForModule(moduleType);
  if (relation?.element) candidates.push({ axis: relation.axis, title: relation.element });

  const seen = new Set();
  return candidates.filter(({ axis, title }) => {
    const key = `${axis}:${String(title || '').trim().toLocaleLowerCase()}`;
    if (!title || seen.has(key) || existing.has(key)) return false;
    seen.add(key);
    const recommendation = recommendedModulesForElement(axis, title);
    return recommendation.evaluation.includes(moduleType) ||
      recommendation.intervention.includes(moduleType) ||
      (relation?.axis === axis && relation?.element === title);
  });
}

/** Crea los elementos clínicos faltantes y los deja listos para enlazar al nuevo módulo. */
export async function ensureCaseStudyElementsForModule(treatmentId, moduleType) {
  const current = await loadCaseStudy(treatmentId);
  const missing = missingCaseStudyElementsForModule(moduleType, current.elements);
  if (!missing.length) return current;
  const next = {
    ...current,
    elements: [...current.elements, ...missing.map(({ axis, title }) => emptyCaseStudyElement(axis, title))],
  };
  const saved = await saveCaseStudy(treatmentId, next);
  await reconcileModuleElementLinks(treatmentId, saved.elements);
  return saved;
}

/**
 * Toggle desde Perfil (lite) → mismo modelo.
 * También escribe space_checks (UI/PDF) vía setSpaceCheck del caller o aquí.
 */
export async function syncProfileCheck(treatmentId, category, label, checked) {
  if (!PROFILE_AXIS_MAP[category]) {
    await setSpaceCheck(treatmentId, category, label, checked);
    return null;
  }
  const current = await loadCaseStudy(treatmentId);
  const next = applyProfileCheckToCaseStudy(current, category, label, checked);
  await setSpaceCheck(treatmentId, category, label, checked);
  return saveCaseStudy(treatmentId, next, { skipMirror: true });
}
