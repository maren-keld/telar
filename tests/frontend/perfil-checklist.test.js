import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildSpaceCheckRowHtml, notePresent } from '../../src/js/perfil-checklist.js';

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

test('notePresent detecta notas no vacías', () => {
  assert.equal(notePresent(''), false);
  assert.equal(notePresent('   '), false);
  assert.equal(notePresent('Observación clínica'), true);
});

test('checklist marcado muestra lápiz y Reforzar', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Empatía',
    category: 'fortalezas',
    checked: true,
    escapeHtml,
  });
  assert.match(html, /data-perfil-edit/);
  assert.match(html, /data-perfil-reinforce/);
  assert.match(html, /title="Reforzar"/);
  assert.match(html, /aria-label="Reforzar"/);
  assert.match(html, /space-check__reinforce/);
  assert.doesNotMatch(html, />Reforzar</);
  assert.match(html, /space-check--checked/);
});

test('checklist sin marcar oculta acciones', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Empatía',
    category: 'fortalezas',
    checked: false,
    escapeHtml,
  });
  assert.doesNotMatch(html, /data-perfil-edit/);
  assert.doesNotMatch(html, /data-perfil-reinforce/);
  assert.doesNotMatch(html, /space-check__actions/);
});

test('Reforzar activo y nota clínica se reflejan en clases y markup', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Humor',
    category: 'defensas',
    checked: true,
    reinforce: true,
    note: 'Usa humor defensivo en sesión.',
    escapeHtml,
  });
  assert.match(html, /space-check--reinforce/);
  assert.match(html, /space-check--has-note/);
  assert.match(html, /space-check__reinforce is-active/);
  assert.match(html, /Usa humor defensivo en sesión\./);
});

test('notes-panel usa perfil-checklist y db note/reinforce', () => {
  const panel = readFileSync(
    new URL('../../src/js/components/notes-panel.js', import.meta.url),
    'utf8',
  );
  assert.match(panel, /buildSpaceCheckRowHtml/);
  assert.match(panel, /setSpaceCheckNote/);
  assert.match(panel, /setSpaceCheckReinforce/);
  assert.match(panel, /openEditFieldModal/);
});

test('db expone columnas note y reinforce en space checks', () => {
  const db = readFileSync(new URL('../../src/js/db.js', import.meta.url), 'utf8');
  assert.match(db, /setSpaceCheckNote/);
  assert.match(db, /setSpaceCheckReinforce/);
  assert.match(db, /reinforce = CASE WHEN excluded\.checked = 0 THEN 0/);
});

test('migración 014 agrega note y reinforce', () => {
  const sql = readFileSync(
    new URL('../../src-tauri/migrations/014_space_check_notes.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN note/);
  assert.match(sql, /ADD COLUMN reinforce/);
});
