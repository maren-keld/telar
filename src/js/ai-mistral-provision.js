/**
 * Mistral de Telar: la clave no va en el instalador.
 * La primera vez se pide al servidor y se guarda solo en este computador.
 */
import { loadProfile, saveProfile } from './profile.js';
import { getSubscriptionApiBase } from './subscription.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { getTelarDeviceId } from './usage-ping.js';

let memoryKey = '';

export function telarProvisionsMistral() {
  return true;
}

export function peekProvisionedMistralKey() {
  return memoryKey;
}

export function clearProvisionedMistralKeyCache() {
  memoryKey = '';
}

async function loadStoredKey() {
  if (!isTauriApp()) return '';
  try {
    const key = await getInvoke()('ai_mistral_key_load');
    return String(key || '').trim();
  } catch {
    return '';
  }
}

async function storeKey(key) {
  memoryKey = key;
  if (!isTauriApp()) return;
  await getInvoke()('ai_mistral_key_store', { key });
}

function migrateLegacyProfileKey(profile = loadProfile()) {
  const leftover = String(profile.aiApiKey || '').trim();
  const provider = profile.aiApiProvider || 'mistral';
  if (!leftover || provider !== 'mistral') return '';
  return leftover;
}

async function requestProvisionedKey(profile = loadProfile()) {
  const email = String(profile.email || '').trim();
  const deviceId = getTelarDeviceId();
  if (!email.includes('@')) {
    throw new Error('Para activar la IA de Telar hace falta el correo del profesional (el del inicio).');
  }
  if (!deviceId) {
    throw new Error('No se pudo identificar esta instalación. Cierra Telar y ábrelo de nuevo.');
  }
  if (!isTauriApp()) {
    throw new Error('La IA en la nube se activa desde la app de escritorio.');
  }
  const apiBase = getSubscriptionApiBase();
  const data = await getInvoke()('mistral_provision', {
    email,
    deviceId,
    apiBase,
  });
  const key = String(data?.api_key || '').trim();
  if (!key) {
    throw new Error('El servidor no devolvió una clave de Mistral.');
  }
  return key;
}

/** Clave lista para llamar a Mistral. Pide una al servidor si este Mac aún no tiene. */
export async function ensureTelarMistralKey(profile = loadProfile()) {
  if (memoryKey) return memoryKey;

  const stored = await loadStoredKey();
  if (stored) {
    memoryKey = stored;
    return stored;
  }

  const leftover = migrateLegacyProfileKey(profile);
  if (leftover) {
    await storeKey(leftover);
    saveProfile({ aiApiKey: '' });
    return leftover;
  }

  const issued = await requestProvisionedKey(profile);
  await storeKey(issued);
  if (profile.aiApiKey) saveProfile({ aiApiKey: '' });
  return issued;
}
