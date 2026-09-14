import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ANAMNESIS_REORDER_KEYS,
  anamnesisFieldSnapshot,
  anamnesisReorderContextText,
  anamnesisReorderUserMessage,
  hasAnamnesisReorderInput,
  parseAnamnesisJson,
  shouldApplyAnamnesisAi,
  stringifyAnamnesisValue,
  stripAiFences,
} from '../../src/js/modules/motivo-consulta.js';

function anamnesisJson(overrides = {}) {
  const base = Object.fromEntries(ANAMNESIS_REORDER_KEYS.map((key) => [key, '']));
  return JSON.stringify({ ...base, ...overrides });
}

test('stripAiFences quita markdown y comillas', () => {
  assert.equal(stripAiFences('```json\n{"a":1}\n```'), '{"a":1}');
});

test('stringifyAnamnesisValue no escribe [object Object]', () => {
  assert.equal(stringifyAnamnesisValue({ text: 'Consulta por ansiedad.' }), 'Consulta por ansiedad.');
  assert.equal(stringifyAnamnesisValue({ motivo: 'A', extra: 'B' }), 'A\nB');
  assert.equal(stringifyAnamnesisValue(['uno', { text: 'dos' }]), 'uno\ndos');
  assert.equal(stringifyAnamnesisValue('[object Object]'), '');
  assert.equal(stringifyAnamnesisValue({ foo: { bar: 'ok' } }), 'ok');
});

test('parseAnamnesisJson lee todos los campos de anamnesis', () => {
  const parsed = parseAnamnesisJson(
    `\`\`\`json\n${anamnesisJson({
      motivo: 'Consulta por ansiedad.',
      expectativas: 'Quiere herramientas.',
      antecedentes: 'Llevo meses así.',
      medicacion: 'Sertralina 50 mg.',
    })}\n\`\`\``,
  );
  assert.equal(parsed.motivo, 'Consulta por ansiedad.');
  assert.equal(parsed.expectativas, 'Quiere herramientas.');
  assert.equal(parsed.antecedentes, 'Llevo meses así.');
  assert.equal(parsed.medicacion, 'Sertralina 50 mg.');
  assert.equal(parsed.tratamientos_previos, '');
});

test('parseAnamnesisJson aplana objetos anidados en vez de [object Object]', () => {
  const parsed = parseAnamnesisJson({
    motivo: { text: 'Consulta por insomnio.' },
    expectativas: { content: 'Dormir mejor.' },
    antecedentes: { value: 'Hace meses.' },
  });
  assert.equal(parsed.motivo, 'Consulta por insomnio.');
  assert.equal(parsed.expectativas, 'Dormir mejor.');
  assert.equal(parsed.antecedentes, 'Hace meses.');
  assert.equal(parsed.motivo.includes('object'), false);
});

test('parseAnamnesisJson rechaza JSON vacío o solo [object Object]', () => {
  assert.equal(parseAnamnesisJson(anamnesisJson()), null);
  assert.equal(
    parseAnamnesisJson(JSON.stringify({ motivo: {}, expectativas: {}, antecedentes: {} })),
    null,
  );
  assert.equal(
    parseAnamnesisJson('{"motivo":"[object Object]","expectativas":"[object Object]"}'),
    null,
  );
});

test('parseAnamnesisJson acepta un subconjunto de claves (no borra el resto al aplicar)', () => {
  const parsed = parseAnamnesisJson('{"motivo":"Consulta por ansiedad."}');
  assert.equal(parsed.motivo, 'Consulta por ansiedad.');
  assert.equal('expectativas' in parsed, false);
  assert.equal('antecedentes' in parsed, false);
});

test('hasAnamnesisReorderInput detecta texto en cualquier textarea', () => {
  assert.equal(hasAnamnesisReorderInput({ motivo: 'x' }), true);
  assert.equal(
    hasAnamnesisReorderInput({ motivo: '', expectativas: 'Quiere dormir mejor', antecedentes: '' }),
    true,
  );
  assert.equal(hasAnamnesisReorderInput({ salud_fisica: 'Hipotiroidismo' }), true);
  assert.equal(hasAnamnesisReorderInput({}), false);
});

test('anamnesisFieldSnapshot lee todos los textareas del módulo', () => {
  const values = {
    motivo: 'm',
    expectativas: 'e',
    antecedentes: 'a',
    tratamientos_previos: 't',
    medicacion: 'med',
    psiquiatra: 'psi',
    salud_fisica: 'sf',
    relacion_ia: 'ia',
  };
  const form = {
    querySelector(sel) {
      const name = sel.match(/name="([^"]+)"/)?.[1];
      return name in values ? { value: values[name] } : null;
    },
  };
  assert.deepEqual(anamnesisFieldSnapshot(form), values);
});

test('anamnesisReorderUserMessage incluye todos los campos para la IA', () => {
  const msg = anamnesisReorderUserMessage({
    motivo: '',
    expectativas: 'Quiere herramientas para dormir.',
    antecedentes: '',
  });
  assert.match(msg, /Expectativas del tratamiento \(expectativas\):/);
  assert.match(msg, /Quiere herramientas para dormir\./);
  assert.match(msg, /Motivo principal \(motivo\):\n—/);
});

test('anamnesisReorderContextText omite campos vacíos en el preview clínico', () => {
  const text = anamnesisReorderContextText({
    expectativas: 'Quiere herramientas.',
    medicacion: 'Sertralina.',
  });
  assert.match(text, /Expectativas del tratamiento:\nQuiere herramientas\./);
  assert.match(text, /Medicación:\nSertralina\./);
  assert.doesNotMatch(text, /Motivo principal/);
});

test('no aplica la IA si el formulario se desmontó', () => {
  const snapshot = { motivo: 'a', expectativas: 'b', antecedentes: 'c' };
  assert.equal(shouldApplyAnamnesisAi({ form: { isConnected: false }, snapshot }).reason, 'unmounted');
  assert.equal(shouldApplyAnamnesisAi({ form: null, snapshot }).reason, 'unmounted');
});

test('no aplica la IA si el terapeuta siguió escribiendo', () => {
  const snapshot = Object.fromEntries(ANAMNESIS_REORDER_KEYS.map((key) => [key, key]));
  const form = {
    isConnected: true,
    dataset: { anamnesisGeneration: '1' },
    querySelector(sel) {
      const name = sel.match(/name="([^"]+)"/)?.[1];
      const values = { ...snapshot, medicacion: 'medicacion cambiado' };
      return name in values ? { value: values[name] } : null;
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
  assert.match(src, /ANAMNESIS_REORDER_KEYS/);
  assert.match(src, /stringifyAnamnesisValue/);
  const css = readFileSync(new URL('../../src/css/modules.css', import.meta.url), 'utf8');
  assert.match(css, /\.btn\.btn-ai-reorder[\s\S]*?height: 40px/);
});
