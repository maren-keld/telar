import assert from 'node:assert/strict';
import test from 'node:test';

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
