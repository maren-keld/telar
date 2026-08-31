import assert from 'node:assert/strict';
import test from 'node:test';

test('fileVault copy is in settings and backup privacy text', async () => {
  if (!globalThis.localStorage) {
    const values = new Map();
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
  }
  const { t } = await import('../../src/js/i18n.js');
  assert.match(t('settings.fileVaultHint'), /FileVault/);
  assert.match(t('settings.fileVaultHint'), /BitLocker/);
  assert.match(t('settings.cloudBackupInfoPrivacy'), /FileVault/);
  assert.match(t('settings.cloudBackupInfoPrivacy'), /BitLocker/);
});
