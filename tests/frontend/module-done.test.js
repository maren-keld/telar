import assert from 'node:assert/strict';
import test from 'node:test';

import {
  doneToastMessage,
  isContentComplete,
  isModuleDone,
  toggleDoneOverride,
} from '../../src/js/module-done.js';

test('el status completado del autosave no marca hecho', () => {
  const data = { status: 'completado' };
  assert.equal(isModuleDone('gad7', { ...data, answers: [1, null, null, null, null, null, null] }), false);
  assert.equal(isContentComplete('gad7', { answers: [1] }), false);
});

test('hecho por respuesta del enlace', () => {
  assert.equal(isModuleDone('gad7', { share_answered_at: '2026-09-05T12:00:00.000Z' }), true);
  assert.equal(isContentComplete('gad7', { share_answered_at: '2026-09-05T12:00:00.000Z' }), false);
});

test('hecho por escala completa (GAD-7 7 ítems, ASRS 6)', () => {
  assert.equal(isContentComplete('gad7', { answers: [0, 1, 2, 3, 1, 0, 2] }), true);
  assert.equal(isModuleDone('gad7', { answers: [0, 1, 2, 3, 1, 0, 2] }), true);
  assert.equal(isContentComplete('gad7', { answers: [0, 1, 2, 3, 1, 0] }), false);
  assert.equal(isContentComplete('asrs', { answers: [0, 1, 2, 3, 1, 0] }), true);
  assert.equal(isContentComplete('asrs', { answers: [0, 1, 2, 3, 1] }), false);
});

test('hecho por handout: secciones y quiz', () => {
  assert.equal(
    isContentComplete('tcc_abc', {
      activador: 'Reunión',
      creencias: 'No sé',
      consecuencias: 'Me callé',
    }),
    true,
  );
  assert.equal(isContentComplete('tcc_abc', { activador: 'Reunión' }), false);
});

test('hecho por nota, subjetiva, NF y BLS', () => {
  assert.equal(isContentComplete('nota_sesion', { nota: 'Hablamos del fin de semana' }), true);
  assert.equal(isContentComplete('nota_sesion', { nota: '  ' }), false);
  assert.equal(isContentComplete('escala_animo', { mood_score: 40 }), true);
  assert.equal(isContentComplete('escala_ansiedad', { anxiety_score: 10 }), true);
  assert.equal(isContentComplete('neurofeedback', { last_results: { alpha: 1 } }), true);
  assert.equal(isContentComplete('neurofeedback', {}), false);
  assert.equal(isContentComplete('bilateral_stimulation', { notes: 'SUD bajó' }), true);
  assert.equal(isContentComplete('bilateral_stimulation', { elapsed_sec: 12 }), true);
  assert.equal(isContentComplete('bilateral_stimulation', { sud_pre: 7 }), true);
  assert.equal(isContentComplete('bilateral_stimulation', { speed_hz: 1 }), false);
});

test('el override manual gana sobre el contenido', () => {
  const full = { answers: [0, 1, 2, 3, 1, 0, 2] };
  assert.equal(isModuleDone('gad7', { ...full, done_override: false }), false);
  assert.equal(isModuleDone('gad7', { answers: [], done_override: true }), true);
});

test('toggle pone override en el sentido contrario', () => {
  assert.deepEqual(toggleDoneOverride('gad7', {}), { done_override: true });
  assert.deepEqual(toggleDoneOverride('gad7', { answers: [0, 1, 2, 3, 1, 0, 2] }), {
    done_override: false,
  });
  assert.deepEqual(toggleDoneOverride('gad7', { done_override: true }), { done_override: false });
});

test('selector_modulo no tiene estado de hecho', () => {
  assert.equal(isModuleDone('selector_modulo', { done_override: true }), false);
  assert.equal(isContentComplete('selector_modulo', { nota: 'x' }), false);
});

test('toasts de marcado', () => {
  assert.equal(doneToastMessage('GAD-7', true), '«GAD-7 marcado como completado»');
  assert.equal(doneToastMessage('GAD-7', false), '«GAD-7 quedó pendiente»');
});

test('experiencia interactiva queda hecha con resumen, payload o completed_at', () => {
  assert.equal(isContentComplete('custom_colores', { completed_at: '2026-09-06T16:00:00.000Z' }), true);
  assert.equal(isModuleDone('custom_colores', { summary: 'Eligió azul' }), true);
  assert.equal(isContentComplete('custom_colores', { payload: { color: 'azul' } }), true);
  assert.equal(isContentComplete('custom_colores', {}), false);
});
