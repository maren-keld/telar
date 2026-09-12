import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  centerModuleIdsMatch,
  moduleViewportOffset,
  nextScrollTopForModule,
  restoreModuleViewportOffset,
  scheduleRestoreModuleViewportOffset,
  snapshotModuleCardHeights,
} from '../../src/js/workspace-center-scroll.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

test('scheduleRestoreModuleViewportOffset re-ancla de inmediato y en doble rAF', async () => {
  const frames = [];
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    frames.push(cb);
    return frames.length;
  };
  try {
    const root = {
      scrollTop: 500,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    const el = {
      isConnected: true,
      getBoundingClientRect: () => ({ top: root.scrollTop === 500 ? -100 : 40 }),
    };
    scheduleRestoreModuleViewportOffset(root, el, 40);
    // Inmediato: current=-100, offset=40 → scrollTop = 500 + (-100 - 40) = 360
    assert.equal(root.scrollTop, 360);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(frames.length, 1);
    // Tras 1er rAF el mock ya dejó top=40 (=offset) → sin delta
    assert.equal(root.scrollTop, 360);
    frames.shift()();
    assert.equal(frames.length, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test('nextScrollTopForModule con force alinea el tope aunque el card ya tenga un sliver visible', () => {
  const rootRect = { top: 100, bottom: 700 };
  // Card alto: tope a 520 (sliver en viewport), fondo muy abajo
  const elRect = { top: 520, bottom: 1400 };
  const next = nextScrollTopForModule(rootRect, elRect, 800, { force: true, pad: 20 });
  assert.equal(next, 800 + (520 - 100) - 20);
});

test('nextScrollTopForModule sin force no mueve si el card cabe entero en vista', () => {
  const rootRect = { top: 100, bottom: 700 };
  const elRect = { top: 200, bottom: 400 };
  assert.equal(nextScrollTopForModule(rootRect, elRect, 300, { force: false }), null);
});

test('nextScrollTopForModule sin force sube si el card está arriba del pad', () => {
  const rootRect = { top: 100, bottom: 700 };
  const elRect = { top: 50, bottom: 250 };
  assert.equal(nextScrollTopForModule(rootRect, elRect, 200, { force: false, pad: 20 }), 130);
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
  const src = readFileSync(join(rootDir, 'src/js/views/workspace.js'), 'utf8');
  assert.match(src, /tryPaintCenterModuleInPlace/);
  assert.match(src, /scheduleRestoreModuleViewportOffset/);
  assert.match(src, /previousHeights/);
});

test('QA-005: clic en ítem de librería ancla por viewport offset, no scrollTop absoluto', () => {
  const src = readFileSync(join(rootDir, 'src/js/components/module-selector.js'), 'utf8');
  assert.match(src, /scheduleRestoreModuleViewportOffset/);
  assert.match(src, /moduleViewportOffset/);
  assert.match(src, /center-module-card/);
  assert.doesNotMatch(src, /centerTop = center\?\.scrollTop/);
});

test('QA-006: al cambiar de módulo se fuerza scroll al tope del card', () => {
  const src = readFileSync(join(rootDir, 'src/js/views/workspace.js'), 'utf8');
  assert.match(src, /switchedModule/);
  assert.match(src, /scrollToModule\(container, moduleId, \{ force: switchedModule \}\)/);
  assert.match(src, /scrollToModule\(container, activeModule\.id, \{ force: true \}\)/);
  assert.match(src, /nextScrollTopForModule/);
});
