/** Stub repo público — sin backend Mercado Pago en GitHub. */
export function getSubscriptionApiBase() {
  return '';
}
export function clearStaleLocalSubscriptionApiCache() {}
export function initSubscriptionCheckoutWatcher() {}
export function resetLocalSubscriptionState() {}
export function isLocalDevFrontend() {
  return false;
}
export async function maybeSyncProFromServer() {
  return { nowPro: true, changed: false };
}
export async function syncProFromServer() {
  return { nowPro: true, changed: false, revoked: false };
}
