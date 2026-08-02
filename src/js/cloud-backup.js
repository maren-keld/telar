import { openBackupInfoModal } from './components/backup-info-modal.js';
import { openBackupRecoveryKeyModal } from './components/backup-recovery-key-modal.js';
import { openConfirmModal } from './components/confirm-modal.js';
import { openPinModal } from './components/pin-modal.js';
import { openSubscribeProModal } from './components/subscribe-pro-modal.js';
import { query } from './db.js';
import { isProUser, loadProfile, saveProfile } from './profile.js';
import { getInvoke, isTauriApp, pickBackupFile, pickBackupFolder } from './tauri-bridge.js';
import { t, tf } from './i18n.js';
import { toast } from './utils.js';

/** @typedef {'idle'|'not_configured'|'active'|'backing_up'|'error'|'folder_missing'} CloudBackupStatus */

/** Intervalo mínimo entre respaldos automáticos (24 h). */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let backingUp = false;
let autoBackupInFlight = false;

/** @param {string|null|undefined} lastBackupAt ISO timestamp */
export function shouldRunAutoCloudBackup(lastBackupAt, nowMs = Date.now()) {
  if (!lastBackupAt) return true;
  const t = new Date(lastBackupAt).getTime();
  if (Number.isNaN(t)) return true;
  return nowMs - t >= AUTO_BACKUP_INTERVAL_MS;
}

function isSilentBackupSkipError(message) {
  const msg = String(message || '');
  return (
    /no existe|no accesible|not accessible|ENOENT|no such file|cannot find/i.test(msg) ||
    /bloqueada|locked|DB bloqueada/i.test(msg)
  );
}

function noteBackupSuccess(createdAt) {
  saveCloudBackupConfig({
    cloudBackupLastError: '',
    cloudBackupLastSuccessAt: createdAt || new Date().toISOString(),
  });
}

export function getCloudBackupConfig() {
  const p = loadProfile();
  return {
    destDir: String(p.cloudBackupDestDir || '').trim(),
    lastError: String(p.cloudBackupLastError || '').trim(),
  };
}

export function saveCloudBackupConfig(patch) {
  saveProfile(patch);
}

/** Respaldos activos si el toggle está ON (migra perfiles con carpeta ya configurada). */
export function isCloudBackupEnabled() {
  const p = loadProfile();
  if (typeof p.cloudBackupEnabled === 'boolean') return p.cloudBackupEnabled;
  return Boolean(String(p.cloudBackupDestDir || '').trim());
}

function shortenPath(dir) {
  const home = /^\/Users\/[^/]+/;
  return String(dir || '').replace(home, '~');
}

/** Carpetas que un cliente de sincronización sube a la nube del propio usuario. */
const SYNCED_FOLDER_PATTERNS = [
  /\/Google ?Drive([ -][^/]*)?(\/|$)/i,
  /\/My Drive(\/|$)/i,
  /\/Library\/CloudStorage\//i,
  /\/Dropbox([ -][^/]*)?(\/|$)/i,
  /\/OneDrive([ -][^/]*)?(\/|$)/i,
  /\/Library\/Mobile Documents(\/|$)/i,
  /\/iCloud ?Drive(\/|$)/i,
  /\/pCloud Drive(\/|$)/i,
  /\/MEGA(sync)?(\/|$)/i,
  /\/Box(\/|$)/i,
];

/**
 * ¿La carpeta elegida se sincroniza a alguna nube? Si no, el respaldo nunca
 * sale del computador y hay que advertirlo.
 * @param {string} dir
 */
export function isSyncedCloudFolder(dir) {
  const path = String(dir || '')
    .trim()
    .replace(/\\/g, '/');
  if (!path) return false;
  return SYNCED_FOLDER_PATTERNS.some((re) => re.test(path));
}

/**
 * Pide una carpeta y, si no está sincronizada, avisa y ofrece elegir otra.
 * @returns {Promise<string|null>}
 */
