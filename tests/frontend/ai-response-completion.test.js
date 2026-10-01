import test from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion, createAiRequest } from '../../src/js/ai-client.js';

const profile = { aiMode: 'api', aiApiProvider: 'custom', aiApiBase: 'https://example.test/v1', aiApiModel: 'test' };
const messages = [{ role: 'user', content: 'Analiza el caso' }];
const response = (content, finish_reason) => ({ choices: [{ message: { content }, finish_reason }] });

test('reintenta el texto completo con más espacio cuando el proveedor señala un corte', async () => {
  const calls = [];
  global.window = { __TAURI__: { core: { invoke: async (_, payload) => {
    calls.push({ ...payload });
    return calls.length === 1 ? response('1. **Aplic', 'length') : response('1. Aplicar la evaluación.', 'stop');
  } } } };
  const result = await chatCompletion({ profile, messages, maxTokens: 4096, completeResponse: true });
  assert.equal(result.text, '1. Aplicar la evaluación.');
  assert.deepEqual(calls.map(x => x.maxTokens), [4096, 8192]);
  assert.ok(calls.every(x => x.messages === messages));
});

test('no guarda una respuesta que sigue cortada después de los reintentos', async () => {
  const limits = [];
  global.window = { __TAURI__: { core: { invoke: async (_, payload) => {
    limits.push(payload.maxTokens);
    return response('Aplic', 'length');
  } } } };
  await assert.rejects(chatCompletion({ profile, messages, maxTokens: 4096, completeResponse: true }), /preguntas más breves/);
  assert.deepEqual(limits, [4096, 8192, 16384]);
});

test('cancelar durante una respuesta cortada evita el reintento', async () => {
  const request = createAiRequest();
  let calls = 0;
  global.window = { __TAURI__: { core: { invoke: async () => {
    calls += 1;
    request.aborted = true;
    return response('Aplic', 'length');
  } } } };
  await assert.rejects(chatCompletion({ profile, messages, request, completeResponse: true }), /cancelado/);
  assert.equal(calls, 1);
});
