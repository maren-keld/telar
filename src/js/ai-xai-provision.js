/**
 * Grok (xAI) de Telar para experiencias interactivas.
 * La clave no va en el instalador: el servidor la entrega y queda en este computador.
 */
import { normalizeXaiApiKey } from './ai-config.js';
import { loadProfile } from './profile.js';
import { getSubscriptionApiBase } from './subscription.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { getTelarDeviceId } from './usage-ping.js';

let memoryKey = '';

export function peekProvisionedXaiKey() {
  return memoryKey;
}

export function clearProvisionedXaiKeyCache() {
  memoryKey = '';
}

async function loadStoredKey() {
  if (!isTauriApp()) return '';
  try {
    const key = await getInvoke()('ai_xai_key_load');
    return normalizeXaiApiKey(key);
  } catch {
    return '';
  }
}

async function storeKey(key) {
  const normalized = normalizeXaiApiKey(key);
  memoryKey = normalized;
  if (!isTauriApp()) return;
  await getInvoke()('ai_xai_key_store', { key: normalized });
}

async function requestProvisionedKey(profile = loadProfile()) {
  const email = String(profile.email || '').trim();
  const deviceId = getTelarDeviceId();
  if (!email.includes('@')) {
    throw new Error('Para activar Grok hace falta el correo del profesional (el del inicio).');
  }
  if (!deviceId) {
    throw new Error('No se pudo identificar esta instalación. Cierra Telar y ábrelo de nuevo.');
  }
  if (!isTauriApp()) {
    throw new Error('Grok se activa desde la app de escritorio.');
  }
  const apiBase = getSubscriptionApiBase();
  const data = await getInvoke()('xai_provision', {
    email,
    deviceId,
    apiBase,
  });
  const key = normalizeXaiApiKey(data?.api_key);
  if (!key) {
    throw new Error('El servidor no devolvió una clave de Grok.');
  }
  return key;
}

/** Clave lista para llamar a xAI. Pide una al servidor si este Mac aún no tiene. */
export async function ensureTelarXaiKey(profile = loadProfile()) {
  if (memoryKey) return memoryKey;

  const stored = await loadStoredKey();
  if (stored) {
    memoryKey = stored;
    return stored;
  }

  const issued = await requestProvisionedKey(profile);
  await storeKey(issued);
  return issued;
}
