// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const reactApp = path.join(__dirname, 'web-ui/react-app');

/**
 * React dual-track shell smoke (separate from legacy public e2e).
 * Serves vite preview of react-app/dist on 4174.
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
    command: `npm --prefix "${reactApp}" run build && npm --prefix "${reactApp}" run preview -- --host 127.0.0.1 --port 4174`,
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
