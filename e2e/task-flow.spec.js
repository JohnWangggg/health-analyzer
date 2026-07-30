// @ts-check
/**
 * v1.73 product task walkthrough:
 * import → find priority → trends → export visit report
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { setWorkspace, goToReports } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

test.describe('v1.73 user task flow', () => {
  test('import → priority focus → trends → export visit one-pager', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n && window.__setWorkspace));

    // 1) Import
    await page.locator('#advanced-source summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    // 2) Find priority (Today)
    await setWorkspace(page, 'today');
    await expect(page.locator('#priority-focus')).toBeVisible();
    await expect(page.locator('#priority-focus-title')).not.toBeEmpty();
    await expect(page.locator('#btn-priority-detail')).toBeVisible();
    // Open detail path does not crash
    await page.locator('#btn-priority-detail').click();

    // 3) Trends workbench
    await setWorkspace(page, 'trends');
    await expect(page.locator('#step-charts')).toBeVisible();
    await expect(page.locator('#charts-workbench')).toBeVisible();
    await expect
      .poll(async () => page.locator('#charts-content .chart-block').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    const options = await page.locator('#chart-primary-metric option').evaluateAll((opts) =>
      opts.map((o) => /** @type {HTMLOptionElement} */ (o).value).filter(Boolean)
    );
    if (options.length > 1) {
      await page.locator('#chart-primary-metric').selectOption(options[1]);
      await expect(page.locator('#charts-content .chart-block').first()).toBeVisible();
    }

    // 4) Export outpatient one-pager (Reports)
    await goToReports(page);
    await expect(page.locator('#btn-export-visit')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.locator('#btn-export-visit').click(),
    ]);
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/visit|门诊|one|summary|health|\.md|\.html|\.txt/i);
    const p = await download.path();
    expect(p).toBeTruthy();

    // Optional weekly export also works
    const [weekly] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.locator('#btn-export-weekly').click(),
    ]);
    expect(await weekly.path()).toBeTruthy();
  });
});
