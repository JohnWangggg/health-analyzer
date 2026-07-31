// @ts-check
/**
 * Shared Playwright helpers for health-analyzer E2E (v1.66+ workspaces).
 */

/**
 * Switch result workspace after analysis (today | trends | reports | more).
 * @param {import('@playwright/test').Page} page
 * @param {'today' | 'trends' | 'reports' | 'more'} workspace
 */
async function setWorkspace(page, workspace) {
  await page.waitForFunction(() => typeof window.__setWorkspace === 'function');
  await page.evaluate((ws) => {
    window.__setWorkspace(ws, { scroll: false });
    // v2.1 more sub-pages: default warehouse lives under storage-backup
    if (ws === 'more' && typeof window.__setMorePage === 'function') {
      window.__setMorePage('storage-backup');
    }
  }, workspace);
}

/**
 * Switch More sub-page (v2.1: data-source | storage-backup | privacy | history | advanced-export).
 * @param {import('@playwright/test').Page} page
 * @param {string} morePage
 */
async function setMorePage(page, morePage) {
  await page.waitForFunction(() => typeof window.__setMorePage === 'function');
  await page.evaluate((p) => {
    window.__setMorePage(p);
  }, morePage);
}

/**
 * Open trends filter sheet on narrow layouts (v2.1); no-op when controls are inline.
 * @param {import('@playwright/test').Page} page
 */
async function openTrendsFilterIfNeeded(page) {
  const primary = page.locator('#chart-primary-metric');
  if (await primary.isVisible().catch(() => false)) return;
  // Prefer API: avoids sticky header intercepting the open button at 200% zoom
  await page.evaluate(() => {
    if (typeof window.__openTrendsFilterSheet === 'function') {
      window.__openTrendsFilterSheet();
    }
  });
  if (await primary.isVisible().catch(() => false)) return;
  const openBtn = page.locator('#btn-trends-filter-open');
  if (await openBtn.count()) {
    await openBtn.click({ force: true });
    await expectVisibleLoose(page, '#chart-primary-metric');
  }
}

/** @param {import('@playwright/test').Page} page @param {string} sel */
async function expectVisibleLoose(page, sel) {
  await page.locator(sel).waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
}

/**
 * Open the FHIR advanced fold in the More workspace (if collapsed).
 * @param {import('@playwright/test').Page} page
 */
async function openFhirFold(page) {
  const fold = page.locator('#fhir-export-fold');
  if (await fold.count()) {
    const open = await fold.evaluate((el) => el instanceof HTMLDetailsElement && el.open);
    if (!open) {
      await fold.locator('summary').click();
    }
  }
}

/**
 * Go to More → advanced export and ensure FHIR controls are visible.
 * @param {import('@playwright/test').Page} page
 */
async function goToFhirExport(page) {
  await setWorkspace(page, 'more');
  await setMorePage(page, 'advanced-export');
  await page.locator('#step-export').scrollIntoViewIfNeeded();
  await openFhirFold(page);
  await page.locator('#btn-export-fhir').scrollIntoViewIfNeeded();
}

/**
 * Go to Reports workspace (prompt + clinical / weekly).
 * @param {import('@playwright/test').Page} page
 */
async function goToReports(page) {
  await setWorkspace(page, 'reports');
  await page.locator('#step-reports').scrollIntoViewIfNeeded();
}

module.exports = {
  setWorkspace,
  setMorePage,
  openTrendsFilterIfNeeded,
  openFhirFold,
  goToFhirExport,
  goToReports,
};