async function pickBackupFolderChecked() {
  for (;;) {
    const picked = await pickBackupFolder(t('settings.cloudBackupPickFolder'));
    if (!picked) return null;
    if (isSyncedCloudFolder(picked)) return picked;
    // Botón primario = la opción segura; cerrar el modal conserva lo que ya eligió.
    const pickAnother = await openConfirmModal({
      title: t('settings.cloudBackupNotSyncedTitle'),
      message: t('settings.cloudBackupNotSyncedMessage'),
      confirmLabel: t('settings.cloudBackupNotSyncedPickOther'),
      cancelLabel: t('settings.cloudBackupNotSyncedUseAnyway'),
      danger: false,
    });
    if (!pickAnother) return picked;
  }
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n || Number.isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBackupDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * @returns {Promise<{ status: CloudBackupStatus, subtitle: string, hasIdentity: boolean, destDir: string, folderStatus: object|null }>}
 */
export async function fetchCloudBackupState() {
  const { destDir, lastError } = getCloudBackupConfig();
  const enabled = isCloudBackupEnabled();
  if (!isTauriApp()) {
    return {
      status: 'idle',
      subtitle: t('settings.cloudBackupDesktopOnly'),
      hasIdentity: false,
      destDir,
      enabled,
      folderStatus: null,
    };
  }

  let hasIdentity = false;
  try {
    hasIdentity = await getInvoke()('cloud_backup_has_identity');
  } catch {
    hasIdentity = false;
  }

  if (!enabled) {
    return {
      status: 'disabled',
      subtitle: t('settings.cloudBackupDisabled'),
      hasIdentity,
      destDir,
      enabled,
      folderStatus: null,
    };
  }

  if (backingUp) {
    return {
      status: 'backing_up',
      subtitle: t('settings.cloudBackupBackingUp'),
      hasIdentity,
      destDir,
      enabled,
      folderStatus: null,
    };
  }

  if (!hasIdentity || !destDir) {
    return {
      status: 'not_configured',
      subtitle: t('settings.cloudBackupNotConfigured'),
      hasIdentity,
      destDir,
      enabled,
      folderStatus: null,
    };
  }

  let folderStatus = null;
  try {
    folderStatus = await getInvoke()('cloud_backup_folder_status_cmd', { destDir });
  } catch {
    folderStatus = { accessible: false };
  }

  if (!folderStatus?.accessible) {
    return {
      status: 'folder_missing',
      subtitle: t('settings.cloudBackupFolderMissing'),
      hasIdentity,
      destDir,
      enabled,
      folderStatus,
    };
  }

  if (lastError) {
    return {
      status: 'error',
      subtitle: lastError,
      hasIdentity,
      destDir,
      enabled,
      folderStatus,
    };
  }

  const when = formatBackupDate(folderStatus.last_backup_at);
  const size = formatBytes(folderStatus.last_backup_bytes);
  const fileName = folderStatus.last_backup_name || '';
  const pathShort = shortenPath(destDir);
  let subtitle;
  if (fileName && when && size) {
    subtitle = tf('settings.cloudBackupActiveDetail', { path: pathShort, file: fileName, when, size });
  } else if (pathShort) {
    subtitle = tf('settings.cloudBackupActivePath', { path: pathShort });
  } else if (when && size) {
    subtitle = tf('settings.cloudBackupActive', { when, size });
  } else {
    subtitle = t('settings.cloudBackupActiveEmpty');
  }

  const localOnly = !isSyncedCloudFolder(destDir);
  if (localOnly) subtitle = `${subtitle} · ${t('settings.cloudBackupLocalOnlyWarn')}`;

  return {
    status: 'active',
    subtitle,
    hasIdentity,
    destDir,
    enabled,
    folderStatus,
    localOnly,
  };
}

export async function activateCloudBackup() {
  const invoke = getInvoke();
  const { destDir: existingDest } = getCloudBackupConfig();

  let hasIdentity = false;
  try {
    hasIdentity = await invoke('cloud_backup_has_identity');
  } catch {
    hasIdentity = false;
  }

  if (!hasIdentity) {
    if (existingDest) {
      const recoveryKey = await promptRecoveryKey();
      if (!recoveryKey) return false;
      try {
        await invoke('cloud_backup_import_identity', { recoveryKey });
      } catch (err) {
        toast(err?.message || String(err));
        return false;
      }
    } else {
      let recoveryKey = null;
      try {
        recoveryKey = await invoke('cloud_backup_setup_identity');
      } catch (err) {
        toast(err?.message || String(err));
        return false;
      }

      const acknowledged = await openBackupRecoveryKeyModal({ recoveryKey });
      if (!acknowledged) {
        toast(t('settings.cloudBackupNeedKeyConfirm'));
        return false;
      }
    }
  }

  const destDir = existingDest || (await pickBackupFolderChecked());
  if (!destDir) {
    toast(t('settings.cloudBackupFolderRequired'));
    return false;
  }

  saveCloudBackupConfig({ cloudBackupDestDir: destDir, cloudBackupEnabled: true, cloudBackupLastError: '' });

  try {
    backingUp = true;
    const result = await invoke('cloud_backup_create', { destDir });
    noteBackupSuccess(result?.created_at);
    if (result?.skipped_duplicate) {
      toast(t('settings.cloudBackupNoChanges'));
    } else {
      toast(existingDest ? t('settings.cloudBackupOk') : t('settings.cloudBackupFirstOk'));
    }
    return true;
  } catch (err) {
    saveCloudBackupConfig({ cloudBackupLastError: err?.message || String(err) });
    toast(err?.message || String(err));
    return false;
  } finally {
    backingUp = false;
  }
}

export async function runManualCloudBackup(destDir) {
  const invoke = getInvoke();
  backingUp = true;
  try {
    const result = await invoke('cloud_backup_create', { destDir });
    noteBackupSuccess(result?.created_at);
    if (result?.skipped_duplicate) {
      toast(t('settings.cloudBackupNoChanges'));
    } else {
      toast(t('settings.cloudBackupOk'));
    }
    return true;
  } catch (err) {
    const msg = err?.message || String(err);
    saveCloudBackupConfig({ cloudBackupLastError: msg });
    toast(msg);
    return false;
  } finally {
    backingUp = false;
  }
}

/**
 * Respaldo automático al desbloquear (24 h). Omite en silencio si la carpeta no está disponible.
 */
export async function maybeAutoCloudBackup() {
  if (!isTauriApp() || !isProUser() || !isCloudBackupEnabled() || backingUp || autoBackupInFlight) return;

  const { destDir } = getCloudBackupConfig();
  if (!destDir) return;

  let hasIdentity = false;
  try {
    hasIdentity = await getInvoke()('cloud_backup_has_identity');
  } catch {
    return;
  }
  if (!hasIdentity) return;

  let folderStatus = null;
  try {
    folderStatus = await getInvoke()('cloud_backup_folder_status_cmd', { destDir });
  } catch {
    return;
  }
  if (!folderStatus?.accessible) return;

  const profile = loadProfile();
  const lastAt = folderStatus.last_backup_at || profile.cloudBackupLastSuccessAt || null;
  if (!shouldRunAutoCloudBackup(lastAt)) return;

  autoBackupInFlight = true;
  backingUp = true;
  try {
    const result = await getInvoke()('cloud_backup_create', { destDir });
    noteBackupSuccess(result?.created_at);
  } catch (err) {
    const msg = err?.message || String(err);
    if (isSilentBackupSkipError(msg)) return;
    saveCloudBackupConfig({ cloudBackupLastError: msg });
  } finally {
    backingUp = false;
    autoBackupInFlight = false;
  }
}

export function scheduleAutoCloudBackup() {
  if (!isTauriApp()) return;
  queueMicrotask(() => {
    maybeAutoCloudBackup().catch(() => {});
  });
}

async function getLocalPatientCount() {
  try {
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM patients');
    return Number(n) || 0;
  } catch {
    return 0;
  }
}

export async function restoreCloudBackupFlow({ destDir } = {}) {
  const invoke = getInvoke();
  const backupPath = await pickBackupFile(t('settings.cloudBackupPickRestore'));
  if (!backupPath) return false;

  let preview;
  try {
    preview = await invoke('cloud_backup_preview', { backupPath, recoveryKey: null });
  } catch (err) {
    const msg = err?.message || String(err);
    const needsKey = /recuperación|recovery|incorrecta/i.test(msg);
    if (!needsKey) {
      toast(msg);
      return false;
    }
    const recoveryKey = await promptRecoveryKey();
    if (!recoveryKey) return false;
    try {
      preview = await invoke('cloud_backup_preview', { backupPath, recoveryKey });
    } catch (err2) {
      toast(err2?.message || String(err2));
      return false;
    }
  }

  const localPatients = await getLocalPatientCount();
  const backupDate = formatBackupDate(preview.created_at);
  const ok = await openConfirmModal({
    title: t('settings.cloudBackupRestoreTitle'),
    message: tf('settings.cloudBackupRestoreConfirm', {
      localPatients,
      backupPatients: preview.patient_count,
      backupDate,
    }),
    confirmLabel: t('settings.cloudBackupRestoreAction'),
    cancelLabel: t('settings.cancel'),
    danger: true,
  });
  if (!ok) return false;

  return new Promise((resolve) => {
    openPinModal({
      title: t('settings.cloudBackupRestorePin'),
      submitLabel: t('settings.cloudBackupRestoreAction'),
      onSubmit: async (pin) => {
        try {
          await invoke('cloud_backup_restore', { backupPath, pin, recoveryKey: null });
          saveCloudBackupConfig({ cloudBackupLastError: '' });
          if (destDir) {
            /* carpeta destino conservada */
          }
          toast(t('settings.cloudBackupRestoreOk'));
          resolve(true);
        } catch (err) {
          const msg = err?.message || String(err);
          if (/recuperación|recovery|incorrecta/i.test(msg)) {
            const recoveryKey = await promptRecoveryKey();
            if (!recoveryKey) {
              resolve(false);
              return;
            }
            await invoke('cloud_backup_restore', { backupPath, pin, recoveryKey });
            toast(t('settings.cloudBackupRestoreOk'));
            resolve(true);
            return;
          }
          toast(msg);
          resolve(false);
        }
      },
      onCancel: () => resolve(false),
    });
  });
}

function promptRecoveryKey() {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-labelledby="recovery-input-title">
          <h2 id="recovery-input-title" class="modal-card__title">${t('settings.cloudBackupRecoveryPromptTitle')}</h2>
          <p class="confirm-modal__message">${t('settings.cloudBackupRecoveryPrompt')}</p>
          <textarea id="recovery-key-input" class="input backup-recovery-input" rows="3" spellcheck="false" autocomplete="off"></textarea>
          <div class="modal-card__actions">
            <button type="button" class="btn btn-secondary" data-cancel>${t('settings.cancel')}</button>
            <button type="button" class="btn btn-primary" data-confirm>${t('settings.cloudBackupContinue')}</button>
          </div>
        </div>
      </div>`;
    const close = (val) => {
      root.innerHTML = '';
      resolve(val);
    };
    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
    root.querySelector('[data-confirm]')?.addEventListener('click', () => {
      const val = root.querySelector('#recovery-key-input')?.value?.trim();
      if (!val) return;
      close(val);
    });
    root.querySelector('#recovery-key-input')?.focus();
  });
}

export async function openCloudBackupActionsModal(state, { onChanged } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card cloud-backup-actions-modal" role="dialog" aria-labelledby="cba-title">
        <header class="cloud-backup-actions-modal__head">
          <h2 id="cba-title" class="modal-card__title">${t('settings.cloudBackup')}</h2>
          <button type="button" class="modal-close" data-cancel aria-label="${t('settings.cancel')}">×</button>
        </header>
        <p class="cloud-backup-actions-modal__path">${state.destDir || ''}</p>
        <div class="cloud-backup-actions-modal__actions">
          <button type="button" class="btn btn-primary btn-block" data-backup-now>${t('settings.cloudBackupNow')}</button>
          <button type="button" class="btn btn-secondary btn-block" data-restore>${t('settings.cloudBackupRestoreFromFile')}</button>
          <button type="button" class="btn btn-ghost btn-block" data-change-folder>${t('settings.cloudBackupChangeFolder')}</button>
          <button type="button" class="btn btn-ghost btn-block" data-info>${t('settings.cloudBackupHowItWorks')}</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelector('[data-cancel]')?.addEventListener('click', close);
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  root.querySelector('[data-info]')?.addEventListener('click', () => openBackupInfoModal());

  root.querySelector('[data-backup-now]')?.addEventListener('click', async () => {
    close();
    await runManualCloudBackup(state.destDir);
    onChanged?.();
  });

  root.querySelector('[data-restore]')?.addEventListener('click', async () => {
    close();
    const ok = await restoreCloudBackupFlow({ destDir: state.destDir });
    if (ok) onChanged?.();
  });

  root.querySelector('[data-change-folder]')?.addEventListener('click', async () => {
    const picked = await pickBackupFolderChecked();
    if (!picked) return;
    saveCloudBackupConfig({ cloudBackupDestDir: picked, cloudBackupLastError: '' });
    toast(t('settings.cloudBackupFolderUpdated'));
    close();
    onChanged?.();
  });
}

export function bindCloudBackupInfoLink(container) {
  container.querySelector('[data-cloud-backup-info]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBackupInfoModal();
  });
}

export async function handleCloudBackupToggleChange(wantedOn, state, { onChanged } = {}) {
  if (!isProUser()) {
    openSubscribeProModal({ onSubscribed: onChanged });
    return false;
  }
  if (!isTauriApp()) {
    toast(t('settings.cloudBackupDesktopOnly'));
    return false;
  }

  if (!wantedOn) {
    saveCloudBackupConfig({ cloudBackupEnabled: false, cloudBackupLastError: '' });
    toast(t('settings.cloudBackupTurnedOff'));
    onChanged?.();
    return true;
  }

  if (state.hasIdentity && state.destDir && state.status !== 'not_configured') {
    saveCloudBackupConfig({ cloudBackupEnabled: true, cloudBackupLastError: '' });
    toast(t('settings.cloudBackupTurnedOn'));
    onChanged?.();
    return true;
  }

  const ok = await activateCloudBackup();
  if (ok) onChanged?.();
  return ok;
}

export async function handleCloudBackupManage(state, { onChanged } = {}) {
  if (!isProUser()) {
    openSubscribeProModal({ onSubscribed: onChanged });
    return;
  }
  if (!isTauriApp()) {
    toast(t('settings.cloudBackupDesktopOnly'));
    return;
  }

  if (state.status === 'not_configured') {
    const ok = await activateCloudBackup();
    if (ok) onChanged?.();
    return;
  }

  await openCloudBackupActionsModal(state, { onChanged });
}

export { openBackupInfoModal };
