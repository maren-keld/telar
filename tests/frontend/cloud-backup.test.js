import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function memoryStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(i) {
      return [...store.keys()][i] ?? null;
    },
    getItem(k) {
      return store.has(String(k)) ? store.get(String(k)) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
  };
}

test('shouldRunAutoCloudBackup respects 24h interval', async () => {
  const { shouldRunAutoCloudBackup, AUTO_BACKUP_INTERVAL_MS } = await import('../../src/js/cloud-backup.js');
  const now = Date.parse('2026-07-31T12:00:00Z');
  const recent = new Date(now - AUTO_BACKUP_INTERVAL_MS + 60_000).toISOString();
  const old = new Date(now - AUTO_BACKUP_INTERVAL_MS - 1).toISOString();

  assert.equal(shouldRunAutoCloudBackup(null, now), true);
  assert.equal(shouldRunAutoCloudBackup(recent, now), false);
  assert.equal(shouldRunAutoCloudBackup(old, now), true);
});

test('shouldRunAutoCloudBackup treats invalid dates as due', async () => {
  const { shouldRunAutoCloudBackup } = await import('../../src/js/cloud-backup.js');
  assert.equal(shouldRunAutoCloudBackup('not-a-date', Date.now()), true);
});

test('isSyncedCloudFolder detecta carpetas sincronizadas', async () => {
  const { isSyncedCloudFolder } = await import('../../src/js/cloud-backup.js');
  const synced = [
    '/Users/ana/Google Drive/Telar',
    '/Users/ana/Library/CloudStorage/GoogleDrive-ana@gmail.com/My Drive/Telar',
    '/Users/ana/Library/CloudStorage/OneDrive-Personal/Telar',
    '/Users/ana/Dropbox',
    '/Users/ana/Dropbox/Telar/respaldos',
    '/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Telar',
    '/Users/ana/OneDrive - Clinica/Telar',
    'C:\\Users\\ana\\Dropbox\\Telar',
  ];
  for (const dir of synced) {
    assert.equal(isSyncedCloudFolder(dir), true, dir);
  }
});

test('isSyncedCloudFolder rechaza carpetas locales', async () => {
  const { isSyncedCloudFolder } = await import('../../src/js/cloud-backup.js');
  const local = [
    '/Users/ana/Desktop',
    '/Users/ana/Documents/Telar/respaldos',
    '/Users/ana/Downloads',
    '/Volumes/Disco externo/Telar',
    '',
    null,
    undefined,
  ];
  for (const dir of local) {
    assert.equal(isSyncedCloudFolder(dir), false, String(dir));
  }
});

test('scheduleAutoCloudBackup registra un interval de 15 min', async () => {
  const {
    scheduleAutoCloudBackup,
    stopAutoCloudBackupForTests,
    AUTO_BACKUP_POLL_MS,
  } = await import('../../src/js/cloud-backup.js');
  stopAutoCloudBackupForTests();
  const calls = [];
  const fake = (_fn, ms) => {
    calls.push(ms);
    return 99;
  };
  const first = scheduleAutoCloudBackup({ isTauri: true, setIntervalFn: fake });
  const second = scheduleAutoCloudBackup({ isTauri: true, setIntervalFn: fake });
  assert.equal(first, 99);
  assert.equal(second, 99);
  assert.deepEqual(calls, [AUTO_BACKUP_POLL_MS]);
  assert.equal(AUTO_BACKUP_POLL_MS, 15 * 60 * 1000);
  stopAutoCloudBackupForTests();
});

test('collectBackupAppState mete perfil y refDocs, sin tokens ni device id', async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem(
    'telar.practitioner',
    JSON.stringify({
      name: 'Ana',
      clinicCountry: 'CL',
      deviceId: 'should-omit',
      subscriptionAccessToken: 'tok',
    }),
  );
  localStorage.setItem('telar.refDocs.12', '[{"name":"nota.md"}]');
  localStorage.setItem('telar.subscriptionAccessToken', 'mp-token');
  localStorage.setItem('telar.deviceId', 'machine-id');
  const { collectBackupAppState } = await import('../../src/js/cloud-backup.js');
  const parsed = JSON.parse(collectBackupAppState());
  assert.equal(parsed.practitioner.name, 'Ana');
  assert.equal(parsed.practitioner.clinicCountry, 'CL');
  assert.equal(parsed.practitioner.deviceId, undefined);
  assert.equal(parsed.practitioner.subscriptionAccessToken, undefined);
  assert.equal(parsed.refDocs['telar.refDocs.12'], '[{"name":"nota.md"}]');
  assert.deepEqual(parsed.detachedRefDocs, {});
  assert.equal(JSON.stringify(parsed).includes('mp-token'), false);
  assert.equal(JSON.stringify(parsed).includes('machine-id'), false);
});

