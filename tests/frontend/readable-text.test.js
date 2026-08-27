import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReadableText } from '../../src/js/readable-text.js';
import { buildPsychometricSummaryBlock } from '../../src/js/psychometric-summary.js';

test('escalas subjetivas se leen en 1–100, no como value/10', () => {
  const ansiedad = buildReadableText('escala_ansiedad', { anxiety_score: 70 });
  const animo = buildReadableText('escala_animo', { mood_score: 20 });
  assert.match(ansiedad, /70\/100/);
  assert.match(animo, /20\/100/);
  assert.doesNotMatch(animo, /\/10\b/);
  assert.doesNotMatch(ansiedad, /\/10\b/);
});

test('estimulación bilateral incluye SUD pre y post 0–10', () => {
  const text = buildReadableText('bilateral_stimulation', {
    speed_hz: 1,
    sud_pre: 8,
    sud_post: 3,
  });
  assert.match(text, /SUD pre: 8\/10/);
  assert.match(text, /SUD post: 3\/10/);
});

test('el resumen psicométrico incluye ánimo y ansiedad subjetivos', () => {
  const block = buildPsychometricSummaryBlock([
    {
      number: 1,
      modules: [
        { module_type: 'escala_ansiedad', data: JSON.stringify({ anxiety_score: 70 }) },
        { module_type: 'escala_animo', data: JSON.stringify({ mood_score: 20 }) },
      ],
    },
  ]);
  assert.match(block, /Ansiedad subjetiva \(sesión 1\): 70\/100/);
  assert.match(block, /Ánimo subjetivo \(sesión 1\): 20\/100/);
});
