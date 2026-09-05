/**
 * Latido de uso anónimo — alimenta el panel privado de telarapp.cl/panel.
 *
 * Qué se envía: un id de dispositivo aleatorio (generado local, sin relación con
 * el profesional ni con pacientes), versión de app, plataforma, plan y si la
 * ventana está en primer plano. Nunca datos clínicos, nombre, email ni IP.
 * Se apaga entero con el toggle «Contador anónimo de uso» de Ajustes.
 */
import { APP_VERSION } from './app-version.js';
import { SUBSCRIPTION_API_PRODUCTION } from './subscription-config.js';
import { loadProfile } from './profile.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';

const DEVICE_ID_KEY = 'telar.deviceId';
/** El panel considera «en línea» un dispositivo visto hace menos de 3 min. */
const HEARTBEAT_MS = 60_000;

let heartbeatTimer = null;
let started = false;
let pingInFlight = false;

function apiBase() {
  return (SUBSCRIPTION_API_PRODUCTION || '').replace(/\/$/, '');
}

/** Id opaco y estable por instalación. Si no hay storage, no se envía nada. */
export function getTelarDeviceId() {
  return deviceId();
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function platform() {
  const raw = `${navigator.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (raw.includes('mac')) return 'macos';
  if (raw.includes('win')) return 'windows';
  if (raw.includes('linux')) return 'linux';
  return 'other';
}

function optedOut() {
  try {
    return Boolean(loadProfile().usagePingOptOut);
  } catch {
    return false;
  }
}

async function sendPing(reason) {
  const base = apiBase();
  const id = deviceId();
  if (!base || !id || optedOut()) return;
  if (pingInFlight) return;
  pingInFlight = true;

  try {
    await getInvoke()('usage_ping', {
      apiBase: base,
      payload: {
        device_id: id,
        app_version: APP_VERSION,
        platform: platform(),
        plan: loadProfile().plan === 'pro' ? 'pro' : 'demo',
        active: !document.hidden,
        reason,
      },
    });
  } catch (err) {
    // Render free duerme tras 15 min: el primer ping del día puede fallar por
    // arranque en frío. El POST corre en un hilo de Rust y vuelve al instante.
    console.debug('[usage-ping]', err?.message || err);
  } finally {
    pingInFlight = false;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (optedOut()) {
      stopHeartbeat();
      return;
    }
    // Solo latimos con la ventana visible: el panel mide uso real, no procesos abiertos.
    if (!document.hidden) sendPing('heartbeat');
  }, HEARTBEAT_MS);
}

export async function maybeSendUsagePing() {
  if (!isTauriApp() || started) return;
  started = true;

  void sendPing('open');
  startHeartbeat();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !optedOut()) sendPing('focus');
  });
}