test('applyBackupAppState reescribe perfil y refDocs', async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem('telar.practitioner', JSON.stringify({ name: 'Vieja' }));
  localStorage.setItem('telar.refDocs.1', 'old');
  const { applyBackupAppState } = await import('../../src/js/cloud-backup.js');
  applyBackupAppState(
    JSON.stringify({
      version: 1,
      practitioner: { name: 'Nueva', clinicCountry: 'AR', deviceId: 'nope' },
      refDocs: { 'telar.refDocs.9': '[{"n":1}]' },
    }),
  );
  const profile = JSON.parse(localStorage.getItem('telar.practitioner'));
  assert.equal(profile.name, 'Nueva');
  assert.equal(profile.clinicCountry, 'AR');
  assert.equal(profile.deviceId, undefined);
  assert.equal(localStorage.getItem('telar.refDocs.1'), null);
  assert.equal(localStorage.getItem('telar.refDocs.9'), '[{"n":1}]');
});

test('applyBackupAppState no pisa la carpeta de respaldo de este computador', async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem(
    'telar.practitioner',
    JSON.stringify({
      name: 'Local',
      cloudBackupDestDir: '/Users/local/Telar',
      useTouchId: true,
      cloudBackupLastSuccessAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  const { applyBackupAppState } = await import('../../src/js/cloud-backup.js');
  applyBackupAppState(
    JSON.stringify({
      version: 1,
      practitioner: {
        name: 'Otra Mac',
        cloudBackupDestDir: '/Users/otramac/Library/CloudStorage/Telar',
        useTouchId: false,
        cloudBackupLastSuccessAt: '2026-09-01T00:00:00.000Z',
      },
      refDocs: {},
    }),
  );
  const profile = JSON.parse(localStorage.getItem('telar.practitioner'));
  assert.equal(profile.name, 'Otra Mac');
  assert.equal(profile.cloudBackupDestDir, '/Users/local/Telar');
  assert.equal(profile.useTouchId, true);
  assert.equal(profile.cloudBackupLastSuccessAt, '2026-01-01T00:00:00.000Z');
});

test('si falla el almacenamiento, applyBackupAppState restaura documentos y lanza', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem('telar.practitioner', JSON.stringify({ name: 'Vieja' }));
  storage.setItem('telar.refDocs.1', 'keep-me');
  const origSet = storage.setItem.bind(storage);
  storage.setItem = (k, v) => {
    if (k === 'telar.refDocs.9') throw new Error('quota');
    origSet(k, v);
  };
  const { applyBackupAppState } = await import('../../src/js/cloud-backup.js');
  assert.throws(
    () =>
      applyBackupAppState(
        JSON.stringify({
          version: 1,
          practitioner: { name: 'Nueva' },
          refDocs: { 'telar.refDocs.9': 'nuevo' },
        }),
      ),
    /quota/,
  );
  assert.equal(JSON.parse(localStorage.getItem('telar.practitioner')).name, 'Vieja');
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'keep-me');
  assert.equal(localStorage.getItem('telar.refDocs.9'), null);
});

test('respaldo viejo sin app-state aparta refDocs locales para no mezclar fichas', async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem('telar.refDocs.12', '[{"name":"nota.md"}]');
  const { applyBackupAppState, REF_DOCS_DETACHED_PREFIX } = await import('../../src/js/cloud-backup.js');
  const outcome = applyBackupAppState(null);
  assert.equal(outcome.hadAppState, false);
  assert.equal(outcome.detachedRefDocs, 1);
  assert.equal(localStorage.getItem('telar.refDocs.12'), null);
  const detached = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(REF_DOCS_DETACHED_PREFIX)) detached.push(key);
  }
  assert.equal(detached.length, 1);
  assert.match(detached[0], /^telar\.refDocsDetached\.[^.]+\.12$/);
  assert.equal(localStorage.getItem(detached[0]), '[{"name":"nota.md"}]');
});

