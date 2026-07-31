// @ts-check
/**
 * v1.74 keyboard accessibility: skip link, workspace nav, priority actions.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

/** @param {import('@playwright/test').Page} page */
async function parseFixture(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n && window.__setWorkspace));
  await page.locator('#advanced-source summary').click();
  await page.locator('input[name="source"][value="xml_only"]').check();
  await page.locator('#file-input').setInputFiles(FIXTURE);
  await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
}

test.describe('v1.74 keyboard a11y', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('skip link moves focus to main', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.I18n));

    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveClass(/skip-link/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('bottom nav Enter switches workspace; priority buttons focusable', async ({ page }) => {
    await parseFixture(page);
    await expect(page.locator('#priority-focus')).toBeVisible();

    // Focus priority detail via JS (avoids flaky full-tab order), then activate with Enter
    await page.locator('#btn-priority-detail').focus();
    await expect(page.locator('#btn-priority-detail')).toBeFocused();
    await page.keyboard.press('Enter');

    // Bottom nav: focus Trends and activate
    const trendsNav = page.locator('#result-bottom-nav [data-workspace="trends"]');
    await expect(trendsNav).toBeVisible();
    await trendsNav.focus();
    await expect(trendsNav).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-charts')).toBeVisible();

    // Chart primary select is keyboard reachable
    await page.locator('#chart-primary-metric').focus();
    await expect(page.locator('#chart-primary-metric')).toBeFocused();
    await page.keyboard.press('ArrowDown');

    // Canvas data is inspectable without a pointer.
    const chartCanvas = page.locator('#charts-content .chart-canvas').first();
    await chartCanvas.focus();
    await expect(chartCanvas).toBeFocused();
    const chartReadout = page.locator(`#${await chartCanvas.getAttribute('aria-describedby')}`);
    await expect(chartReadout).toHaveClass(/is-hover/);
    const latestReadout = await chartReadout.textContent();
    await page.keyboard.press('Home');
    await expect(chartReadout).not.toHaveText(latestReadout || '');
    await page.keyboard.press('End');

    // Reports via keyboard
    const reportsNav = page.locator('#result-bottom-nav [data-workspace="reports"]');
    await reportsNav.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-prompt')).toBeVisible();
  });
});

test.describe('v1.74 keyboard a11y desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('side nav ArrowDown + Enter reaches trends', async ({ page }) => {
    await parseFixture(page);
    await expect(page.locator('#result-side-nav')).toBeVisible();

    const today = page.locator('#result-side-nav [data-workspace="today"]');
    await today.focus();
    await expect(today).toBeFocused();

    // Side nav keyboard handler uses ArrowDown
    await page.keyboard.press('ArrowDown');
    const trends = page.locator('#result-side-nav [data-workspace="trends"]');
    await expect(trends).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-charts')).toBeVisible();
  });
});
