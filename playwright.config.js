// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const publicDir = path.join(__dirname, 'web-ui/public');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    locale: 'zh-CN',
    // Avoid SW caching flaky history-db/app during parallel e2e against live public/
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Static serve of PWA assets (no SPA rewrite needed)
    command: `npx --yes serve "${publicDir}" -l 4173 --no-port-switching --cors`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
