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
  stripAiFences,
} from '../../src/js/modules/motivo-consulta.js';

function anamnesisJson(overrides = {}) {
  const base = Object.fromEntries(ANAMNESIS_REORDER_KEYS.map((key) => [key, '']));
  return JSON.stringify({ ...base, ...overrides });
}

test('stripAiFences quita markdown y comillas', () => {
  assert.equal(stripAiFences('```json\n{"a":1}\n```'), '{"a":1}');
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

test('parseAnamnesisJson rechaza JSON vacío', () => {
  assert.equal(parseAnamnesisJson(anamnesisJson()), null);
});

test('parseAnamnesisJson rechaza JSON sin todas las claves o totalmente vacío', () => {
  assert.equal(parseAnamnesisJson('{"motivo":"Consulta por ansiedad."}'), null);
  const partial = parseAnamnesisJson(
    anamnesisJson({ motivo: 'Consulta.', expectativas: 'Herramientas.' }),
  );
  assert.equal(partial.motivo, 'Consulta.');
  assert.equal(partial.expectativas, 'Herramientas.');
  assert.equal(partial.antecedentes, '');
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
  const css = readFileSync(new URL('../../src/css/modules.css', import.meta.url), 'utf8');
  assert.match(css, /\.btn\.btn-ai-reorder[\s\S]*?height: 40px/);
});
