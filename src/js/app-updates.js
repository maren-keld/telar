import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { toast } from './utils.js';
import { playOverlayOpen, animateAndRemove } from './transitions.js';

/** @type {{ version: string, notes?: string } | null} */
let pendingUpdate = null;
let startupPromptShown = false;
/** Last check error (e.g. latest.json 404) — not the same as “up to date”. */
let lastCheckError = null;

const LATER_KEY = 'telar.update.laterUntil';

export function getPendingUpdate() {
  return pendingUpdate;
}

export function getAppUpdateCheckError() {
  return lastCheckError;
}

function dismissedUntil() {
  try {
    const raw = Number(localStorage.getItem(LATER_KEY) || '0');
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function rememberLater(hours = 24) {
  try {
    localStorage.setItem(LATER_KEY, String(Date.now() + hours * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
}

/** Popup al abrir: «Hay una actualización disponible» · Más tarde / Descargar ahora. */
export function promptAppUpdate(info) {
  if (!info?.version) return;
  if (document.querySelector('.app-update-overlay')) return;
  if (Date.now() < dismissedUntil()) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop app-update-overlay';
  overlay.innerHTML = `
    <div class="modal-card app-update-modal" role="dialog" aria-labelledby="app-update-title">
      <h2 id="app-update-title" class="modal-card__title">Hay una actualización disponible</h2>
      <p class="app-update-modal__body">
        Telar <strong>${escapeAttr(info.version)}</strong> está lista.
        ${info.notes ? `<span class="app-update-modal__notes">${escapeAttr(info.notes)}</span>` : ''}
      </p>
      <div class="app-update-modal__actions">
        <button type="button" class="btn btn-secondary" data-update-later>Más tarde</button>
        <button type="button" class="btn btn-primary" data-update-now>Descargar ahora</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  playOverlayOpen(overlay);

  const close = () => {
    void animateAndRemove(overlay);
  };

  overlay.querySelector('[data-update-later]')?.addEventListener('click', () => {
    rememberLater(24);
    close();
  });
  overlay.querySelector('[data-update-now]')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('[data-update-now]');
    if (btn) btn.disabled = true;
    try {
      await installAppUpdate();
    } catch (err) {
      toast(err?.message || String(err));
      if (btn) btn.disabled = false;
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      rememberLater(6);
      close();
    }
  });
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      if (notify && !startupPromptShown) {
        startupPromptShown = true;
        promptAppUpdate(info);
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
