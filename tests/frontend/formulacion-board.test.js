import assert from 'node:assert/strict';
import test from 'node:test';

import {
  legacyProblemsFromFormulation,
  normalizeFormulationData,
} from '../../src/js/modules/diagnostico.js';
import { buildReadableText } from '../../src/js/readable-text.js';

test('migra problemas y checks de perfil al tablero de formulación', () => {
  const formulation = normalizeFormulationData(
    {
      custom_diagnosis: 'TDAH en adultez',
      structured: { hipotesis: 'Desregulación atencional con ansiedad secundaria' },
      problems: [
        {
          name: 'Déficit atencional y organización',
          assigned: true,
          indicators: [{ text: 'Olvida tareas', checked: false }],
          objectives: [{ text: 'Organizar la semana', checked: false }],
        },
      ],
    },
    {
      resource: [{ axis: 'resource', title: 'Red de apoyo familiar', status: 'active' }],
      defense: [{ axis: 'defense', title: 'Humor', status: 'active' }],
      risk: [{ axis: 'risk', title: 'Aislamiento social', status: 'active' }],
    },
  );

  assert.equal(formulation.nominalDiagnosis, 'TDAH en adultez');
  assert.equal(formulation.structured.hipotesis, 'Desregulación atencional con ansiedad secundaria');
  assert.deepEqual(
    formulation.elements.map((element) => element.axis),
    ['problem', 'resource', 'defense', 'risk'],
  );
  assert.equal(formulation.elements[0].title, 'Déficit atencional y organización');
});

test('puede volver de formulación a problemas legacy', () => {
  const problems = legacyProblemsFromFormulation({
    elements: [
      {
        axis: 'problem',
        title: 'Absentismo escolar',
        indicators: [{ text: 'Asiste 3/5 días', checked: true }],
        objectives: [{ text: 'Retomar asistencia', checked: false }],
      },
      { axis: 'resource', title: 'Tía significativa', indicators: [], objectives: [] },
    ],
  });

  assert.deepEqual(problems, [
    {
      name: 'Absentismo escolar',
      assigned: true,
      indicators: [{ text: 'Asiste 3/5 días', checked: true }],
      objectives: [{ text: 'Retomar asistencia', checked: false }],
    },
  ]);
});

test('el texto legible resume los ejes del tablero', () => {
  const text = buildReadableText('diagnostico', {
    formulation: {
      nominalDiagnosis: 'Hipótesis TDAH',
      caseSummary: 'Se prioriza organización y ansiedad ante plazos.',
      elements: [
        {
          axis: 'problem',
          title: 'Déficit atencional y organización',
          status: 'active',
          manifestations: [{ text: 'Olvida compromisos', checked: false }],
          indicators: [{ text: 'Usa agenda semanal', checked: true }],
          objectives: [{ text: 'Sostener rutina de planificación', checked: false }],
          evidence: [{ text: 'Relato de procrastinación crónica', checked: false }],
          notes: 'Revisar sobrecarga laboral.',
        },
      ],
      structured: {},
    },
    structured: {},
  });

  assert.match(text, /Hipótesis diagnóstica nominal/);
  assert.match(text, /Síntesis clínica/);
  assert.match(text, /Problemas · Déficit atencional y organización/);
  assert.match(text, /Manifestaciones: Olvida compromisos/);
  assert.match(text, /Indicadores: ✓ Usa agenda semanal/);
});
