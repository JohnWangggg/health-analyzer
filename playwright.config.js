// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const publicDir = path.join(__dirname, 'web-ui/public');

module.exports = defineConfig({
  // Default e2e is React (legacy UI removed). Archive suite remains under ./e2e.
  testDir: './e2e-react',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command:
      'npm --prefix web-ui/react-app run build && npm --prefix web-ui/react-app run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
