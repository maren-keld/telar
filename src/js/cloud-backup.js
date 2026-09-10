import { openBackupInfoModal } from './components/backup-info-modal.js';
import { openBackupRecoveryKeyModal } from './components/backup-recovery-key-modal.js';
import { openConfirmModal } from './components/confirm-modal.js';
import { openPinModal } from './components/pin-modal.js';
import { openSubscribeProModal } from './components/subscribe-pro-modal.js';
import { query, invalidateClinicalAlertCache } from './db.js';
import { ensureCustomModulesLoaded, resetCustomModulesCache } from './custom-modules.js';
import { ensureGlobalShareSync, resumeShareSyncAfterDbChange, suspendShareSyncForDbChange } from './share-sync.js';
import { applyPresentationMode, applyTheme, isProUser, loadProfile, saveProfile } from './profile.js';
import { getInvoke, isTauriApp, pickBackupFile, pickBackupFolder } from './tauri-bridge.js';
import { t, tf } from './i18n.js';
import { toast } from './utils.js';

/** @typedef {'idle'|'not_configured'|'active'|'backing_up'|'error'|'folder_missing'} CloudBackupStatus */

/** Intervalo mínimo entre respaldos automáticos **exitosos** (24 h). */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Mientras la app sigue abierta, reintenta carpeta ausente ~cada 15 min. */
export const AUTO_BACKUP_POLL_MS = 15 * 60 * 1000;

const PRACTITIONER_KEY = 'telar.practitioner';
const REF_DOCS_PREFIX = 'telar.refDocs.';
/** Documentos locales apartados al restaurar un .age viejo (sin app-state). */
export const REF_DOCS_DETACHED_PREFIX = 'telar.refDocsDetached.';
const APP_STATE_OMIT = new Set([
  'subscriptionAccessToken',
  'deviceId',
  'mpAccessToken',
  'access_token',
]);
/** Rutas, huella y timestamps de este computador: no se aplican desde un .age ajeno. */
const MACHINE_LOCAL_PROFILE_KEYS = [
  'cloudBackupDestDir',
  'useTouchId',
  'cloudBackupLastSuccessAt',
  'cloudBackupLastError',
];

let backingUp = false;
let autoBackupInFlight = false;
let autoBackupPollTimer = null;

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

function sanitizePractitioner(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next = { ...raw };
  for (const key of APP_STATE_OMIT) delete next[key];
  return next;
}

