// @ts-check
/**
 * v1.68 on-device raw warehouse: consent → persist → reload hydrate → wipe.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { setWorkspace } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      !!(
        window.HealthAnalyzer &&
        window.I18n &&
        window.HealthHistory &&
        typeof window.HealthHistory.grantWarehouseConsent === 'function' &&
        typeof window.HealthHistory.persistHealthDataWarehouse === 'function'
      )
  );
}

/** @param {import('@playwright/test').Page} page */
async function selectXmlOnly(page) {
  const advanced = page.locator('#advanced-source');
  await advanced.locator('summary').click();
  await page.locator('input[name="source"][value="xml_only"]').check();
}

test.describe('v1.68 raw warehouse', () => {
  test('consent off by default; grant → persist → reload restores; wipe clears', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Default: no auto hydrate (empty)
    await expect(page.locator('body')).not.toHaveClass(/has-results/);

    const defaultGranted = await page.evaluate(async () =>
      window.HealthHistory.isWarehouseConsentGranted()
    );
    expect(defaultGranted).toBe(false);

    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    await setWorkspace(page, 'more');
    await expect(page.locator('#warehouse-panel')).toBeVisible();
    await expect(page.locator('#warehouse-consent')).not.toBeChecked();

    // Grant consent (confirm dialog)
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#warehouse-consent').check();
    await expect
      .poll(async () => page.evaluate(() => window.HealthHistory.isWarehouseConsentGranted()), {
        timeout: 8_000,
      })
      .toBe(true);

    // Ensure payload written
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return !!(st && st.hasPayload);
          }),
        { timeout: 10_000 }
      )
      .toBe(true);

    // Reload → auto-hydrate
    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          typeof window.HealthHistory.loadHealthDataWarehouse === 'function'
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    // Wipe clears warehouse
    await setWorkspace(page, 'more');
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#btn-clear-all-local').click();
    await expect(page.locator('body')).not.toHaveClass(/has-results/, { timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => window.HealthHistory.isWarehouseConsentGranted()), {
        timeout: 8_000,
      })
      .toBe(false);
    const afterWipe = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      return loaded == null;
    });
    expect(afterWipe).toBe(true);
  });
});
