import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { toast } from './utils.js';

/** @type {{ version: string, notes?: string } | null} */
let pendingUpdate = null;
let startupToastShown = false;
/** Last check error (e.g. latest.json 404) — not the same as “up to date”. */
let lastCheckError = null;

export function getPendingUpdate() {
  return pendingUpdate;
}

export function getAppUpdateCheckError() {
  return lastCheckError;
}

/**
 * @returns {Promise<{ version: string, notes?: string } | null>}
 * @throws {Error} when the updater endpoint fails (network / 404 / signing)
 */
export async function checkForAppUpdate({ notify = false } = {}) {
  if (!isTauriApp()) return null;
  lastCheckError = null;
  try {
    const info = await getInvoke()('check_app_update');
    if (info?.version) {
      pendingUpdate = info;
      if (notify && !startupToastShown) {
        startupToastShown = true;
        toast(`Actualización ${info.version} disponible`);
      }
      return info;
    }
    pendingUpdate = null;
    return null;
  } catch (err) {
    const message = err?.message || String(err);
    lastCheckError = message;
    console.warn('No se pudo comprobar actualizaciones:', err);
    throw new Error(message);
  }
}

export async function installAppUpdate() {
  if (!isTauriApp()) {
    throw new Error('Disponible solo en la app de escritorio');
  }
  toast('Descargando e instalando actualización…');
  await getInvoke()('install_app_update');
}

export function initAppUpdateChecker() {
  if (!isTauriApp()) return;

  const run = (notify) => {
    checkForAppUpdate({ notify })
      .then((info) => {
        document.dispatchEvent(new CustomEvent('app-update-status', { detail: info }));
      })
      .catch(() => {
        document.dispatchEvent(new CustomEvent('app-update-status', { detail: null }));
      });
  };

  run(true);
  window.setInterval(() => run(false), 6 * 60 * 60 * 1000);
}