test('dos restauraciones apartan documentos del mismo tratamiento sin pisarse', async () => {
  globalThis.localStorage = memoryStorage();
  const {
    applyBackupAppState,
    collectBackupAppState,
    REF_DOCS_DETACHED_PREFIX,
  } = await import('../../src/js/cloud-backup.js');
  localStorage.setItem('telar.refDocs.1', 'primero');
  applyBackupAppState(null);
  localStorage.setItem('telar.refDocs.1', 'segundo');
  applyBackupAppState(null);
  const detached = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(REF_DOCS_DETACHED_PREFIX)) detached.push(key);
  }
  assert.equal(detached.length, 2);
  const values = detached.map((k) => localStorage.getItem(k)).sort();
  assert.deepEqual(values, ['primero', 'segundo']);
  const parsed = JSON.parse(collectBackupAppState());
  assert.equal(Object.keys(parsed.detachedRefDocs).length, 2);
  assert.equal(parsed.detachedRefDocs[detached[0]], localStorage.getItem(detached[0]));
});

test('si falla el app-state tras restaurar la DB, no borra documentos que no pudo copiar', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem('telar.practitioner', JSON.stringify({ name: 'Vieja' }));
  storage.setItem('telar.refDocs.1', 'local-doc');
  const origSet = storage.setItem.bind(storage);
  storage.setItem = (k, v) => {
    if (k === 'telar.refDocs.9') throw new Error('quota');
    origSet(k, v);
  };
  const { applyBackupAppStateAfterDbRestore } = await import('../../src/js/cloud-backup.js');
  const outcome = applyBackupAppStateAfterDbRestore(
    JSON.stringify({
      version: 1,
      practitioner: { name: 'Nueva' },
      refDocs: { 'telar.refDocs.9': 'nuevo' },
    }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'local-doc');
  assert.equal(localStorage.getItem('telar.refDocs.9'), null);
});

test('cuota llena: no borra originales si también falla apartarlos', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem('telar.refDocs.1', 'local-doc');
  storage.setItem = () => {
    throw new Error('quota');
  };
  const {
    applyBackupAppStateAfterDbRestore,
    copyLiveRefDocsToDetached,
    REF_DOCS_DETACHED_PREFIX,
  } = await import('../../src/js/cloud-backup.js');
  assert.throws(() => copyLiveRefDocsToDetached(), /quota/);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'local-doc');
  const outcome = applyBackupAppStateAfterDbRestore(
    JSON.stringify({
      version: 1,
      practitioner: { name: 'Nueva' },
      refDocs: { 'telar.refDocs.9': 'nuevo' },
    }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'local-doc');
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    assert.equal(key && key.startsWith(REF_DOCS_DETACHED_PREFIX), false);
  }
});

test('apartar no borra vivos si la copia no entra', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem('telar.refDocs.1', 'local-doc');
  storage.setItem = () => {
    throw new Error('quota');
  };
  const { detachLocalRefDocs } = await import('../../src/js/cloud-backup.js');
  assert.throws(() => detachLocalRefDocs(), /quota/);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'local-doc');
});

test('si la copia se llena a mitad de camino, deshace lo escrito y deja los vivos', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem('telar.refDocs.1', 'uno');
  storage.setItem('telar.refDocs.2', 'dos');
  const origSet = storage.setItem.bind(storage);
  let detachedWrites = 0;
  storage.setItem = (k, v) => {
    if (String(k).startsWith('telar.refDocsDetached.')) {
      detachedWrites += 1;
      if (detachedWrites >= 2) throw new Error('quota');
    }
    origSet(k, v);
  };
  const { copyLiveRefDocsToDetached, REF_DOCS_DETACHED_PREFIX } = await import(
    '../../src/js/cloud-backup.js'
  );
  assert.throws(() => copyLiveRefDocsToDetached(), /quota/);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'uno');
  assert.equal(localStorage.getItem('telar.refDocs.2'), 'dos');
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    assert.equal(key && key.startsWith(REF_DOCS_DETACHED_PREFIX), false);
  }
});

test('copia los documentos vivos antes de quitarlos', async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem('telar.refDocs.1', 'local-doc');
  const {
    copyLiveRefDocsToDetached,
    dropCopiedLiveRefDocs,
    REF_DOCS_DETACHED_PREFIX,
  } = await import('../../src/js/cloud-backup.js');
  const copied = copyLiveRefDocsToDetached();
  assert.equal(copied.count, 1);
  assert.equal(localStorage.getItem('telar.refDocs.1'), 'local-doc');
  const dest = `${REF_DOCS_DETACHED_PREFIX}${copied.restoreId}.1`;
  assert.equal(localStorage.getItem(dest), 'local-doc');
  dropCopiedLiveRefDocs(copied.liveKeys);
  assert.equal(localStorage.getItem('telar.refDocs.1'), null);
  assert.equal(localStorage.getItem(dest), 'local-doc');
});

