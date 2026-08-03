// @ts-check
/**
 * P0 layout gate: health dashboard mode must use full viewport width.
 * Regression for desktop grid where hidden sidebar left main at ~248px.
 */
const { test, expect } = require('@playwright/test');

test.describe('dashboard layout (1440 desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('TV mode main content spans full width (not ~248px sidebar track)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('btn-dashboard-mode').click();
    await expect(page.getByTestId('dashboard-mode-bar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/health-dashboard-mode/);

    const main = page.locator('.app-main');
    await expect(main).toBeVisible();
    const mainBox = await main.boundingBox();
    expect(mainBox, 'app-main should have a box').toBeTruthy();
    // Sidebar track is ~248px; full layout at 1440 must be far wider.
    expect(mainBox.width).toBeGreaterThan(900);

    const overview = page.getByTestId('page-overview');
    const ovBox = await overview.boundingBox();
    expect(ovBox, 'page-overview should have a box').toBeTruthy();
    expect(ovBox.width).toBeGreaterThan(800);

    // Status score should not be squeezed into a single narrow column
    const score = page.locator('.status-band-value').first();
    if (await score.count()) {
      const scoreBox = await score.boundingBox();
      if (scoreBox) {
        expect(scoreBox.width).toBeGreaterThan(40);
      }
    }

    await page.getByTestId('dashboard-exit').click();
    await expect(page.getByTestId('dashboard-mode-bar')).toHaveCount(0);
  });
});
