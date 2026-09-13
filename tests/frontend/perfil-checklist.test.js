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

test('Recursos marcado muestra Presente además de Reforzar', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Empatía',
    category: 'fortalezas',
    checked: true,
    escapeHtml,
  });
  assert.match(html, /data-perfil-present/);
  assert.match(html, /title="Presente"/);
  assert.match(html, /aria-label="Presente"/);
});

test('Defensas no muestra Presente', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Humor',
    category: 'defensas',
    checked: true,
    escapeHtml,
  });
  assert.doesNotMatch(html, /data-perfil-present/);
  assert.match(html, /data-perfil-reinforce/);
});

test('Presente y Reforzar son independientes en markup', () => {
  const html = buildSpaceCheckRowHtml({
    label: 'Empatía',
    category: 'fortalezas',
    checked: true,
    present: true,
    reinforce: false,
    escapeHtml,
  });
  assert.match(html, /space-check--present/);
  assert.doesNotMatch(html, /space-check--reinforce/);
  assert.match(html, /space-check__present is-active/);
  assert.match(html, /space-check__reinforce(?! is-active)/);
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
  assert.doesNotMatch(html, /data-perfil-present/);
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

test('notes-panel usa perfil-checklist y db note/reinforce/present', () => {
  const panel = readFileSync(
    new URL('../../src/js/components/notes-panel.js', import.meta.url),
    'utf8',
  );
  assert.match(panel, /buildSpaceCheckRowHtml/);
  assert.match(panel, /setSpaceCheckNote/);
  assert.match(panel, /setSpaceCheckReinforce/);
  assert.match(panel, /setSpaceCheckPresent/);
  assert.match(panel, /openEditFieldModal/);
  assert.match(panel, /Defensas psíquicas/);
});

test('db expone columnas note, reinforce y present en space checks', () => {
  const db = readFileSync(new URL('../../src/js/db.js', import.meta.url), 'utf8');
  assert.match(db, /setSpaceCheckNote/);
  assert.match(db, /setSpaceCheckReinforce/);
  assert.match(db, /setSpaceCheckPresent/);
  assert.match(db, /reinforce = CASE WHEN excluded\.checked = 0 THEN 0/);
  assert.match(db, /present = CASE WHEN excluded\.checked = 0 THEN 0/);
});

test('migración 014 agrega note y reinforce', () => {
  const sql = readFileSync(
    new URL('../../src-tauri/migrations/014_space_check_notes.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN note/);
  assert.match(sql, /ADD COLUMN reinforce/);
});

test('migración 015 agrega present', () => {
  const sql = readFileSync(
    new URL('../../src-tauri/migrations/015_space_check_present.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN present/);
});

test('diagnóstico expone ayuda y tab Formulación', () => {
  const dx = readFileSync(new URL('../../src/js/modules/diagnostico.js', import.meta.url), 'utf8');
  assert.match(dx, /DX_HELP_MESSAGE/);
  assert.match(dx, />Formulación</);
  assert.doesNotMatch(dx, /dx-help/);
  assert.match(dx, /data-view="formulacion"/);
});

test('workspace enlaza ayuda de diagnóstico en botonera', () => {
  const ws = readFileSync(new URL('../../src/js/views/workspace.js', import.meta.url), 'utf8');
  assert.match(ws, /DX_HELP_MESSAGE/);
  assert.match(ws, /isDx/);
});

test('PDF programa incluye ejes de perfil antes de sesiones', () => {
  const pdf = readFileSync(
    new URL('../../src/js/export-treatment-pdf.js', import.meta.url),
    'utf8',
  );
  assert.match(pdf, /renderPerfilAxesBlock/);
  assert.match(pdf, /Defensas psíquicas/);
  const sessionsIdx = pdf.indexOf("'Sesiones y módulos'");
  const axesIdx = pdf.indexOf('renderPerfilAxesBlock');
  assert.ok(axesIdx > 0 && sessionsIdx > axesIdx);
});
