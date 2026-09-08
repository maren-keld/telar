import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPatientHomeworkForPrompt } from '../../src/js/export-case-context.js';

const pendingShare = {
  token: 'RdaxQNLLpP_QNZyeEvmTZLtXuEUEAQN0',
  key: '9rEZzBdliEnYkPeZH-yzICRBIuehq8nUIm9B_Vt4aNA',
};

test('el contexto de email lista enlaces pendientes y no inventa URLs', () => {
  const text = formatPatientHomeworkForPrompt([
    {
      id: 1,
      number: 1,
      modules: [{ id: 10, module_type: 'registro_inicial', data: '{}' }],
    },
    {
      id: 2,
      number: 2,
      modules: [
        { id: 21, module_type: 'gad7', data: JSON.stringify({ share: pendingShare }) },
        { id: 22, module_type: 'tcc_activacion', data: '{}' },
        { id: 23, module_type: 'selector_modulo', data: '{}' },
      ],
    },
    {
      id: 3,
      number: 3,
      modules: [{ id: 31, module_type: 'tcc_experimento', data: '{}' }],
    },
  ]);

  assert.match(text, /Enlaces y tareas para el paciente/);
  assert.match(text, /gad7/);
  assert.match(text, /https:\/\/telarapp\.cl\/r\/RdaxQNLLpP_QNZyeEvmTZLtXuEUEAQN0#9rEZzBdliEnYkPeZH-yzICRBIuehq8nUIm9B_Vt4aNA/);
  assert.match(text, /tcc_activacion/);
  assert.match(text, /sin enlace aún/);
  assert.doesNotMatch(text, /tcc_experimento/);
  assert.doesNotMatch(text, /registro_inicial/);
});

test('si no hay enlaces, solo mira la última sesión', () => {
  const text = formatPatientHomeworkForPrompt([
    {
      id: 1,
      number: 1,
      modules: [{ id: 10, module_type: 'gad7', data: '{}' }],
    },
    {
      id: 2,
      number: 2,
      modules: [{ id: 20, module_type: 'tcc_preocupaciones', data: '{}' }],
    },
  ]);

  assert.match(text, /tcc_preocupaciones/);
  assert.match(text, /sin enlace aún/);
  assert.doesNotMatch(text, /gad7/);
});

test('omite módulos ya respondidos por el enlace', () => {
  const text = formatPatientHomeworkForPrompt([
    {
      id: 2,
      number: 2,
      modules: [
        {
          id: 21,
          module_type: 'gad7',
          data: JSON.stringify({ share_answered_at: '2026-09-05T12:00:00.000Z' }),
        },
      ],
    },
  ]);
  assert.equal(text, '');
});
