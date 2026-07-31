import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DEFAULTS, AI_MODE_ORDER } from '../../src/js/ai-config.js';
import { getApiTransferNotice, hasAiApiConsent, requireAiApiConsent } from '../../src/js/ai-consent.js';

test('AI default mode is off (no outbound data without user action)', () => {
  assert.equal(AI_DEFAULTS.aiMode, 'off');
});

test('UI lists off mode first', () => {
  assert.equal(AI_MODE_ORDER[0], 'off');
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
