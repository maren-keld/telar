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
  expect(await page.evaluate(() => typeof window.Chart)).toBe('function');
  expect(await page.evaluate(() => typeof window.jspdf?.jsPDF)).toBe('function');
});

test('settings shows FileVault hint next to lock and Touch ID', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'telar.practitioner',
      JSON.stringify({ name: 'Ana', email: 'ana@example.com' }),
    );
    window.__TAURI__ = {
      core: {
        invoke: async (command) => {
          if (command === 'db_status') {
            return {
              unlocked: true,
              needs_setup: false,
              encrypted_db_exists: true,
              plaintext_db_exists: false,
            };
          }
          if (command === 'touch_id_available') return true;
          if (command === 'touch_id_has_stored_key') return false;
          if (command === 'subscription_status') return { active: false, status: 'none' };
          if (command === 'usage_ping') return { ok: true };
          if (command === 'db_select') return [];
          if (command === 'cloud_backup_has_identity') return false;
          if (command === 'cloud_backup_folder_status_cmd') {
            return { accessible: false, backup_count: 0 };
          }
          return null;
        },
      },
    };
  });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/settings');

  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByText('Desbloquear con Touch ID')).toBeVisible();
  await expect(page.getByText(/FileVault/)).toBeVisible();
  expect(errors).toEqual([]);
});
