import test from 'node:test';
import assert from 'node:assert/strict';
import { eedDefenseScore } from '../../src/js/eed-defense-score.js';
import { eedDefenseScoreHtml } from '../../src/js/views/estudio-de-caso.js';
import { getModuleDefs } from '../../src/js/config.js';

const data = (...entries) => { const answers = []; for (const [i,v] of entries) answers[i] = v; return { answers }; };
test('EED calcula la media de respuestas relacionadas con cada defensa', () => {
  assert.equal(eedDefenseScore('Anticipación', data([3,4])).score, 4);
  assert.equal(eedDefenseScore('Racionalización', data([9,2],[10,5])).score, 3.5);
  assert.equal(eedDefenseScore('racionalizacion', data([9,'2'],[10,'5'])).score, 3.5);
});
test('EED distingue respuestas parciales, vacías e inválidas de intensidad baja', () => {
  const partial = eedDefenseScore('Racionalización', data([9,4],[10,null]));
  assert.equal(partial.score, 4);
  assert.equal(partial.answered, 1);
  assert.equal(partial.total, 2);
  for (const value of [null,'',0,6,2.5]) assert.equal(eedDefenseScore('Anticipación', data([3,value])).score, null);
  assert.equal(eedDefenseScore('Represión parcial', data([3,5])).total, 0);
});
test('badge EED muestra promedio y carácter descriptivo, no una gravedad', () => {
  const badge = eedDefenseScoreHtml({ axis:'defense',title:'Racionalización' }, data([9,2],[10,5]));
  assert.match(badge, /3,5\/5/);
  assert.match(badge, /No es un nivel de gravedad ni una subescala validada/);
  assert.equal((badge.match(/class="is-filled"/g)||[]).length, 4);
  assert.equal(eedDefenseScoreHtml({ axis:'problem',title:'Anticipación' },data([3,4])), '');
});
test('EED está restringido a una aplicación por tratamiento en el catálogo', () => {
  assert.equal(getModuleDefs().eed.oncePerTreatment, true);
});
