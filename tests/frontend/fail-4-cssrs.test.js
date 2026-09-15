import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cssrsRiskBand } from '../../src/js/modules/cssrs.js';
import { computeVitalRisk } from '../../src/js/vital-risk.js';
import { statusLabelFor } from '../../src/js/case-study-model.js';

const root = dirname(fileURLToPath(import.meta.url));

test('C-SSRS: Q2=no omite 3–5; conducta 3 meses es alto', () => {
  assert.equal(cssrsRiskBand({ q1: 'yes', q2: 'no', q6: 'no' }).key, 'low');
  assert.equal(cssrsRiskBand({ q2: 'yes', q3: 'yes' }).key, 'moderate');
  assert.equal(cssrsRiskBand({ q6_recent: 'yes' }).key, 'high');
});

test('C-SSRS aparece como módulo renderizable, no solo como metadato', () => {
  const registry = readFileSync(join(root, '../../src/js/modules/index.js'), 'utf8');
  assert.match(registry, /import \{ renderCssrs \} from '\.\/cssrs\.js'/);
  assert.match(registry, /cssrs: renderCssrs/);
});

test('FAIL-4: chips Programa|Estudio, sin icono footer de estudio', () => {
  const ws = readFileSync(join(root, '../../src/js/views/workspace.js'), 'utf8');
  assert.match(ws, /workspace-mode-chip/);
  assert.match(ws, />Programa</);
  assert.match(ws, />Estudio</);
  assert.match(ws, /data-sidebar-index-mode="programa"/);
  assert.doesNotMatch(ws, /data-sidebar-index-mode="chrono"/);
});

test('FAIL-4: Resumen sin nube; puntajes + riesgo vital', () => {
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  assert.doesNotMatch(view, /Nube de palabras/);
  assert.match(view, /estudio-resumen-scores/);
  assert.match(view, /tabbed: true/);
  assert.match(view, /vitalRiskOrbHtml/);
  assert.match(view, /estudio-summary__top/);
});

test('FAIL-4: Gestionado en problemas y riesgos', () => {
  assert.equal(statusLabelFor('problem', 'present'), 'Gestionado');
  assert.equal(statusLabelFor('risk', 'present'), 'Gestionado');
});

test('FAIL-4: contexto IA incluye ejes', () => {
  const ctx = readFileSync(join(root, '../../src/js/export-case-context.js'), 'utf8');
  assert.match(ctx, /formatCaseStudyForPrompt/);
  assert.match(ctx, /Estudio de caso \(ejes\)/);
});

test('Riesgo vital sube con C-SSRS alto y urgencia', () => {
  const low = computeVitalRisk({ sessions: [], caseStudy: { elements: [] } });
  const high = computeVitalRisk({
    sessions: [
      {
        number: 1,
        modules: [
          { module_type: 'cssrs', data: JSON.stringify({ answers: { q4: 'yes' }, triage: 'high' }) },
          { module_type: 'motivo_consulta', data: JSON.stringify({ urgencia: 'alta' }) },
        ],
      },
    ],
    caseStudy: {
      elements: [{ axis: 'risk', title: 'Vive solo', status: 'present', notes: 'psicofármacos' }],
    },
    marital: 'Soltero/a',
  });
  assert.ok(high.score > low.score);
  assert.equal(high.label, 'Alto');
});
