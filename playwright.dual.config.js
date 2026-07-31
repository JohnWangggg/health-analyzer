// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const publicDir = path.join(__dirname, 'web-ui/public');

/**
 * Same-origin warehouse cross E2E after Strategy A cutover.
 * Serves React at `/` and legacy rollback at `/legacy/` (port 4175).
 * webServer runs react:export-cutover first.
 */
module.exports = defineConfig({
  testDir: './e2e-dual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'on-first-retry',
    locale: 'zh-CN',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-dual',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run react:export-cutover && npx --yes serve "${publicDir}" -l 4175 --no-port-switching --cors`,
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
