import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PENDING_SHARE_SQL,
  shareInfo,
  sharePollShouldRun,
  ensureGlobalShareSync,
  suspendShareSyncForDbChange,
  resumeShareSyncAfterDbChange,
  resetShareSyncForTests,
  setCountPendingSharesForTests,
  isSharePollRunningForTests,
  isShareSyncSuspendedForTests,
} from '../../src/js/share-sync.js';

test.afterEach(() => {
  resetShareSyncForTests();
});

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

test('collectShareResponse confirma el guardado antes de pedir el ack', () => {
  const src = readFileSync(new URL('../../src/js/share-sync.js', import.meta.url), 'utf8');
  const fnStart = src.indexOf('export async function collectShareResponse');
  const fnEnd = src.indexOf('const PENDING_SHARE_SELECT');
  const fn = src.slice(fnStart, fnEnd);
  const persistAt = fn.lastIndexOf('await syncModuleReadableText');
  const ackAt = fn.indexOf('await shareAckRequest');
  assert.ok(persistAt > -1 && ackAt > persistAt);
  assert.match(fn, /shareAckRequest\(share\.token/);
  assert.match(fn, /isShareSyncCurrent\(startedAt\)/);
  assert.match(src, /share_ack/);
  assert.match(src, /\/response\/ack/);
});

test('un countPendingShares tardío no arranca el poll después de suspender', async () => {
  let resolveCount;
  let first = true;
  setCountPendingSharesForTests(() => {
    if (!first) return 0;
    first = false;
    return new Promise((resolve) => {
      resolveCount = resolve;
    });
  });
  ensureGlobalShareSync();
  await suspendShareSyncForDbChange();
  resolveCount(4);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(isSharePollRunningForTests(), false);
  resumeShareSyncAfterDbChange();
});

test('el primer resume no levanta el poll si otro restore sigue con lease', async () => {
  setCountPendingSharesForTests(() => 3);
  await suspendShareSyncForDbChange();
  await suspendShareSyncForDbChange();
  resumeShareSyncAfterDbChange();
  assert.equal(isShareSyncSuspendedForTests(), true);
  ensureGlobalShareSync();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(isSharePollRunningForTests(), false);
  resumeShareSyncAfterDbChange();
  assert.equal(isShareSyncSuspendedForTests(), false);
});

test('después del setTimeout no consulta un enlace si la generación ya cambió', async () => {
  const src = readFileSync(new URL('../../src/js/share-sync.js', import.meta.url), 'utf8');
  const body = src
    .slice(src.indexOf('export async function syncPendingShares'), src.indexOf('let globalShareSyncStop'))
    .replace('export ', '');
  let checks = 0;
  let collectCalls = 0;
  const syncPendingShares = new Function(
    'isShareSyncSuspended',
    'shareSyncGeneration',
    'isShareSyncCurrent',
    'pendingShareModules',
    'collectShareResponse',
    `${body}\nreturn syncPendingShares;`,
  )(
    () => false,
    0,
    () => {
      checks += 1;
      return checks === 1;
    },
    async () => [{ id: 1, data: JSON.stringify({ share: { token: 'old', key: 'k', secret: 's' } }) }],
    async () => {
      collectCalls += 1;
      return { moduleId: 1 };
    },
  );
  const applied = await syncPendingShares();
  assert.deepEqual(applied, []);
  assert.equal(collectCalls, 0);
  assert.ok(checks >= 2);
});
