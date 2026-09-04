import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORIES } from '../../src/js/module-categories.js';
import { shareableContentFor } from '../../src/js/share-content.js';
import { handoutStorage, patchFromHandoutResponse, toShareHandout } from '../../src/js/share-handout.js';
import { tccHandoutDef } from '../../src/js/tcc-handout-defs.js';

test('TCC, narrativa y plan de seguridad se pueden enviar por enlace', () => {
  const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  for (const type of [...byId.tcc.types, ...byId.significado.types, 'tcc_plan_seguridad']) {
    const share = shareableContentFor(type);
    assert.ok(share?.handout, `${type} debería ser un handout compartible`);
    assert.ok(share.handout.sections.length || share.handout.quiz.length, type);
    assert.equal(share.handout.title, tccHandoutDef(type).title);
  }
});

test('el quiz compartido no lleva la respuesta correcta', () => {
  const share = toShareHandout(tccHandoutDef('tcc_activacion'));
  assert.ok(share.quiz.length >= 2);
  for (const q of share.quiz) {
    assert.equal('correct' in q, false);
    for (const o of q.options) {
      assert.equal('correct' in o, false);
      assert.ok(o.v);
      assert.ok(o.label);
    }
  }
});

test('las escalas siguen siendo cuestionario, no handout', () => {
  const gad = shareableContentFor('gad7');
  assert.ok(gad.def);
  assert.equal(gad.handout, undefined);
  assert.equal(shareableContentFor('pcl5')?.def.id, 'pcl5');
});

test('NF, BLS y módulos de ficha no se envían al paciente', () => {
  for (const type of [
    'neurofeedback',
    'bilateral_stimulation',
    'nota_sesion',
    'diagnostico',
    'registro_inicial',
    'redes_apoyo',
    'motivo_consulta',
    'iesr',
    'sprint_ecl',
  ]) {
    assert.equal(shareableContentFor(type), null, type);
  }
});

test('la respuesta del paciente cae en las claves del módulo', () => {
  const handout = toShareHandout(tccHandoutDef('tcc_abc'));
  const storage = handoutStorage(handout);
  const patch = patchFromHandoutResponse(storage, {
    fields: { activador: 'Antes de dormir', creencias: 'No voy a dormir', extra: 'ignorar' },
    quiz: { q0: 'c' },
  });
  assert.deepEqual(patch, {
    activador: 'Antes de dormir',
    creencias: 'No voy a dormir',
  });
  assert.equal('extra' in patch, false);
  assert.equal('quiz' in patch, false);
});

test('el quiz de activación se guarda aparte, sin claves inventadas', () => {
  const handout = toShareHandout(tccHandoutDef('tcc_activacion'));
  const storage = handoutStorage(handout);
  const patch = patchFromHandoutResponse(storage, {
    fields: { weekly_plan: 'Caminar 20 min' },
    quiz: { q0: 'c', qHack: 'x' },
  });
  assert.equal(patch.weekly_plan, 'Caminar 20 min');
  assert.deepEqual(patch.quiz, { q0: 'c' });
});
