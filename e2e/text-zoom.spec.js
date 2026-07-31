// @ts-check
/**
 * v1.73: 200% text / zoom acceptance — chrome remains usable.
 * Uses CSS zoom (Chromium) which approximates user text/page zoom.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { setWorkspace } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

test.describe('v1.73 text zoom 200%', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('priority + bottom nav + trends usable at 200% zoom', async ({ page }) => {
    await page.goto('/legacy/');
    await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n && window.__setWorkspace));

    await page.locator('#advanced-source summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    // Simulate ~200% zoom
    await page.addStyleTag({ content: 'html { zoom: 2; }' });

    await expect(page.locator('#priority-focus')).toBeVisible();
    await expect(page.locator('#priority-focus-title')).toBeVisible();
    await expect(page.locator('#btn-priority-detail')).toBeVisible();

    // Bottom nav remains interactive
    await expect(page.locator('#result-bottom-nav')).toBeVisible();
    const trendsBtn = page.locator('#result-bottom-nav [data-workspace="trends"]');
    await expect(trendsBtn).toBeVisible();
    await trendsBtn.click();
    await expect(page.locator('#step-charts')).toBeVisible();
    await page.evaluate(() => {
      if (typeof window.__openTrendsFilterSheet === 'function') window.__openTrendsFilterSheet();
    });
    await expect(page.locator('#chart-primary-metric')).toBeVisible();

    // KPI / priority text not fully clipped (scrollHeight roughly usable)
    const clipCheck = await page.evaluate(() => {
      const title = document.getElementById('priority-focus-title');
      const nav = document.getElementById('result-bottom-nav');
      if (!title || !nav) return { ok: false, reason: 'missing' };
      const tStyle = getComputedStyle(title);
      const nStyle = getComputedStyle(nav);
      return {
        ok: true,
        titleOverflow: tStyle.overflow,
        titleWhiteSpace: tStyle.whiteSpace,
        navDisplay: nStyle.display,
        titleClientH: title.clientHeight,
        titleScrollH: title.scrollHeight,
      };
    });
    expect(clipCheck.ok).toBe(true);
    // Title should not use nowrap clipping
    expect(clipCheck.titleWhiteSpace).not.toBe('nowrap');
    // Allow minor rounding; hard clip would be scrollHeight >> clientHeight with overflow hidden
    if (clipCheck.titleOverflow === 'hidden') {
      expect(clipCheck.titleScrollH).toBeLessThanOrEqual(clipCheck.titleClientH + 4);
    }

    await setWorkspace(page, 'today');
    await expect(page.locator('#priority-focus')).toBeVisible();
  });
});
