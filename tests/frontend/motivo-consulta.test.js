import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnamnesisJson, stripAiFences } from '../../src/js/modules/motivo-consulta.js';

test('stripAiFences quita markdown y comillas', () => {
  assert.equal(stripAiFences('```json\n{"a":1}\n```'), '{"a":1}');
});

test('parseAnamnesisJson lee los tres campos', () => {
  const parsed = parseAnamnesisJson(
    '```json\n{"motivo":"Consulta por ansiedad.","expectativas":"Quiere herramientas.","antecedentes":"Llevo meses así."}\n```',
  );
  assert.equal(parsed.motivo, 'Consulta por ansiedad.');
  assert.equal(parsed.expectativas, 'Quiere herramientas.');
  assert.equal(parsed.antecedentes, 'Llevo meses así.');
});

test('parseAnamnesisJson rechaza JSON vacío', () => {
  assert.equal(parseAnamnesisJson('{"motivo":"","expectativas":"","antecedentes":""}'), null);
});
