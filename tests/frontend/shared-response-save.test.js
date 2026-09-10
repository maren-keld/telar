import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createModuleSaveCoordinator, STALE_SHARED_RESPONSE } from '../../src/js/module-save-coordinator.js';
import { bindAutoSave, flushPendingAutoSaves, resetAutoSaveHandlesForTests } from '../../src/js/autobind.js';
import { mergeModuleReadable, finishModuleSave } from '../../src/js/readable-text.js';

function fixture() {
  let row = { id: 1, module_type: 'gad7', status: 'pendiente', data: JSON.stringify({
    answers: [], share: { token: 'synthetic', secret: 'synthetic' },
  }) };
  let beforeWrite = async () => {};
  const save = createModuleSaveCoordinator({
    read: async () => structuredClone(row),
    merge: mergeModuleReadable,
    write: async (id, data, status) => {
      await beforeWrite();
      row = { ...row, data: JSON.stringify(data), status };
    },
    finish: finishModuleSave,
  });
  return {
    save,
    read: () => structuredClone(row),
    beforeWrite: (fn) => {
      beforeWrite = fn;
    },
    replaceRow: (next) => {
      row = next;
    },
  };
}

const response = { answers: [3, 3, 3, 3, 3, 3, 3], share: null, share_answered_at: '2026-09-10T12:00:00Z' };
test.afterEach(resetAutoSaveHandlesForTests);

test('a pending form cannot overwrite a received response or resurrect its link during repaint', async () => {
  const f = fixture();
  const mounted = f.read();
  const root = { isConnected: true, addEventListener() {} };
  const pending = bindAutoSave(root, () => f.save(mounted, { answers: [0] }), { debounceMs: 60000 });
  pending();
  await f.save(f.read(), response, 'completado');
  await flushPendingAutoSaves();
  await flushPendingAutoSaves();
  const saved = JSON.parse(f.read().data);
  assert.deepEqual(saved.answers, response.answers);
  assert.equal(saved.share, null);
  // Reopening with the current row allows intentional subsequent edits.
  await f.save(f.read(), { answers: [1, 1, 1, 1, 1, 1, 1] });
  assert.equal(JSON.parse(f.read().data).answers[0], 1);
});

test('a local write queued during the response write sees the committed revision', async () => {
  const f = fixture();
  const mounted = f.read();
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  f.beforeWrite(async () => { entered(); await blocked; });
  const incoming = f.save(f.read(), response);
  await started;
  const local = f.save(mounted, { answers: [0] });
  const rejected = assert.rejects(local, { code: STALE_SHARED_RESPONSE });
  release();
  await incoming;
  await rejected;
  assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
});

test('failed response persistence does not advance the revision and can be retried', async () => {
  const f = fixture();
  const mounted = f.read();
  f.beforeWrite(async () => { throw new Error('disk full'); });
  await assert.rejects(f.save(mounted, response), /disk full/);
  assert.equal(JSON.parse(mounted.data).share_answered_at, undefined);
  assert.equal(JSON.parse(f.read().data).share.token, 'synthetic');
  f.beforeWrite(async () => {});
  await f.save(mounted, response);
  assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
});

test('ordinary writes from different forms merge with the latest saved metadata', async () => {
  const f = fixture();
  const a = f.read();
  const b = f.read();
  await Promise.all([f.save(a, { first: 'a' }), f.save(b, { second: 'b' })]);
  const saved = JSON.parse(f.read().data);
  assert.equal(saved.first, 'a');
  assert.equal(saved.second, 'b');
});

// Execute the actual collector with an isolated DB and transport. No patient
// data, native application or remote server is used by these regressions.
function collector(f, ack, extras = {}) {
  const source = readFileSync(new URL('../../src/js/share-sync.js', import.meta.url), 'utf8');
  const body = source
    .slice(source.indexOf('export async function collectShareResponse'), source.indexOf('const PENDING_SHARE_SELECT'))
    .replace('export ', '');
  return new Function(
    'parseJsonSafe',
    'shareCollectRequest',
    'getModule',
    'syncModuleReadableText',
    'decryptShare',
    'shareContextFor',
    'patchFromResponse',
    'shareAckRequest',
    'moduleLabelFor',
    'flushPendingAutoSaves',
    'isShareSyncSuspended',
    'shareSyncGeneration',
    'isShareSyncCurrent',
    'shareCollectJobs',
    `${body}\nreturn collectShareResponse;`,
  )(
    JSON.parse,
    extras.shareCollectRequest ||
      (async () => ({
        status: 200,
        body: { answered: true, response_ct: 'synthetic', answered_at: response.share_answered_at },
      })),
    async () => f.read(),
    f.save,
    async () => ({ answers: response.answers }),
    async () => ({}),
    (_, decoded) => decoded,
    ack,
    () => 'GAD7',
    flushPendingAutoSaves,
    extras.isShareSyncSuspended || (() => extras.shareSyncSuspended ?? false),
    extras.shareSyncGeneration ?? 0,
    extras.isShareSyncCurrent || (() => true),
    extras.shareCollectJobs || { add() {}, delete() {} },
  );
}

