// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const publicDir = path.join(__dirname, 'web-ui/public');

/**
 * Same-origin dual-track warehouse cross E2E.
 * Serves legacy `/` + React `/next/` from one static host (port 4175).
 * webServer runs react:export-next first (public/next is gitignored).
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
    // Avoid SW caching flaky history-db / next assets during dual-track e2e
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-dual',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // 1) export React into public/next/  2) serve same origin for / and /next/
    command: `npm run react:export-next && npx --yes serve "${publicDir}" -l 4175 --no-port-switching --cors`,
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    // export-next runs two Vite builds; allow generous startup
    timeout: 300_000,
  },
});
