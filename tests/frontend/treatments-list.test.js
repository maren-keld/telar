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
  const nameAt = t2.indexOf('Ana');
  const tnAt = t2.indexOf('patient-card__tn');
  assert.ok(nameAt > 0 && tnAt > nameAt);
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

test('tags sit to the right of the name with add-label control', () => {
  const html = treatmentSectionHtml('en_pausa', [
    { ...row, name: 'Ana Pérez', convenio_name: 'Isapre', tags: ['estudiar_caso', 'necesita_supervision'] },
  ]);
  const nameAt = html.indexOf('Ana Pérez');
  const tagsAt = html.indexOf('patient-card__tags');
  assert.ok(nameAt > 0 && tagsAt > nameAt);
  assert.match(html, /patient-card__tag--estudiar_caso/);
  assert.match(html, /Necesita más estudio/);
  assert.match(html, /patient-card__tag--necesita_supervision/);
  assert.match(html, /Supervisado/);
  assert.match(html, /patient-card__tag-dot/);
  assert.match(html, /data-tag-picker/);
  assert.match(html, /\+ Etiqueta/);
  assert.match(html, /Isapre/);
  assert.doesNotMatch(html, /patient-card__meta/);
  assert.doesNotMatch(html, /patient-card__tn/);
});

test('alerta tag is auto-and-manual and reddish', () => {
  const auto = treatmentSectionHtml('en_tratamiento', [
    { ...row, clinical_alert: true, clinical_alert_reasons: ['Urgencia alta en la anamnesis'], tags: [] },
  ]);
  assert.match(auto, /patient-card__tag--alerta/);
  assert.match(auto, /En alerta/);
  assert.match(auto, /tag-glyph--pulse/);
  assert.match(auto, /data-tooltip="Urgencia alta en la anamnesis"/);

  const manual = treatmentSectionHtml('en_tratamiento', [{ ...row, tags: ['alerta'] }]);
  assert.match(manual, /patient-card__tag--alerta/);
  assert.match(manual, /En alerta/);
  assert.match(manual, /Marcado en alerta por el profesional/);
});
