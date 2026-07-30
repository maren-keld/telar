/** Stub público — handouts clínicos en packs propietarios / instalador oficial. */
import { getHandoutDef, getSearchExtra, getTccVariables } from './pack-registry.js';

const LEGACY_TCC_HANDOUT_DEFS = {};

export function tccHandoutDef(moduleType) {
  return getHandoutDef(moduleType) || LEGACY_TCC_HANDOUT_DEFS[moduleType] || null;
}

export const TCC_HANDOUT_DEFS = LEGACY_TCC_HANDOUT_DEFS;

export function formatTccHandoutReadable(moduleType, data) {
  const def = tccHandoutDef(moduleType);
  if (!def) return '';
  const d = data || {};
  const parts = [];
  for (const s of def.sections || []) {
    const v = d[s.key];
    if (v == null || v === '') continue;
    parts.push(`${s.title}:\n${String(v).trim()}`);
  }
  return parts.join('\n\n');
}

const LEGACY_TCC_VARIABLES = {};
export function tccVariablesFor(type) {
  return getTccVariables(type) || LEGACY_TCC_VARIABLES[type] || null;
}
export const TCC_VARIABLES = LEGACY_TCC_VARIABLES;

const LEGACY_MODULE_SEARCH_EXTRA = {};
export function moduleSearchBlob(type, def, psych) {
  const handout = tccHandoutDef(type);
  const tags = handout?.searchTags || [];
  const chunks = [def?.label, def?.description, getSearchExtra(type), ...tags];
  return chunks.filter(Boolean).join(' ').toLowerCase();
}
