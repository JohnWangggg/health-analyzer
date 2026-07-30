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
  }, workspace);
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
 * Go to More → data management and ensure FHIR controls are visible.
 * @param {import('@playwright/test').Page} page
 */
async function goToFhirExport(page) {
  await setWorkspace(page, 'more');
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
  openFhirFold,
  goToFhirExport,
  goToReports,
};
