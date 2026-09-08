import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function source(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('el iframe de la experiencia queda dentro de la tarjeta, no como un segundo módulo', () => {
  const src = source('src/js/modules/interactive-html.js');
  const start = src.indexOf('host.innerHTML');
  const end = src.indexOf('const frame', start);
  const block = src.slice(start, end);
  const opens = (block.match(/<div/g) || []).length;
  const closes = (block.match(/<\/div>/g) || []).length;
  assert.equal(opens, closes);
  assert.match(block, /module-card-head[\s\S]*interactive-module__frame-wrap/);
});

test('generar con IA no reescribe el título del módulo', () => {
  const src = source('src/js/views/module-editor.js');
  assert.equal(src.includes('titleInput.value = prompt'), false);
  assert.equal(/#cm-title[\s\S]{0,80}prompt\.slice/.test(src), false);
});

test('el tab del editor se llama Asistente, sin título duplicado', () => {
  const src = source('src/js/views/module-editor.js');
  assert.match(src, /data-rail="chat"[^>]*>Asistente</);
  assert.doesNotMatch(src, />Chat IA</);
  assert.doesNotMatch(src, /cm-interactive-chat__head/);
});

test('la vista previa recarga con query, no solo con hash', () => {
  const editor = source('src/js/views/module-editor.js');
  const iframe = source('src/js/modules/interactive-html.js');
  assert.match(editor, /interactiveModuleUrl\(previewId\)\}\?r=\$\{previewRev\}/);
  assert.match(iframe, /interactiveModuleUrl\(contentId\)\}\?r=\$\{rev\}/);
  assert.doesNotMatch(editor, /#r\$\{previewRev\}/);
});
