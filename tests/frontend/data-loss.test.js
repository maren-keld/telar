import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bindAutoSave,
  enqueueSave,
  flushPendingAutoSaves,
  queuedPersist,
  resetAutoSaveHandlesForTests,
} from '../../src/js/autobind.js';
import {
  coherentRegistroPayload,
  seedRegistroFields,
} from '../../src/js/modules/registro-inicial.js';
import { commitModuleRow } from '../../src/js/readable-text.js';

test.afterEach(() => {
  resetAutoSaveHandlesForTests();
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeRoot() {
  const listeners = {};
  return {
    isConnected: true,
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    fire(type, target) {
      listeners[type]?.({ type, target });
    },
  };
}

function textTarget(value = '') {
  return {
    value,
    type: 'text',
    tagName: 'INPUT',
    matches: (sel) => String(sel).includes('input'),
    closest: () => null,
  };
}

test('seed Registro toma el RUT del paciente si el módulo está vacío', () => {
  const seeded = seedRegistroFields(
    {},
    { patient_name: 'Ana Pérez', patient_id_number: '12345678-5', patient_phone: '912345678' },
    'CL',
  );
  assert.equal(seeded.nombre, 'Ana Pérez');
  assert.match(seeded.id_number, /12\.345\.678-5/);
  assert.equal(seeded.phone, '912345678');
});

test('payload coherente: vacío nunca mostrado no pisa el RUT guardado', () => {
  const stored = {
    nombre: 'Ana Pérez',
    id_number: '12.345.678-5',
    phone: '912345678',
    address: 'Santiago',
    email: 'ana@test.cl',
  };
  const payload = coherentRegistroPayload({
    form: { nombre: 'Ana Pérez', id_number: '', phone: '', address: '', email: '' },
    seeded: { nombre: 'Ana Pérez', id_number: '', phone: '', address: '', email: '' },
    stored,
  });
  assert.equal(payload.id_number, '12.345.678-5');
  assert.equal(payload.phone, '912345678');
  assert.equal(payload.address, 'Santiago');
  assert.equal(payload.email, 'ana@test.cl');
});

test('payload coherente: borrar un campo que sí se mostró queda vacío en las dos copias', () => {
  const payload = coherentRegistroPayload({
    form: { nombre: 'Ana', id_number: '', phone: '9', address: 'Santiago', email: '' },
    seeded: { nombre: 'Ana', id_number: '12.345.678-5', phone: '9', address: 'Santiago', email: 'a@b.cl' },
    stored: { id_number: '12.345.678-5', email: 'a@b.cl' },
  });
  assert.equal(payload.id_number, '');
  assert.equal(payload.email, '');
  assert.equal(payload.phone, '9');
});

test('commitModuleRow deja la RAM igual que el JSON guardado', () => {
  const row = { id: 3, module_type: 'registro_inicial', data: '{}', status: 'pendiente' };
  commitModuleRow(row, { nombre: 'Ana', id_number: '1-9' }, 'completado');
  assert.equal(JSON.parse(row.data).nombre, 'Ana');
  assert.equal(JSON.parse(row.data).id_number, '1-9');
  assert.equal(row.status, 'completado');
});

test('escribir y salir ya: flush guarda lo pendiente', async () => {
  const stored = [];
  let current = '';
  const root = fakeRoot();
  const saveFn = async () => {
    stored.push(current);
  };
  bindAutoSave(root, saveFn, { debounceMs: 80 });
  current = 'hola';
  root.fire('input', textTarget(current));
  await flushPendingAutoSaves();
  assert.deepEqual(stored, ['hola']);
});

test('editar durante una escritura lenta deja el valor nuevo', async () => {
  const stored = [];
  let current = 'a';
  let release;
  const root = fakeRoot();
  const saveFn = async () => {
    const snap = current;
    if (stored.length === 0) {
      stored.push(snap);
      await new Promise((resolve) => {
        release = resolve;
      });
      return;
    }
    stored.push(snap);
  };
  const schedule = bindAutoSave(root, saveFn, { debounceMs: 20 });
  root.fire('input', textTarget('a'));
  await delay(40);
  current = 'b';
  const second = schedule.now();
  release();
  await second;
  await flushPendingAutoSaves();
  assert.equal(stored.at(-1), 'b');
});

test('fallo de guardado hace fallar el flush (no se sigue como si hubiera guardado)', async () => {
  const root = fakeRoot();
  const saveFn = async () => {
    throw new Error('boom');
  };
  const schedule = bindAutoSave(root, saveFn, { debounceMs: 10 });
  await assert.rejects(() => schedule.now(), /boom/);
  await assert.rejects(() => flushPendingAutoSaves(), /boom/);
});

test('enqueueSave espera la escritura en curso de la misma función', async () => {
  const order = [];
  let release;
  const saveFn = async () => {
    if (order.length === 0) {
      order.push('first-start');
      await new Promise((resolve) => {
        release = resolve;
      });
      order.push('first-end');
      return;
    }
    order.push('second');
  };
  const first = enqueueSave(saveFn);
  const second = enqueueSave(saveFn);
  await delay(10);
  assert.deepEqual(order, ['first-start']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});

test('flush espera queuedPersist en vuelo', async () => {
  let release;
  let written = false;
  const saveFn = async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    written = true;
  };
  const persist = queuedPersist(saveFn);
  const pending = persist();
  const flushP = flushPendingAutoSaves();
  let flushDone = false;
  flushP.then(() => {
    flushDone = true;
  });
  await delay(20);
  assert.equal(written, false);
  assert.equal(flushDone, false);
  release();
  await pending;
  await flushP;
  assert.equal(written, true);
  assert.equal(flushDone, true);
});

test('flush reintenta queuedPersist fallido y persiste el valor actual', async () => {
  let calls = 0;
  let stored = '';
  const current = 'Providencia';
  const saveFn = async () => {
    calls += 1;
    if (calls === 1) throw new Error('red');
    stored = current;
  };
  const persist = queuedPersist(saveFn, () => {});
  await assert.rejects(() => persist(), /red/);
  assert.equal(stored, '');
  await flushPendingAutoSaves();
  assert.equal(calls, 2);
  assert.equal(stored, 'Providencia');
});

test('workspace no desmonta si el flush falla y recarga con getModule', () => {
  const ws = readFileSync(new URL('../../src/js/views/workspace.js', import.meta.url), 'utf8');
  assert.match(ws, /registro_inicial/);
  assert.match(ws, /motivo_consulta/);
  assert.match(ws, /KEEP_HYDRATED_TYPES/);
  assert.match(ws, /await getModule\(item\.mod\.id\)/);
  assert.match(ws, /if \(!\(await flushWorkspaceSaves\(\)\)\) return/);
  const app = readFileSync(new URL('../../src/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /flushPendingAutoSaves/);
  assert.match(app, /#workspace-layout/);
  assert.match(app, /lastWorkspaceHash/);
  const registro = readFileSync(new URL('../../src/js/modules/registro-inicial.js', import.meta.url), 'utf8');
  assert.match(registro, /savePatientAndModule/);
  assert.match(registro, /coherentRegistroPayload/);
});
