import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSrc = readFileSync(new URL('../../src/js/views/workspace.js', import.meta.url), 'utf8');
const transitionsSrc = readFileSync(new URL('../../src/js/transitions.js', import.meta.url), 'utf8');
const editorSrc = readFileSync(new URL('../../src/js/views/module-editor.js', import.meta.url), 'utf8');

test('BOTONERA_TOOLTIPS usa copy pedido por Felipe', () => {
  assert.match(workspaceSrc, /print: 'Imprimir en PDF'/);
  assert.match(workspaceSrc, /share: 'Compartir con tus pacientes'/);
  assert.match(workspaceSrc, /swap: 'Cambiar módulo'/);
  assert.match(workspaceSrc, /remove: 'Remover módulo'/);
});

test('appendBotoneraCore usa data-tooltip vía setBotoneraTooltip', () => {
  assert.match(workspaceSrc, /function setBotoneraTooltip\(el, text\)/);
  assert.match(workspaceSrc, /el\.dataset\.tooltip = text/);
  assert.match(workspaceSrc, /setBotoneraTooltip\(printBtn, BOTONERA_TOOLTIPS\.print\)/);
  assert.match(workspaceSrc, /setBotoneraTooltip\(shareBtn, label\)/);
  assert.match(workspaceSrc, /setBotoneraTooltip\(swapBtn, BOTONERA_TOOLTIPS\.swap\)/);
  assert.match(workspaceSrc, /setBotoneraTooltip\(del, BOTONERA_TOOLTIPS\.remove\)/);
  assert.doesNotMatch(workspaceSrc, /printBtn\.title = /);
});

test('transitions posiciona tooltips de botonera debajo del botón', () => {
  assert.match(transitionsSrc, /botoneraBtn/);
  assert.match(transitionsSrc, /r\.bottom \+ gap/);
});

test('module-editor sim usa data-tooltip en la botonera', () => {
  assert.match(editorSrc, /data-tooltip="Imprimir en PDF"/);
  assert.match(editorSrc, /data-tooltip="Compartir con tus pacientes"/);
  assert.match(editorSrc, /data-tooltip="Remover módulo"/);
});
