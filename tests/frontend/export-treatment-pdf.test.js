import assert from 'node:assert/strict';
import test from 'node:test';

import { motivoPdfFields } from '../../src/js/export-treatment-pdf.js';
import { moduleDisplayLabel } from '../../src/js/custom-modules.js';
import { readFileSync } from 'node:fs';

test('el programa PDF ordena la información clínica inicial antes de los ejes', () => {
  const fields = motivoPdfFields({
    motivo: 'Consulta por ánimo bajo.',
    expectativas: 'Quiere recuperar sus rutinas.',
    antecedentes: 'Antecedente relevante.',
    tratamientos_previos: 'Terapia previa.',
    medicacion: 'Sertralina.',
    psiquiatra: 'Dra. Pérez.',
    consumo: 'Sin consumo reportado.',
    relacion_ia: 'Usa la IA como apoyo para ordenar ideas.',
    urgencia: 'media',
  });

  assert.deepEqual(fields.map(([label]) => label), [
    'Motivo principal',
    'Expectativas del tratamiento',
    'Antecedentes relevantes',
    'Tratamientos previos',
    'Medicación',
    'Psiquiatra / médico tratante',
    'Consumo de sustancias',
    'Relación con la IA',
    'Urgencia',
  ]);
});

test('el PDF conserva respuestas antiguas de relación con la IA', () => {
  const fields = motivoPdfFields({
    ia_pregunto: 'Qué hacer con mi ansiedad.',
    ia_respondio: 'Me ayudó a ordenar alternativas.',
  });
  const ia = fields.find(([label]) => label === 'Relación con la IA')?.[1];
  assert.match(ia, /¿Qué preguntaste\?\nQué hacer con mi ansiedad\./);
  assert.match(ia, /¿Qué te respondió\?\nMe ayudó a ordenar alternativas\./);
});

test('las mediciones muestran el tipo y el título de la medición', () => {
  assert.equal(
    moduleDisplayLabel('medicion_cualitativa', { measurement_title: 'Análisis de los motivos cualitativos de la evitación' }),
    'Medición cualitativa - Análisis de los motivos cualitativos de la evitación',
  );
  assert.equal(
    moduleDisplayLabel('medicion_cuantitativa', { measurement_title: 'Días de cumplimiento' }),
    'Medición cuantitativa - Días de cumplimiento',
  );
});

test('las respuestas IA fijadas no fuerzan negrita', () => {
  const css = readFileSync(new URL('../../src/css/notes.css', import.meta.url), 'utf8');
  assert.match(css, /\.kindle-note--starred \.kindle-note__ai-answer,\s*\.kindle-note--starred \.kindle-note__ai-answer strong/);
  assert.match(css, /font-weight:\s*400/);
});
