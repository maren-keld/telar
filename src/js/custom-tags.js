import { TREATMENT_TAG_DEFS } from './config.js';
import { loadProfile, saveProfile } from './profile.js';

export function listCustomTags() {
  const list = loadProfile().customTags;
  return Array.isArray(list) ? list.filter((t) => t?.id && t?.label) : [];
}

export function allTagDefs() {
  const defs = { ...TREATMENT_TAG_DEFS };
  for (const t of listCustomTags()) {
    defs[t.id] = { label: t.label, color: t.color || '#64748b', custom: true };
  }
  return defs;
}

export function allTagEntries() {
  const builtins = Object.entries(TREATMENT_TAG_DEFS);
  const custom = listCustomTags().map((t) => [
    t.id,
    { label: t.label, color: t.color || '#64748b', custom: true },
  ]);
  return [...builtins, ...custom];
}

export function addCustomTag({ label, color }) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const match = allTagEntries().find(([, v]) => v.label.toLowerCase() === trimmed.toLowerCase());
  if (match) return { id: match[0], label: match[1].label, color: match[1].color, existed: true };
  const tag = {
    id: `c_${Date.now().toString(36)}`,
    label: trimmed,
    color: color || '#64748b',
  };
  saveProfile({ customTags: [...listCustomTags(), tag] });
  return tag;
}
