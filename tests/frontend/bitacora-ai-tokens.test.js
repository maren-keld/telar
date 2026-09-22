import test from 'node:test';
import assert from 'node:assert/strict';
import { bitacoraMaxTokens } from '../../src/js/bitacora-ai-tokens.js';
import { AI_QUICK_PROMPTS } from '../../src/js/ai-actions.js';

test('bitacoraMaxTokens sube el techo para análisis y programa', () => {
  const analisis = AI_QUICK_PROMPTS.find((p) => p.id === 'analisis').prompt;
  const programa = AI_QUICK_PROMPTS.find((p) => p.id === 'programa').prompt;
  assert.equal(bitacoraMaxTokens(analisis, { local: false }), 4000);
  assert.equal(bitacoraMaxTokens(programa, { local: true }), 3200);
});

test('bitacoraMaxTokens deja más margen que el cap anterior para preguntas cortas', () => {
  assert.equal(bitacoraMaxTokens('¿Cómo va el caso?', { local: false }), 2800);
  assert.equal(bitacoraMaxTokens('¿Cómo va el caso?', { local: true }), 2000);
});
