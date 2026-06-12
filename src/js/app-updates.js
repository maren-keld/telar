import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { toast } from './utils.js';

/** @type {{ version: string, notes?: string } | null} */
let pendingUpdate = null;
let startupToastShown = false;

export function getPendingUpdate() {
  return pendingUpdate;
}

export async function checkForAppUpdate({ notify = false } = {}) {
  if (!isTauriApp()) return null;
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
    console.warn('No se pudo comprobar actualizaciones:', err);
    return null;
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

  const run = () => {
    checkForAppUpdate({ notify: true }).then((info) => {
      document.dispatchEvent(new CustomEvent('app-update-status', { detail: info }));
    });
  };

  run();
  window.setInterval(() => {
    checkForAppUpdate({ notify: false }).then((info) => {
      document.dispatchEvent(new CustomEvent('app-update-status', { detail: info }));
    });
  }, 6 * 60 * 60 * 1000);
}
