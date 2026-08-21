import assert from 'node:assert/strict';
import test from 'node:test';

import { collectFormData, formPayload } from '../../src/js/autobind.js';

test('formPayload acepta el objeto plano de collectFormData', () => {
  const payload = formPayload({ hitos: 'colegio', giros: 'mudanza' });
  assert.deepEqual(payload, { hitos: 'colegio', giros: 'mudanza' });
});

test('formPayload acepta FormData', () => {
  const fd = new FormData();
  fd.set('hitos', 'colegio');
  assert.equal(formPayload(fd).hitos, 'colegio');
});

test('collectFormData sigue guardando aunque se use como FormData.entries', () => {
  const root = {
    querySelectorAll: () => [{ name: 'hitos', type: 'textarea', value: 'colegio' }],
  };
  const data = collectFormData(root);
  assert.equal(formPayload(data).hitos, 'colegio');
  assert.equal(Object.fromEntries(data.entries()).hitos, 'colegio');
});

test('los módulos no vuelven a tratar collectFormData como FormData', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(import.meta.dirname, '../../src/js/modules');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const hits = [];
  for (const file of files) {
    const src = await readFile(join(dir, file), 'utf8');
    if (/collectFormData\([^)]*\)[\s\S]{0,160}?\.entries\(/.test(src)) {
      hits.push(file);
    }
  }
  assert.deepEqual(hits, []);
});
