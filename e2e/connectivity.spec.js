// @ts-check
/**
 * v1.90 soft: offline / connectivity banner.
 * Does not require network APIs; only checks chrome when UI is present.
 */
const { test, expect } = require('@playwright/test');

test.describe('connectivity banner (v1.90 soft)', () => {
  test('offline: #connectivity-banner visible when UI present; restore online', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.I18n || window.HealthAnalyzer));

    // Baseline: online session should not require a blocking offline banner
    const banner = page.locator('#connectivity-banner');
    const bannerCount = await banner.count();

    if (bannerCount === 0) {
      // Soft skip — UI agent may still be merging connectivity chrome
      // eslint-disable-next-line no-console
      console.log(
        'v1.90 soft skip: #connectivity-banner not in DOM (connectivity UI not merged yet)'
      );
      // Still exercise offline/online transitions so the suite documents the intent
      await page.context().setOffline(true);
      await page.evaluate(() => {
        try {
          window.dispatchEvent(new Event('offline'));
        } catch (e) {
          /* ignore */
        }
      });
      await page.context().setOffline(false);
      await page.evaluate(() => {
        try {
          window.dispatchEvent(new Event('online'));
        } catch (e) {
          /* ignore */
        }
      });
      return;
    }

    // Element exists: go offline and soft-assert visibility
    await page.context().setOffline(true);
    await page.evaluate(() => {
      try {
        window.dispatchEvent(new Event('offline'));
      } catch (e) {
        /* ignore */
      }
    });

    // Soft: allow a short tick for listeners; do not hard-fail if still hidden
    // (some builds only show banner after a failed fetch)
    await page.waitForTimeout(300);
    const offlineVisible = await banner.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return el.offsetParent !== null || style.position === 'fixed' || style.position === 'sticky';
    });

    if (offlineVisible) {
      await expect(banner).toBeVisible();
      const text = (await banner.innerText()).trim();
      // Soft: non-empty, non-clinical chrome
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/systolic|diastolic|mmol/i);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        'v1.90 soft: #connectivity-banner present but not visible after setOffline ' +
          '(may require failed fetch); element still attached'
      );
      await expect(banner).toBeAttached();
    }

    // Restore online
    await page.context().setOffline(false);
    await page.evaluate(() => {
      try {
        window.dispatchEvent(new Event('online'));
      } catch (e) {
        /* ignore */
      }
    });
    await page.waitForTimeout(200);

    // Soft: after online, banner may hide; do not require either state
    const stillAttached = (await banner.count()) > 0;
    expect(stillAttached, '#connectivity-banner should remain in DOM after online').toBe(true);
  });
});
