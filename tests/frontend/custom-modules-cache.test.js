import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCustomModule,
  listCustomModules,
  resetCustomModulesCache,
  saveCustomModule,
} from '../../src/js/custom-modules.js';

test.afterEach(() => {
  resetCustomModulesCache();
});

test('resetCustomModulesCache deja la lista vacía para recargar de la DB', async () => {
  resetCustomModulesCache();
  try {
    await saveCustomModule({ id: 'm1', title: 'Viejo' });
  } catch {
    /* persist necesita Tauri; la caché ya quedó */
  }
  assert.equal(getCustomModule('m1')?.title, 'Viejo');
  resetCustomModulesCache();
  assert.equal(getCustomModule('m1'), null);
  assert.equal(listCustomModules().length, 0);
});
