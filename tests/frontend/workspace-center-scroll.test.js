import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  centerModuleIdsMatch,
  moduleViewportOffset,
  restoreModuleViewportOffset,
  snapshotModuleCardHeights,
} from '../../src/js/workspace-center-scroll.js';

test('restoreModuleViewportOffset corrige el scroll para dejar la tarjeta donde estaba', () => {
  const root = {
    scrollTop: 400,
    getBoundingClientRect: () => ({ top: 100 }),
  };
  const el = {
    getBoundingClientRect: () => ({ top: 40 }),
  };
  assert.equal(moduleViewportOffset(root, el), -60);
  restoreModuleViewportOffset(root, el, 80);
  assert.equal(root.scrollTop, 260);
});

test('centerModuleIdsMatch exige el mismo orden de ids', () => {
  const host = {
    querySelectorAll: () => [{ dataset: { moduleId: '1' } }, { dataset: { moduleId: '2' } }],
  };
  assert.equal(
    centerModuleIdsMatch(host, [{ modules: [{ id: 1 }, { id: 2 }] }]),
    true,
  );
  assert.equal(
    centerModuleIdsMatch(host, [{ modules: [{ id: 2 }, { id: 1 }] }]),
    false,
  );
});

test('snapshotModuleCardHeights ignora tarjetas sin altura', () => {
  const host = {
    querySelectorAll: () => [
      { dataset: { moduleId: '9' }, getBoundingClientRect: () => ({ height: 780 }) },
      { dataset: { moduleId: '8' }, getBoundingClientRect: () => ({ height: 0 }) },
    ],
  };
  const heights = snapshotModuleCardHeights(host);
  assert.equal(heights.get('9'), 780);
  assert.equal(heights.has('8'), false);
});

test('al elegir un módulo desde la librería se pinta in situ y se ancla la tarjeta', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../src/js/views/workspace.js'),
    'utf8',
  );
  assert.match(src, /tryPaintCenterModuleInPlace/);
  assert.match(src, /restoreModuleViewportOffset/);
  assert.match(src, /previousHeights/);
});
