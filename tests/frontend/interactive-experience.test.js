import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureInteractiveCloseable,
  extractInteractiveHtml,
  unwrapInteractiveDocument,
} from '../../src/js/interactive-experience.js';

test('extrae bloque html con vallas', () => {
  const html = extractInteractiveHtml('Listo.\n```html\n<button>Azul</button>\n```');
  assert.equal(html, '<button>Azul</button>');
});

test('acepta html suelto o valla sin cerrar', () => {
  assert.match(extractInteractiveHtml('<div class="card"><button>Ok</button></div>'), /button/);
  assert.match(
    extractInteractiveHtml('```html\n<style>body{color:red}</style><section>Hola'),
    /<section>Hola/,
  );
});

test('no toma un JSON por experiencia', () => {
  assert.equal(extractInteractiveHtml('```json\n{"title":"x"}\n```'), '');
});

test('inyecta cierre si falta Telar.done', () => {
  const html = ensureInteractiveCloseable('<div><button id="c1">Rojo</button></div>');
  assert.match(html, /Telar\.done/);
  assert.match(html, /telar-finish/);
  const already = ensureInteractiveCloseable('<script>Telar.done("ok")</script>');
  assert.equal(already.includes('telar-finish'), false);
});

test('el cierre no queda después de </html> (Mistral a veces omite </body>)', () => {
  const html = ensureInteractiveCloseable(`<!doctype html>
<html><head><style>.card{color:blue}</style></head>
<body>
<p>Respira</p>
</html>`);
  assert.equal(html.includes('</html>'), false);
  assert.match(html, /<style>\.card\{color:blue\}<\/style>/);
  assert.match(html, /telar-finish/);
  const cssIndex = html.indexOf('.telar-closebar{');
  const htmlClose = html.lastIndexOf('</html>');
  assert.ok(cssIndex >= 0);
  assert.equal(htmlClose, -1);
});

test('cierra un <style> que Mistral dejó abierto', () => {
  const html = ensureInteractiveCloseable('<style>.x{color:red}\n<div>Hola</div>');
  assert.match(html, /<\/style>/);
  assert.match(html, /<div>Hola<\/div>/);
});

test('conserva scripts del <head> al unwrap (si no, Siguiente no hace nada)', () => {
  const html = unwrapInteractiveDocument(`<!doctype html>
<html><head>
<style>.step{color:red}</style>
<script>function next(){window.__moved=1}</script>
</head>
<body>
<div class="step">uno</div>
<button onclick="next()">Siguiente</button>
</body></html>`);
  assert.match(html, /function next\(\)/);
  assert.match(html, /<style>\.step\{color:red\}<\/style>/);
  assert.match(html, /onclick="next\(\)"/);
  assert.equal(html.includes('<html'), false);
});
