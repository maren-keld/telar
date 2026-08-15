import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteModule, canMoveModule } from '../../src/js/db.js';

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
