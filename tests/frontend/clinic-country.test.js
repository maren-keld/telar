import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coverageFor,
  coverageLabel,
  formatNationalId,
  idSpecFor,
  isValidClinicCountry,
  nominatimCountryCode,
} from '../../src/js/clinic-country.js';
import { normalizeEducationLevel } from '../../src/js/config.js';
import { iaAnamnesisPlaceholderAttr, IA_ANAMNESIS_PLACEHOLDER } from '../../src/js/modules/motivo-consulta.js';

test('país válido solo de la lista', () => {
  assert.equal(isValidClinicCountry('CL'), true);
  assert.equal(isValidClinicCountry('AR'), true);
  assert.equal(isValidClinicCountry(''), false);
  assert.equal(isValidClinicCountry('US'), false);
});

test('previsión / cobertura cambia con el país', () => {
  assert.equal(coverageLabel('CL'), 'Previsión');
  assert.ok(coverageFor('CL').options.includes('Fonasa'));
  assert.equal(coverageLabel('AR'), 'Cobertura de salud');
  assert.ok(coverageFor('AR').options.includes('Obra social'));
  assert.ok(coverageFor('MX').options.includes('IMSS'));
  assert.ok(coverageFor('PE').options.includes('EsSalud'));
  assert.ok(coverageFor('UY').options.includes('ASSE'));
});

test('ID se formatea según el país', () => {
  assert.equal(formatNationalId('123456789', 'CL'), '12.345.678-9');
  assert.equal(formatNationalId('12345678', 'AR'), '12.345.678');
  assert.equal(formatNationalId('12345678', 'UY'), '1.234.567-8');
  assert.equal(formatNationalId('12345678', 'PE'), '12345678');
  assert.equal(formatNationalId('abcd000000hdfxxx00', 'MX'), 'ABCD000000HDFXXX00');
  assert.equal(idSpecFor('CL').placeholder, '12.345.678-9');
  assert.equal(idSpecFor('AR').placeholder, '12.345.678');
});

test('Nominatim usa el código del país del clínico', () => {
  assert.equal(nominatimCountryCode('CL'), 'cl');
  assert.equal(nominatimCountryCode('AR'), 'ar');
  assert.equal(nominatimCountryCode('OTRO'), '');
});

test('educación básica/media se lee como primaria/secundaria', () => {
  assert.equal(normalizeEducationLevel('Educación básica completa'), 'Educación primaria completa');
  assert.equal(normalizeEducationLevel('Educación media incompleta'), 'Educación secundaria incompleta');
  assert.equal(normalizeEducationLevel('Educación universitaria completa'), 'Educación universitaria completa');
});

test('placeholder de IA: una pregunta por línea, sin líneas en blanco', () => {
  const lines = IA_ANAMNESIS_PLACEHOLDER.split('\n');
  assert.equal(lines.length, 5);
  assert.ok(lines.every((line) => line.startsWith('¿') && !line.includes('\n')));
  assert.ok(iaAnamnesisPlaceholderAttr().includes('&#10;'));
  assert.doesNotMatch(iaAnamnesisPlaceholderAttr(), /&#10;&#10;/);
});
