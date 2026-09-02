import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyAnswers,
  optionsForItem,
  questionnaireMax,
  questionnaireReadable,
  scoreQuestionnaire,
  validateQuestionnaire,
} from '../../src/lib/questionnaire-schema.js';

const LIKERT_0_3 = [
  { v: 0, label: 'Para nada' },
  { v: 1, label: 'Varios días' },
  { v: 2, label: 'Más de la mitad' },
  { v: 3, label: 'Casi todos los días' },
];

function sumDef() {
  return {
    schema: 1,
    id: 'demo-sum',
    title: 'Escala de suma',
    items: ['a', 'b', 'c'],
    options: LIKERT_0_3,
    scoring: {
      kind: 'sum',
      bands: [
        { max: 3, label: 'Bajo' },
        { max: 9, label: 'Alto' },
      ],
      cutoff: { value: 5, label: 'sobre el umbral' },
    },
  };
}

test('suma respuestas, calcula banda y punto de corte', () => {
  const s = scoreQuestionnaire(sumDef(), [3, 2, 1]);
  assert.equal(s.total, 6);
  assert.equal(s.max, 9);
  assert.equal(s.label, 'Alto');
  assert.equal(s.aboveCutoff, true);
  assert.equal(s.complete, true);
});

test('ignora ítems sin responder pero avisa que está incompleto', () => {
  const s = scoreQuestionnaire(sumDef(), [1, null, '']);
  assert.equal(s.total, 1);
  assert.equal(s.answered, 1);
  assert.equal(s.complete, false);
  assert.equal(s.aboveCutoff, false);
  assert.match(questionnaireReadable(sumDef(), { answers: [1, null, ''] }), /1\/3 ítems/);
});

test('sin ninguna respuesta no hay puntaje', () => {
  assert.equal(scoreQuestionnaire(sumDef(), emptyAnswers(sumDef())), null);
});

test('invierte los ítems marcados como reverse', () => {
  const def = {
    schema: 1,
    id: 'rev',
    title: 'Con inversos',
    items: [{ text: 'positivo' }, { text: 'negativo', reverse: true }],
    options: [
      { v: 1, label: 'no' },
      { v: 4, label: 'sí' },
    ],
    scoring: { kind: 'sum', reverseMax: 5, bands: [{ max: 8, label: '' }] },
  };
  // El inverso 4 pasa a valer 1: total 4 + 1.
  assert.equal(scoreQuestionnaire(def, [4, 4]).total, 5);
});

test('cuenta ítems positivos por umbral en cada dirección', () => {
  const def = {
    schema: 1,
    id: 'aq',
    title: 'Umbrales',
    items: ['acuerdo puntúa', 'desacuerdo puntúa'],
    options: [
      { v: 0, label: 'muy de acuerdo' },
      { v: 1, label: 'algo de acuerdo' },
      { v: 2, label: 'algo en desacuerdo' },
      { v: 3, label: 'muy en desacuerdo' },
    ],
    scoring: {
      kind: 'count-threshold',
      itemThresholds: [{ lte: 1 }, { gte: 2 }],
      bands: [{ max: 2, label: '' }],
      cutoff: { value: 2, label: 'derivar' },
    },
  };
  assert.equal(scoreQuestionnaire(def, [0, 3]).positives, 2);
  assert.equal(scoreQuestionnaire(def, [3, 0]).positives, 0);
  assert.equal(scoreQuestionnaire(def, [1, 1]).positives, 1);
});

test('promedia en las escalas de media y resuelve el techo del deslizador', () => {
  const def = {
    schema: 1,
    id: 'slider',
    title: 'Deslizadores',
    items: [
      { text: 'uno', kind: 'slider', min: 0, max: 10 },
      { text: 'dos', kind: 'slider', min: 0, max: 10 },
    ],
    options: [],
    scoring: { kind: 'mean', bands: [{ max: 10, label: '' }] },
  };
  assert.equal(questionnaireMax(def), 10);
  assert.equal(optionsForItem(def, 0).length, 0);
  assert.equal(scoreQuestionnaire(def, [8, 4]).total, 6);
});

test('puntúa subescalas y marca los ítems de riesgo', () => {
  const def = {
    schema: 1,
    id: 'subs',
    title: 'Con subescalas',
    items: ['a', 'b', 'c', 'riesgo'],
    options: LIKERT_0_3,
    scoring: {
      kind: 'sum',
      bands: [{ max: 12, label: '' }],
      subscales: [
        { id: 'x', label: 'Primera', items: [0, 1] },
        { id: 'y', label: 'Segunda', items: [2, 3] },
      ],
    },
    riskItems: [{ index: 3, gte: 1, message: 'Ideación de daño' }],
  };
  const s = scoreQuestionnaire(def, [1, 2, 3, 2]);
  assert.deepEqual(
    s.subscales.map((x) => [x.id, x.total, x.max]),
    [
      ['x', 3, 6],
      ['y', 5, 6],
    ],
  );
  assert.equal(s.riskFlags.length, 1);
  assert.match(questionnaireReadable(def, { answers: [0, 0, 0, 2] }), /ALERTA ítem 4/);
});

test('valida definiciones antes de guardarlas', () => {
  assert.equal(validateQuestionnaire(sumDef()).ok, true);

  const noItems = { ...sumDef(), items: [] };
  assert.match(validateQuestionnaire(noItems).errors.join(' '), /items/);

  const badSchema = { ...sumDef(), schema: 2 };
  assert.match(validateQuestionnaire(badSchema).errors.join(' '), /schema debe ser 1/);

  const missingReverseMax = {
    ...sumDef(),
    items: [{ text: 'a', reverse: true }],
    scoring: { kind: 'sum', bands: [] },
  };
  assert.match(validateQuestionnaire(missingReverseMax).errors.join(' '), /reverseMax/);

  const badThresholds = {
    ...sumDef(),
    scoring: { kind: 'count-threshold', itemThresholds: [1], bands: [] },
  };
  assert.match(validateQuestionnaire(badThresholds).errors.join(' '), /itemThresholds/);

  const badSubscale = {
    ...sumDef(),
    scoring: { ...sumDef().scoring, subscales: [{ id: 'z', items: [99] }] },
  };
  assert.match(validateQuestionnaire(badSubscale).errors.join(' '), /inexistente/);
});
