import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomModuleRecord,
  canSwitchModuleKind,
  collectQuestionsFrom,
  normalizeAudience,
  normalizeEditorCategory,
  normalizeEditorWhere,
  parseAiModuleReply,
  shareCompletedByLinkLabel,
} from '../../src/js/module-editor-model.js';

test('el badge del enlace dice completado, no respondido', () => {
  assert.equal(shareCompletedByLinkLabel(), 'Completado por el enlace');
});

test('categoría, edad y cajón tienen defaults sanos', () => {
  assert.equal(normalizeEditorCategory('significado'), 'significado');
  assert.equal(normalizeEditorCategory('custom'), 'tcc');
  assert.equal(normalizeAudience('ninos'), 'ninos');
  assert.equal(normalizeAudience(''), 'todas');
  assert.equal(normalizeEditorWhere('en_sesion'), 'en_sesion');
  assert.equal(normalizeEditorWhere(''), 'entre_sesiones');
});

test('el payload guarda descripción, autor y PDF', () => {
  const record = buildCustomModuleRecord({
    id: 'm1',
    kind: 'simple',
    title: 'Respiración',
    description: 'Cuatro pasos de Huberman',
    author: 'Felipe',
    category: 'intervencion',
    audience: 'adultos',
    where: 'en_sesion',
    questions: [{ id: 'q1', text: '¿Cómo te sentiste?', type: 'text', options: [] }],
    pdfName: 'guia.pdf',
    pdfPath: '/tmp/guia.pdf',
  });
  assert.equal(record.description, 'Cuatro pasos de Huberman');
  assert.equal(record.author, 'Felipe');
  assert.equal(record.category, 'intervencion');
  assert.equal(record.audience, 'adultos');
  assert.equal(record.where, 'en_sesion');
  assert.equal(record.pdfName, 'guia.pdf');
  assert.equal(record.kind, 'simple');
});

test('una experiencia interactiva no arrastra preguntas', () => {
  const record = buildCustomModuleRecord({
    existing: { questions: [{ id: 'q1', text: 'x', type: 'text' }] },
    id: 'm2',
    kind: 'interactive',
    title: 'Tarjeta',
    html: '<div>hola</div>',
  });
  assert.equal(record.kind, 'interactive');
  assert.equal(record.html, '<div>hola</div>');
  assert.equal(record.questions, undefined);
});

test('si ya se habló no se puede cambiar el tipo', () => {
  assert.equal(canSwitchModuleKind('questionnaire', { interactiveChatLocked: true }), false);
  assert.equal(canSwitchModuleKind('interactive', { interactiveChatLocked: true }), true);
  assert.equal(canSwitchModuleKind('questionnaire', { interactiveChatLocked: false }), true);
  assert.equal(
    canSwitchModuleKind('interactive', { kindLocked: true, currentKind: 'questionnaire' }),
    false,
  );
  assert.equal(
    canSwitchModuleKind('questionnaire', { kindLocked: true, currentKind: 'questionnaire' }),
    true,
  );
});

test('la IA puede devolver cuestionario o HTML', () => {
  const q = parseAiModuleReply('Listo.\n```json\n{"questions":[{"text":"¿Cómo estás?","type":"text"}]}\n```');
  assert.equal(q.kind, 'questionnaire');
  assert.equal(q.questions[0].text, '¿Cómo estás?');
  const html = parseAiModuleReply('```html\n<div class="card"><button>Ok</button></div>\n```');
  assert.equal(html.kind, 'interactive');
  assert.match(html.html, /button/);
});

test('con tipo cuestionario no se acepta HTML', () => {
  const parsed = parseAiModuleReply('```html\n<div>sí</div>\n```', { preferQuestionnaire: true });
  assert.equal(parsed, null);
});

test('con chat interactivo bloqueado se ignora el JSON y se usa el HTML', () => {
  const parsed = parseAiModuleReply(
    '```json\n{"questions":[{"text":"No"}]}\n```\n```html\n<div>sí</div>\n```',
    { preferInteractive: true },
  );
  assert.equal(parsed.kind, 'interactive');
  assert.match(parsed.html, /sí/);
});

test('opción única entra como radio', () => {
  const parsed = parseAiModuleReply(
    '```json\n{"questions":[{"text":"Elige una","type":"radio","options":["A","B"]}]}\n```',
  );
  assert.equal(parsed.kind, 'questionnaire');
  assert.equal(parsed.questions[0].type, 'radio');
  assert.deepEqual(parsed.questions[0].options, ['A', 'B']);
});

test('collectQuestionsFrom ignora ítems vacíos y lee radio', () => {
  const root = {
    querySelectorAll(sel) {
      if (sel !== '.cm-question') return [];
      return [
        {
          dataset: { qid: 'q1' },
          querySelector(field) {
            if (field === '[data-field="text"]') return { value: '  ' };
            if (field === '[data-field="type"]') return { value: 'text' };
            return null;
          },
          querySelectorAll() {
            return [];
          },
        },
        {
          dataset: { qid: 'q2' },
          querySelector(field) {
            if (field === '[data-field="text"]') return { value: 'Ánimo' };
            if (field === '[data-field="type"]') return { value: 'scale' };
            return null;
          },
          querySelectorAll() {
            return [];
          },
        },
        {
          dataset: { qid: 'q3' },
          querySelector(field) {
            if (field === '[data-field="text"]') return { value: 'Elige' };
            if (field === '[data-field="type"]') return { value: 'radio' };
            return null;
          },
          querySelectorAll(sel) {
            if (sel !== '[data-option]') return [];
            return [{ value: 'A' }, { value: 'B' }];
          },
        },
      ];
    },
  };
  assert.deepEqual(collectQuestionsFrom(root), [
    { id: 'q2', text: 'Ánimo', type: 'scale', options: [] },
    { id: 'q3', text: 'Elige', type: 'radio', options: ['A', 'B'] },
  ]);
});
