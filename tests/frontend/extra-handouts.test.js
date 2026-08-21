import assert from 'node:assert/strict';
import test from 'node:test';
import { EXTRA_HANDOUT_DEFS } from '../../src/js/extra-handout-defs.js';
import { isModuleTypeAvailable } from '../../src/js/modules/index.js';
import { handoutPdfFilename } from '../../src/js/export-handout-pdf.js';
import { formatTccHandoutReadable, tccHandoutDef } from '../../src/js/tcc-handout-defs.js';

const NEW_IDS = [
  'tcc_registro_pensamientos',
  'tcc_exposicion',
  'tcc_experimento',
  'tcc_monitoreo_actividades',
  'tcc_prevencion_recaida',
  'sig_externalizacion',
  'sig_resultados_unicos',
  'sig_linea_vida',
  'sig_carta_problema',
  'sig_condiciones_valia',
  'sig_felt_sense',
  'sig_pregunta_milagro',
];

test('los 12 módulos nuevos tienen definición, renderer y PDF', () => {
  assert.equal(Object.keys(EXTRA_HANDOUT_DEFS).length, 12);
  for (const id of NEW_IDS) {
    const def = tccHandoutDef(id);
    assert.ok(def?.title, id);
    assert.ok(def.intro, id);
    assert.ok((def.sections || []).length, id);
    assert.equal(isModuleTypeAvailable(id), true, id);
    const filename = handoutPdfFilename(def, 'Paciente Demo');
    assert.match(filename, /\.pdf$/);
    assert.doesNotMatch(filename, /[\\/]/);
  }
});

test('el registro de pensamientos formatea columnas con datos', () => {
  const text = formatTccHandoutReadable('tcc_registro_pensamientos', {
    situacion: 'Reunión de equipo',
    pensamiento: 'Van a notar que no sé',
  });
  assert.match(text, /Situación/);
  assert.match(text, /Reunión de equipo/);
  assert.match(text, /Van a notar/);
});
