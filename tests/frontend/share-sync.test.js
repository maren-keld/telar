import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PENDING_SHARE_SQL,
  shareInfo,
  sharePollShouldRun,
} from '../../src/js/share-sync.js';

test('shareInfo exige token y llave; share_answered_at solo no cuenta', () => {
  assert.equal(shareInfo({ share_answered_at: '2026-10-02T16:05:00.000Z' }), null);
  assert.equal(shareInfo({ share: { token: 'abc' } }), null);
  assert.equal(shareInfo({ share: { token: 'abc', key: 'k'.repeat(32) } })?.token, 'abc');
  assert.equal(
    shareInfo(JSON.stringify({ share: { token: 't1', key: 'secret-key-value-not-short' } }))?.token,
    't1',
  );
});

test('el poll no corre si no hay enlaces pendientes', () => {
  assert.equal(sharePollShouldRun(0), false);
  assert.equal(sharePollShouldRun(null), false);
  assert.equal(sharePollShouldRun(2), true);
});

test('el SQL de pendientes usa json_extract del token, no LIKE share', () => {
  assert.match(PENDING_SHARE_SQL, /json_extract/);
  assert.match(PENDING_SHARE_SQL, /\.share\.token/);
  assert.doesNotMatch(PENDING_SHARE_SQL, /LIKE/i);
});
