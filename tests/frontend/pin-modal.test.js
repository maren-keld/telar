import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createExclusiveSubmit } from '../../src/js/components/pin-modal.js';

test('Enter o click no relanzan onSubmit mientras el primero sigue en curso', async () => {
  const exclusive = createExclusiveSubmit();
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const first = exclusive.run(async () => {
    calls += 1;
    await blocked;
    return 'ok';
  });
  const second = await exclusive.run(async () => {
    calls += 1;
    return 'no';
  });
  assert.deepEqual(second, { started: false });
  assert.equal(exclusive.busy, true);
  release();
  assert.deepEqual(await first, { started: true, value: 'ok' });
  assert.equal(calls, 1);
  const third = await exclusive.run(async () => {
    calls += 1;
    return 'again';
  });
  assert.deepEqual(third, { started: false });
  assert.equal(calls, 1);
});

test('si el envío falla, se puede reintentar', async () => {
  const exclusive = createExclusiveSubmit();
  await assert.rejects(
    () =>
      exclusive.run(async () => {
        throw new Error('pin');
      }),
    /pin/,
  );
  assert.equal(exclusive.busy, false);
  const retry = await exclusive.run(async () => 'ok');
  assert.deepEqual(retry, { started: true, value: 'ok' });
});

test('el modal de PIN usa el candado exclusivo y no deja pasar el Enter al botón', () => {
  const src = readFileSync(new URL('../../src/js/components/pin-modal.js', import.meta.url), 'utf8');
  assert.match(src, /const exclusive = createExclusiveSubmit\(\)/);
  assert.match(src, /await exclusive\.run/);
  assert.match(src, /ev\.preventDefault\(\)/);
  assert.match(src, /if \(ev\.key !== 'Enter'\) return/);
});
