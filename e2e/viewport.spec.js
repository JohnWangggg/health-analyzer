// @ts-check
/**
 * v1.72 responsive acceptance: 390 phone / 834 tablet / 1440 desktop.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { setWorkspace } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

/** @param {import('@playwright/test').Page} page */
async function parseFixture(page) {
  await page.goto('/legacy/');
  await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n && window.__setWorkspace));
  await page.locator('#advanced-source summary').click();
  await page.locator('input[name="source"][value="xml_only"]').check();
  await page.locator('#file-input').setInputFiles(FIXTURE);
  await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('body')).toHaveClass(/has-results/);
}

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('shell + today priority + nav pattern + workspace switch', async ({ page }) => {
      await parseFixture(page);

      // Today: priority focus card
      await expect(page.locator('#priority-focus')).toBeVisible();
      await expect(page.locator('#priority-focus-title')).not.toBeEmpty();
      await expect(page.locator('#btn-priority-detail')).toBeVisible();

      // Adaptive nav: side rail ≥1100, bottom nav below
      if (vp.width >= 1100) {
        await expect(page.locator('#result-side-nav')).toBeVisible();
        await expect(page.locator('#result-bottom-nav')).toBeHidden();
      } else {
        await expect(page.locator('#result-bottom-nav')).toBeVisible();
        // Side nav exists but CSS-hidden on narrow
        await expect(page.locator('#result-side-nav')).toBeHidden();
      }

      // Workspace switch: trends
      await setWorkspace(page, 'trends');
      await expect(page.locator('#step-charts')).toBeVisible();
      await expect(page.locator('#charts-workbench')).toBeVisible();

      // Reports
      await setWorkspace(page, 'reports');
      await expect(page.locator('#step-prompt')).toBeVisible();

      // More
      await setWorkspace(page, 'more');
      await expect(page.locator('#step-export')).toBeVisible();
      await expect(page.locator('#warehouse-panel')).toBeVisible();

      // Back to today — priority still there
      await setWorkspace(page, 'today');
      await expect(page.locator('#priority-focus')).toBeVisible();
      await expect(page.locator('#step-overview')).toBeVisible();
    });
  });
}
