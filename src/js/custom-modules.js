import { MODULE_DEFS } from './config.js';
import { moduleLabelI18n } from './i18n.js';
import { loadProfile, saveProfile } from './profile.js';

const PREFIX = 'custom_';

export function customModuleTypeId(id) {
  return `${PREFIX}${id}`;
}

export function parseCustomModuleType(moduleType) {
  if (!moduleType?.startsWith(PREFIX)) return null;
  return moduleType.slice(PREFIX.length);
}

export function isCustomModuleType(moduleType) {
  return Boolean(parseCustomModuleType(moduleType));
}

export function listCustomModules() {
  return loadProfile().customModules || [];
}

export function getCustomModuleByType(moduleType) {
  const id = parseCustomModuleType(moduleType);
  if (!id) return null;
  return listCustomModules().find((m) => m.id === id) || null;
}

export function getCustomModule(id) {
  return listCustomModules().find((m) => m.id === id) || null;
}

export function saveCustomModule(def) {
  const modules = listCustomModules();
  const idx = modules.findIndex((m) => m.id === def.id);
  if (idx >= 0) modules[idx] = def;
  else modules.push(def);
  saveProfile({ customModules: modules });
  return def;
}

export function deleteCustomModule(id) {
  const modules = listCustomModules().filter((m) => m.id !== id);
  saveProfile({ customModules: modules });
}

export function resolveModuleDef(moduleType) {
  if (MODULE_DEFS[moduleType]) return MODULE_DEFS[moduleType];
  const custom = getCustomModuleByType(moduleType);
  if (custom) {
    return {
      label: custom.title,
      category: 'custom',
      description: custom.instructions || 'Módulo personalizado.',
      allowMultipleInSession: true,
      custom: true,
    };
  }
  return null;
}

export function moduleLabelFor(type) {
  const def = resolveModuleDef(type);
  if (!def) return type;
  if (def.custom) return def.label;
  return moduleLabelI18n(type, def.label);
}

export function newCustomModuleId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
