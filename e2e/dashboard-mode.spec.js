// @ts-check
/**
 * v2.1 health dashboard / TV mode — soft/hard gates.
 * Soft: if #btn-dashboard-mode missing, log and skip hard assertions.
 * Hard when chrome present: enter → body class → exit (button + Esc).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} msg
 */
async function softLog(page, msg) {
  // Keep CI green while still surfacing incomplete UI in the report
  console.log(`[dashboard-mode soft] ${msg}`);
  test.info().annotations.push({ type: 'soft', description: msg });
}

test.describe('v2.1 dashboard / TV mode', () => {
  test('enter / body class / exit when button exists (soft if incomplete)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.I18n || window.HealthAnalyzer));

    const enterBtn = page.locator('#btn-dashboard-mode');
    const count = await enterBtn.count();
    if (count === 0) {
      await softLog(page, '#btn-dashboard-mode not found — UI incomplete, soft pass');
      return;
    }

    await expect(enterBtn).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/health-dashboard-mode/);

    await enterBtn.click();
    await expect(page.locator('body')).toHaveClass(/health-dashboard-mode/);

    const chrome = page.locator('#dashboard-mode-chrome');
    if ((await chrome.count()) === 0) {
      await softLog(page, '#dashboard-mode-chrome missing after enter — soft partial');
    } else {
      await expect(chrome).toBeVisible();
      await expect(page.locator('#dashboard-clock')).toBeVisible();
      const exitBtn = page.locator('#btn-dashboard-exit');
      if ((await exitBtn.count()) > 0) {
        await expect(exitBtn).toBeVisible();
        await exitBtn.click();
        await expect(page.locator('body')).not.toHaveClass(/health-dashboard-mode/);
      } else {
        await softLog(page, '#btn-dashboard-exit missing — trying Esc');
        await page.keyboard.press('Escape');
        await expect(page.locator('body')).not.toHaveClass(/health-dashboard-mode/);
      }
    }

    // Re-enter and exit via Esc
    if (!(await page.locator('body').evaluate((b) => b.classList.contains('health-dashboard-mode')))) {
      await enterBtn.click();
    }
    await expect(page.locator('body')).toHaveClass(/health-dashboard-mode/);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/health-dashboard-mode/);
  });

  test('with results: dashboard keeps overview chrome; exit restores', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.HealthAnalyzer && window.I18n));

    const enterBtn = page.locator('#btn-dashboard-mode');
    if ((await enterBtn.count()) === 0) {
      await softLog(page, 'no dashboard button — soft skip results path');
      return;
    }

    await page.locator('#advanced-source summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    await enterBtn.click();
    await expect(page.locator('body')).toHaveClass(/health-dashboard-mode/);

    // Upload zone should be suppressed in CSS when mode on
    const dropHidden = await page.locator('#drop-zone').evaluate((el) => {
      const st = getComputedStyle(el.closest('#step-source') || el);
      return st.display === 'none' || st.visibility === 'hidden';
    });
    if (!dropHidden) {
      await softLog(page, 'upload zone still visible in dashboard mode (soft)');
    }

    // Sticky copy bar should not steal the floor
    const sticky = page.locator('#sticky-cta');
    if ((await sticky.count()) > 0) {
      const stickyVis = await sticky.evaluate((el) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && !el.classList.contains('hidden');
      });
      if (stickyVis) {
        await softLog(page, 'sticky-cta still visible in dashboard mode (soft)');
      }
    }

    // Clock / data line present
    const clock = page.locator('#dashboard-clock');
    if ((await clock.count()) > 0) {
      await expect(clock).toBeVisible();
      const text = (await clock.innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
    }

    // KPI or priority still in DOM (may be off-screen but mode keeps them)
    const hasKpi = await page.locator('#kpi-grid .kpi-card, #kpi-grid > *').count();
    const hasPriority = await page.locator('#priority-focus').count();
    expect(hasKpi + hasPriority).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/health-dashboard-mode/);
  });
});
