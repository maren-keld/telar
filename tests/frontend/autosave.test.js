import test from 'node:test';
import assert from 'node:assert/strict';
import { bindAutoSave, flushPendingAutoSaves } from '../../src/js/autobind.js';

function fakeRoot() {
  const listeners = [];
  return {
    isConnected: true,
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    emit(type, target) {
      for (const l of listeners) {
        if (l.type === type) l.fn({ target });
      }
    },
  };
}

function fakeField(tag = 'textarea') {
  return {
    type: tag === 'textarea' ? 'textarea' : 'text',
    matches: (sel) => sel.includes(tag) || sel.includes('input'),
    closest: () => null,
  };
}

test('bindAutoSave escribe al hacer flush aunque el debounce no haya vencido', async () => {
  const root = fakeRoot();
  let writes = 0;
  bindAutoSave(root, async () => {
    writes += 1;
  }, { debounceMs: 10_000 });

  root.emit('input', fakeField());
  assert.equal(writes, 0);

  await flushPendingAutoSaves();
  assert.equal(writes, 1);
});

test('flushPendingAutoSaves no pierde el write si el nodo sigue conectado', async () => {
  const root = fakeRoot();
  const saved = [];
  bindAutoSave(root, async () => {
    saved.push('ok');
  }, { debounceMs: 5_000 });

  root.emit('change', fakeField('input'));
  await flushPendingAutoSaves();
  assert.deepEqual(saved, ['ok']);
});
