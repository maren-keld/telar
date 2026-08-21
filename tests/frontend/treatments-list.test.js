import assert from 'node:assert/strict';
import test from 'node:test';

import { treatmentSectionHtml } from '../../src/js/views/treatments.js';

const row = {
  treatment_id: 7,
  treatment_number: 1,
  name: 'Paciente Archivado',
  tags: [],
};

test('collapsed archived section still contains the patient cards', () => {
  const html = treatmentSectionHtml('archivado', [row], true);
  assert.match(html, /hidden/);
  assert.match(html, /Paciente Archivado/);
  assert.match(html, /data-treatment-id="7"/);
  assert.match(html, /aria-expanded="false"/);
});

test('open section does not hide the list', () => {
  const html = treatmentSectionHtml('completado', [row], false);
  assert.doesNotMatch(html, /section-accordion__body" hidden/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Paciente Archivado/);
});

test('T1 pill is omitted; T2+ appears to the right of the name', () => {
  const t1 = treatmentSectionHtml('en_tratamiento', [row], false);
  assert.doesNotMatch(t1, /patient-card__tn/);
  assert.doesNotMatch(t1, /Tratamiento 1/);

  const t2 = treatmentSectionHtml('en_tratamiento', [{ ...row, treatment_number: 2, name: 'Ana' }], false);
  assert.match(t2, /class="patient-card__tn" title="Tratamiento 2">T2</);
  assert.doesNotMatch(t2, /<span class="badge">Tratamiento/);
});

test('cards keep section status without a status glyph', () => {
  const html = treatmentSectionHtml('en_tratamiento', [row], false);
  assert.match(html, /data-status="en_tratamiento"/);
  assert.doesNotMatch(html, /patient-card__status/);
  assert.doesNotMatch(html, /status-glyph__svg/);
});

test('card menu uses vertical three-dots icon', () => {
  const html = treatmentSectionHtml('en_tratamiento', [row], false);
  assert.match(html, /patient-card__menu/);
  assert.match(html, /nav-icon-svg/);
  assert.doesNotMatch(html, />⋯</);
});

test('tag glyphs sit to the left of the label', () => {
  const html = treatmentSectionHtml('en_pausa', [
    { ...row, convenio_name: 'Isapre', tags: ['estudiar_caso', 'necesita_supervision'] },
  ]);
  assert.match(html, /patient-card__tag--estudiar_caso/);
  assert.match(html, /Necesita más estudio/);
  assert.match(html, /patient-card__tag--necesita_supervision/);
  assert.match(html, /Supervisado/);
  assert.match(html, /tag-glyph__svg/);
  assert.match(html, /Isapre/);
  assert.doesNotMatch(html, /patient-card__tn/);
});

test('alerta tag is auto-and-manual and reddish', () => {
  const auto = treatmentSectionHtml('en_tratamiento', [{ ...row, clinical_alert: true, tags: [] }]);
  assert.match(auto, /patient-card__tag--alerta/);
  assert.match(auto, /En alerta/);
  assert.match(auto, /tag-glyph--pulse/);

  const manual = treatmentSectionHtml('en_tratamiento', [{ ...row, tags: ['alerta'] }]);
  assert.match(manual, /patient-card__tag--alerta/);
  assert.match(manual, /En alerta/);
});
