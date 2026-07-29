// @ts-check
/**
 * Risk / regression E2E: bad inputs, locale, history clear.
 * Prefer new file (avoid clobbering smoke.spec.js merges).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');
const EMPTY_XML = path.join(__dirname, 'fixtures/empty-export.xml');
const BAD_XML = path.join(__dirname, 'fixtures/bad-export.xml');
const NOT_HEALTH = path.join(__dirname, 'fixtures/not-health.txt');

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n));
}

/** @param {import('@playwright/test').Page} page */
async function selectXmlOnly(page) {
  const advanced = page.locator('#advanced-source');
  await advanced.locator('summary').click();
  await page.locator('input[name="source"][value="xml_only"]').check();
}

/**
 * Shell still interactive (not a white/blank crash page).
 * Note: after successful parse, #drop-zone is intentionally hidden (has-results).
 * @param {import('@playwright/test').Page} page
 */
async function expectNoWhiteScreen(page) {
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('header.app-header, .app-header').first()).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();
  // Core shell still mounted
  await expect(page.locator('#step-source, #drop-zone, main').first()).toBeAttached();
  // JS still alive
  const ok = await page.evaluate(() => !!(window.HealthAnalyzer && window.I18n));
  expect(ok).toBe(true);
}

test.describe('risk: bad / empty inputs', () => {
  test('empty XML does not white-screen (empty results or stable shell)', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(EMPTY_XML);

    // Parser treats empty HealthData as success → results with empty insights,
    // or (if future validation changes) error-box. Either way: no crash.
    await expect
      .poll(
        async () => {
          const hasResults = await page.locator('body').evaluate((b) => b.classList.contains('has-results'));
          const hasError = await page.locator('.error-box').count();
          const overview = await page.locator('#step-overview').isVisible().catch(() => false);
          return hasResults || hasError > 0 || overview;
        },
        { timeout: 45_000 },
      )
      .toBe(true);

    await expectNoWhiteScreen(page);

    // Prefer empty-insights path when results rendered
    const hasResults = await page.locator('body').evaluate((b) => b.classList.contains('has-results'));
    if (hasResults) {
      await expect(page.locator('#step-overview')).toBeVisible();
      // Empty-state insight card or KPI grid still present
      const emptyInsight = page.locator('#insight-list .empty-state-card, #insight-list .insight-item');
      await expect(emptyInsight.first()).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.locator('.error-box')).toBeVisible();
      await expect(page.locator('#step-progress')).toBeVisible();
    }
  });

  test('malformed XML does not white-screen', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(BAD_XML);

    await expect
      .poll(
        async () => {
          const hasResults = await page.locator('body').evaluate((b) => b.classList.contains('has-results'));
          const hasError = await page.locator('.error-box').count();
          const overview = await page.locator('#step-overview').isVisible().catch(() => false);
          return hasResults || hasError > 0 || overview;
        },
        { timeout: 45_000 },
      )
      .toBe(true);

    await expectNoWhiteScreen(page);
    // Page must not be stuck on infinite progress without UI
    const progressVisible = await page.locator('#step-progress').isVisible().catch(() => false);
    if (progressVisible) {
      // If progress still shown, either error UI or done text — not blank card
      const text = await page.locator('#step-progress').innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('invalid file type (txt) shows error-box, not white screen', async ({ page }) => {
    await waitAppReady(page);
    // Default source is apple_health_export (zip/xml only)
    await page.locator('#file-input').setInputFiles(NOT_HEALTH);

    // Error card must be shown (role=alert inside #step-progress)
    await expect(page.locator('#step-progress .error-box, .error-box[role="alert"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#step-progress')).toBeVisible();
    await expect(page.locator('#step-progress')).not.toHaveClass(/hidden/);
    await expect(page.locator('.error-box')).toContainText(/zip|\.xml|选择|choose|file/i);
    // Retry affordance present
    await expect(page.locator('#btn-retry, #btn-retry-same').first()).toBeVisible();
    await expectNoWhiteScreen(page);
  });
});

test.describe('risk: locale en parse', () => {
  test('locale=en before parse still yields results from fixture', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#locale-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);

    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    const hasKpi = await page.locator('#kpi-grid .kpi-card, #kpi-grid > *').count();
    const hasInsights = await page.locator('#insight-list .insight-item, #insight-list li').count();
    expect(hasKpi + hasInsights).toBeGreaterThan(0);

    // Chrome stays English
    await expect(page.locator('#step-signals h2')).toContainText(/signal|Cross/i);
    await expect(page.locator('h1')).toContainText(/Apple Health|Health/i);
  });
});

test.describe('risk: history clear UI', () => {
  test('clear-history button shows confirm dialog when results exist', async ({ page }) => {
    await waitAppReady(page);

    const clearBtn = page.locator('#btn-history-clear');
    // Button is in markup; may be hidden until results — parse first if needed
    const initiallyVisible = await clearBtn.isVisible().catch(() => false);
    if (!initiallyVisible) {
      await selectXmlOnly(page);
      await page.locator('#file-input').setInputFiles(FIXTURE);
      await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('#step-export')).toBeVisible();
    }

    test.skip(!(await clearBtn.count()), 'btn-history-clear not in DOM on this branch');

    await expect(clearBtn).toBeVisible();

    /** @type {string | null} */
    let dialogMessage = null;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await clearBtn.click();
    // confirm() is sync; give a tick for handler
    await expect
      .poll(() => dialogMessage != null, { timeout: 5_000 })
      .toBe(true);
    expect(dialogMessage).toMatch(/清空|clear|历史|histor|snapshot|不可恢复|cannot undo|irreversible/i);

    // Still no crash after dismiss
    await expectNoWhiteScreen(page);
  });

  test('clear-all local health data accept resets results and prompt', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    // Ensure prompt area has content when visible
    await page.locator('#step-prompt').scrollIntoViewIfNeeded().catch(() => {});
    const wipeBtn = page.locator('#btn-clear-all-local');
    test.skip(!(await wipeBtn.count()), 'btn-clear-all-local not in DOM');

    // Export section may be below fold; force show path
    await page.locator('#step-export').scrollIntoViewIfNeeded();
    await expect(wipeBtn).toBeVisible({ timeout: 10_000 });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/清除|clear|本机|on-device|健康|health/i);
      await dialog.accept();
    });

    await wipeBtn.click();

    // Memory analysis cleared + UI reset
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            // app.js keeps currentAnalysis in IIFE; check DOM state
            const body = document.body;
            const overview = document.getElementById('step-overview');
            const kpis = document.getElementById('kpi-grid');
            const prompt = document.getElementById('prompt-output');
            return {
              hasResults: body.classList.contains('has-results'),
              overviewHidden: !overview || overview.classList.contains('hidden'),
              kpiEmpty: !kpis || !kpis.innerHTML.trim(),
              promptEmpty: !prompt || !String(prompt.value || '').trim(),
              sourceVisible: !document.getElementById('step-source')?.classList.contains('hidden'),
            };
          }),
        { timeout: 10_000 }
      )
      .toMatchObject({
        hasResults: false,
        overviewHidden: true,
        kpiEmpty: true,
        promptEmpty: true,
        sourceVisible: true,
      });

    await expectNoWhiteScreen(page);
  });
});
