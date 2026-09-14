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

test('FAIL-4: C-SSRS wired as legacy renderer with GAD-like Sí/No UI', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(join(root, '../../src/js/modules/index.js'), 'utf8');
  const legacy = readFileSync(join(root, '../../src/js/legacy-module-defs.js'), 'utf8');
  const cssrs = readFileSync(join(root, '../../src/js/modules/cssrs.js'), 'utf8');
  assert.match(index, /cssrs:\s*renderCssrs/);
  assert.match(legacy, /'cssrs'/);
  assert.match(cssrs, /Past Month|Mes pasado/);
  assert.match(cssrs, /cssrs-triage-cell/);
  assert.match(cssrs, /If YES to 2|Si 2 = Sí/);
});

test('FAIL-4: sidebar chips Estudio|Programa and no footer microscope', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const workspace = readFileSync(join(root, '../../src/js/views/workspace.js'), 'utf8');
  assert.match(workspace, /workspace-space-chips/);
  assert.match(workspace, /Estudio de caso/);
  assert.match(workspace, />Programa</);
  assert.doesNotMatch(workspace, /data-sidebar-index-mode="estudio"[\s\S]*microscope|M12 13v3.*data-sidebar-index-mode="estudio"/);
  // Footer no longer has the estudio microscope toggle (chip instead).
  const footer = workspace.slice(workspace.indexOf('workspace-sidebar__footer'));
  assert.doesNotMatch(footer, /data-sidebar-index-mode="estudio"/);
});

test('FAIL-4: AI context includes Estudio axes', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const ctx = readFileSync(join(root, '../../src/js/export-case-context.js'), 'utf8');
  assert.match(ctx, /loadCaseStudy/);
  assert.match(ctx, /formatEstudioAxisBlock/);
  assert.match(ctx, /Factores protectores|resource/);
});

test('FAIL-4: DOB coherent payload preserves birth_date', async () => {
  const { coherentRegistroPayload } = await import('../../src/js/modules/registro-inicial.js');
  const kept = coherentRegistroPayload({
    form: { birth_date: '' },
    seeded: { birth_date: '' },
    stored: { patient_birth_date: '1990-03-15' },
  });
  assert.equal(kept.birth_date, '1990-03-15');
  const cleared = coherentRegistroPayload({
    form: { birth_date: '' },
    seeded: { birth_date: '1990-03-15' },
    stored: { patient_birth_date: '1990-03-15' },
  });
  assert.equal(cleared.birth_date, '');
});

test('FAIL-4: vital risk score rises with C-SSRS high', async () => {
  const { computeVitalRisk } = await import('../../src/js/vital-risk-score.js');
  const low = computeVitalRisk({ sessions: [], caseStudy: { elements: [] } });
  assert.ok(low.level < 0.25);
  const high = computeVitalRisk({
    sessions: [
      {
        modules: [
          {
            module_type: 'cssrs',
            data: JSON.stringify({ answers: { q4: 'yes' } }),
          },
          {
            module_type: 'motivo_consulta',
            data: JSON.stringify({ urgencia: 'alta' }),
          },
        ],
      },
    ],
    caseStudy: {
      elements: [{ axis: 'risk', title: 'Ideación suicida', status: 'managed' }],
    },
  });
  assert.ok(high.level > 0.7);
  assert.equal(high.label, 'Alto');
});
