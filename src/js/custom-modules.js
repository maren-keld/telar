import { getModuleDef, getModuleDefs } from './config.js';
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
  const defs = getModuleDefs();
  if (defs[moduleType]) return defs[moduleType];
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

function plainHandoutText(value = '') {
  return String(value)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-•]\s+/gm, '• ')
    .trim();
}

/**
 * Adapta un módulo personalizado al renderer común de handouts PDF.
 * Las indicaciones quedan como material y los demás ítems como campos
 * rellenables, incluyendo las respuestas ya registradas.
 */
export function customModuleHandoutPayload(moduleType, data = {}) {
  const custom = getCustomModuleByType(moduleType);
  if (!custom) return null;

  const answers = data?.answers || {};
  const sections = [];
  const infoItems = [];
  const values = {};

  for (const q of custom.questions || []) {
    const text = plainHandoutText(q.text);
    if (!text) continue;
    if (q.type === 'info') {
      infoItems.push(text);
      continue;
    }

    let title = text;
    let hint = '';
    let rows = q.type === 'text' || q.type === 'task' ? 3 : 2;
    if (q.type === 'task') {
      const colon = text.indexOf(':');
      if (colon > 2 && colon < 80) {
        title = text.slice(0, colon);
        hint = text.slice(colon + 1).trim();
      } else {
        title = 'Ejercicio / tarea';
        hint = text;
      }
      const stored = answers[q.id] || {};
      values[q.id] = [
        stored.done ? 'Completado' : '',
        String(stored.comment || '').trim(),
      ]
        .filter(Boolean)
        .join(' — ');
    } else if (q.type === 'checkbox') {
      hint = `Opciones: ${(q.options || []).join(' · ')}`;
      values[q.id] = Array.isArray(answers[q.id]) ? answers[q.id].join(' · ') : '';
    } else if (q.type === 'scale') {
      hint = 'Escala de 0 a 10';
      values[q.id] = answers[q.id] === '' || answers[q.id] == null ? '' : String(answers[q.id]);
    } else {
      values[q.id] = String(answers[q.id] || '');
    }
    sections.push({ key: q.id, title, hint, rows });
  }

  return {
    def: {
      title: plainHandoutText(custom.title),
      intro: plainHandoutText(custom.instructions),
      activityGroups: infoItems.length ? [{ title: 'Indicaciones', items: infoItems }] : [],
      sections,
    },
    data: values,
  };
}
