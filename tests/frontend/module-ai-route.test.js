import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROK_REASONING_EFFORT,
  buildInteractiveEditUserMessage,
  buildQuestionnaireEditUserMessage,
  looksLikeInteractivePrompt,
  moduleAiPurpose,
  shouldUseGrokForModule,
  summarizeInteractiveHtml,
} from '../../src/js/module-ai-route.js';

test('el editor de módulos habla siempre con Grok', () => {
  assert.equal(GROK_REASONING_EFFORT, 'medium');
  assert.equal(looksLikeInteractivePrompt('un registro de pensamientos'), false);
  assert.equal(looksLikeInteractivePrompt('una tarjeta de respiración con botones'), true);

  assert.equal(shouldUseGrokForModule({ prompt: 'escala likert de 8 ítems' }), true);
  assert.equal(
    shouldUseGrokForModule({ prompt: 'una tarjeta de respiración con cuatro pasos' }),
    true,
  );
  assert.equal(
    shouldUseGrokForModule({
      kind: 'interactive',
      hasHtml: true,
      prompt: 'cámbiale el fondo a beige',
    }),
    true,
  );
  assert.equal(moduleAiPurpose({ prompt: 'ítems likert' }), 'modules');
  assert.equal(moduleAiPurpose({ prompt: 'experiencia con botones' }), 'modules');
});

test('el resumen de la experiencia no reenvía CSS ni JS', () => {
  const html = `<style>${'x'.repeat(2800)}</style>
    <div data-step="1"><h2>Respiración</h2><button>Siguiente</button></div>
    <script>${'y'.repeat(1800)}</script>`;
  const summary = summarizeInteractiveHtml(html);
  assert.match(summary, /Respiración/);
  assert.match(summary, /Siguiente/);
  assert.doesNotMatch(summary, /xxxx/);
  assert.doesNotMatch(summary, /yyyy/);
  assert.ok(summary.length < 1800);
});

test('el retoque de experiencia reenvía el HTML completo, con CSS', () => {
  const html = `<style>.box{background:#f5e6d3}</style>
    <div class="box" data-step="1"><h2>Respiración</h2><button>Siguiente</button></div>`;
  const msg = buildInteractiveEditUserMessage('el fondo beige', html);
  assert.match(msg, /el fondo beige/);
  assert.match(msg, /background:#f5e6d3/);
  assert.match(msg, /```html/);
});

test('el retoque de cuestionario manda los ítems, no HTML', () => {
  const msg = buildQuestionnaireEditUserMessage('quita el ítem 2', [
    { id: 'q1', text: 'Ánimo', type: 'scale', options: [] },
  ]);
  assert.match(msg, /quita el ítem 2/);
  assert.match(msg, /Ánimo/);
});
