import assert from 'node:assert/strict';
import test from 'node:test';

function browserStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('getSubscriptionApiBase uses local API on dev frontend', async () => {
  globalThis.window = {
    location: { hostname: '127.0.0.1', href: 'http://127.0.0.1:1420/' },
    __TAURI__: { core: { invoke: async () => ({}) } },
  };
  const { getSubscriptionApiBase } = await import(
    `../../src/js/subscription.js?dev=${Date.now()}`
  );
  assert.equal(getSubscriptionApiBase(), 'http://127.0.0.1:5001');
});

test('getSubscriptionApiBase uses Render on packaged tauri.localhost', async () => {
  globalThis.window = {
    location: { hostname: 'tauri.localhost', href: 'http://tauri.localhost/' },
    __TAURI__: { core: { invoke: async () => ({}) } },
  };
  const { getSubscriptionApiBase } = await import(
    `../../src/js/subscription.js?pkg=${Date.now()}`
  );
  assert.equal(getSubscriptionApiBase(), 'https://telar-api-aim8.onrender.com');
});

test('getSubscriptionApiBase uses Render on packaged macOS (tauri://localhost)', async () => {
  globalThis.localStorage = browserStorage();
  globalThis.sessionStorage = browserStorage();
  localStorage.setItem('telar.subscriptionApiBase', 'http://127.0.0.1:5001');
  globalThis.window = {
    location: { protocol: 'tauri:', hostname: 'localhost', href: 'tauri://localhost/' },
    __TAURI__: { core: { invoke: async () => ({}) } },
  };
  const { getSubscriptionApiBase } = await import(
    `../../src/js/subscription.js?mac=${Date.now()}`
  );
  assert.equal(getSubscriptionApiBase(), 'https://telar-api-aim8.onrender.com');
});

test('checkout opens Mercado Pago URL', async () => {
  globalThis.localStorage = browserStorage();
  globalThis.window = {
    location: { hostname: '127.0.0.1', port: '1420' },
    open: () => {},
  };
  localStorage.setItem(
    'telar.practitioner',
    JSON.stringify({ email: 'person@example.com', plan: 'free' }),
  );

  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('/checkout')) {
      return new Response(
        JSON.stringify({
          checkout_url: 'https://www.mercadopago.cl/checkout',
        }),
        { status: 200 },
      );
    }
    if (url.includes('/status')) {
      return new Response(JSON.stringify({ active: true, status: 'authorized' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const { startProSubscription, fetchProStatus } = await import(
    `../../src/js/subscription.js?test=${Date.now()}`
  );
  await startProSubscription();
  const status = await fetchProStatus('person@example.com');
  assert.equal(status.active, true);
});

test('getSubscriptionApiBase ignores stale localhost cache on packaged app', async () => {
  globalThis.localStorage = browserStorage();
  globalThis.sessionStorage = browserStorage();
  localStorage.setItem('telar.subscriptionApiBase', 'http://127.0.0.1:5001');
  globalThis.window = {
    location: { hostname: 'tauri.localhost', href: 'http://tauri.localhost/' },
    __TAURI__: { core: { invoke: async () => ({}) } },
  };
  const { getSubscriptionApiBase } = await import(
    `../../src/js/subscription.js?stale=${Date.now()}`
  );
  assert.equal(getSubscriptionApiBase(), 'https://telar-api-aim8.onrender.com');
});

test('fetchSubscriptionHealth falls back to local API when Render fails in dev frontend', async () => {
  globalThis.sessionStorage = browserStorage();
  globalThis.window = {
    location: { hostname: '127.0.0.1', href: 'http://127.0.0.1:1420/' },
    __TAURI__: { core: { invoke: async () => ({}) } },
  };
  globalThis.fetch = async (url) => {
    if (url.includes('onrender.com')) {
      return new Response('unavailable', { status: 503 });
    }
    if (url.includes('127.0.0.1:5001')) {
      return new Response(
        JSON.stringify({ ok: true, mp_configured: true, mp_test_mode: true, dev_bypass: true }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  };

  const { fetchSubscriptionHealth, getSubscriptionApiBase } = await import(
    `../../src/js/subscription.js?fallback=${Date.now()}`
  );
  const health = await fetchSubscriptionHealth();
  assert.equal(health.dev_bypass, true);
  assert.equal(getSubscriptionApiBase(), 'http://127.0.0.1:5001');
});

test('resetLocalSubscriptionState clears plan and checkout credentials', async () => {
  globalThis.localStorage = browserStorage();
  localStorage.setItem(
    'telar.practitioner',
    JSON.stringify({ email: 'person@example.com', plan: 'pro' }),
  );
  localStorage.setItem('telar.subscriptionAccessToken', 'opaque-checkout-credential');
  localStorage.setItem('telar.subscriptionSyncLast', '2026-07-21');

  const { resetLocalSubscriptionState } = await import(
    `../../src/js/subscription.js?reset=${Date.now()}`
  );
  const result = resetLocalSubscriptionState();

  assert.equal(result.plan, 'free');
  assert.equal(JSON.parse(localStorage.getItem('telar.practitioner')).plan, 'free');
  assert.equal(localStorage.getItem('telar.subscriptionAccessToken'), null);
  assert.equal(localStorage.getItem('telar.subscriptionSyncLast'), null);
});
