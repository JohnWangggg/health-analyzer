// @ts-check
/**
 * Same-origin dual-track warehouse cross E2E (skeleton).
 *
 * Proves both directions on the same origin (shared BrowserContext / IDB):
 *   A–B: React write (sharded-v1 under /next/) → legacy HealthHistory status + React re-load
 *   C:   legacy API write (/) → React load-warehouse under /next/
 *   D:   legacy write → React persist overwrite → legacy status still ok (+ optional re-load)
 *
 * Not a full UI keep-N matrix — only React ↔ legacy warehouse skeleton.
 *
 * Shared BrowserContext: IndexedDB is origin-scoped; default Playwright per-test
 * contexts would wipe warehouse between serial cases.
 */
const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const desktop = devices['Desktop Chrome'];
const FIXTURE_XML = path.join(__dirname, '../e2e/fixtures/minimal-export.xml');

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

  test('C: legacy API write → React load-warehouse', async () => {
    // Isolate from A/B residue: clear warehouse then re-grant (consent lives in meta)
    await page.goto('/');
    await page.waitForFunction(
      () =>
        !!(
          window.HealthHistory &&
          window.HealthAnalyzer &&
          typeof window.HealthHistory.persistHealthDataWarehouse === 'function' &&
          typeof window.HealthAnalyzer.parseHealthXml === 'function'
        ),
      { timeout: 30_000 },
    );

    const xml = fs.readFileSync(FIXTURE_XML, 'utf8');
    const persist = await page.evaluate(async (xmlText) => {
      const HH = window.HealthHistory;
      const HA = window.HealthAnalyzer;
      if (typeof HH.clearWarehouseOnly === 'function') {
        await HH.clearWarehouseOnly();
      } else if (typeof HH.revokeWarehouseConsent === 'function') {
        await HH.revokeWarehouseConsent();
      }
      await HH.grantWarehouseConsent();
      const data = HA.parseHealthXml(xmlText);
      const r = await HH.persistHealthDataWarehouse(data);
      return {
        ok: !!(r && r.ok !== false),
        layout: (r && r.meta && r.meta.layout) || null,
        reason: (r && r.reason) || null,
        approxBytes: (r && r.approxBytes) || 0,
      };
    }, xml);

    expect(persist.ok, `persist=${JSON.stringify(persist)}`).toBe(true);
    const layoutOk =
      persist.layout === 'sharded-v1' ||
      (typeof persist.layout === 'string' && persist.layout.includes('sharded'));
    expect(layoutOk, `layout=${persist.layout}`).toBe(true);

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
    const payloadOk =
      status.hasPayload ||
      status.approxBytes > 0 ||
      status.totalRecordCount > 0 ||
      (Array.isArray(status.cgmMonths) && status.cgmMonths.length > 0);
    expect(payloadOk, `status=${JSON.stringify(status)}`).toBe(true);

    // Same origin / shared context: React shell loads warehouse written by legacy API
    await page.goto('/next/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });

    const clearBtn = page.getByTestId('clear-session');
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

  test('D: legacy write → React persist overwrite → legacy status still ok', async () => {
    // Isolate: clear warehouse then legacy fixture write; capture baseline size/counts
    await page.goto('/');
    await page.waitForFunction(
      () =>
        !!(
          window.HealthHistory &&
          window.HealthAnalyzer &&
          typeof window.HealthHistory.persistHealthDataWarehouse === 'function' &&
          typeof window.HealthAnalyzer.parseHealthXml === 'function'
        ),
      { timeout: 30_000 },
    );

    const xml = fs.readFileSync(FIXTURE_XML, 'utf8');
    const legacyWrite = await page.evaluate(async (xmlText) => {
      const HH = window.HealthHistory;
      const HA = window.HealthAnalyzer;
      if (typeof HH.clearWarehouseOnly === 'function') {
        await HH.clearWarehouseOnly();
      } else if (typeof HH.revokeWarehouseConsent === 'function') {
        await HH.revokeWarehouseConsent();
      }
      await HH.grantWarehouseConsent();
      const data = HA.parseHealthXml(xmlText);
      const r = await HH.persistHealthDataWarehouse(data);
      const st = await HH.getWarehouseStatus();
      return {
        ok: !!(r && r.ok !== false),
        layout: (r && r.meta && r.meta.layout) || (st && st.layout) || null,
        approxBytes:
          (st && (st.approxBytes || (st.meta && st.meta.totalApproxBytes))) ||
          (r && r.approxBytes) ||
          0,
        totalRecordCount: (st && st.meta && st.meta.totalRecordCount) || 0,
        cgmMonthsLen: Array.isArray(st && st.cgmMonths) ? st.cgmMonths.length : 0,
        hasPayload: !!(st && st.hasPayload),
      };
    }, xml);

    expect(legacyWrite.ok, `legacyWrite=${JSON.stringify(legacyWrite)}`).toBe(
      true,
    );
    const legacyPayloadOk =
      legacyWrite.hasPayload ||
      legacyWrite.approxBytes > 0 ||
      legacyWrite.totalRecordCount > 0 ||
      legacyWrite.cgmMonthsLen > 0;
    expect(
      legacyPayloadOk,
      `legacyWrite=${JSON.stringify(legacyWrite)}`,
    ).toBe(true);

    // React: load warehouse (fallback fixture), then re-persist sharded overwrite
    await page.goto('/next/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });

    const clearBtn = page.getByTestId('clear-session');
    if (await clearBtn.isEnabled()) {
      await clearBtn.click();
      await expect(page.getByTestId('overview-empty')).toBeVisible({
        timeout: 15_000,
      });
    }

    await page.getByTestId('load-warehouse').click();
    try {
      await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 45_000 });
      const cgmLoad = Number(await page.getByTestId('kpi-cgm').innerText());
      if (!(cgmLoad > 0)) throw new Error('kpi-cgm not positive after load-warehouse');
    } catch {
      await page.getByTestId('load-fixture').click();
      await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 45_000 });
    }
    const cgm = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm).toBeGreaterThan(0);

    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 30_000 },
    );

    // Legacy status after React overwrite: still granted + sharded + payload
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

    // Optional: React clear-session + load-warehouse still works after overwrite
    await page.goto('/next/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });
    const clearBtn2 = page.getByTestId('clear-session');
    if (await clearBtn2.isEnabled()) {
      await clearBtn2.click();
      await expect(page.getByTestId('overview-empty')).toBeVisible({
        timeout: 15_000,
      });
    }
    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('analyze-via')).toContainText('数据仓', {
      timeout: 45_000,
    });
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 45_000 });
    const cgm2 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm2).toBeGreaterThan(0);
  });
});
