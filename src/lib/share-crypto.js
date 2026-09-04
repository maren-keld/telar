/**
 * Encriptado de los formularios que se envían al paciente por enlace.
 *
 * La llave se genera en la app, viaja solo en el fragmento (`#`) del enlace y
 * nunca se manda al servidor: los navegadores no incluyen el fragmento en la
 * petición. El servidor guarda un sobre AES-GCM que no puede abrir.
 *
 * Este archivo se usa tal cual en la app y en la página del paciente, así que
 * no importa nada y solo usa WebCrypto.
 */

const IV_BYTES = 12;
const KEY_BYTES = 32;

function subtle() {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('Este navegador no soporta encriptar datos (WebCrypto).');
  return c.subtle;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const base64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  return base64 + pad;
}

/** Llave nueva en base64url, lista para pegar en el fragmento del enlace. */
export function generateShareKey() {
  const bytes = new Uint8Array(KEY_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytesToBase64(bytes));
}

async function importKey(keyB64Url) {
  const raw = base64ToBytes(fromBase64Url(keyB64Url));
  if (raw.length !== KEY_BYTES) throw new Error('La llave del enlace no es válida.');
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encripta un objeto. El resultado es base64 de `iv || ciphertext`, que es lo
 * único que llega al servidor.
 */
export async function encryptShare(keyB64Url, payload) {
  const key = await importKey(keyB64Url);
  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  const envelope = new Uint8Array(iv.length + cipher.length);
  envelope.set(iv, 0);
  envelope.set(cipher, iv.length);
  return bytesToBase64(envelope);
}

/** Desencripta un sobre creado por `encryptShare`. */
export async function decryptShare(keyB64Url, envelopeBase64) {
  const key = await importKey(keyB64Url);
  const envelope = base64ToBytes(String(envelopeBase64).trim());
  if (envelope.length <= IV_BYTES) throw new Error('El contenido del enlace está incompleto.');
  const iv = envelope.slice(0, IV_BYTES);
  const cipher = envelope.slice(IV_BYTES);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}
