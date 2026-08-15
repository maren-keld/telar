import { SUBSCRIPTION_API_PRODUCTION } from './subscription-config.js';
import { loadProfile, saveProfile } from './profile.js';
import { getInvoke, isTauriApp, openExternalUrl } from './tauri-bridge.js';
import { toast } from './utils.js';

export const LOCAL_SUBSCRIPTION_API = 'http://127.0.0.1:5001';
const API_BASE_STORAGE_KEY = 'telar.subscriptionApiBase';

function productionApiBase() {
  return (SUBSCRIPTION_API_PRODUCTION || '').replace(/\/$/, '');
}

function readStoredApiBase() {
  try {
    return (
      sessionStorage.getItem(API_BASE_STORAGE_KEY) ||
      localStorage.getItem(API_BASE_STORAGE_KEY) ||
      ''
    ).replace(/\/$/, '');
  } catch {
    return '';
  }
}

function subscriptionApiCandidates() {
  const production = productionApiBase();
  if (isLocalDevFrontend()) {
    const primary = readStoredApiBase() || LOCAL_SUBSCRIPTION_API;
    return primary === LOCAL_SUBSCRIPTION_API
      ? [primary]
      : [primary, LOCAL_SUBSCRIPTION_API];
  }
  return production ? [production] : [];
}

function rememberSubscriptionApiBase(base) {
  try {
    sessionStorage.setItem(API_BASE_STORAGE_KEY, base);
    localStorage.setItem(API_BASE_STORAGE_KEY, base);
  } catch {
    /* ignore */
  }
}

/** URL de la mini-API de suscripciones (local en pruebas, Render en producción). */
export function getSubscriptionApiBase() {
  const override = window.TELAR_SUBSCRIPTION_API;
  if (override) return String(override).replace(/\/$/, '');
  if (isLocalDevFrontend()) {
    return readStoredApiBase() || LOCAL_SUBSCRIPTION_API;
  }
  const production = productionApiBase();
  if (production) return production;
  const stored = readStoredApiBase();
  if (stored && !isLocalApiBase(stored)) return stored;
  throw new Error('La API de suscripciones de producción no está configurada.');
}

