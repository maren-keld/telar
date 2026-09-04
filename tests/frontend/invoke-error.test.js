import test from 'node:test';
import assert from 'node:assert/strict';

const { invokeErrorMessage } = await import('../../src/js/utils.js');

test('Tauri a veces tira un string, no un Error', () => {
  assert.equal(invokeErrorMessage('Pack dañado'), 'Pack dañado');
  assert.equal(invokeErrorMessage(new Error('Load failed')), 'Load failed');
  assert.equal(invokeErrorMessage({ message: 'No se pudo abrir el pack' }), 'No se pudo abrir el pack');
  assert.equal(invokeErrorMessage(null, 'fallback'), 'fallback');
});
