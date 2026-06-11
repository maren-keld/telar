import { SUBSCRIPTION_API_PRODUCTION } from './subscription-config.js';
import { loadProfile, saveProfile } from './profile.js';
import { openExternalUrl } from './tauri-bridge.js';
import { toast } from './utils.js';

export function getSubscriptionApiBase() {
  const override = window.PSICOTERAPIA_SUBSCRIPTION_API;
  if (override) return String(override).replace(/\/$/, '');
  if (SUBSCRIPTION_API_PRODUCTION) return SUBSCRIPTION_API_PRODUCTION.replace(/\/$/, '');
  return 'http://localhost:5001';
}

export async function createProCheckout(email) {
  const base = getSubscriptionApiBase();
  const res = await fetch(`${base}/api/subscriptions/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el pago');
  return data;
}

export async function fetchProStatus(email) {
  const base = getSubscriptionApiBase();
  const q = encodeURIComponent(email);
  const res = await fetch(`${base}/api/subscriptions/status?email=${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la suscripción');
  return data;
}

export async function startProSubscription() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) {
    throw new Error('Configura tu email en Ajustes antes de suscribirte.');
  }
  const { checkout_url: url } = await createProCheckout(email);
  if (!url) throw new Error('Mercado Pago no devolvió enlace de pago');
  await openExternalUrl(url);
}

export async function syncProFromServer() {
  const profile = loadProfile();
  const email = (profile.email || '').trim();
  if (!email) return false;
  try {
    const { active } = await fetchProStatus(email);
    if (active) {
      saveProfile({ plan: 'pro' });
      return true;
    }
  } catch (e) {
    console.warn('[subscription]', e.message);
  }
  return false;
}

export async function tryActivatePro() {
  try {
    await startProSubscription();
    toast('Completa el pago en Mercado Pago. Luego vuelve a la app y pulsa «Verificar suscripción».');
  } catch (e) {
    toast(e.message || 'Error al iniciar suscripción');
  }
}

export async function verifyProSubscription() {
  const ok = await syncProFromServer();
  if (ok) {
    toast('Plan Profesional activo');
    return true;
  }
  toast('Suscripción no activa aún. Si ya pagaste, espera unos minutos e intenta de nuevo.');
  return false;
}
