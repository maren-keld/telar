import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decryptShare, encryptShare, generateShareKey } from '../../src/lib/share-crypto.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

for (const file of ['questionnaire-schema.js', 'share-crypto.js']) {
  test(`landing/r/js/${file} es copia exacta de src/lib`, () => {
    const source = readFileSync(`${root}src/lib/${file}`, 'utf8');
    const copy = readFileSync(`${root}landing/r/js/${file}`, 'utf8');
    assert.equal(
      copy,
      source,
      `Desincronizado: corre ./scripts/sync-share-lib.sh tras editar src/lib/${file}`,
    );
  });
}

test('el sobre cifrado va y vuelve con la misma llave', async () => {
  const key = generateShareKey();
  const envelope = await encryptShare(key, { answers: [1, 2, null] });
  assert.deepEqual(await decryptShare(key, envelope), { answers: [1, 2, null] });
});

test('el sobre no se abre con otra llave', async () => {
  const envelope = await encryptShare(generateShareKey(), { answers: [1] });
  await assert.rejects(() => decryptShare(generateShareKey(), envelope));
});

test('el sobre cifrado es base64 puro, que es lo que acepta el servidor', async () => {
  const envelope = await encryptShare(generateShareKey(), { answers: [3, 3, 3] });
  assert.match(envelope, /^[A-Za-z0-9+/=]+$/);
});

test('rechaza llaves de largo incorrecto', async () => {
  await assert.rejects(() => encryptShare('llave-corta', { a: 1 }), /no es válida/);
});
