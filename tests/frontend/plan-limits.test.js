import assert from 'node:assert/strict';
import test from 'node:test';

test('FREE_ACTIVE_PATIENT_LIMIT is 3', async () => {
  const { FREE_ACTIVE_PATIENT_LIMIT } = await import('../../src/js/subscription-config.js');
  assert.equal(FREE_ACTIVE_PATIENT_LIMIT, 3);
});

test('isProUser when plan is pro', async () => {
  globalThis.window = { __TAURI__: undefined };
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  const { saveProfile, isProUser } = await import('../../src/js/profile.js');
  saveProfile({ plan: 'pro', name: 'Test', email: 't@test.cl' });
  assert.equal(isProUser(), true);
});
