import { SUBSCRIPTION_API_PRODUCTION } from './subscription-config.js';
import { loadProfile, saveProfile } from './profile.js';
import { getInvoke, isTauriApp, openExternalUrl } from './tauri-bridge.js';
import { toast } from './utils.js';

/** Solo `./scripts/dev.sh` (puerto 1420) — no confundir con Telar.app (tauri.localhost). */
function isDevHotReload() {
  const h = window.location?.hostname || '';
  const p = window.location?.port || '';
  return (h === '127.0.0.1' || h === 'localhost') && p === '1420';
}

/** URL de la mini-API de suscripciones (local en pruebas, Render en producción). */
export function getSubscriptionApiBase() {
  const override = window.TELAR_SUBSCRIPTION_API;
  if (override) return String(override).replace(/\/$/, '');
  if (isDevHotReload()) return 'http://127.0.0.1:5001';
  if (SUBSCRIPTION_API_PRODUCTION) return SUBSCRIPTION_API_PRODUCTION.replace(/\/$/, '');
  return 'http://127.0.0.1:5001';
}

export function isLocalSubscriptionApi() {
  return /127\.0\.0\.1|localhost/.test(getSubscriptionApiBase());
}

export async function fetchSubscriptionHealth() {
  const base = getSubscriptionApiBase();
  if (isTauriApp()) {
    return getInvoke()('subscription_health', { apiBase: base });
  }
  const res = await fetch(`${base}/api/health`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'API no disponible');
  return data;
}

async function parseApiResponse(res) {
  const text = await res.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: {}, text };
  }
}

export async function createProCheckout(email) {
  const base = getSubscriptionApiBase();

  if (isTauriApp()) {
    return getInvoke()('subscription_checkout', { email, apiBase: base });
  }

  let res;
  try {
    res = await fetch(`${base}/api/subscriptions/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error(
      `No se pudo conectar con la API (${base}). ¿Está corriendo «python app.py» en server/?`,
    );
  }
  const { data, text } = await parseApiResponse(res);
  if (!res.ok) {
    throw new Error(data.error || text.slice(0, 120) || 'No se pudo iniciar el pago');
  }
  return data;
}

export async function activateProDevBypass() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) {
    throw new Error('Configura tu email en Ajustes antes de activar Pro.');
  }
  const base = getSubscriptionApiBase();
  if (isTauriApp()) {
    return getInvoke()('subscription_dev_activate', { email, apiBase: base });
  }
  const res = await fetch(`${base}/api/subscriptions/dev-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { data, text } = await parseApiResponse(res);
  if (!res.ok) throw new Error(data.error || text.slice(0, 120) || 'No se pudo activar Pro');
  return data;
}

export async function tryActivateProDevBypass() {
  try {
    await activateProDevBypass();
    saveProfile({ plan: 'pro' });
    toast('Plan Profesional activo (desarrollo local, sin cobro).');
    return true;
  } catch (e) {
    console.error('[subscription]', e);
    toast(formatInvokeError(e));
    return false;
  }
}

export async function fetchProStatus(email) {
  const base = getSubscriptionApiBase();

  if (isTauriApp()) {
    return getInvoke()('subscription_status', { email, apiBase: base });
  }

  const q = encodeURIComponent(email);
  const res = await fetch(`${base}/api/subscriptions/status?email=${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la suscripción');
  return data;
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

export async function startProSubscription() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) {
    throw new Error('Configura tu email en Ajustes antes de suscribirte.');
  }
  const data = await createProCheckout(email);
  const url = checkoutUrlFromResponse(data);
  if (!url) throw new Error('Mercado Pago no devolvió enlace de pago');
  await openExternalUrl(url);
}

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
      saveProfile({ plan: 'free' });
      return { nowPro: false, changed: true, revoked: true };
    }
    return { nowPro: wasPro, changed: false, revoked: false };
  } catch (e) {
    console.warn('[subscription]', e.message);
    return { nowPro: wasPro, changed: false, revoked: false };
  }
}

export async function tryActivatePro() {
  try {
    const health = await fetchSubscriptionHealth();
    if (health.dev_bypass) {
      await tryActivateProDevBypass();
      return;
    }
    await startProSubscription();
    toast('Completa el pago en Mercado Pago. Luego «Verificar suscripción».');
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
