// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const publicDir = path.join(__dirname, 'web-ui/public');

/**
 * Production-shaped React e2e: export-cutover → static host on :4174.
 * Root `/` is React; `/legacy/` is rollback-only.
 */
module.exports = defineConfig({
  testDir: './e2e-react',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
    locale: 'zh-CN',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-react',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run react:export-cutover && npx --yes serve "${publicDir}" -l 4174 --no-port-switching --cors`,
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
