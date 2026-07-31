// @ts-check
/**
 * v1.90: offline / connectivity banner regression gate.
 * Does not require external network APIs; it drives the browser connectivity state directly.
 */
const { test, expect } = require('@playwright/test');

test.describe('connectivity banner (v1.90)', () => {
  test('offline shows the banner; restoring online hides it', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.I18n || window.HealthAnalyzer));

    const banner = page.locator('#connectivity-banner');
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeAttached();
    await expect(banner).toBeHidden();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(banner).toBeVisible();
    const text = (await banner.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/systolic|diastolic|mmol/i);

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(banner).toBeHidden();
    await expect(banner).toBeAttached();
  });
});
