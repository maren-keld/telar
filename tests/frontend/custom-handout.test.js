import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customModuleHandoutPayload,
  customModuleTypeId,
  questionnaireToHandoutPayload,
  resetCustomModulesCache,
  resolveQuestionnaireDef,
  saveCustomModule,
} from '../../src/js/custom-modules.js';
import { renderHandoutPdf } from '../../src/js/export-handout-pdf.js';
import { pdfOptionMark, pdfSafeText } from '../../src/js/pdf-utils.js';

test.afterEach(() => {
  resetCustomModulesCache();
});

function aqDef(overrides = {}) {
  return {
    schema: 1,
    id: 'aq10',
    title: 'AQ-10 - Cociente de espectro autista (10 ítems)',
    subtitle: '10 ítems · tamizaje · adultos desde 16 años.',
    instructions: 'Marca la opción que mejor te describa.',
    items: [
      { text: 'A menudo noto sonidos pequeños que otras personas no notan.' },
      { text: 'Me concentro más en el cuadro general.' },
    ],
    options: [
      { v: 0, label: 'Muy de acuerdo' },
      { v: 1, label: 'Un poco de acuerdo' },
      { v: 2, label: 'Un poco en desacuerdo' },
      { v: 3, label: 'Muy en desacuerdo' },
    ],
    scoring: { kind: 'sum', max: 6, bands: [{ max: 6, label: 'Total' }] },
    attribution: {
      authors: 'Allison, C., Auyeung, B., & Baron-Cohen, S.',
      year: 2012,
      source: 'Autism Research Centre, Universidad de Cambridge.',
      license: 'Uso clínico e investigación sin costo; el uso comercial requiere licencia.',
    },
    ...overrides,
  };
}

async function saveAq(mod) {
  try {
    await saveCustomModule(mod);
  } catch {
    /* persist necesita Tauri; la caché ya quedó */
  }
}

function collectPdfText(def, data = {}) {
  const lines = [];
  const doc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFont() {},
    setFontSize() {},
    setTextColor() {},
    setDrawColor() {},
    setLineWidth() {},
    setFillColor() {},
    rect() {},
    line() {},
    circle() {},
    getTextWidth: (t) => String(t).length * 2,
    splitTextToSize: (t) => [String(t)],
    text(text) {
      if (Array.isArray(text)) lines.push(...text.map(String));
      else lines.push(String(text));
    },
    addPage() {},
  };
  renderHandoutPdf(doc, { def, data, patientName: '' });
  return lines.join('\n');
}

test('un cuestionario de pack se imprime con casillas, no vacío', () => {
  const payload = questionnaireToHandoutPayload(aqDef(), { answers: [] });
  assert.equal(payload.def.sections.length, 2);
  assert.equal(payload.def.sections[0].type, 'radio');
  assert.equal(payload.def.sections[0].options.length, 4);
  assert.equal(payload.data.q0, undefined);
  assert.match(payload.def.intro, /Marca la opción/);
  assert.match(payload.def.intro, /Autism Research Centre/);
});

test('si ya hay respuestas, el PDF lleva la etiqueta elegida', () => {
  const payload = questionnaireToHandoutPayload(aqDef(), { answers: [3, 0] });
  assert.equal(payload.data.q0, 'Muy en desacuerdo');
  assert.equal(payload.data.q1, 'Muy de acuerdo');
});

test('customModuleHandoutPayload usa el def aunque la copia vieja no tenga questions', async () => {
  await saveAq({
    id: 'autismo-danyau--aq10',
    kind: 'questionnaire',
    title: 'AQ-10',
    def: aqDef(),
  });
  const payload = customModuleHandoutPayload(customModuleTypeId('autismo-danyau--aq10'), {
    answers: [1],
  });
  assert.ok(payload);
  assert.equal(payload.def.sections.length, 2);
  assert.equal(payload.data.q0, 'Un poco de acuerdo');
});

test('QA humano: blank AQ-10 no imprime «Sin contenido registrado»', async () => {
  const def = aqDef();
  await saveAq({
    id: 'autismo-danyau--aq10-blank',
    kind: 'questionnaire',
    title: def.title,
    def,
    defs: { es: def },
  });
  const payload = customModuleHandoutPayload(customModuleTypeId('autismo-danyau--aq10-blank'), {
    answers: [],
  });
  assert.ok(payload?.def?.sections?.length, 'debe serializar ítems del schema');
  const text = collectPdfText(payload.def, payload.data);
  assert.doesNotMatch(text, /Sin contenido registrado/);
  assert.match(text, /A menudo noto sonidos/);
  assert.match(text, /\[ \]  Muy de acuerdo/);
  assert.match(text, /\[ \]  Muy en desacuerdo/);
});

test('si def es el wrapper del pack, aún se leen items desde defs', async () => {
  const inner = aqDef();
  const wrapper = { id: 'aq10', kind: 'questionnaire', label: inner.title, defs: { es: inner } };
  await saveAq({
    id: 'autismo-danyau--aq10-wrap',
    kind: 'questionnaire',
    title: inner.title,
    def: wrapper,
    defs: { es: inner },
  });
  assert.equal(resolveQuestionnaireDef({ def: wrapper, defs: { es: inner } })?.items?.length, 2);
  const payload = customModuleHandoutPayload(customModuleTypeId('autismo-danyau--aq10-wrap'), {
    answers: [],
  });
  assert.equal(payload.def.sections.length, 2);
  assert.equal(payload.def.sections[0].options.length, 4);
  const text = collectPdfText(payload.def, payload.data);
  assert.doesNotMatch(text, /Sin contenido registrado/);
});

test('defs solo bajo es-CL (sin es/en) también alimentan el handout', async () => {
  const inner = aqDef();
  await saveAq({
    id: 'autismo-danyau--aq10-escl',
    kind: 'questionnaire',
    title: inner.title,
    defs: { 'es-CL': inner },
  });
  const payload = customModuleHandoutPayload(customModuleTypeId('autismo-danyau--aq10-escl'), {
    answers: [],
  });
  assert.equal(payload.def.sections.length, 2);
});

test('pdfSafeText no borra casillas: ☐ queda como [ ] ASCII', () => {
  assert.equal(pdfSafeText('☐  Muy de acuerdo'), '[ ]  Muy de acuerdo');
  assert.equal(pdfSafeText('☑ hecho'), '[x] hecho');
  assert.equal(pdfOptionMark(false), '[ ]');
  assert.equal(pdfOptionMark(true), '[x]');
  assert.match(`${pdfOptionMark(false)}  Muy de acuerdo`, /^\[ \]  Muy de acuerdo$/);
});
