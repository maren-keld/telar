import assert from 'node:assert/strict';
import test from 'node:test';
import { axisAssignmentRows } from '../../src/js/workspace-axis-assignment.js';
import { defaultElementIdsForModule } from '../../src/js/case-study-model.js';
import { missingCaseStudyElementsForModule } from '../../src/js/case-study-store.js';

test('la asignación de ejes prioriza los elementos recomendados para el módulo', () => {
  const rows = axisAssignmentRows(
    [
      { id: 'stress', axis: 'problem', title: 'Estrés alto' },
      { id: 'relations', axis: 'problem', title: 'Dificultades relacionales' },
      { id: 'sleep', axis: 'problem', title: 'Insomnio' },
    ],
    'dbt_camino_del_medio',
  );

  assert.equal(rows[0].id, 'relations');
  assert.equal(rows[0].recommended, true);
  assert.equal(rows.find((row) => row.id === 'stress').recommended, false);
  assert.equal(rows.find((row) => row.id === 'sleep').recommended, false);
});

test('DASS-21 obtiene todos los elementos clínicos recomendados que ya existen', () => {
  const ids = defaultElementIdsForModule('dass21', [
    { id: 'mood', title: 'Estado de ánimo bajo' },
    { id: 'anxiety', title: 'Ansiedad alta' },
    { id: 'stress', title: 'Estrés alto' },
    { id: 'sleep', title: 'Insomnio' },
  ]);
  assert.deepEqual(ids, ['mood', 'anxiety', 'stress']);
});

test('activación conductual queda asociada a ánimo, actividad física y estructura', () => {
  const ids = defaultElementIdsForModule('tcc_activacion', [
    { id: 'mood', title: 'Estado de ánimo bajo' },
    { id: 'activity', title: 'Actividad física' },
    { id: 'structure', title: 'Estructura diaria / disciplina' },
  ]);
  assert.deepEqual(ids, ['mood', 'activity', 'structure']);
});

test('al añadir un módulo se crean los elementos clínicos asociados que falten', () => {
  const missing = missingCaseStudyElementsForModule('tcc_estres', [
    { id: 'anxiety', axis: 'problem', title: 'Ansiedad alta' },
  ]);

  assert.ok(missing.some((element) => element.axis === 'problem' && element.title === 'Estrés alto'));
  assert.ok(missing.some((element) => element.axis === 'resource' && element.title === 'Regulación afectiva'));
  assert.ok(!missing.some((element) => element.title === 'Ansiedad alta'));
});
