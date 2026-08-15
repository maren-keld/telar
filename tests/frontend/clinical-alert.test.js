import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clinicalAlertFromModules,
  ferSelfHarmAlert,
  sprintSuicideAlert,
  treatmentIsClinicalAlert,
} from '../../src/js/clinical-alert.js';
import { selectableTreatmentTags, TREATMENT_TAG_DEFS } from '../../src/js/config.js';

test('urgencia alta triggers clinical alert', () => {
  assert.equal(treatmentIsClinicalAlert({ urgencia: 'alta' }), true);
  assert.equal(treatmentIsClinicalAlert({ urgencia: 'media' }), false);
});

test('sprint item 12 yes triggers clinical alert', () => {
  const answers = Array(12).fill(0);
  answers[11] = 1;
  assert.equal(sprintSuicideAlert(answers), true);
  assert.equal(treatmentIsClinicalAlert({ sprintAnswers: answers }), true);
  answers[11] = 0;
  assert.equal(treatmentIsClinicalAlert({ sprintAnswers: answers }), false);
});

test('FER self-harm item at A veces or more triggers alert', () => {
  const answers = Array(12).fill(0);
  answers[6] = 2;
  assert.equal(ferSelfHarmAlert(answers), true);
  answers[6] = 1;
  assert.equal(ferSelfHarmAlert(answers), false);
});

test('perfil vital-risk checks trigger alert', () => {
  assert.equal(treatmentIsClinicalAlert({ spaceLabels: ['Ideación suicida'] }), true);
  assert.equal(treatmentIsClinicalAlert({ spaceLabels: ['Aislamiento social'] }), false);
});

test('clinicalAlertFromModules reads motivo urgencia', () => {
  assert.equal(
    clinicalAlertFromModules([{ module_type: 'motivo_consulta', data: { urgencia: 'alta' } }]),
    true,
  );
});

test('alerta tag is selectable and also auto-assigned', () => {
  assert.equal(TREATMENT_TAG_DEFS.alerta.auto, true);
  assert.equal(TREATMENT_TAG_DEFS.alerta.label, 'En alerta');
  assert.ok(selectableTreatmentTags().some(([k]) => k === 'alerta'));
});
