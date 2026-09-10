import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('el drawer ya no tiene Objetivos y termina en Free o Pro', () => {
  const src = read(join('../../src/js/components/app-sidebar.js'));
  assert.doesNotMatch(src, /id: 'goals'/);
  assert.match(src, /data-nav="plan"/);
  assert.match(src, /Actualizar/);
  assert.match(src, /openSubscribeProModal/);
});

test('objetivos viven en estadísticas, sin sesiones por semana', () => {
  const reportes = read(join('../../src/js/views/reportes.js'));
  const goals = read(join('../../src/js/views/goals.js'));
  const app = read(join('../../src/js/app.js'));
  assert.match(reportes, /mountGoalsSection/);
  assert.match(goals, /Pacientes nuevos/);
  assert.match(goals, /Convenios/);
  assert.doesNotMatch(goals, /goal_sess_week/);
  assert.doesNotMatch(goals, /sessions_weekly/);
  assert.match(app, /location.hash = '\/reportes'/);
});

test('herramientas no muestra el asistente IA', () => {
  const src = read(join('../../src/js/components/workspace-tools-menu.js'));
  assert.doesNotMatch(src, /Asistente IA/);
  assert.doesNotMatch(src, /toolsAiSectionHtml/);
  assert.match(src, /Espacio de trabajo/);
});
