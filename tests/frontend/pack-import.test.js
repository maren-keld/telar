import test from 'node:test';
import assert from 'node:assert/strict';

const { parsePackContents, packFilesFor, packModuleId } = await import('../../src/js/pack-import.js');

function questionnaireDef(overrides = {}) {
  return {
    schema: 1,
    id: 'demo',
    title: 'Escala demo',
    items: [{ text: 'Ítem uno' }, { text: 'Ítem dos' }],
    options: [
      { v: 0, label: 'Nada' },
      { v: 1, label: 'Algo' },
    ],
    scoring: { kind: 'sum', bands: [{ max: 2, label: 'Bajo' }] },
    attribution: { authors: 'Nadie', license: 'Uso clínico' },
    ...overrides,
  };
}

function packFiles({ modules, entries } = {}) {
  return {
    'pack.json': JSON.stringify({
      schema: 1,
      id: 'pack-demo',
      label: 'Pack demo',
      modules: entries || [{ id: 'demo', kind: 'questionnaire', file: 'questionnaires/demo.json' }],
    }),
    ...(modules || {
      'questionnaires/demo.json': JSON.stringify({
        id: 'demo',
        kind: 'questionnaire',
        label: { es: 'Escala demo', en: 'Demo scale' },
        defs: { es: questionnaireDef(), en: questionnaireDef({ lang: 'en', title: 'Demo scale' }) },
      }),
    }),
  };
}

test('los ids de módulo de un pack son seguros para el tipo custom_', () => {
  assert.equal(packModuleId('Autismo Danyau', 'RAADS-R'), 'autismo-danyau--raads-r');
  assert.match(packModuleId('a/b', 'c d'), /^[a-z0-9-]+$/);
});

test('importa un cuestionario del pack con su definición y etiqueta del pack', () => {
  const { pack, modules, warnings } = parsePackContents(packFiles());
  assert.equal(pack.id, 'pack-demo');
  assert.equal(pack.label, 'Pack demo');
  assert.deepEqual(warnings, []);
  assert.equal(modules.length, 1);
  const [mod] = modules;
  assert.equal(mod.id, 'pack-demo--demo');
  assert.equal(mod.kind, 'questionnaire');
  assert.equal(mod.title, 'Escala demo');
  assert.equal(mod.packLabel, 'Pack demo');
  assert.equal(mod.def.title, 'Escala demo');
  assert.equal(Object.keys(mod.defs).length, 2);
});

test('el idioma elegido decide qué definición queda activa', () => {
  const { modules } = parsePackContents(packFiles(), { lang: 'en' });
  assert.equal(modules[0].title, 'Demo scale');
  assert.equal(modules[0].def.lang, 'en');
});

test('un cuestionario inválido se omite con aviso en vez de romper la importación', () => {
  const files = packFiles({
    entries: [
      { id: 'demo', kind: 'questionnaire', file: 'questionnaires/demo.json' },
      { id: 'roto', kind: 'questionnaire', file: 'questionnaires/roto.json' },
    ],
    modules: {
      'questionnaires/demo.json': JSON.stringify({ defs: { es: questionnaireDef() } }),
      'questionnaires/roto.json': JSON.stringify({
        defs: { es: questionnaireDef({ items: [{ text: '' }] }) },
      }),
    },
  });
  const { modules, warnings } = parsePackContents(files);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, 'pack-demo--demo');
  assert.ok(warnings.some((w) => w.includes('roto')));
});

test('las experiencias interactivas avisan de librerías de internet', () => {
  const files = packFiles({
    entries: [{ id: 'juego', kind: 'interactive', file: 'interactive/juego.html', label: 'Juego' }],
    modules: {
      'interactive/juego.html': '<script src="https://cdn.example/p5.js"></script><div>hola</div>',
    },
  });
  const { modules, warnings } = parsePackContents(files);
  assert.equal(modules[0].kind, 'interactive');
  assert.equal(modules[0].title, 'Juego');
  assert.ok(warnings.some((w) => w.includes('cdn.example')));
});

test('un pack sin ningún módulo aprovechable falla con mensaje', () => {
  const files = packFiles({
    entries: [{ id: 'x', kind: 'questionnaire', file: 'questionnaires/falta.json' }],
    modules: {},
  });
  assert.throws(() => parsePackContents(files), /No se pudo importar/);
});

test('exportar y volver a importar deja el mismo módulo', () => {
  const original = parsePackContents(packFiles()).modules;
  const files = packFilesFor(original, { id: 'pack-demo', label: 'Pack demo' });
  const asMap = Object.fromEntries(files.map((f) => [f.name, f.content]));
  const { modules } = parsePackContents(asMap);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, 'pack-demo--demo');
  assert.deepEqual(modules[0].def.items, original[0].def.items);
});