test('applyBackupAppState recupera documentos apartados del .age', async () => {
  globalThis.localStorage = memoryStorage();
  const { applyBackupAppState, REF_DOCS_DETACHED_PREFIX } = await import(
    '../../src/js/cloud-backup.js'
  );
  applyBackupAppState(
    JSON.stringify({
      version: 1,
      practitioner: { name: 'Ana' },
      refDocs: { 'telar.refDocs.3': 'vivo' },
      detachedRefDocs: {
        [`${REF_DOCS_DETACHED_PREFIX}abc.1`]: 'apartado-a',
      },
    }),
  );
  assert.equal(localStorage.getItem('telar.refDocs.3'), 'vivo');
  assert.equal(localStorage.getItem(`${REF_DOCS_DETACHED_PREFIX}abc.1`), 'apartado-a');
});

test('restore importa la clave y avisa si el automático queda pendiente', () => {
  const src = readFileSync(new URL('../../src/js/cloud-backup.js', import.meta.url), 'utf8');
  assert.match(src, /cloud_backup_import_identity/);
  assert.match(src, /cloudBackupRestoreNeedsSetup/);
  assert.match(src, /cloudBackupRestorePartial/);
  assert.match(src, /copyLiveRefDocsToDetached/);
  assert.match(src, /cloudBackupRestorePreserveFailed/);
  assert.match(src, /dropCopiedLiveRefDocs\(liveKeys\)/);
  assert.doesNotMatch(src, /preservedLiveKeys/);
  assert.doesNotMatch(src, /clearLiveRefDocsBestEffort/);
  const restoreWithKeyAt = src.indexOf('const restoreWithKey');
  const copyAt = src.indexOf('copyLiveRefDocsToDetached()', restoreWithKeyAt);
  const nativeAt = src.indexOf("invoke('cloud_backup_restore'", restoreWithKeyAt);
  assert.ok(copyAt > -1 && nativeAt > copyAt);
  assert.match(src.slice(restoreWithKeyAt), /let liveKeys = \[\]/);
  const finishAt = src.indexOf('const finishRestore');
  const dropAt = src.indexOf('dropCopiedLiveRefDocs(liveKeys)', finishAt);
  assert.ok(dropAt > -1 && dropAt < restoreWithKeyAt);
  assert.match(src.slice(finishAt, restoreWithKeyAt), /finishRestore = async \(result, recoveryKey = recoveryKeyUsed, liveKeys = \[\]\)/);
  assert.match(src.slice(restoreWithKeyAt), /finishRestore\(result, recoveryKey, liveKeys\)/);
  const resetAt = src.indexOf('resetCustomModulesCache()', finishAt);
  const reloadAt = src.indexOf('ensureCustomModulesLoaded()', finishAt);
  assert.ok(resetAt > -1 && reloadAt > resetAt);
  assert.match(src, /invalidateClinicalAlertCache/);
  const suspendAt = src.indexOf('await suspendShareSyncForDbChange()', restoreWithKeyAt);
  assert.ok(suspendAt > -1 && suspendAt < nativeAt);
  assert.match(src, /finally \{\s*resumeShareSyncAfterDbChange\(\);\s*ensureGlobalShareSync\(\);/s);
});

test('unlock y ajustes ofrecen restaurar sin Pro', () => {
  const unlock = readFileSync(new URL('../../src/js/views/unlock.js', import.meta.url), 'utf8');
  assert.match(unlock, /restoreCloudBackupFlow/);
  assert.match(unlock, /unlockRestoreBtn/);
  const settings = readFileSync(new URL('../../src/js/views/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /data-cloud-backup-restore/);
  assert.match(settings, /restoreCloudBackupFlow/);
});

test('QA-004: versión del unlock centrada en hero (no hereda text-align:left)', () => {
  const hero = readFileSync(new URL('../../src/css/unlock-hero.css', import.meta.url), 'utf8');
  const base = readFileSync(new URL('../../src/css/components.css', import.meta.url), 'utf8');
  assert.match(hero, /\.initial-screen--hero\s+#unlockInner\s*\{[^}]*text-align:\s*left/s);
  assert.match(hero, /\.initial-screen--hero\s+\.unlock-page__build\s*\{[^}]*text-align:\s*center/s);
  assert.match(base, /\.unlock-page__build\s*\{[^}]*text-align:\s*center/s);
});
