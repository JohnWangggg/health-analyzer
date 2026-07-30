// @ts-check
/**
 * v1.67 trends workbench MVP: controls present after parse; switch primary metric without crash.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { setWorkspace } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

test.describe('v1.67 trends workbench', () => {
  test('after parse → trends controls exist → switch primary metric does not crash', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto('/');
    await page.waitForFunction(() => window.HealthAnalyzer && window.I18n && window.HealthCharts);

    const advanced = page.locator('#advanced-source');
    await advanced.locator('summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    await setWorkspace(page, 'trends');
    await expect(page.locator('#step-charts')).toBeVisible();
    await expect(page.locator('#charts-workbench')).toBeVisible();
    await expect(page.locator('#chart-primary-metric')).toBeVisible();
    await expect(page.locator('#chart-compare-metric')).toBeVisible();
    await expect(page.locator('#chart-baseline-toggle')).toBeAttached();
    await expect(page.locator('#chart-events-toggle')).toBeAttached();

    // Primary select should have at least one real metric option from fixture data
    await expect
      .poll(async () => page.locator('#chart-primary-metric option').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);

    const optionValues = await page.locator('#chart-primary-metric option').evaluateAll((opts) =>
      opts.map((o) => /** @type {HTMLOptionElement} */ (o).value).filter(Boolean)
    );
    expect(optionValues.length).toBeGreaterThan(0);

    // Chart content renders for primary
    await expect
      .poll(async () => page.locator('#charts-content .chart-block').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(page.locator('#charts-content .chart-conclusion').first()).toBeVisible();

    // Switch primary through available keys — must not throw
    for (const val of optionValues.slice(0, 4)) {
      await page.locator('#chart-primary-metric').selectOption(val);
      await expect
        .poll(async () => page.locator('#charts-content .chart-block').count())
        .toBeGreaterThan(0);
      // Selected primary block present when key matches a rendered block
      const blocks = await page.locator('#charts-content .chart-block').count();
      expect(blocks).toBeGreaterThan(0);
    }

    // Toggle baseline / events without crash
    await page.locator('#chart-baseline-toggle').uncheck();
    await page.locator('#chart-baseline-toggle').check();
    await page.locator('#chart-events-toggle').uncheck();
    await page.locator('#chart-events-toggle').check();
    await expect(page.locator('#charts-content .chart-block').first()).toBeVisible();

    // Optional compare: pick a different metric if available
    const compareOptions = await page
      .locator('#chart-compare-metric option')
      .evaluateAll((opts) =>
        opts.map((o) => /** @type {HTMLOptionElement} */ (o).value).filter(Boolean)
      );
    if (compareOptions.length) {
      await page.locator('#chart-compare-metric').selectOption(compareOptions[0]);
      await expect(page.locator('#charts-content .chart-block-compare, #charts-content .chart-block').first()).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });
});