function readStorageKeys(prefix) {
  const out = {};
  try {
    const storage = globalThis.localStorage;
    if (!storage) return out;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) {
        out[key] = storage.getItem(key);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function restoreStorageSnapshot(prefix, snapshot) {
  const storage = globalThis.localStorage;
  if (!storage) return;
  const current = readStorageKeys(prefix);
  for (const key of Object.keys(current)) {
    if (!(key in snapshot)) storage.removeItem(key);
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

let detachedRestoreSeq = 0;

function newDetachedRestoreId(nowMs = Date.now(), rand = Math.random()) {
  detachedRestoreSeq += 1;
  return `${Number(nowMs).toString(36)}-${detachedRestoreSeq.toString(36)}-${Math.floor(Number(rand) * 1e9).toString(36)}`;
}

function detachedKeyFor(restoreId, suffix) {
  return `${REF_DOCS_DETACHED_PREFIX}${restoreId}.${suffix}`;
}

function normalizeDetachedMap(raw) {
  const next = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(REF_DOCS_DETACHED_PREFIX) && typeof value === 'string') {
      next[key] = value;
    }
  }
  return next;
}

function readAllDetachedRefDocs() {
  return readStorageKeys(REF_DOCS_DETACHED_PREFIX);
}

function mergeDetachedRefDocs(incoming) {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('No hay almacenamiento local');
  const previous = readAllDetachedRefDocs();
  const next = normalizeDetachedMap(incoming);
  const written = [];
  try {
    for (const [key, value] of Object.entries(next)) {
      storage.setItem(key, value);
      written.push(key);
    }
  } catch (err) {
    for (const key of written) {
      if (!(key in previous)) {
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
    }
    restoreStorageSnapshot(REF_DOCS_DETACHED_PREFIX, previous);
    throw err;
  }
}

/**
 * Copia durable de los documentos vivos. No borra los originales.
 * Si no hay espacio, lanza y deja todo como estaba.
 */
export function copyLiveRefDocsToDetached({ restoreId } = {}) {
  const storage = globalThis.localStorage;
  const live = readAllRefDocs();
  const liveKeys = Object.keys(live);
  if (!liveKeys.length) return { restoreId: restoreId || '', count: 0, liveKeys: [] };
  if (!storage) throw new Error('No hay almacenamiento local');
  const id = restoreId || newDetachedRestoreId();
  const written = [];
  try {
    for (const key of liveKeys) {
      const dest = detachedKeyFor(id, key.slice(REF_DOCS_PREFIX.length));
      const value = live[key] ?? '';
      storage.setItem(dest, value);
      if (storage.getItem(dest) !== value) {
        throw new Error('No se pudo conservar una copia de los documentos locales.');
      }
      written.push(dest);
    }
  } catch (err) {
    for (const dest of written) {
      try {
        storage.removeItem(dest);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
  return { restoreId: id, count: liveKeys.length, liveKeys };
}

/** Quita las claves vivas recién copiadas. Solo después de una copia verificada. */
export function dropCopiedLiveRefDocs(liveKeys) {
  const storage = globalThis.localStorage;
  if (!storage || !liveKeys?.length) return;
  for (const key of liveKeys) {
    storage.removeItem(key);
  }
}

/** Aparta refDocs vivos (copia verificada y recién entonces borra). */
export function detachLocalRefDocs({ restoreId } = {}) {
  const copied = copyLiveRefDocsToDetached({ restoreId });
  dropCopiedLiveRefDocs(copied.liveKeys);
  return copied.count;
}

function readAllRefDocs() {
  return readStorageKeys(REF_DOCS_PREFIX);
}

function normalizeRefDocsMap(raw) {
  const next = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(REF_DOCS_PREFIX) && typeof value === 'string') {
      next[key] = value;
    }
  }
  return next;
}

/** Escribe los recuperados y recién entonces quita los que sobran. Si falla, restaura el snapshot. */
function replaceRefDocs(nextRefDocs) {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('No hay almacenamiento local');
  const previous = readAllRefDocs();
  const next = normalizeRefDocsMap(nextRefDocs);
  try {
    for (const [key, value] of Object.entries(next)) {
      storage.setItem(key, value);
    }
    for (const key of Object.keys(previous)) {
      if (!(key in next)) storage.removeItem(key);
    }
  } catch (err) {
    restoreStorageSnapshot(REF_DOCS_PREFIX, previous);
    throw err;
  }
}

function applyPractitionerFromBackup(incoming) {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('No hay almacenamiento local');
  const previous = storage.getItem(PRACTITIONER_KEY);
  const patched = { ...incoming };
  for (const key of MACHINE_LOCAL_PROFILE_KEYS) delete patched[key];
  const next = sanitizePractitioner({ ...loadProfile(), ...patched });
  try {
    storage.setItem(PRACTITIONER_KEY, JSON.stringify(next));
    try {
      applyTheme(Boolean(next.darkMode));
      applyPresentationMode(Boolean(next.presentationMode));
    } catch {
      /* sin DOM (tests) */
    }
  } catch (err) {
    if (previous == null) storage.removeItem(PRACTITIONER_KEY);
    else storage.setItem(PRACTITIONER_KEY, previous);
    throw err;
  }
}

/**
 * Aplica perfil + documentos del .age.
 * Sin app-state (respaldo viejo): aparta refDocs locales para no colgarlos de otras fichas.
 * Si el almacenamiento falla, restaura el estado anterior y lanza.
 */
export function applyBackupAppState(raw) {
  if (raw == null || raw === '') {
    return { hadAppState: false, detachedRefDocs: detachLocalRefDocs() };
  }
  let parsed = raw;
  try {
    if (typeof raw === 'string') parsed = JSON.parse(raw);
  } catch {
    return { hadAppState: false, detachedRefDocs: detachLocalRefDocs() };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { hadAppState: false, detachedRefDocs: detachLocalRefDocs() };
  }

  const practitionerSnapshot = globalThis.localStorage?.getItem(PRACTITIONER_KEY) ?? null;
  const refDocsSnapshot = readAllRefDocs();
  const detachedSnapshot = readAllDetachedRefDocs();
  try {
    if (parsed.practitioner && typeof parsed.practitioner === 'object') {
      applyPractitionerFromBackup(parsed.practitioner);
    }
    let detachedRefDocs = 0;
    if ('refDocs' in parsed && parsed.refDocs && typeof parsed.refDocs === 'object') {
      replaceRefDocs(parsed.refDocs);
    } else {
      detachedRefDocs = detachLocalRefDocs();
    }
    if ('detachedRefDocs' in parsed && parsed.detachedRefDocs && typeof parsed.detachedRefDocs === 'object') {
      mergeDetachedRefDocs(parsed.detachedRefDocs);
    }
    return { hadAppState: true, detachedRefDocs };
  } catch (err) {
    if (practitionerSnapshot == null) localStorage.removeItem(PRACTITIONER_KEY);
    else localStorage.setItem(PRACTITIONER_KEY, practitionerSnapshot);
    restoreStorageSnapshot(REF_DOCS_PREFIX, refDocsSnapshot);
    restoreStorageSnapshot(REF_DOCS_DETACHED_PREFIX, detachedSnapshot);
    throw err;
  }
}

/**
 * Tras instalar la DB restaurada: aplica perfil/documentos del .age.
 * Si falla, no borra lo que no pudo copiar. `ok: false` = no continuar.
 */
export function applyBackupAppStateAfterDbRestore(raw) {
  try {
    const outcome = applyBackupAppState(raw);
    return {
      ok: true,
      hadAppState: Boolean(outcome?.hadAppState),
      detachedRefDocs: Number(outcome?.detachedRefDocs) || 0,
    };
  } catch {
    return { ok: false, hadAppState: false, detachedRefDocs: 0 };
  }
}

/** Perfil (sin tokens MP / device id) + documentos de referencia para el `.age`. */
export function collectBackupAppState() {
  return JSON.stringify({
    version: 1,
    practitioner: sanitizePractitioner(loadProfile()),
    refDocs: readAllRefDocs(),
    detachedRefDocs: readAllDetachedRefDocs(),
  });
}

function backupAppStateArg() {
  try {
    return collectBackupAppState();
  } catch {
    return null;
  }
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

async function startFreshBackupIdentity({ warnLostFiles = true } = {}) {
  if (warnLostFiles) {
    const ok = await openConfirmModal({
      title: t('settings.cloudBackupForgotTitle'),
      message: t('settings.cloudBackupForgotMessage'),
      confirmLabel: t('settings.cloudBackupForgotConfirm'),
      cancelLabel: t('settings.cancel'),
      danger: true,
    });
    if (!ok) return false;
  }

  try {
    const recoveryKey = await getInvoke()('cloud_backup_setup_identity');
    const acknowledged = await openBackupRecoveryKeyModal({ recoveryKey });
    if (!acknowledged) {
      toast(t('settings.cloudBackupNeedKeyConfirm'));
      return false;
    }
    return true;
  } catch (err) {
    toast(err?.message || String(err));
    return false;
  }
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
      const result = await promptRecoveryKey({ allowForgot: true });
      if (result?.forgot) {
        const ok = await startFreshBackupIdentity({ warnLostFiles: true });
        if (!ok) return false;
      } else if (result?.key) {
        try {
          await invoke('cloud_backup_import_identity', { recoveryKey: result.key });
        } catch (err) {
          toast(err?.message || String(err));
          return false;
        }
      } else {
        return false;
      }
    } else {
      const ok = await startFreshBackupIdentity({ warnLostFiles: false });
      if (!ok) return false;
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
    const result = await invoke('cloud_backup_create', { destDir, appState: backupAppStateArg() });
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
    const result = await invoke('cloud_backup_create', { destDir, appState: backupAppStateArg() });
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
 * Respaldo automático: 24 h entre éxitos. Si la carpeta no está, el siguiente
 * tick (~15 min) reintenta. No afirma que iCloud/Drive ya subieron el archivo.
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
    const result = await getInvoke()('cloud_backup_create', { destDir, appState: backupAppStateArg() });
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

export function scheduleAutoCloudBackup({
  isTauri = isTauriApp(),
  intervalMs = AUTO_BACKUP_POLL_MS,
  setIntervalFn = globalThis.setInterval?.bind(globalThis),
} = {}) {
  if (!isTauri) return null;
  queueMicrotask(() => {
    maybeAutoCloudBackup().catch(() => {});
  });
  if (autoBackupPollTimer != null) return autoBackupPollTimer;
  if (typeof setIntervalFn !== 'function') return null;
  autoBackupPollTimer = setIntervalFn(() => {
    maybeAutoCloudBackup().catch(() => {});
  }, intervalMs);
  return autoBackupPollTimer;
}

export function stopAutoCloudBackupForTests() {
  if (autoBackupPollTimer != null && typeof clearInterval === 'function') {
    clearInterval(autoBackupPollTimer);
  }
  autoBackupPollTimer = null;
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
  let recoveryKeyUsed = null;
  try {
    preview = await invoke('cloud_backup_preview', { backupPath, recoveryKey: null });
  } catch (err) {
    const msg = err?.message || String(err);
    const needsKey = /recuperación|recovery|incorrecta/i.test(msg);
    if (!needsKey) {
      toast(msg);
      return false;
    }
    const prompted = await promptRecoveryKey();
    if (!prompted?.key) return false;
    recoveryKeyUsed = prompted.key;
    try {
      preview = await invoke('cloud_backup_preview', { backupPath, recoveryKey: recoveryKeyUsed });
    } catch (err2) {
      toast(err2?.message || String(err2));
      return false;
    }
  }

  let hasLocalDb = false;
  try {
    const status = await invoke('db_status');
    hasLocalDb = Boolean(status?.encrypted_db_exists);
  } catch {
    hasLocalDb = false;
  }
  const localPatients = await getLocalPatientCount();
  const backupDate = formatBackupDate(preview.created_at);
  const confirmMessage = hasLocalDb
    ? tf('settings.cloudBackupRestoreConfirm', {
        localPatients,
        backupPatients: preview.patient_count,
        backupDate,
      })
    : tf('settings.cloudBackupRestoreConfirmEmpty', {
        backupPatients: preview.patient_count,
        backupDate,
      });
  const ok = await openConfirmModal({
    title: t('settings.cloudBackupRestoreTitle'),
    message: confirmMessage,
    confirmLabel: t('settings.cloudBackupRestoreAction'),
    cancelLabel: t('settings.cancel'),
    danger: true,
  });
  if (!ok) return false;

  const finishRestore = async (result, recoveryKey = recoveryKeyUsed, liveKeys = []) => {
    dropCopiedLiveRefDocs(liveKeys);
    resetCustomModulesCache();
    invalidateClinicalAlertCache();
    try {
      await ensureCustomModulesLoaded();
    } catch (e) {
      console.error(e);
    }
    const outcome = applyBackupAppStateAfterDbRestore(result?.app_state_json);
    const appStateOk = Boolean(outcome.ok);
    const hadAppState = Boolean(outcome.hadAppState);
    const detachedRefDocs = Number(outcome.detachedRefDocs) || 0;

    if (recoveryKey) {
      try {
        await invoke('cloud_backup_import_identity', { recoveryKey });
      } catch (e) {
        console.error(e);
      }
    }

    saveCloudBackupConfig({
      cloudBackupLastError: '',
      ...(destDir ? { cloudBackupDestDir: destDir } : {}),
    });

    if (!appStateOk) {
      toast(t('settings.cloudBackupRestorePartial'));
      return false;
    }

    let hasIdentity = false;
    try {
      hasIdentity = await invoke('cloud_backup_has_identity');
    } catch {
      hasIdentity = false;
    }
    const folder = String(destDir || getCloudBackupConfig().destDir || '').trim();
    let folderOk = false;
    if (folder) {
      try {
        const st = await invoke('cloud_backup_folder_status_cmd', { destDir: folder });
        folderOk = Boolean(st?.accessible);
      } catch {
        folderOk = false;
      }
    }
    const wantsBackup = isCloudBackupEnabled();
    const needsBackupSetup = wantsBackup && (!hasIdentity || !folderOk);

    const parts = [t('settings.cloudBackupRestoreOk')];
    if (!hadAppState && detachedRefDocs > 0) {
      parts.push(t('settings.cloudBackupRestoreDocsDetached'));
    }
    if (needsBackupSetup) {
      parts.push(t('settings.cloudBackupRestoreNeedsSetup'));
    }
    toast(parts.join(' '));
    return true;
  };

  return new Promise((resolve) => {
    openPinModal({
      title: t('settings.cloudBackupRestorePin'),
      submitLabel: t('settings.cloudBackupRestoreAction'),
      onSubmit: async (pin) => {
        const restoreWithKey = async (recoveryKey) => {
          let liveKeys = [];
          try {
            const copied = copyLiveRefDocsToDetached();
            liveKeys = copied.liveKeys;
          } catch {
            toast(t('settings.cloudBackupRestorePreserveFailed'));
            return false;
          }
          await suspendShareSyncForDbChange();
          try {
            const result = await invoke('cloud_backup_restore', {
              backupPath,
              pin,
              recoveryKey,
            });
            return Boolean(await finishRestore(result, recoveryKey, liveKeys));
          } finally {
            resumeShareSyncAfterDbChange();
            ensureGlobalShareSync();
          }
        };

        try {
          resolve(await restoreWithKey(recoveryKeyUsed));
        } catch (err) {
          const msg = err?.message || String(err);
          if (/recuperación|recovery|incorrecta/i.test(msg) && !recoveryKeyUsed) {
            const prompted = await promptRecoveryKey();
            if (!prompted?.key) {
              resolve(false);
              return;
            }
            try {
              resolve(await restoreWithKey(prompted.key));
            } catch (err2) {
              toast(err2?.message || String(err2));
              resolve(false);
            }
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

/**
 * @returns {Promise<{ key: string } | { forgot: true } | null>}
 */
function promptRecoveryKey({ allowForgot = false } = {}) {
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
          ${
            allowForgot
              ? `<button type="button" class="settings-inline-link backup-forgot-link" data-forgot>${t('settings.cloudBackupForgotKey')}</button>`
              : ''
          }
        </div>
      </div>`;
    const close = (val) => {
      root.innerHTML = '';
      resolve(val);
    };
    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
    root.querySelector('[data-forgot]')?.addEventListener('click', () => close({ forgot: true }));
    root.querySelector('[data-confirm]')?.addEventListener('click', () => {
      const val = root.querySelector('#recovery-key-input')?.value?.trim();
      if (!val) return;
      close({ key: val });
    });
    root.querySelector('#recovery-key-input')?.focus();
  });
}

/** Regenera la identidad de respaldo cuando se perdió la clave y activa copias nuevas. */
export async function handleForgotBackupKey({ onChanged } = {}) {
  if (!isProUser()) {
    openSubscribeProModal({ onSubscribed: onChanged });
    return false;
  }
  if (!isTauriApp()) {
    toast(t('settings.cloudBackupDesktopOnly'));
    return false;
  }
  const ok = await startFreshBackupIdentity({ warnLostFiles: true });
  if (!ok) return false;
  const activated = await activateCloudBackup();
  if (activated) onChanged?.();
  return activated;
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
          <button type="button" class="btn btn-ghost btn-block" data-forgot>${t('settings.cloudBackupForgotKey')}</button>
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

  root.querySelector('[data-forgot]')?.addEventListener('click', async () => {
    close();
    await handleForgotBackupKey({ onChanged });
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
