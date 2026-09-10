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
  assert.equal(localStorage.getItem(`${REF_DOCS_DETACHED_PREFIX}12`), '[{"name":"nota.md"}]');
});

test('restore importa la clave y avisa si el automático queda pendiente', () => {
  const src = readFileSync(new URL('../../src/js/cloud-backup.js', import.meta.url), 'utf8');
  assert.match(src, /cloud_backup_import_identity/);
  assert.match(src, /cloudBackupRestoreNeedsSetup/);
  assert.match(src, /cloudBackupRestorePartial/);
  assert.match(src, /REF_DOCS_DETACHED_PREFIX/);
});

test('unlock y ajustes ofrecen restaurar sin Pro', () => {
  const unlock = readFileSync(new URL('../../src/js/views/unlock.js', import.meta.url), 'utf8');
  assert.match(unlock, /restoreCloudBackupFlow/);
  assert.match(unlock, /unlockRestoreBtn/);
  const settings = readFileSync(new URL('../../src/js/views/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /data-cloud-backup-restore/);
  assert.match(settings, /restoreCloudBackupFlow/);
});
