import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanSessionLabel, parseAiActions } from '../../src/js/ai-actions.js';
import { birthParts, isoFromParts } from '../../src/js/modules/registro-inicial.js';

test('birthParts quita el cero a la izquierda para casar con el select', () => {
  assert.deepEqual(birthParts('1992-03-05'), { year: '1992', month: '3', day: '5' });
  assert.deepEqual(birthParts('2000-12-31'), { year: '2000', month: '12', day: '31' });
  assert.deepEqual(birthParts(''), { year: '', month: '', day: '' });
});

test('isoFromParts vuelve a guardar con cero a la izquierda', () => {
  assert.equal(isoFromParts('1992', '3', '5'), '1992-03-05');
  assert.equal(isoFromParts('1992', '', '5'), '');
});

test('roundtrip fecha de nacimiento no se pierde', () => {
  const saved = isoFromParts('1988', '7', '9');
  const parts = birthParts(saved);
  assert.equal(isoFromParts(parts.year, parts.month, parts.day), '1988-07-09');
});

test('cleanSessionLabel evita «Sesión N» duplicado en el título', () => {
  assert.equal(cleanSessionLabel('Sesión 2: Regulación emocional e ira', 1), 'Regulación emocional e ira');
  assert.equal(cleanSessionLabel('Sesión 8: Evaluación final', 7), 'Evaluación final');
  assert.equal(cleanSessionLabel('Evaluación', 0), 'Evaluación');
  assert.equal(cleanSessionLabel('', 2), 'Sesión 3');
});

test('parseAiActions limpia heading JSON y backticks sueltos', () => {
  const raw = [
    '8. Sesión 8: Evaluación final',
    'Mantener `GAD-7` , ` ` `PHQ-9` y `PCL-5`.',
    'Programa ajustado (JSON):',
    '```telar-plan',
    '{"label":"Plan","sessions":[{"label":"Sesión 1: Ingreso","modules":["gad7"]}]}',
    '```',
  ].join('\n');
  const { text, actions } = parseAiActions(raw);
  assert.doesNotMatch(text, /Programa ajustado/i);
  assert.doesNotMatch(text, /`/);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].plan.sessions[0].label, 'Ingreso');
});
