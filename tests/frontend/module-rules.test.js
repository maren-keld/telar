import test from 'node:test';
import assert from 'node:assert/strict';
import { attachModulesToSessions, canDeleteModule, canMoveModule, isSessionDone } from '../../src/js/db.js';

const mod = (id, type) => ({ id, module_type: type, session_id: 1, sort_order: id });

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