/** Quita URL local cacheada en la .app (evita quedar pegado a 127.0.0.1:5001). */
export function clearStaleLocalSubscriptionApiCache() {
  if (isLocalDevFrontend()) return;
  try {
    const stored = readStoredApiBase();
    if (stored && isLocalApiBase(stored)) {
      sessionStorage.removeItem(API_BASE_STORAGE_KEY);
      localStorage.removeItem(API_BASE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Frontend servido por dev.sh/live-server — no la .app empaquetada.
 * macOS empaquetado: tauri://localhost (protocol tauri:). Windows: http://tauri.localhost.
 */
export function isLocalDevFrontend() {
  const proto = window.location?.protocol || '';
  if (proto === 'tauri:') return false;
  const h = window.location?.hostname || '';
  const href = window.location?.href || '';
  if (h === 'tauri.localhost' || h.endsWith('.tauri.localhost')) return false;
  if (h === '127.0.0.1' || h === 'localhost') {
    return !href.includes(':5001');
  }
  return false;
}

export function isLocalSubscriptionApi() {
  try {
    return /127\.0\.0\.1|localhost/.test(getSubscriptionApiBase());
  } catch {
    return false;
  }
}

function isLocalApiBase(base) {
  return /127\.0\.0\.1:5001|localhost:5001/.test(String(base));
}

/** Tauri: en dev del navegador usamos fetch. En la .app, comandos Rust:
 *  el fetch del WKWebView muestra el cursor de espera (rueda arcoíris) si la red cuelga. */
function shouldUseFetchForBase(_base) {
  if (isLocalDevFrontend()) return true;
  return !isTauriApp();
}

async function fetchWithTimeout(url, init = {}, ms = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('La consulta tardó demasiado. Intenta de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function parseApiResponse(res) {
  const text = await res.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: {}, text };
  }
}

function formatFetchError(err, base) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/load failed|failed to fetch|networkerror/i.test(msg)) {
    if (isLocalApiBase(base)) {
      return `No se pudo conectar con la API (${base}). ¿Está corriendo «python app.py» en server/?`;
    }
    return `No se pudo conectar con la API (${base}). El servidor puede estar despertando; intenta de nuevo.`;
  }
  return msg;
}

async function subscriptionFetch(base, path, { method = 'GET', body } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res;
  try {
    res = await fetchWithTimeout(`${base}${path}`, init);
  } catch (err) {
    throw new Error(formatFetchError(err, base));
  }
  const { data, text } = await parseApiResponse(res);
  if (!res.ok) {
    throw new Error(data.error || text.slice(0, 120) || 'Error en la API de suscripciones');
  }
  return data;
}

export async function fetchSubscriptionHealth() {
  const tryBase = async (base) => {
    if (shouldUseFetchForBase(base)) {
      let res;
      try {
        res = await fetchWithTimeout(`${base}/api/health`);
      } catch (err) {
        throw new Error(formatFetchError(err, base));
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'API no disponible');
      return data;
    }
    return getInvoke()('subscription_health', { apiBase: base });
  };

  const candidates = subscriptionApiCandidates();
  if (!candidates.length) {
    throw new Error('La API de suscripciones de producción no está configurada.');
  }

  let lastErr;
  for (const base of candidates) {
    try {
      const health = await tryBase(base);
      rememberSubscriptionApiBase(base);
      return health;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function createProCheckout(email) {
  const base = getSubscriptionApiBase();

  if (shouldUseFetchForBase(base)) {
    return subscriptionFetch(base, '/api/subscriptions/checkout', {
      method: 'POST',
      body: { email, access_token: subscriptionAccessToken() },
    });
  }

  return getInvoke()('subscription_checkout', {
    email,
    accessToken: subscriptionAccessToken(),
    apiBase: base,
  });
}

const ACCESS_TOKEN_KEY = 'telar.subscriptionAccessToken';
const PREAPPROVAL_ID_KEY = 'telar.subscriptionPreapprovalId';

function subscriptionAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function subscriptionPreapprovalId() {
  try {
    return localStorage.getItem(PREAPPROVAL_ID_KEY) || '';
  } catch {
    return '';
  }
}

function saveSubscriptionCheckoutMeta(data) {
  if (data?.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  }
  if (data?.preapproval_id) {
    localStorage.setItem(PREAPPROVAL_ID_KEY, data.preapproval_id);
  }
}

export async function fetchProStatus(email) {
  const base = getSubscriptionApiBase();
  const preapprovalId = subscriptionPreapprovalId();
  const qs = new URLSearchParams({ email });
  if (preapprovalId) qs.set('preapproval_id', preapprovalId);

  if (shouldUseFetchForBase(base)) {
    const res = await fetchWithTimeout(`${base}/api/subscriptions/status?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo consultar la suscripción');
    return data;
  }

  const accessToken = subscriptionAccessToken();
  return getInvoke()('subscription_status', {
    email,
    accessToken,
    apiBase: base,
    preapprovalId: preapprovalId || null,
  });
}

/** Activa Pro en local sin pasarela (requiere SUBSCRIPTION_DEV_BYPASS=1 en server/.env). */
export async function activateDevPro() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) {
    throw new Error('Configura tu email en Ajustes antes de activar Pro.');
  }
  const bases = [LOCAL_SUBSCRIPTION_API, getSubscriptionApiBase()].filter(
    (b, i, arr) => b && arr.indexOf(b) === i,
  );
  let lastErr = new Error('Activación de desarrollo no disponible');
  for (const base of bases) {
    try {
      const data = await subscriptionFetch(base, '/api/subscriptions/dev-activate', {
        method: 'POST',
        body: { email },
      });
      if (data.active) {
        rememberSubscriptionApiBase(base);
        saveProfile({ plan: 'pro' });
        return data;
      }
      lastErr = new Error('Activación de desarrollo no disponible');
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

function checkoutUrlFromResponse(data) {
  return data?.checkout_url || data?.checkoutUrl || null;
}

function formatInvokeError(e) {
  if (typeof e === 'string') return e;
  if (e?.message) return String(e.message);
  try {
    return JSON.stringify(e);
  } catch {
    return 'Error al iniciar suscripción';
  }
}

const LAST_SYNC_KEY = 'telar.subscriptionSyncLast';
const PENDING_CHECKOUT_KEY = 'telar.subscriptionCheckoutPending';
const CHECKOUT_POLL_MS = 4000;
const CHECKOUT_POLL_MAX_MS = 15 * 60 * 1000;

let checkoutWatchTimer = null;
let checkoutWatchStartedAt = 0;
let checkoutWatchCallback = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function markCheckoutPending() {
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearCheckoutPending() {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    /* ignore */
  }
}

export function isCheckoutPending() {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return false;
    const started = Number(raw);
    if (!started || Date.now() - started > CHECKOUT_POLL_MAX_MS) {
      clearCheckoutPending();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function stopCheckoutWatch() {
  if (checkoutWatchTimer) {
    clearInterval(checkoutWatchTimer);
    checkoutWatchTimer = null;
  }
  checkoutWatchCallback = null;
}

async function tryCompletePendingCheckout({ onActivated, quiet = false } = {}) {
  if (!isCheckoutPending()) return false;
  const { nowPro, changed } = await syncProFromServer();
  if (nowPro) {
    clearCheckoutPending();
    stopCheckoutWatch();
    if (changed && !quiet) toast('Plan Profesional activo');
    onActivated?.();
    window.dispatchEvent(new CustomEvent('telar:subscription-activated'));
    return true;
  }
  return false;
}

/** Tras abrir Mercado Pago, consulta el servidor hasta confirmar el plan Pro. */
export function startCheckoutWatch({ onActivated } = {}) {
  markCheckoutPending();
  checkoutWatchCallback = onActivated;
  checkoutWatchStartedAt = Date.now();
  if (checkoutWatchTimer) {
    clearInterval(checkoutWatchTimer);
    checkoutWatchTimer = null;
  }

  const tick = async () => {
    if (Date.now() - checkoutWatchStartedAt > CHECKOUT_POLL_MAX_MS) {
      stopCheckoutWatch();
      clearCheckoutPending();
      return;
    }
    await tryCompletePendingCheckout({ onActivated: checkoutWatchCallback, quiet: true });
  };

  tick();
  checkoutWatchTimer = setInterval(tick, CHECKOUT_POLL_MS);
}

export function initSubscriptionCheckoutWatcher() {
  window.addEventListener('focus', () => {
    if (isCheckoutPending()) {
      tryCompletePendingCheckout({ onActivated: checkoutWatchCallback });
    }
  });

  if (isCheckoutPending()) {
    startCheckoutWatch({ onActivated: checkoutWatchCallback });
  }
}

/** Consulta estado Pro en el servidor como máximo 1 vez al día (email en Ajustes). */
export async function maybeSyncProFromServer() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) return { changed: false, revoked: false, nowPro: profile.plan === 'pro' };

  const today = todayKey();
  try {
    if (localStorage.getItem(LAST_SYNC_KEY) === today) {
      return { changed: false, revoked: false, nowPro: profile.plan === 'pro' };
    }
  } catch {
    /* ignore */
  }

  const result = await syncProFromServer();
  try {
    localStorage.setItem(LAST_SYNC_KEY, today);
  } catch {
    /* ignore */
  }

  if (result.revoked) {
    toast('Tu suscripción Pro ya no está activa. Algunas funciones quedaron limitadas.');
  }
  return result;
}

export async function startProSubscription() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) {
    throw new Error('Configura tu email en Ajustes antes de suscribirte.');
  }
  const data = await createProCheckout(email);
  saveSubscriptionCheckoutMeta(data);
  const url = checkoutUrlFromResponse(data);
  if (!url) throw new Error('Mercado Pago no devolvió enlace de pago');
  markCheckoutPending();
  await openExternalUrl(url);
}

const REVOKED_MP_STATUSES = new Set(['cancelled', 'paused', 'rejected', 'expired', 'inactive']);

/**
 * @returns {Promise<{ nowPro: boolean, changed: boolean, revoked: boolean }>}
 */
export async function syncProFromServer() {
  const profile = loadProfile();
  const wasPro = profile.plan === 'pro';
  const email = (profile.email || '').trim();
  if (!email) {
    return { nowPro: wasPro, changed: false, revoked: false };
  }
  try {
    const data = await fetchProStatus(email);
    if (data.active === true) {
      if (!wasPro) saveProfile({ plan: 'pro' });
      return { nowPro: true, changed: !wasPro, revoked: false };
    }
    if (data.active === false && wasPro) {
      const st = String(data.status || 'none').toLowerCase();
      // Sin fila en el servidor o MP aún pendiente: no quitar Pro local.
      if (st === 'none' || st === 'pending' || !REVOKED_MP_STATUSES.has(st)) {
        return { nowPro: wasPro, changed: false, revoked: false };
      }
      saveProfile({ plan: 'free' });
      return { nowPro: false, changed: true, revoked: true };
    }
    return { nowPro: wasPro, changed: false, revoked: false };
  } catch (e) {
    console.warn('[subscription]', e.message);
    return { nowPro: wasPro, changed: false, revoked: false };
  }
}

export async function tryActivatePro({ onActivated } = {}) {
  try {
    await startProSubscription();
    startCheckoutWatch({ onActivated });
    toast('Completa el pago en Mercado Pago. Telar se activará solo al volver.');
  } catch (e) {
    console.error('[subscription]', e);
    toast(formatInvokeError(e));
  }
}

export async function verifyProSubscription() {
  const { nowPro } = await syncProFromServer();
  if (nowPro) {
    toast('Plan Profesional activo');
    return true;
  }
  toast('Suscripción no activa aún. Si ya pagaste, espera unos minutos e intenta de nuevo.');
  return false;
}

/** Borra plan Pro y credenciales de checkout solo en este dispositivo (pruebas locales). */
export function resetLocalSubscriptionState() {
  saveProfile({ plan: 'free' });
  stopCheckoutWatch();
  clearCheckoutPending();
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(PREAPPROVAL_ID_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    localStorage.removeItem(API_BASE_STORAGE_KEY);
    sessionStorage.removeItem(API_BASE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { plan: 'free' };
}
