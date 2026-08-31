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

test('anamnesis incluye salud física y relación con la IA', () => {
  const text = buildReadableText('motivo_consulta', {
    motivo: 'Ansiedad',
    salud_fisica: 'Hipotiroidismo en control',
    relacion_ia: 'Usa ChatGPT todas las noches para dormir',
  });
  assert.match(text, /Salud física \/ factores orgánicos: Hipotiroidismo/);
  assert.match(text, /Relación con la IA: Usa ChatGPT/);
});

test('anamnesis junta las respuestas viejas de IA si no hay campo único', () => {
  const text = buildReadableText('motivo_consulta', {
    ia_pregunto: 'Cómo dormir',
    ia_compartio: 'Insomnio',
  });
  assert.match(text, /Relación con la IA: ¿Qué preguntaste\? Cómo dormir/);
  assert.match(text, /¿Qué compartiste\? Insomnio/);
});

test('el género del registro se lee con la etiqueta, no el id', () => {
  const text = buildReadableText('registro_inicial', { genero: 'no_identifica' });
  assert.match(text, /Género: No se identifica con ninguno/);
});

test('nota de sesión se lee como el texto de la nota', () => {
  const text = buildReadableText('nota_sesion', { nota: 'Hoy trabajamos evitación.' });
  assert.match(text, /Hoy trabajamos evitación/);
  assert.equal(buildReadableText('nota_sesion', { nota: '  ' }), '');
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
