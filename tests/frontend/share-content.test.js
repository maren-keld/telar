import assert from 'node:assert/strict';
import test from 'node:test';

import { simpleCustomToHandout } from '../../src/js/share-content.js';

test('un cuestionario simple se puede enviar al paciente como handout', () => {
  const handout = simpleCustomToHandout({
    title: 'Colores',
    instructions: 'Elige el que más te calme',
    questions: [
      { id: 'q1', type: 'checkbox', text: 'Color', options: ['Azul', 'Verde'] },
      { id: 'info', type: 'info', text: 'No hay respuestas incorrectas' },
    ],
  });
  assert.equal(handout.title, 'Colores');
  assert.equal(handout.sections.length, 1);
  assert.equal(handout.sections[0].key, 'q1');
});

test('una experiencia interactiva no se convierte a handout', () => {
  assert.equal(simpleCustomToHandout({ kind: 'interactive', html: '<div></div>' }), null);
});
