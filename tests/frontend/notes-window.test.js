import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { NOTES_WINDOW_TAIL, captureNotesScroll, restoreNotesScroll, visibleNotesWindow } from '../../src/js/notes-window.js';

test('visibleNotesWindow muestra todo si hay pocas notas', () => {
  const notes = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const win = visibleNotesWindow(notes);
  assert.deepEqual(win.notes, notes);
  assert.equal(win.hiddenCount, 0);
});

test('visibleNotesWindow recorta a la cola y cuenta las ocultas', () => {
  const notes = Array.from({ length: NOTES_WINDOW_TAIL + 7 }, (_, i) => ({ id: i + 1 }));
  const win = visibleNotesWindow(notes);
  assert.equal(win.hiddenCount, 7);
  assert.equal(win.notes.length, NOTES_WINDOW_TAIL);
  assert.equal(win.notes[0].id, 8);
  assert.equal(win.notes.at(-1).id, NOTES_WINDOW_TAIL + 7);
});

test('visibleNotesWindow con showAll no recorta', () => {
  const notes = Array.from({ length: NOTES_WINDOW_TAIL + 3 }, (_, i) => ({ id: i + 1 }));
  const win = visibleNotesWindow(notes, { showAll: true });
  assert.equal(win.hiddenCount, 0);
  assert.equal(win.notes.length, notes.length);
});

test('el empty de la bitácora capitaliza, pone atajos y deja la anotación al final', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../src/js/components/notes-panel.js'),
    'utf8',
  );
  assert.match(src, /title: 'Pregunta a la IA sobre el caso'/);
  assert.match(src, /notesKbd\('N'/);
  assert.match(src, /notesKbd\('I'/);
  assert.match(src, /Consulta a la IA sobre el caso/);
  assert.match(src, /También puedes seleccionar texto en un módulo para crear una anotación/);
  assert.match(src, /key !== 'n' && key !== 'i'/);
  const emptyIdx = src.indexOf('NOTES_EMPTY_HTML');
  const selectIdx = src.indexOf('También puedes seleccionar texto');
  const pulsaIdx = src.indexOf('Pulsa + Nota');
  assert.ok(emptyIdx > 0 && pulsaIdx > emptyIdx && selectIdx > pulsaIdx);
});

test('captureNotesScroll lee #notes-list', () => {
  const list = { scrollTop: 312 };
  const root = { querySelector: (sel) => (sel === '#notes-list' ? list : null) };
  assert.equal(captureNotesScroll(root), 312);
  assert.equal(captureNotesScroll({ querySelector: () => null }), 0);
});

test('restoreNotesScroll no pisa el scroll si el nodo ya no está', () => {
  const list = { scrollTop: 10, isConnected: false };
  restoreNotesScroll({ querySelector: () => list }, 400);
  assert.equal(list.scrollTop, 10);
});

test('restoreNotesScroll vuelve a poner el scrollTop de la bitácora', () => {
  const list = { scrollTop: 0, isConnected: true };
  restoreNotesScroll({ querySelector: () => list }, 420);
  assert.equal(list.scrollTop, 420);
});

test('el workspace restaura el scroll de la bitácora al reusar el panel', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../src/js/views/workspace.js'),
    'utf8',
  );
  assert.match(src, /captureNotesScroll\(container\)/);
  assert.match(src, /restoreNotesScroll\(container, savedNotesScroll\)/);
  assert.match(src, /if \(keepNotes\) restoreNotesScroll/);
});

test('al elegir un módulo desde la librería se conserva el scroll del centro', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../src/js/views/workspace.js'),
    'utf8',
  );
  assert.match(src, /preserveScroll: true/);
  assert.match(src, /tryPaintCenterModuleInPlace/);
  assert.match(src, /scheduleRestoreModuleViewportOffset/);
});
