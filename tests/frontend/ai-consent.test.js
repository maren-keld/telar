import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DEFAULTS, AI_LOCAL_MODELS, AI_MODE_ORDER, AI_MODES } from '../../src/js/ai-config.js';
import { getApiTransferNotice, hasAiApiConsent, requireAiApiConsent } from '../../src/js/ai-consent.js';

test('AI default mode is off (no outbound data without user action)', () => {
  assert.equal(AI_DEFAULTS.aiMode, 'off');
});

test('UI lists off first; local is the recommended option', () => {
  assert.equal(AI_MODE_ORDER[0], 'off');
  assert.match(AI_MODES.local.label, /recomendado/i);
  assert.match(AI_MODES.local.description, /tarda más/i);
});

test('el aviso de corte de listado vive en Qwen 2.5 3B, no en el modo', () => {
  const qwen3 = AI_LOCAL_MODELS.find((m) => m.id === 'qwen2.5-3b-instruct-q4');
  assert.match(qwen3?.caution || '', /cortar el listado/i);
  assert.doesNotMatch(AI_MODES.local.description, /cortar el listado/i);
});

test('Qwen 2.5 7B dice recomendado una sola vez, en el badge', () => {
  const qwen7 = AI_LOCAL_MODELS.find((m) => m.id === 'qwen2.5-7b-instruct-q4');
  assert.equal(qwen7?.recommended, true);
  assert.doesNotMatch(qwen7?.label || '', /recomendado/i);
});

test('hasAiApiConsent requires persisted timestamp', () => {
  assert.equal(hasAiApiConsent({}), false);
  assert.equal(hasAiApiConsent({ aiApiConsentAt: '' }), false);
  assert.equal(hasAiApiConsent({ aiApiConsentAt: '2026-07-30T12:00:00.000Z' }), true);
});

test('requireAiApiConsent throws when missing consent', () => {
  assert.throws(() => requireAiApiConsent({}), /transferencia/i);
});

test('getApiTransferNotice includes provider and data categories', () => {
  const notice = getApiTransferNotice({ aiApiProvider: 'mistral' });
  assert.match(notice.provider, /Mistral/i);
  assert.match(notice.serverCountry, /Francia/i);
  assert.ok(notice.dataSent.length >= 4);
  assert.match(notice.legalNote, /19\.628/);
});
