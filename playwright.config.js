import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 1420 --bind 127.0.0.1 --directory src',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
