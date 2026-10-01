import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCities } from '../../src/js/city-suggestions.js';
import { CLINIC_COUNTRIES, cityFieldSpec, nominatimCountryCode } from '../../src/js/clinic-country.js';

test('cada país americano ofrece sugerencias propias y un filtro geográfico', () => {
  for (const code of ['CL','AR','UY','MX','PE','CO','BO','EC','PY','VE','CR','PA','GT','SV','HN','NI','DO','CU','PR','US']) {
    assert.ok(CLINIC_COUNTRIES.some(country => country.id === code), code);
    assert.equal(nominatimCountryCode(code), code.toLowerCase());
    assert.ok(suggestCities('',code).length, code);
  }
});
test('ciudades no mezclan países y toleran acentos', () => {
  assert.ok(suggestCities('miami','US').some(city => /Miami/.test(city)));
  assert.equal(suggestCities('miami','CL').length, 0);
  assert.ok(suggestCities('valparaiso','CL').some(city => /Valparaíso/.test(city)));
  assert.equal(suggestCities('valparaiso','US').length, 0);
  assert.equal(cityFieldSpec('CL').label, 'Ciudad o comuna');
  assert.match(cityFieldSpec('US').placeholder, /Miami/);
});
