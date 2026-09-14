import assert from 'node:assert/strict';
import test from 'node:test';
import { cssrsRiskBand } from '../../src/js/modules/cssrs.js';
import { detectSystemLocale } from '../../src/js/i18n.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('C-SSRS triage: high on intent/plan or recent behavior', () => {
  assert.equal(cssrsRiskBand({ q4: 'yes' }).key, 'high');
  assert.equal(cssrsRiskBand({ q5: 'yes' }).key, 'high');
  assert.equal(cssrsRiskBand({ q6: 'yes', q6_recent: 'yes' }).key, 'high');
});

test('C-SSRS triage: moderate on ideation/method or lifetime behavior', () => {
  assert.equal(cssrsRiskBand({ q2: 'yes' }).key, 'moderate');
  assert.equal(cssrsRiskBand({ q2: 'yes', q3: 'yes' }).key, 'moderate');
  assert.equal(cssrsRiskBand({ q6: 'yes', q6_recent: 'no' }).key, 'moderate');
});

test('C-SSRS triage: low only wish-to-die; none when empty', () => {
  assert.equal(cssrsRiskBand({ q1: 'yes', q2: 'no' }).key, 'low');
  assert.equal(cssrsRiskBand({}).key, 'none');
});

test('PDF export programa no exige Pro', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const tools = readFileSync(join(root, '../../src/js/components/workspace-tools-menu.js'), 'utf8');
  const modal = readFileSync(join(root, '../../src/js/components/subscribe-pro-modal.js'), 'utf8');
  assert.match(tools, /data-action="export-pdf"/);
  assert.doesNotMatch(tools, /requireProOrSubscribe/);
  assert.doesNotMatch(modal, /Exportar programa de tratamiento \(PDF\)/);
  assert.match(modal, /support@telarapp\.cl/);
});

test('updater: popup Más tarde / Descargar ahora', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const updates = readFileSync(join(root, '../../src/js/app-updates.js'), 'utf8');
  const settings = readFileSync(join(root, '../../src/js/views/settings.js'), 'utf8');
  assert.match(updates, /promptAppUpdate/);
  assert.match(updates, /Hay una actualización disponible/);
  assert.match(updates, /Más tarde/);
  assert.match(updates, /Descargar ahora/);
  assert.match(updates, /throw new Error/);
  assert.match(settings, /No se pudo comprobar actualizaciones/);
});

test('Plus USA modal usa support@telarapp.cl', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const modal = readFileSync(join(root, '../../src/js/components/subscribe-pro-modal.js'), 'utf8');
  const clinic = readFileSync(join(root, '../../src/js/clinic-country.js'), 'utf8');
  assert.match(modal, /isUsa/);
  assert.match(modal, /subscribe-pro-usa/);
  assert.match(modal, /support@telarapp\.cl/);
  assert.match(clinic, /id: 'US'/);
});

test('i18n detecta locale de sistema', () => {
  assert.ok(['es', 'en'].includes(detectSystemLocale()));
  const root = dirname(fileURLToPath(import.meta.url));
  const i18n = readFileSync(join(root, '../../src/js/i18n.js'), 'utf8');
  assert.match(i18n, /detectSystemLocale/);
  assert.match(i18n, /navigator\.language/);
});

test('Plus USA geo apunta a support@telarapp.cl', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const geo = readFileSync(join(root, '../../landing/js/geo-pricing.js'), 'utf8');
  assert.match(geo, /US:\s*\{/);
  assert.match(geo, /support@telarapp\.cl/);
});
