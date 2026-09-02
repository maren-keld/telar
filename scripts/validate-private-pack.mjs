#!/usr/bin/env node
/**
 * Valida un pack antes de empaquetarlo: pack.json bien formado, archivos presentes
 * y cada definición de cuestionario aprobada por validateQuestionnaire.
 *
 * Uso: node scripts/validate-private-pack.mjs packs-src/private/<id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { validateQuestionnaire, questionnaireItems, questionnaireMax } = await import(
  join(here, '..', 'src', 'lib', 'questionnaire-schema.js')
);

const dir = resolve(process.argv[2] || '.');
const errors = [];
const notes = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    errors.push(`${path}: JSON inválido — ${err.message}`);
    return null;
  }
}

const pack = readJson(join(dir, 'pack.json'));
if (pack) {
  if (pack.schema !== 1) errors.push('pack.json: schema debe ser 1.');
  if (!pack.id) errors.push('pack.json: falta id.');
  if (!pack.label) errors.push('pack.json: falta label.');
  if (!Array.isArray(pack.modules) || !pack.modules.length) {
    errors.push('pack.json: modules debe ser una lista no vacía.');
  }

  for (const mod of pack.modules || []) {
    const where = `módulo ${mod?.id || '?'}`;
    if (!mod?.id) errors.push(`${where}: falta id.`);
    if (!['questionnaire', 'interactive'].includes(mod?.kind)) {
      errors.push(`${where}: kind debe ser questionnaire o interactive.`);
      continue;
    }
    const file = join(dir, mod.file || '');
    if (!mod.file || !existsSync(file)) {
      errors.push(`${where}: no existe el archivo ${mod.file}.`);
      continue;
    }
    if (mod.kind === 'interactive') {
      const html = readFileSync(file, 'utf8');
      if (!/<html|<body|<div|<canvas/i.test(html)) {
        notes.push(`${where}: el HTML parece vacío o sin marcado.`);
      }
      for (const m of html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)) {
        notes.push(`${where}: usa una librería externa (${m[1]}); sin red no cargará.`);
      }
      continue;
    }

    const entry = readJson(file);
    if (!entry) continue;
    const defs = entry.defs || (entry.schema === 1 ? { es: entry } : null);
    if (!defs || !Object.keys(defs).length) {
      errors.push(`${where}: falta defs (o una definición schema 1 en la raíz).`);
      continue;
    }
    let itemCount = null;
    for (const [lang, def] of Object.entries(defs)) {
      const res = validateQuestionnaire(def);
      for (const e of res.errors) errors.push(`${where} [${lang}]: ${e}`);
      if (!res.ok) continue;
      const count = questionnaireItems(def).length;
      if (itemCount === null) itemCount = count;
      else if (itemCount !== count) {
        errors.push(`${where}: los idiomas no tienen el mismo número de ítems (${itemCount} vs ${count}).`);
      }
      if (!def.attribution?.license) {
        errors.push(`${where} [${lang}]: falta attribution.license (obligatorio en packs privados).`);
      }
      notes.push(`${where} [${lang}]: ${count} ítems, máximo ${questionnaireMax(def)}.`);
    }
  }
}

for (const n of notes) console.log(`  · ${n}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problema(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ Pack válido.');
