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

test('las categorías agrupan por función en la hora, no por escuela', async () => {
  const { CATEGORIES, CATEGORY_LABELS } = await import('../../src/js/module-categories.js');
  const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  assert.equal(CATEGORY_LABELS.conceptualizacion, 'Conceptualización');
  assert.equal(CATEGORY_LABELS.tcc, 'Habilidades y tareas');
  assert.equal(CATEGORY_LABELS.significado, 'Significado');
  assert.equal(CATEGORY_LABELS.intervencion, 'Intervención en sesión');
  assert.ok(byId.conceptualizacion.types.includes('tcc_plan_seguridad'));
  assert.ok(byId.significado.types.includes('tcc_autoconceptos'));
  assert.ok(byId.significado.types.includes('sig_felt_sense'));
  assert.ok(byId.tcc.types.includes('tcc_exposicion'));
  assert.ok(byId.tcc.types.includes('tcc_experimento'));
  assert.ok(!byId.intervencion.types.includes('tcc_exposicion'));
  assert.ok(!byId.tcc.types.includes('tcc_plan_seguridad'));
  assert.ok(!byId.tcc.types.includes('tcc_autoconceptos'));
  assert.equal(byId.conceptualizacion.blurb, 'Encuadre y formulación del caso');
  assert.equal(
    byId.tcc.blurb,
    'Psicoeducación y práctica, recomendado para traer como tarea entre sesiones.',
  );
  assert.equal(byId.significado.blurb, 'Narrativa e identidad, se trabaja en sesión');
  assert.equal(byId.intervencion.blurb, 'Entrenar habilidades en sesión');
});

test('Mis módulos van al final del selector', async () => {
  const { selectorListInnerHtml } = await import('../../src/js/components/module-selector.js');
  const html = selectorListInnerHtml();
  const cats = [...html.matchAll(/data-cat="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(cats.includes('conceptualizacion'));
  if (cats.includes('custom')) {
    assert.equal(cats.at(-1), 'custom');
  }
});

test('al seleccionar Diagnósticos o Redes de apoyo el preview muestra descripción', async () => {
  const { previewHtml } = await import('../../src/js/components/module-selector.js');
  const { getModuleDef } = await import('../../src/js/config.js');
  const redes = getModuleDef('redes_apoyo');
  const dx = getModuleDef('diagnostico');
  assert.ok(redes?.description && redes.description !== 'Módulo clínico.');
  assert.ok(dx?.description && dx.description !== 'Módulo clínico.');
  const redesPreview = previewHtml('redes_apoyo', redes, null);
  const dxPreview = previewHtml('diagnostico', dx, null);
  assert.match(redesPreview, /Mapa de personas/);
  assert.match(dxPreview, /Problemas, indicadores/);
  assert.doesNotMatch(redesPreview, /mod-selector-item__desc/);
});

test('el preview del selector puede ocultar el botón de acción', async () => {
  const { previewHtml } = await import('../../src/js/components/module-selector.js');
  const withBtn = previewHtml('gad7', { label: 'GAD-7' }, null);
  const withoutBtn = previewHtml('gad7', { label: 'GAD-7' }, null, { showAction: false });
  assert.match(withBtn, /id="mod-select-btn"/);
  assert.doesNotMatch(withoutBtn, /id="mod-select-btn"/);
});
