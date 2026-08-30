import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:1420).*/, (route) => route.abort());
  await page.addInitScript(() => {
    const status = {
      unlocked: false,
      needs_setup: true,
      encrypted_db_exists: false,
      plaintext_db_exists: false,
    };
    window.__TAURI__ = {
      core: {
        invoke: async (command) => {
          if (command === 'db_status') return status;
          if (command === 'touch_id_available') return false;
          if (command === 'touch_id_has_stored_key') return false;
          if (command === 'subscription_status') return { active: false, status: 'none' };
          if (command === 'usage_ping') return { ok: true };
          if (command === 'check_for_update') return null;
          return null;
        },
      },
    };
  });
});

test('boots into encrypted database setup without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Telar' })).toBeVisible();
  await expect(page.locator('.hero-camera')).toBeVisible();
  await expect(page.getByText('¿Necesitas orientación o ayuda?')).toBeVisible();
  await expect(page.getByRole('link', { name: /contacto@telarapp\.cl/ })).toBeVisible();
  await expect(page.getByText('Crea un PIN de 6 dígitos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear y desbloquear' })).toBeVisible();
  await expect(page.locator('.hero-cam-card__go')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__telarBooted)).toBe(true);
  expect(errors).toEqual([]);
});