test('collector flushes pending edits and only acknowledges the durably saved response', async () => {
  const f = fixture();
  const mounted = f.read();
  const root = { isConnected: true, addEventListener() {} };
  let localSaved = false;
  const pending = bindAutoSave(root, async () => {
    await f.save(mounted, { answers: [0] });
    localSaved = true;
  }, { debounceMs: 60000 });
  pending();
  let acknowledged = false;
  await collector(f, async () => {
    assert.equal(localSaved, true);
    assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
    acknowledged = true;
    // A late event from the old form must not undo the committed response.
    pending();
  })(f.read());
  await flushPendingAutoSaves();
  assert.equal(acknowledged, true);
  assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
  assert.equal(JSON.parse(f.read().data).share, null);
});

test('collector never acknowledges a response whose local write fails', async () => {
  const f = fixture();
  let acknowledged = false;
  f.beforeWrite(async () => { throw new Error('disk full'); });
  await assert.rejects(collector(f, async () => { acknowledged = true; })(f.read()), /disk full/);
  assert.equal(acknowledged, false);
  assert.equal(JSON.parse(f.read().data).share.token, 'synthetic');
});

test('waitUntilIdle no cede hasta que termina un write pausado; entonces se puede cambiar de base', async () => {
  const f = fixture();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  f.beforeWrite(async () => {
    entered();
    await blocked;
  });
  const writing = f.save(f.read(), response);
  await started;
  let idleDone = false;
  const idle = f.save.waitUntilIdle().then(() => {
    idleDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(idleDone, false);
  release();
  await writing;
  await idle;
  assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
  f.replaceRow({
    id: 1,
    module_type: 'gad7',
    status: 'pendiente',
    data: JSON.stringify({ answers: ['restored-db'] }),
  });
  assert.equal(JSON.parse(f.read().data).answers[0], 'restored-db');
});

test('collect en cola termina en la base vieja; la nueva no se toca ni hay ack si no se guardó', async () => {
  const f = fixture();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  f.beforeWrite(async () => {
    entered();
    await blocked;
  });
  let acknowledged = false;
  const collecting = collector(f, async () => {
    acknowledged = true;
  })(f.read());
  await started;
  let idleDone = false;
  const idle = f.save.waitUntilIdle().then(() => {
    idleDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(idleDone, false);
  assert.equal(acknowledged, false);
  release();
  await collecting;
  await idle;
  assert.equal(acknowledged, true);
  assert.deepEqual(JSON.parse(f.read().data).answers, response.answers);
  f.replaceRow({
    id: 1,
    module_type: 'gad7',
    status: 'pendiente',
    data: JSON.stringify({ answers: ['restored-db'], share: { token: 'other' } }),
  });
  assert.equal(JSON.parse(f.read().data).answers[0], 'restored-db');
  assert.equal(JSON.parse(f.read().data).share.token, 'other');
});

test('410 en cola no limpia share en la base nueva', async () => {
  const f = fixture();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  f.beforeWrite(async () => {
    entered();
    await blocked;
  });
  const collecting = collector(f, async () => {}, {
    shareCollectRequest: async () => ({ status: 410, body: { gone: true } }),
  })(f.read());
  await started;
  let idleDone = false;
  const idle = f.save.waitUntilIdle().then(() => {
    idleDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(idleDone, false);
  release();
  await collecting;
  await idle;
  assert.equal(JSON.parse(f.read().data).share, null);
  f.replaceRow({
    id: 1,
    module_type: 'gad7',
    status: 'pendiente',
    data: JSON.stringify({ share: { token: 'keep-me', secret: 's', key: 'k' } }),
  });
  assert.equal(JSON.parse(f.read().data).share.token, 'keep-me');
});

test('si la generación ya cambió, collect no persiste ni confirma', async () => {
  const f = fixture();
  let acknowledged = false;
  const applied = await collector(f, async () => {
    acknowledged = true;
  }, { shareSyncSuspended: true })(f.read());
  assert.equal(applied, null);
  assert.equal(acknowledged, false);
  assert.equal(JSON.parse(f.read().data).share.token, 'synthetic');
});

test('si la generación ya cambió, el 410 no borra el share local', async () => {
  const f = fixture();
  await collector(f, async () => {}, {
    shareSyncSuspended: true,
    shareCollectRequest: async () => ({ status: 410, body: { gone: true } }),
  })(f.read());
  assert.equal(JSON.parse(f.read().data).share.token, 'synthetic');
});

test('410 de un token viejo no borra el enlace distinto de la base restaurada', async () => {
  const f = fixture();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const oldRow = f.read();
  const collecting = collector(f, async () => {}, {
    shareCollectRequest: async () => {
      entered();
      await blocked;
      return { status: 410, body: { gone: true } };
    },
  })(oldRow);
  await started;
  f.replaceRow({
    id: 1,
    module_type: 'gad7',
    status: 'pendiente',
    data: JSON.stringify({
      share: { token: 'restored-token', secret: 's', key: 'k'.repeat(32) },
    }),
  });
  release();
  await collecting;
  assert.equal(JSON.parse(f.read().data).share.token, 'restored-token');
});

