// @ts-check
/**
 * Same-origin dual-track warehouse cross E2E (skeleton).
 *
 * Proves React write (sharded-v1 under /next/) is visible to legacy HealthHistory
 * on the same origin (/), and that React can load the warehouse again.
 *
 * Not a full UI keep-N matrix — only React write → legacy status + React re-load.
 *
 * Shared BrowserContext: IndexedDB is origin-scoped; default Playwright per-test
 * contexts would wipe warehouse between serial cases.
 */
const { test, expect, devices } = require('@playwright/test');

const desktop = devices['Desktop Chrome'];

test.describe('same-origin dual-track warehouse cross', () => {
  test.describe.configure({ mode: 'serial' });

  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      ...desktop,
      locale: 'zh-CN',
      serviceWorkers: 'block',
      baseURL: 'http://127.0.0.1:4175',
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('A: React fixture → persist → legacy getWarehouseStatus sees sharded-v1', async () => {
    await page.goto('/next/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 45_000 });
    const cgm = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm).toBeGreaterThan(0);

    // Desktop Chrome: advanced toolbar always visible (persist-warehouse)
    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 30_000 },
    );

    // Same origin: legacy PWA can read IndexedDB warehouse written by React
    await page.goto('/');
    await page.waitForFunction(
      () =>
        !!(
          window.HealthHistory &&
          typeof window.HealthHistory.getWarehouseStatus === 'function'
        ),
      { timeout: 30_000 },
    );

    const status = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return {
        granted: !!(st && st.granted),
        layout: st && st.layout,
        hasPayload: !!(st && st.hasPayload),
        approxBytes:
          (st && (st.approxBytes || (st.meta && st.meta.totalApproxBytes))) || 0,
        totalRecordCount: (st && st.meta && st.meta.totalRecordCount) || 0,
        cgmMonths: (st && st.cgmMonths) || [],
      };
    });

    expect(status.granted, `status=${JSON.stringify(status)}`).toBe(true);
    const layoutOk =
      status.layout === 'sharded-v1' ||
      (typeof status.layout === 'string' && status.layout.includes('sharded'));
    expect(layoutOk, `layout=${status.layout}`).toBe(true);
    const payloadOk =
      status.hasPayload ||
      status.approxBytes > 0 ||
      status.totalRecordCount > 0 ||
      (Array.isArray(status.cgmMonths) && status.cgmMonths.length > 0);
    expect(payloadOk, `status=${JSON.stringify(status)}`).toBe(true);
  });

  test('B: after React write, clear session + load-warehouse still works', async () => {
    // Serial after A: same context → warehouse still granted + sharded on this origin
    await page.goto('/next/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });

    const clearBtn = page.getByTestId('clear-session');
    // clear-session is disabled when status === 'idle' (fresh React shell after nav)
    if (await clearBtn.isEnabled()) {
      await clearBtn.click();
      await expect(page.getByTestId('overview-empty')).toBeVisible({
        timeout: 15_000,
      });
    }

    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('analyze-via')).toContainText('数据仓', {
      timeout: 45_000,
    });
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 45_000 });
    const cgm = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm).toBeGreaterThan(0);
  });
});
