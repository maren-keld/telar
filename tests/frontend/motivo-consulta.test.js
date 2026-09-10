import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseAnamnesisJson,
  shouldApplyAnamnesisAi,
  stripAiFences,
} from '../../src/js/modules/motivo-consulta.js';

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

test('parseAnamnesisJson rechaza un solo campo (no borrar los otros con vacío)', () => {
  assert.equal(parseAnamnesisJson('{"motivo":"Consulta por ansiedad."}'), null);
  assert.equal(
    parseAnamnesisJson('{"motivo":"Consulta.","expectativas":"Herramientas."}'),
    null,
  );
});

test('no aplica la IA si el formulario se desmontó', () => {
  const snapshot = { motivo: 'a', expectativas: 'b', antecedentes: 'c' };
  assert.equal(shouldApplyAnamnesisAi({ form: { isConnected: false }, snapshot }).reason, 'unmounted');
  assert.equal(shouldApplyAnamnesisAi({ form: null, snapshot }).reason, 'unmounted');
});

test('no aplica la IA si el terapeuta siguió escribiendo', () => {
  const snapshot = { motivo: 'a', expectativas: 'b', antecedentes: 'c' };
  const form = {
    isConnected: true,
    dataset: { anamnesisGeneration: '1' },
    querySelector(sel) {
      const name = sel.match(/name="(\w+)"/)?.[1];
      const values = { motivo: 'a cambiado', expectativas: 'b', antecedentes: 'c' };
      return { value: values[name] };
    },
  };
  assert.equal(shouldApplyAnamnesisAi({ form, snapshot, generation: '1' }).reason, 'diverged');
});

test('reorganizar con IA usa estrella, readOnly (no disabled) y el click vive en el host', () => {
  const src = readFileSync(new URL('../../src/js/modules/motivo-consulta.js', import.meta.url), 'utf8');
  assert.match(src, /ICON_STAR/);
  assert.doesNotMatch(src, /ICON_WAND/);
  assert.match(src, /host\.addEventListener\('click'/);
  assert.match(src, /el\.readOnly = locked/);
  assert.match(src, /shouldApplyAnamnesisAi/);
  const css = readFileSync(new URL('../../src/css/modules.css', import.meta.url), 'utf8');
  assert.match(css, /\.btn\.btn-ai-reorder[\s\S]*?height: 40px/);
});
