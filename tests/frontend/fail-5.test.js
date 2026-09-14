import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatCaseStudyForPrompt } from '../../src/js/export-case-context.js';
import {
  SUPPORT_NETWORK_KIND,
  SUPPORT_NETWORK_TITLE,
  normalizeCaseStudyData,
} from '../../src/js/case-study-model.js';
import { libraryItemsForAxis } from '../../src/js/case-study-catalog.js';
import { isSessionDone } from '../../src/js/db.js';

const root = dirname(fileURLToPath(import.meta.url));

test('FAIL-5: workspace-scores importa escapeHtml', () => {
  const src = readFileSync(join(root, '../../src/js/components/workspace-scores.js'), 'utf8');
  assert.match(src, /import \{[^}]*escapeHtml[^}]*\} from '\.\.\/utils\.js'/);
});

test('FAIL-5: Sesiones cuenta done=1, no status completada', () => {
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  assert.match(view, /isSessionDone\(s\)/);
  assert.doesNotMatch(view, /s\.status === 'completada'/);
  assert.equal(isSessionDone({ done: 1 }), true);
  assert.equal(isSessionDone({ done: 0, status: 'completada' }), false);
});

test('FAIL-5: sin eyebrow ESTUDIO DE CASO en leftSidebar', () => {
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  assert.doesNotMatch(view, /estudio-axis-nav__eyebrow/);
});

test('FAIL-5: chip Programa|Estudio alto 32px como collapse', () => {
  const css = readFileSync(join(root, '../../src/css/layout.css'), 'utf8');
  assert.match(css, /\.workspace-index-switch--chips\s*\{[^}]*height:\s*32px/s);
  assert.match(css, /\.workspace-mode-chip\s*\{[^}]*height:\s*32px/s);
  assert.match(css, /\.workspace-sidebar-toggle\s*\{[^}]*height:\s*32px/s);
});

test('FAIL-5: apertura de tratamiento fuerza Programa', () => {
  const ws = readFileSync(join(root, '../../src/js/views/workspace.js'), 'utf8');
  assert.match(ws, /!sameTreatment && isEstudioWorkspaceMode\(\)/);
  assert.match(ws, /dispatchProgramaWorkspace\(\)/);
});

test('FAIL-5: click eje hace scroll al elemento', () => {
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  assert.match(view, /scrollToElement/);
  assert.match(view, /focusElementId/);
  assert.match(view, /data-focus-element/);
});

test('FAIL-5: contexto IA incluye Estudio rico + riesgo vital', () => {
  const text = formatCaseStudyForPrompt(
    {
      elements: [
        {
          axis: 'problem',
          title: 'Ansiedad alta',
          status: 'present',
          notes: 'GAD-7 alto',
          indicators: [{ text: 'Preocupación diaria' }],
          objectives: [{ text: 'Bajar ansiedad' }],
        },
        {
          axis: 'resource',
          title: 'Autocuidado',
          status: 'developing',
        },
        {
          axis: 'defense',
          title: 'Humor',
          status: 'present',
        },
        {
          axis: 'risk',
          title: 'Vive solo',
          status: 'present',
        },
        {
          axis: 'resource',
          kind: SUPPORT_NETWORK_KIND,
          title: SUPPORT_NETWORK_TITLE,
          people: [{ name: 'Ana', relation: 'Madre', domain: 'Apoyo emocional' }],
        },
      ],
    },
    { vital: { label: 'Moderado', score: 0.59, reasons: ['C-SSRS moderate'] } },
  );
  assert.match(text, /Estudio de caso \(ejes\)/);
  assert.match(text, /Riesgo vital/);
  assert.match(text, /Ansiedad alta/);
  assert.match(text, /Preocupación diaria/);
  assert.match(text, /Autocuidado/);
  assert.match(text, /Humor/);
  assert.match(text, /Vive solo/);
  assert.match(text, /Red de apoyo/);
  assert.match(text, /Ana/);
  assert.doesNotMatch(text, /\(emocional\)/);
});

test('FAIL-5: una sola Red de apoyo; aliases migran', () => {
  const study = normalizeCaseStudyData({
    elements: [
      {
        axis: 'resource',
        title: 'Red de apoyo (emocional)',
        kind: SUPPORT_NETWORK_KIND,
        people: [{ name: 'Ana' }],
      },
      { axis: 'resource', title: 'Red de apoyo emocional', people: [{ name: 'Luis' }] },
      { axis: 'resource', title: 'Autocuidado' },
    ],
  });
  const networks = study.elements.filter((el) => el.kind === SUPPORT_NETWORK_KIND);
  assert.equal(networks.length, 1);
  assert.equal(networks[0].title, 'Red de apoyo');
  assert.ok(networks[0].people.some((p) => p.name === 'Ana'));
  assert.ok(networks[0].people.some((p) => p.name === 'Luis'));
  assert.equal(SUPPORT_NETWORK_TITLE, 'Red de apoyo');
  assert.ok(!libraryItemsForAxis('resource').some((item) => /emocional/i.test(item.title)));
});

test('FAIL-5: custom element queda plantilla reutilizable', async () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  const { saveProfile } = await import('../../src/js/profile.js');
  const {
    addCustomCaseStudyElement,
    listCustomCaseStudyElements,
  } = await import('../../src/js/case-study-custom-library.js');
  const { libraryItemsForAxis: libForAxis } = await import('../../src/js/case-study-catalog.js');
  saveProfile({ customCaseStudyElements: [] });
  const added = addCustomCaseStudyElement({ axis: 'risk', title: 'Riesgo custom FAIL-5' });
  assert.ok(added?.id);
  assert.equal(listCustomCaseStudyElements('risk').length, 1);
  assert.ok(libForAxis('risk').some((item) => item.title === 'Riesgo custom FAIL-5'));
  const again = addCustomCaseStudyElement({ axis: 'risk', title: 'Riesgo custom FAIL-5' });
  assert.equal(again?.existed, true);
  assert.equal(listCustomCaseStudyElements('risk').length, 1);
});

test('FAIL-5: C-SSRS CSS sin cajas dual feas; regla válida', () => {
  const css = readFileSync(join(root, '../../src/css/modules.css'), 'utf8');
  assert.match(css, /\.cssrs-module \.likert-row\.cssrs-row\s*\{[^}]*border-left:\s*3px solid/s);
  assert.doesNotMatch(css, /\.cssrs-tf--lifetime\s*\{[^}]*background:\s*#fde8c8/s);
  assert.doesNotMatch(css, /\.cssrs-tf--recent\s*\{[^}]*background:\s*#f8d7da/s);
  assert.doesNotMatch(css, /\{\s*[^}]*border-bottom:\s*0;\s*\}\s*gap:/s);
});
