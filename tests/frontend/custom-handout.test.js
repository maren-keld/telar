import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customModuleHandoutPayload,
  customModuleTypeId,
  questionnaireToHandoutPayload,
  resetCustomModulesCache,
  saveCustomModule,
} from '../../src/js/custom-modules.js';
import { pdfOptionMark, pdfSafeText } from '../../src/js/pdf-utils.js';

test.afterEach(() => {
  resetCustomModulesCache();
});

function aqDef() {
  return {
    schema: 1,
    id: 'aq10',
    title: 'AQ-10 — Cociente de espectro autista',
    subtitle: '10 ítems',
    instructions: 'Marca la opción que mejor te describa.',
    items: [
      { text: 'A menudo noto sonidos pequeños.' },
      { text: 'Me concentro más en el cuadro general.' },
    ],
    options: [
      { v: 0, label: 'Muy de acuerdo' },
      { v: 1, label: 'Un poco de acuerdo' },
      { v: 2, label: 'Un poco en desacuerdo' },
      { v: 3, label: 'Muy en desacuerdo' },
    ],
    scoring: { kind: 'sum', max: 6, bands: [{ max: 6, label: 'Total' }] },
    attribution: { authors: 'Allison et al.', year: 2012, license: 'Uso clínico' },
  };
}

test('un cuestionario de pack se imprime con casillas, no vacío', () => {
  const payload = questionnaireToHandoutPayload(aqDef(), { answers: [] });
  assert.equal(payload.def.sections.length, 2);
  assert.equal(payload.def.sections[0].type, 'radio');
  assert.equal(payload.def.sections[0].options.length, 4);
  assert.equal(payload.data.q0, undefined);
  assert.match(payload.def.intro, /Marca la opción/);
});

test('si ya hay respuestas, el PDF lleva la etiqueta elegida', () => {
  const payload = questionnaireToHandoutPayload(aqDef(), { answers: [3, 0] });
  assert.equal(payload.data.q0, 'Muy en desacuerdo');
  assert.equal(payload.data.q1, 'Muy de acuerdo');
});

test('customModuleHandoutPayload usa el def aunque la copia vieja no tenga questions', async () => {
  try {
    await saveCustomModule({
      id: 'autismo-danyau--aq10',
      kind: 'questionnaire',
      title: 'AQ-10',
      def: aqDef(),
    });
  } catch {
    /* persist necesita Tauri; la caché ya quedó */
  }
  const payload = customModuleHandoutPayload(customModuleTypeId('autismo-danyau--aq10'), {
    answers: [1],
  });
  assert.ok(payload);
  assert.equal(payload.def.sections.length, 2);
  assert.equal(payload.data.q0, 'Un poco de acuerdo');
});

test('pdfSafeText no borra casillas: ☐ queda como [ ] ASCII', () => {
  assert.equal(pdfSafeText('☐  Muy de acuerdo'), '[ ]  Muy de acuerdo');
  assert.equal(pdfSafeText('☑ hecho'), '[x] hecho');
  assert.equal(pdfOptionMark(false), '[ ]');
  assert.equal(pdfOptionMark(true), '[x]');
  assert.match(`${pdfOptionMark(false)}  Muy de acuerdo`, /^\[ \]  Muy de acuerdo$/);
});
