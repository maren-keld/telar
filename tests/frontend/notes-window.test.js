import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { NOTES_WINDOW_TAIL, visibleNotesWindow } from '../../src/js/notes-window.js';

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
