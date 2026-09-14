/**
 * Plantillas reutilizables de elementos custom del Estudio de caso.
 * Viven en el perfil del clínico (mismo patrón que customTags).
 */
import { CASE_STUDY_AXES, normalizeAxis } from './case-study-model.js';
import { loadProfile, saveProfile } from './profile.js';

function normalizeEntry(raw = {}) {
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const axis = normalizeAxis(raw.axis || 'other');
  return {
    id: String(raw.id || `cse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
    axis,
    title,
    description: String(raw.description || '').trim(),
  };
}

export function listCustomCaseStudyElements(axis = null) {
  const list = loadProfile().customCaseStudyElements;
  const rows = (Array.isArray(list) ? list : []).map(normalizeEntry).filter(Boolean);
  if (!axis) return rows;
  const want = normalizeAxis(axis);
  return rows.filter((row) => row.axis === want);
}

export function addCustomCaseStudyElement({ axis, title, description = '' } = {}) {
  const entry = normalizeEntry({ axis, title, description });
  if (!entry) return null;
  const existing = listCustomCaseStudyElements();
  const dup = existing.find(
    (row) =>
      row.axis === entry.axis && row.title.toLowerCase() === entry.title.toLowerCase(),
  );
  if (dup) return { ...dup, existed: true };
  saveProfile({ customCaseStudyElements: [...existing, entry] });
  return entry;
}

export function customLibraryItemsForAxis(axis) {
  return listCustomCaseStudyElements(axis).map((row) => ({
    title: row.title,
    description: row.description || 'Plantilla personalizada',
    custom: true,
  }));
}

export function axisLabelFor(axis) {
  return CASE_STUDY_AXES.find((a) => a.id === axis)?.label || axis;
}
