import assert from 'node:assert/strict';
import test from 'node:test';

import { previewHtml } from '../../src/js/components/module-selector.js';
import { whereFor, whereLabel, WHERE_IDS } from '../../src/js/module-where.js';
import { sessionsForCenter, sidebarCategoryHtml } from '../../src/js/workspace-index-mode.js';

test('los tres cajones son En sesión / Entre sesiones / Ficha', () => {
  assert.deepEqual(WHERE_IDS, ['en_sesion', 'entre_sesiones', 'ficha']);
  assert.equal(whereLabel('en_sesion'), 'En sesión');
  assert.equal(whereLabel('entre_sesiones'), 'Entre sesiones');
  assert.equal(whereLabel('ficha'), 'Ficha');
});

test('defaults por tipo: sesión, tarea y escritorio', () => {
  assert.equal(whereFor('neurofeedback'), 'en_sesion');
  assert.equal(whereFor('bilateral_stimulation'), 'en_sesion');
  assert.equal(whereFor('tcc_autoconceptos'), 'en_sesion');
  assert.equal(whereFor('sig_felt_sense'), 'en_sesion');
  assert.equal(whereFor('sig_linea_vida'), 'en_sesion');

  assert.equal(whereFor('gad7'), 'entre_sesiones');
  assert.equal(whereFor('asrs'), 'entre_sesiones');
  assert.equal(whereFor('tcc_abc'), 'entre_sesiones');
  assert.equal(whereFor('tcc_plan_seguridad'), 'entre_sesiones');
  assert.equal(whereFor('custom_demo'), 'entre_sesiones');

  assert.equal(whereFor('registro_inicial'), 'ficha');
  assert.equal(whereFor('motivo_consulta'), 'ficha');
  assert.equal(whereFor('diagnostico'), 'ficha');
  assert.equal(whereFor('nota_sesion'), 'ficha');
  assert.equal(whereFor('redes_apoyo'), 'ficha');
});

test('el selector no tiene cajón', () => {
  assert.equal(whereFor('selector_modulo'), null);
  assert.equal(whereFor(''), null);
});

test('el preview del selector nombra el cajón, no sustituye las 5 categorías', () => {
  const gad = previewHtml('gad7', { label: 'GAD-7', description: 'Escala.' }, null);
  assert.match(gad, /Entre sesiones/);
  assert.match(gad, /mod-info__where/);

  const nf = previewHtml('neurofeedback', { label: 'Neurofeedback', description: 'Sala.' }, null);
  assert.match(nf, /En sesión/);

  const nota = previewHtml('nota_sesion', { label: 'Nota de sesión', description: 'Ficha.' }, null);
  assert.match(nota, /Ficha/);

  const sel = previewHtml('selector_modulo', { label: 'Elegir módulo', description: 'x' }, null);
  assert.doesNotMatch(sel, /mod-info__where/);
});

function catHtml(html, id) {
  const start = html.indexOf(`data-function-cat="${id}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-function-cat="', start + 1);
  return html.slice(start, next < 0 ? html.length : next);
}

test('el índice por categoría agrupa por función clínica, no por En sesión / Entre / Ficha', () => {
  const sessions = [
    {
      id: 1,
      number: 1,
      modules: [
        { id: 10, module_type: 'registro_inicial', data: '{}' },
        { id: 11, module_type: 'gad7', data: '{}' },
        { id: 12, module_type: 'neurofeedback', data: '{}' },
        { id: 13, module_type: 'tcc_plan_seguridad', data: '{}' },
        { id: 14, module_type: 'selector_modulo', data: '{}' },
        { id: 15, module_type: 'tcc_activacion', data: '{}' },
      ],
    },
  ];
  const html = sidebarCategoryHtml(sessions, null, (type) => type, { treatmentId: 1 });

  assert.doesNotMatch(html, /data-where-id=/);
  assert.doesNotMatch(html, /En sesión/);
  assert.doesNotMatch(html, /Entre sesiones/);
  assert.doesNotMatch(html, /Ficha/);
  assert.doesNotMatch(html, /selector_modulo/);
  assert.match(html, /Conceptualización/);
  assert.match(html, /Pruebas psicométricas/);
  assert.match(html, /Habilidades y tareas/);
  assert.match(html, /Intervención en sesión/);

  const conceptualizacion = catHtml(html, 'conceptualizacion');
  const pruebas = catHtml(html, 'pruebas');
  const tcc = catHtml(html, 'tcc');
  const intervencion = catHtml(html, 'intervencion');

  assert.match(conceptualizacion, /registro_inicial/);
  assert.match(conceptualizacion, /tcc_plan_seguridad/);
  assert.doesNotMatch(conceptualizacion, /gad7/);

  assert.match(pruebas, /gad7/);
  assert.doesNotMatch(pruebas, /tcc_activacion/);

  assert.match(tcc, /tcc_activacion/);
  assert.doesNotMatch(tcc, /tcc_plan_seguridad/);

  assert.match(intervencion, /neurofeedback/);
  assert.doesNotMatch(intervencion, /gad7/);
  assert.match(html, /module-row--add/);
  assert.match(html, /module-done-dot--add/);
  assert.match(html, /Añadir módulo/);
  assert.doesNotMatch(html, /\+ Añadir módulo|\+ Agregar módulo/);
});

test('el centro cronológico solo trae la sesión activa', () => {
  const sessions = [
    { id: 1, modules: [{ id: 10, module_type: 'gad7' }] },
    { id: 2, modules: [{ id: 20, module_type: 'nota_sesion' }, { id: 21, module_type: 'asrs' }] },
  ];
  const one = sessionsForCenter(sessions, { indexMode: 'chrono', sessionId: 2 });
  assert.equal(one.length, 1);
  assert.equal(one[0].id, 2);
  assert.equal(one[0].modules.length, 2);

  const byModule = sessionsForCenter(sessions, { indexMode: 'chrono', moduleId: 10 });
  assert.equal(byModule[0].id, 1);

  const cats = sessionsForCenter(sessions, { indexMode: 'category', indexType: 'gad7' });
  assert.equal(cats.length, 1);
  assert.equal(cats[0].modules[0].module_type, 'gad7');
});
