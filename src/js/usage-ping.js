import { BUILD_STAMP_ISO } from './build-info.js';
import { loadProfile } from './profile.js';
import { getSubscriptionApiBase } from './subscription.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';

const LAST_PING_KEY = 'telar.usagePingLast';
import { APP_VERSION } from './app-version.js';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Ping anónimo al abrir (máx. 1/día). Respeta opt-out en perfil. */
export async function maybeSendUsagePing() {
  if (!isTauriApp()) return;
  const profile = loadProfile();
  if (profile.usagePingOptOut) return;

  const today = todayKey();
  try {
    if (localStorage.getItem(LAST_PING_KEY) === today) return;
  } catch {
    /* ignore */
  }

  try {
    const invoke = getInvoke();
    const apiBase = getSubscriptionApiBase();
    await invoke('usage_ping', { apiBase, appVersion: APP_VERSION });
    localStorage.setItem(LAST_PING_KEY, today);
  } catch (err) {
    console.debug('[usage-ping]', err?.message || err, BUILD_STAMP_ISO);
  }
}
