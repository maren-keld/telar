import assert from 'node:assert/strict';
import test from 'node:test';

import { caseCode } from '../../src/js/case-code.js';
import { buildCasePresentationData } from '../../src/js/export-case-presentation-pdf.js';

/** Caso de prueba con identificadores distintivos y fáciles de buscar. */
function fixture() {
  return {
    treatment: { id: 42, number: 1, status: 'en_tratamiento', patient_name: 'Juanita Testverificacion' },
    sessions: [
      {
        number: 1,
        modules: [
          {
            module_type: 'registro_inicial',
            data: JSON.stringify({
              nombre: 'Juanita Testverificacion',
              id_number: '12.345.678-9',
              email: 'juanita@correoprivado.cl',
              phone: '+56911112222',
              address: 'Calle Secreta 123',
              birth_date: '1990-03-15',
              genero: 'femenino',
              marital_status: 'soltera',
              prevision: 'Fonasa',
              source: 'derivación neurólogo',
              occupations: ['profesora'],
            }),
          },
          { module_type: 'gad7', data: JSON.stringify({ answers: [3, 3, 2, 3, 2, 2, 3] }) },
        ],
      },
      {
        number: 6,
        modules: [{ module_type: 'gad7', data: JSON.stringify({ answers: [1, 1, 0, 1, 1, 0, 1] }) }],
      },
    ],
    notes: [
      { starred: 1, content: 'Revisar evitación en sesión 4', quote_text: '', kind: 'comment' },
      { starred: 0, content: '¿Conviene exposición ahora?', kind: 'pregunta_supervision' },
    ],
    profile: { name: 'Ps. Felipe Uppen' },
  };
}

test('case presentation carries no patient identifiers', () => {
  const data = buildCasePresentationData(fixture());
  const serialized = JSON.stringify(data);

  for (const secret of [
    'Juanita',
    'Testverificacion',
    '12.345.678-9',
    'juanita@correoprivado.cl',
    '+56911112222',
    'Calle Secreta 123',
    '1990-03-15',
  ]) {
    assert.ok(!serialized.includes(secret), `filtró un identificador: ${secret}`);
  }

  assert.equal(data.code, 'TL-0042');
});

test('case presentation keeps the clinically relevant, non-identifying context', () => {
  const data = buildCasePresentationData(fixture());
  const context = data.context.join(' | ');

  assert.match(context, /Edad: \d+ años/);
  assert.match(context, /femenino/);
  assert.match(context, /profesora/);
  assert.match(context, /Fonasa/);
});

test('case presentation computes the longitudinal delta', () => {
  const data = buildCasePresentationData(fixture());
  const gad = data.series.find((s) => s.type === 'gad7');

  assert.ok(gad, 'debería incluir la serie GAD-7');
  assert.equal(gad.baseline, 18);
  assert.equal(gad.current, 5);
  assert.equal(gad.delta, -13);
  assert.equal(gad.points.length, 2);
});

test('case presentation separates flagged moments from supervision questions', () => {
  const data = buildCasePresentationData(fixture());

  assert.equal(data.flagged.length, 1);
  assert.match(data.flagged[0], /evitación/);
  assert.deepEqual(data.questions, ['¿Conviene exposición ahora?']);
});


test('caseCode is deterministic and zero-padded', () => {
  assert.equal(caseCode(42), 'TL-0042');
  assert.equal(caseCode(42), caseCode(42));
  assert.equal(caseCode(7), 'TL-0007');
  assert.equal(caseCode(12345), 'TL-12345');
});

test('caseCode never leaks an identifier for invalid input', () => {
  assert.equal(caseCode(null), 'TL-0000');
  assert.equal(caseCode(undefined), 'TL-0000');
  assert.equal(caseCode('Juanita'), 'TL-0000');
  assert.equal(caseCode(-3), 'TL-0000');
});
