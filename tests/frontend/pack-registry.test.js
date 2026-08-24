import assert from 'node:assert/strict';
import test from 'node:test';

test('pack registry merges module defs and programs', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();

  registry.registerModuleDef('gad7', { label: 'GAD-7', category: 'pruebas' }, { packId: 'test' });
  registry.registerProgram(
    'tdah_8',
    { id: 'tdah_8', label: 'TDAH 8', sessions: [{ label: 'S1', modules: ['gad7'] }] },
    { packId: 'test' },
  );

  assert.equal(registry.getModuleDef('gad7')?.label, 'GAD-7');
  assert.equal(registry.listPrograms().length, 1);
  assert.equal(registry.getProgram('tdah_8')?.sessions.length, 1);
  registry.markPackLoaded('test', { id: 'test' });
  assert.ok(registry.isPackLoaded('test'));
});

test('getModuleDefs merges core and pack modules', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();
  registry.registerModuleDef('asrs', { label: 'ASRS', category: 'pruebas' }, { packId: 'p' });

  const { getModuleDefs } = await import('../../src/js/config.js');
  const defs = getModuleDefs();
  assert.ok(defs.registro_inicial);
  assert.equal(defs.asrs?.label, 'ASRS');
});

test('getModuleDefs includes legacy clinical modules without packs', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();
  const { getModuleDefs } = await import('../../src/js/config.js');
  const defs = getModuleDefs();
  assert.ok(defs.gad7?.label);
  assert.doesNotMatch(defs.tcc_abc?.label || '', /demo/i);
  assert.ok(defs.tcc_registro_pensamientos?.label);
  assert.ok(defs.sig_pregunta_milagro?.label);
  assert.equal(defs.tcc_registro_pensamientos.oncePerTreatment, false);
  assert.equal(defs.sig_externalizacion.oncePerTreatment, true);
  assert.ok(defs.bilateral_stimulation?.label);
});

test('treatment templates prefer pack programs over legacy', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();
  registry.registerProgram(
    'tdah_8',
    { id: 'tdah_8', label: 'From pack', featured: true, sessions: [] },
    { packId: 'p' },
  );

  const tpl = await import('../../src/js/treatment-templates.js');
  const list = tpl.listTreatmentTemplates();
  assert.ok(list.some((t) => t.label === 'From pack'));
});

test('demo pack does not overwrite clinical module defs', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();
  registry.registerModuleDef('tcc_abc', { label: 'Modelo ABC (versión simple)' }, { packId: 'clinical-shared' });
  registry.registerModuleDef('tcc_abc', { label: 'Modelo ABC — demo' }, { packId: 'demo' });
  assert.equal(registry.getModuleDef('tcc_abc')?.label, 'Modelo ABC (versión simple)');
  registry.registerModuleDef('escala_animo', { label: 'Escala subjetiva de ánimo (demo)' }, { packId: 'demo' });
  assert.equal(registry.getModuleDef('escala_animo')?.label, 'Escala subjetiva de ánimo (demo)');
});

test('getModuleDefs ignores demo labels when the type already exists', async () => {
  const registry = await import('../../src/js/pack-registry.js');
  registry.resetRegistry();
  registry.registerModuleDef('tcc_abc', { label: 'Modelo ABC — demo' }, { packId: 'demo' });
  const { getModuleDefs } = await import('../../src/js/config.js');
  assert.equal(getModuleDefs().tcc_abc.label, 'Modelo ABC (versión simple)');
});

test('missing pack module type does not crash renderer resolution', async () => {
  const mod = await import('../../src/js/modules/index.js');
  assert.equal(mod.isModuleTypeAvailable('nonexistent_xyz'), false);
});
