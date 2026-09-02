import { getModuleDef, getModuleDefs } from './config.js';
import { moduleLabelI18n } from './i18n.js';
import { loadProfile, saveProfile } from './profile.js';
import { parseJsonSafe } from './utils.js';

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

/**
 * Los módulos personalizados viven en la tabla `custom_modules` de la DB cifrada,
 * pero se leen desde muchos renderers sincrónicos. La tabla se carga una vez a
 * caché al desbloquear (`ensureCustomModulesLoaded`) y las escrituras actualizan
 * la caché al instante además de persistir.
 */
let cache = null;
let loading = null;

function normalize(mod) {
  return { kind: 'simple', ...mod };
}

function rowToModule(row) {
  const payload = parseJsonSafe(row.payload, {});
  return normalize({
    ...payload,
    id: row.id,
    kind: row.kind || payload.kind || 'simple',
    title: payload.title ?? row.title ?? '',
    packId: payload.packId ?? row.pack_id ?? '',
    packLabel: payload.packLabel ?? row.pack_label ?? '',
  });
}

/** Sube a SQLite los módulos que quedaron en el perfil de la versión anterior. */
async function migrateFromProfile(existingIds) {
  const legacy = loadProfile().customModules || [];
  if (!legacy.length) return [];
  const migrated = [];
  for (const mod of legacy) {
    if (!mod?.id || existingIds.has(mod.id)) continue;
    const row = normalize(mod);
    await persist(row);
    migrated.push(row);
  }
  saveProfile({ customModules: [] });
  return migrated;
}

async function persist(mod) {
  const { execute } = await import('./db.js');
  await execute(
    `INSERT INTO custom_modules (id, kind, title, category, pack_id, pack_label, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind, title = excluded.title, category = excluded.category,
       pack_id = excluded.pack_id, pack_label = excluded.pack_label,
       payload = excluded.payload, updated_at = datetime('now')`,
    [
      mod.id,
      mod.kind || 'simple',
      mod.title || '',
      mod.category || 'custom',
      mod.packId || '',
      mod.packLabel || '',
      JSON.stringify(mod),
    ],
  );
}

/** Idempotente: se llama al entrar a cualquier vista con la DB desbloqueada. */
export function ensureCustomModulesLoaded() {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = (async () => {
    const { query } = await import('./db.js');
    const rows = await query(`SELECT * FROM custom_modules ORDER BY created_at`);
    cache = rows.map(rowToModule);
    cache.push(...(await migrateFromProfile(new Set(cache.map((m) => m.id)))));
    return cache;
  })()
    .catch((err) => {
      console.error('No se pudieron cargar los módulos personalizados', err);
      cache = [];
      return cache;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function listCustomModules() {
  return cache || [];
}

export function getCustomModuleByType(moduleType) {
  const id = parseCustomModuleType(moduleType);
  if (!id) return null;
  return listCustomModules().find((m) => m.id === id) || null;
}

export function getCustomModule(id) {
  return listCustomModules().find((m) => m.id === id) || null;
}

export async function saveCustomModule(def) {
  const mod = normalize(def);
  cache = cache || [];
  const idx = cache.findIndex((m) => m.id === mod.id);
  if (idx >= 0) cache[idx] = mod;
  else cache.push(mod);
  await persist(mod);
  return mod;
}

export async function deleteCustomModule(id) {
  cache = (cache || []).filter((m) => m.id !== id);
  const { execute } = await import('./db.js');
  await execute(`DELETE FROM custom_modules WHERE id = ?`, [id]);
}

/** Borra todos los módulos de un pack importado (al desinstalarlo). */
export async function deleteCustomModulePack(packId) {
  cache = (cache || []).filter((m) => m.packId !== packId);
  const { execute } = await import('./db.js');
  await execute(`DELETE FROM custom_modules WHERE pack_id = ?`, [packId]);
}

/** Packs importados presentes, para agrupar la librería de módulos. */
export function listCustomModulePacks() {
  const packs = new Map();
  for (const mod of listCustomModules()) {
    if (!mod.packId) continue;
    if (!packs.has(mod.packId)) {
      packs.set(mod.packId, { id: mod.packId, label: mod.packLabel || mod.packId, modules: [] });
    }
    packs.get(mod.packId).modules.push(mod);
  }
  return [...packs.values()];
}

export function resolveModuleDef(moduleType) {
  const defs = getModuleDefs();
  if (defs[moduleType]) return defs[moduleType];
  const custom = getCustomModuleByType(moduleType);
  if (custom) {
    const def = custom.def || custom.defs?.es || custom.defs?.en || null;
    return {
      label: custom.title || def?.title || custom.id,
      category: custom.category || 'custom',
      description:
        custom.description || custom.instructions || def?.subtitle || 'Módulo personalizado.',
      allowMultipleInSession: true,
      custom: true,
      kind: custom.kind || 'simple',
      packId: custom.packId || '',
      packLabel: custom.packLabel || '',
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
