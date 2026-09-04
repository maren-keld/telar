import assert from 'node:assert/strict';
import test from 'node:test';

import { listProposableModules } from '../../src/js/ai-actions.js';
import { computeAsrsScores, mergeAsrsScreenerAnswers } from '../../src/js/asrs-scoring.js';
import { asrsItems } from '../../src/js/modules/asrs.js';
import { isLicensePendingModule } from '../../src/js/license-pending-modules.js';
import { psychometricsFor } from '../../src/js/module-psychometrics.js';
import { toShareDef } from '../../src/js/questionnaire-defs.js';
import { asrsSummary } from '../../src/js/asrs-scoring.js';
import { previewHtml } from '../../src/js/components/module-selector.js';
import { getTreatmentTemplate } from '../../src/js/treatment-templates.js';
import { listAddableModuleOptions } from '../../src/js/workspace-index-mode.js';

test('IES-R y SPRINT quedan pendientes de permiso', () => {
  assert.equal(isLicensePendingModule('iesr'), true);
  assert.equal(isLicensePendingModule('sprint_ecl'), true);
  assert.equal(isLicensePendingModule('pcl5'), false);
});

test('el catálogo, la IA y el compartir no ofrecen escalas pendientes', () => {
  const proposable = new Set(listProposableModules().map((m) => m.id));
  assert.equal(proposable.has('iesr'), false);
  assert.equal(proposable.has('sprint_ecl'), false);
  assert.equal(proposable.has('pcl5'), true);

  const addable = new Set(listAddableModuleOptions().map((m) => m.type));
  assert.equal(addable.has('iesr'), false);
  assert.equal(addable.has('sprint_ecl'), false);

  assert.equal(toShareDef('iesr'), null);
  assert.equal(toShareDef('sprint_ecl'), null);
  assert.ok(toShareDef('pcl5'));
  assert.equal(toShareDef('asrs').items.length, 6);
});

test('la plantilla de trauma usa PCL-5 y no escalas pendientes', () => {
  const tpl = getTreatmentTemplate('trauma_regulacion');
  assert.ok(tpl);
  const ids = tpl.sessions.flatMap((s) => s.modules);
  assert.ok(ids.includes('pcl5'));
  assert.ok(!ids.includes('iesr'));
  assert.ok(!ids.includes('sprint_ecl'));
});

test('ASRS puntúa solo el screener de 6 ítems y conserva la Parte B guardada', () => {
  const stored = Array.from({ length: 18 }, (_, i) => i % 5);
  const next = mergeAsrsScreenerAnswers([4, 4, 3, 4, 4, 3], stored);
  assert.equal(next.length, 18);
  assert.deepEqual(next.slice(0, 6), [4, 4, 3, 4, 4, 3]);
  assert.deepEqual(next.slice(6), stored.slice(6));

  const scores = computeAsrsScores(next);
  assert.equal(scores.partAPositive, 6);
  assert.equal(scores.screenPositive, true);
  assert.equal('total' in scores, false);

  const summary = asrsSummary({ answers: next });
  assert.equal(summary.partAPositive, 6);
  assert.equal(summary.total, undefined);
  assert.equal(asrsItems().length, 6);
});

test('el preview del selector muestra licencia cuando existe', () => {
  const psych = psychometricsFor('pcl5');
  assert.ok(psych?.license);
  const html = previewHtml('pcl5', { label: 'PCL-5' }, psych);
  assert.match(html, /Licencia/);
  assert.match(html, /Dominio público/);
  assert.equal(psychometricsFor('gad7').license.includes('Pfizer'), true);
  assert.match(psychometricsFor('asrs').license, /WHO/);
  assert.match(psychometricsFor('tcc_abc').license, /Telar/);
});
