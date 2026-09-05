import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DEFAULTS, AI_LOCAL_MODELS, AI_MODE_ORDER, AI_MODES, resolveAiConfig, telarProvisionsMistral } from '../../src/js/ai-config.js';
import { getApiTransferNotice, hasAiApiConsent, requireAiApiConsent } from '../../src/js/ai-consent.js';

test('AI default mode is cloud Mistral (consent still required before send)', () => {
  assert.equal(AI_DEFAULTS.aiMode, 'api');
  assert.equal(AI_DEFAULTS.aiApiProvider, 'mistral');
});

test('UI lists cloud first; local is not the recommended option', () => {
  assert.equal(AI_MODE_ORDER[0], 'api');
  assert.match(AI_MODES.api.label, /recomendad/i);
  assert.doesNotMatch(AI_MODES.local.label, /recomendado/i);
  assert.match(AI_MODES.local.description, /peor/i);
});

test('el aviso de corte de listado vive en Qwen 2.5 3B, no en el modo', () => {
  const qwen3 = AI_LOCAL_MODELS.find((m) => m.id === 'qwen2.5-3b-instruct-q4');
  assert.match(qwen3?.caution || '', /cortar el listado/i);
  assert.doesNotMatch(AI_MODES.local.description, /cortar el listado/i);
});

test('Qwen 2.5 3B ya no se marca como modelo recomendado', () => {
  const qwen3 = AI_LOCAL_MODELS.find((m) => m.id === 'qwen2.5-3b-instruct-q4');
  assert.equal(qwen3?.recommended, false);
  assert.doesNotMatch(qwen3?.label || '', /recomendado/i);
  const qwen7 = AI_LOCAL_MODELS.find((m) => m.id === 'qwen2.5-7b-instruct-q4');
  assert.notEqual(qwen7?.recommended, true);
  assert.match(qwen7?.caution || '', /más lento/i);
});

test('hasAiApiConsent requires persisted timestamp', () => {
  assert.equal(hasAiApiConsent({}), false);
  assert.equal(hasAiApiConsent({ aiApiConsentAt: '' }), false);
  assert.equal(hasAiApiConsent({ aiApiConsentAt: '2026-07-30T12:00:00.000Z' }), true);
});

test('requireAiApiConsent throws when missing consent', () => {
  assert.throws(() => requireAiApiConsent({}), /transferencia/i);
});

test('Mistral no lleva clave en el perfil; Telar la provisiona', () => {
  assert.equal(telarProvisionsMistral(), true);
  assert.equal(AI_DEFAULTS.aiApiKey, '');
  const cfg = resolveAiConfig({ aiMode: 'api', aiApiProvider: 'mistral', aiApiKey: 'sk-should-ignore' });
  assert.equal(cfg.apiKey, '');
  assert.equal(cfg.providerId, 'mistral');
});

test('getApiTransferNotice includes provider and data categories', () => {
  const notice = getApiTransferNotice({ aiApiProvider: 'mistral' });
  assert.match(notice.provider, /Mistral/i);
  assert.match(notice.serverCountry, /Francia/i);
  assert.ok(notice.dataSent.length >= 4);
  assert.match(notice.legalNote, /19\.628/);
});
