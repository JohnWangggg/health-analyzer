// @ts-check
/**
 * HAE UI path E2E: file select → merge (Worker or main fallback) → stats render.
 * Soft on Worker: success via either path is enough; do not assert Worker specifically.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const HAE_FIXTURE = path.join(__dirname, 'fixtures/hae-mini.json');

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      !!(
        window.HealthAnalyzer &&
        window.I18n &&
        typeof window.HealthAnalyzer.mergeHaeIntoData === 'function' &&
        typeof window.HealthAnalyzer.createEmptyData === 'function' &&
        typeof window.HealthAnalyzer.analyzeAll === 'function'
      )
  );
}

/**
 * Open HAE import details if collapsed.
 * @param {import('@playwright/test').Page} page
 */
async function expandHaeImportBox(page) {
  const box = page.locator('#hae-import-box');
  await expect(box).toBeAttached();
  const open = await box.evaluate((el) => el instanceof HTMLDetailsElement && el.open);
  if (!open) {
    await box.locator('summary').click();
  }
  await expect(page.locator('#hae-file-input')).toBeVisible();
  await expect(page.locator('#btn-hae-apply')).toBeVisible();
}

test.describe('HAE UI import path', () => {
  test('file select → merge → stats + results overview', async ({ page }) => {
    await waitAppReady(page);
    await expandHaeImportBox(page);

    await page.locator('#hae-file-input').setInputFiles(HAE_FIXTURE);
    await page.locator('#btn-hae-apply').click();

    // Success: status "新增 …" / "Added …" or result panel with counts (Worker or main).
    // setHaeStatus may drop .show after 4s; textContent and #hae-import-result stay.
    await expect
      .poll(
        async () => {
          const statusText = (await page.locator('#hae-import-status').textContent().catch(() => '')) || '';
          const resultText = (await page.locator('#hae-import-result').textContent().catch(() => '')) || '';
          const combined = `${statusText}\n${resultText}`;
          // added > 0 language (zh-CN default, also zh-TW / en)
          const hasAdded =
            /新增\s*[1-9]\d*|已合并 HAE：新增\s*[1-9]|Added\s*[1-9]|\+[1-9]\d*/i.test(combined) ||
            (/新增\s*\d+|Added\s*\d+/i.test(combined) && /[1-9]/.test(combined));
          const resultVisible = await page
            .locator('#hae-import-result:not(.hidden)')
            .isVisible()
            .catch(() => false);
          const resultHasNums = resultVisible && /\d/.test(resultText);
          return hasAdded || resultHasNums;
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    // Stats / overview after merge (HAE-only path uses empty base + analyzeAll)
    await expect
      .poll(
        async () => {
          const hasResults = await page.locator('body').evaluate((b) => b.classList.contains('has-results'));
          const overview = await page.locator('#step-overview').isVisible().catch(() => false);
          const kpi = await page.locator('#kpi-grid .kpi-card, #kpi-grid > *').count();
          return hasResults || overview || kpi > 0;
        },
        { timeout: 15_000 }
      )
      .toBe(true);

    // Optional soft: result panel un-hidden with numeric stats
    const resultEl = page.locator('#hae-import-result');
    if (await resultEl.isVisible().catch(() => false)) {
      await expect(resultEl).not.toHaveClass(/hidden/);
      const text = (await resultEl.innerText()) || '';
      expect(text).toMatch(/\d/);
      // Prefer explicit added line when present
      if (/新增|Added/i.test(text)) {
        expect(text).toMatch(/新增\s*[1-9]|Added\s*[1-9]/i);
      }
    }
  });
});
