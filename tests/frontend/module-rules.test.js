import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachModulesToSessions,
  canDeleteModule,
  canMoveModule,
  isSessionDone,
  planSwapModuleToSelector,
  sessionHasModuleLibrary,
} from '../../src/js/db.js';

const mod = (id, type, sessionId = 1) => ({
  id,
  module_type: type,
  session_id: sessionId,
  sort_order: id,
});

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('los módulos estructurales no se pueden mover', () => {
  for (const type of ['registro_inicial', 'motivo_consulta', 'selector_modulo']) {
    assert.equal(canMoveModule(mod(1, type)), false, `${type} debería ser inamovible`);
  }
});

test('el resto de módulos se puede mover', () => {
  assert.equal(canMoveModule(mod(1, 'gad7')), true);
  assert.equal(canMoveModule(mod(2, 'custom_abc')), true);
});

test('registro inicial y motivo de consulta no se pueden eliminar', () => {
  const session = [mod(1, 'registro_inicial'), mod(2, 'motivo_consulta'), mod(3, 'gad7')];
  assert.equal(canDeleteModule(session[0], session), false);
  assert.equal(canDeleteModule(session[1], session), false);
});

test('una sesión nunca queda sin módulos', () => {
  const solo = [mod(9, 'gad7')];
  assert.equal(canDeleteModule(solo[0], solo), false);

  const dos = [mod(9, 'gad7'), mod(10, 'selector_modulo')];
  assert.equal(canDeleteModule(dos[0], dos), true);
  assert.equal(canDeleteModule(dos[1], dos), true);
});

test('el primer módulo clínico de la sesión sí se puede eliminar', () => {
  const session = [mod(1, 'gad7'), mod(2, 'dass21')];
  assert.equal(canDeleteModule(session[0], session), true);
});

test('attachModulesToSessions agrupa sin N+1', () => {
  const sessions = [
    { id: 1, number: 1 },
    { id: 2, number: 2 },
  ];
  const modules = [
    { id: 10, session_id: 1, module_type: 'gad7' },
    { id: 11, session_id: 1, module_type: 'phq9' },
    { id: 20, session_id: 2, module_type: 'pcl5' },
  ];
  const out = attachModulesToSessions(sessions, modules);
  assert.equal(out[0].modules.length, 2);
  assert.equal(out[1].modules.length, 1);
  assert.equal(out[0].modules[0].id, 10);
  assert.equal(out[1].modules[0].module_type, 'pcl5');
});

test('el check de sesión es un flag manual 0/1', () => {
  assert.equal(isSessionDone({ done: 1 }), true);
  assert.equal(isSessionDone({ done: 0 }), false);
  assert.equal(isSessionDone({}), false);
  assert.equal(isSessionDone({ done: '1' }), true);
});

test('F-004: sessionHasModuleLibrary detecta selector_modulo', () => {
  assert.equal(sessionHasModuleLibrary([mod(1, 'gad7')]), false);
  assert.equal(sessionHasModuleLibrary([mod(1, 'gad7'), mod(2, 'selector_modulo')]), true);
  assert.equal(sessionHasModuleLibrary([]), false);
  assert.equal(sessionHasModuleLibrary(null), false);
});

test('F-004: planSwap convierte in situ y no pide add al final', () => {
  const solo = mod(9, 'gad7');
  assert.deepEqual(planSwapModuleToSelector(solo, [solo]), {
    sessionId: 1,
    moduleId: 9,
    deleteOtherSelectorIds: [],
  });

  const mid = mod(2, 'dass21');
  const session = [mod(1, 'gad7'), mid, mod(3, 'phq9')];
  assert.deepEqual(planSwapModuleToSelector(mid, session), {
    sessionId: 1,
    moduleId: 2,
    deleteOtherSelectorIds: [],
  });
});

test('F-004: planSwap con librería existente convierte el slot y borra el otro selector', () => {
  const clinical = mod(1, 'gad7');
  const session = [clinical, mod(2, 'dass21'), mod(3, 'selector_modulo')];
  assert.deepEqual(planSwapModuleToSelector(clinical, session), {
    sessionId: 1,
    moduleId: 1,
    deleteOtherSelectorIds: [3],
  });
});

test('F-004: planSwap rechaza estructurales y el propio selector', () => {
  assert.throws(() =>
    planSwapModuleToSelector(mod(1, 'registro_inicial'), [mod(1, 'registro_inicial')]),
  );
  assert.throws(() =>
    planSwapModuleToSelector(mod(1, 'selector_modulo'), [mod(1, 'selector_modulo')]),
  );
  assert.throws(() => planSwapModuleToSelector(null, []));
});

test('F-004: sidebar oculta + Añadir módulo si la sesión ya tiene librería', () => {
  const src = readFileSync(join(rootDir, 'src/js/views/workspace.js'), 'utf8');
  assert.match(src, /sessionHasModuleLibrary\(session\.modules\)/);
  assert.match(src, /onSwap[\s\S]*?refreshWorkspace/);
  assert.doesNotMatch(
    src,
    /async onSwap\(modId, sessId\) \{\s*const next = await swapModuleToSelector\(modId\);\s*onNavigate\(/,
  );
});
