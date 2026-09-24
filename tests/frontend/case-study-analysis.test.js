import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisCategoriesForElement } from '../../src/js/case-study-analysis.js';

test('un módulo asignado desde el programa aparece en la categoría correcta del eje', () => {
  const element = { id: 'sleep', axis: 'problem', title: 'Insomnio' };
  const sessions = [
    {
      id: 's1',
      modules: [
        { id: 'gad', module_type: 'gad7', data: JSON.stringify({ elementIds: ['sleep'] }) },
        {
          id: 'safety',
          module_type: 'tcc_plan_seguridad',
          data: JSON.stringify({ elementIds: ['sleep'] }),
        },
      ],
    },
  ];
  const categories = analysisCategoriesForElement(element, sessions);
  const byLabel = Object.fromEntries(categories.map((category) => [category.label, category.values]));

  assert.ok(byLabel['Evaluación cuantitativa'].includes('gad7'));
  assert.ok(byLabel.Intervención.includes('tcc_plan_seguridad'));
});

test('el resumen no muestra recomendaciones que no estén integradas al programa', () => {
  const element = { id: 'suicidality', axis: 'problem', title: 'Suicidalidad' };
  const categories = analysisCategoriesForElement(element, [
    { id: 's1', modules: [{ id: 'unrelated', module_type: 'gad7', data: '{}' }] },
  ]);

  assert.deepEqual(categories, []);
});

test('el resumen conserva evidencia y actividades explícitamente asociadas', () => {
  const element = {
    id: 'affect',
    axis: 'resource',
    title: 'Regulación afectiva',
    quantitativeEvidence: [{ moduleType: 'dass21' }],
    activities: [{ moduleType: 'dbt_regulacion_emocional' }],
  };
  const categories = analysisCategoriesForElement(element, []);
  const byLabel = Object.fromEntries(categories.map((category) => [category.label, category.values]));

  assert.deepEqual(byLabel['Evaluación cuantitativa'], ['dass21']);
  assert.deepEqual(byLabel.Intervención, ['dbt_regulacion_emocional']);
});
