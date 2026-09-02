/**
 * Importar y exportar `.telarpack`: paquetes de módulos que no viajan dentro de
 * la app. Sirven para material clínico con licencia que el terapeuta tiene
 * derecho a usar pero que Telar no puede distribuir, y para compartir módulos
 * propios con colegas.
 *
 * Un pack es un tar.gz con `pack.json` y un archivo por módulo. Rust lo lee y
 * escribe (`pack_read` / `pack_write`); acá solo se valida y se guarda en la
 * tabla `custom_modules`.
 */
import { validateQuestionnaire } from '../lib/questionnaire-schema.js';
import { listCustomModules, saveCustomModule } from './custom-modules.js';
import { getInvoke } from './tauri-bridge.js';
import { parseJsonSafe } from './utils.js';

const MODULE_KINDS = ['questionnaire', 'interactive'];

/** Id estable y seguro para `custom_<id>`: solo letras, números y guiones. */
export function packModuleId(packId, moduleId) {
  const slug = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slug(packId)}--${slug(moduleId)}`;
}

function packLabel(pack) {
  if (typeof pack.label === 'string') return pack.label;
  return pack.label?.es || pack.label?.en || pack.id;
}

function moduleTitle(entry, def, lang) {
  if (typeof entry.label === 'string') return entry.label;
  return entry.label?.[lang] || entry.label?.es || def?.title || entry.id;
}

/**
 * Convierte los archivos de un pack en módulos personalizados listos para
 * guardar. No toca la base: así se puede previsualizar antes de instalar.
 * @param {Record<string,string>} files
 * @param {{ lang?: string }} opts
 */
export function parsePackContents(files, { lang = 'es' } = {}) {
  const pack = parseJsonSafe(files['pack.json'], null);
  if (!pack) throw new Error('El pack no tiene un pack.json legible.');
  if (pack.schema !== 1) throw new Error('Este pack usa un formato que esta versión de Telar no entiende.');
  if (!pack.id || !Array.isArray(pack.modules) || !pack.modules.length) {
    throw new Error('El pack no declara módulos.');
  }

  const label = packLabel(pack);
  const modules = [];
  const warnings = [];

  for (const entry of pack.modules) {
    const where = entry?.id || 'módulo sin id';
    if (!MODULE_KINDS.includes(entry?.kind)) {
      warnings.push(`«${where}»: tipo de módulo no soportado, se omite.`);
      continue;
    }
    const raw = files[entry.file];
    if (raw === undefined) {
      warnings.push(`«${where}»: falta el archivo ${entry.file}, se omite.`);
      continue;
    }

    const base = {
      id: packModuleId(pack.id, entry.id),
      kind: entry.kind,
      category: entry.category || 'pruebas',
      packId: pack.id,
      packLabel: label,
      createdAt: new Date().toISOString(),
    };

    if (entry.kind === 'interactive') {
      if (!raw.trim()) {
        warnings.push(`«${where}»: el HTML está vacío, se omite.`);
        continue;
      }
      for (const m of raw.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)) {
        warnings.push(`«${where}» usa una librería de internet (${m[1]}); dentro de Telar no hay red, así que esa parte no funcionará.`);
      }
      modules.push({
        ...base,
        title: moduleTitle(entry, null, lang),
        instructions: entry.instructions || '',
        html: raw,
      });
      continue;
    }

    const parsed = parseJsonSafe(raw, null);
    if (!parsed) {
      warnings.push(`«${where}»: el JSON no se pudo leer, se omite.`);
      continue;
    }
    const defs = parsed.defs || (parsed.schema === 1 ? { es: parsed } : null);
    if (!defs) {
      warnings.push(`«${where}»: no trae ninguna definición de cuestionario, se omite.`);
      continue;
    }

    let invalid = false;
    for (const [defLang, def] of Object.entries(defs)) {
      const res = validateQuestionnaire(def);
      if (!res.ok) {
        warnings.push(`«${where}» [${defLang}]: ${res.errors[0]}`);
        invalid = true;
      }
    }
    if (invalid) continue;

    const def = defs[lang] || defs.es || Object.values(defs)[0];
    modules.push({
      ...base,
      title: moduleTitle(parsed, def, lang),
      def,
      defs,
    });
  }

  if (!modules.length) {
    throw new Error(`No se pudo importar ningún módulo del pack.${warnings.length ? ` ${warnings[0]}` : ''}`);
  }

  return { pack: { id: pack.id, label, version: pack.version || '', note: pack.note || '' }, modules, warnings };
}

/** Lee el archivo y guarda sus módulos. @returns {Promise<{pack, modules, warnings}>} */
export async function installPackFromPath(path, { lang = 'es' } = {}) {
  const { files } = await getInvoke()('pack_read', { path });
  const result = parsePackContents(files, { lang });
  for (const mod of result.modules) {
    await saveCustomModule(mod);
  }
  return result;
}

/** Archivos de un `.telarpack` a partir de módulos ya guardados. */
export function packFilesFor(modules, { id, label }) {
  const files = [];
  const entries = [];

  for (const mod of modules) {
    const slug = String(mod.id).split('--').pop() || mod.id;
    if (mod.kind === 'interactive') {
      const file = `interactive/${slug}.html`;
      files.push({ name: file, content: mod.html || '' });
      entries.push({ id: slug, kind: 'interactive', file, label: mod.title, instructions: mod.instructions || '' });
      continue;
    }
    const file = `questionnaires/${slug}.json`;
    const defs = mod.defs || (mod.def ? { es: mod.def } : null);
    if (!defs) continue;
    files.push({
      name: file,
      content: JSON.stringify({ id: slug, kind: 'questionnaire', category: mod.category || 'pruebas', label: mod.title, defs }, null, 2),
    });
    entries.push({ id: slug, kind: 'questionnaire', file, category: mod.category || 'pruebas' });
  }

  files.unshift({
    name: 'pack.json',
    content: JSON.stringify({ schema: 1, id, label, version: '1.0.0', modules: entries }, null, 2),
  });
  return files;
}

/** Exporta módulos a un `.telarpack` en la ruta elegida. */
export async function exportPackToPath(path, modules, { id, label }) {
  const files = packFilesFor(modules, { id, label });
  return getInvoke()('pack_write', { path, files });
}

/** Módulos de un pack ya instalado, para reexportarlo. */
export function modulesOfPack(packId) {
  return listCustomModules().filter((m) => m.packId === packId);
}
