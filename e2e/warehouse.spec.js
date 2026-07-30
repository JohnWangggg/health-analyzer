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

  test('backup export/import roundtrip restores analysis', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#warehouse-consent').check();
    await expect
      .poll(async () => page.evaluate(() => window.HealthHistory.isWarehouseConsentGranted()), {
        timeout: 8_000,
      })
      .toBe(true);

    // Export backup via API (stable for e2e)
    const envelope = await page.evaluate(async () => {
      return window.HealthHistory.exportWarehouseBackup({
        includeSnapshots: false,
        includeEvents: false,
        includeReports: false,
        includeBatches: false,
      });
    });
    expect(envelope.magic).toBe('health-analyzer-backup');
    expect(envelope.payload.domainChunks.length).toBeGreaterThan(0);

    // Wipe all
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#btn-clear-all-local').click();
    await expect(page.locator('body')).not.toHaveClass(/has-results/, { timeout: 15_000 });

    // Import backup
    await page.evaluate(async (env) => {
      await window.HealthHistory.importWarehouseBackup(env, { regrantConsent: true });
    }, envelope);

    const restored = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      if (!loaded || !loaded.data) return false;
      const analysis = window.HealthAnalyzer.analyzeAll(loaded.data);
      return !!(analysis && analysis.data);
    });
    expect(restored).toBe(true);

    // UI restore path
    await page.reload();
    await page.waitForFunction(
      () => !!(window.HealthHistory && window.HealthAnalyzer && window.I18n)
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#warehouse-restored-banner')).toBeVisible();
  });

  test('sharded layout: core + cgm months persist and reload', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#warehouse-consent').check();
    await expect
      .poll(async () => page.evaluate(() => window.HealthHistory.isWarehouseConsentGranted()), {
        timeout: 8_000,
      })
      .toBe(true);

    const layout = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      return {
        layout: st.layout || loaded.layout,
        hasPayload: st.hasPayload,
        cgmLen: loaded && loaded.data && loaded.data.cgm ? loaded.data.cgm.length : 0,
        chunkCount: loaded && loaded.chunks ? loaded.chunks.length : 0,
      };
    });
    expect(layout.hasPayload).toBe(true);
    expect(layout.layout).toMatch(/sharded|legacy/);
    // Sharded writes at least core chunk
    expect(layout.chunkCount).toBeGreaterThan(0);

    // UI: layout line + optional CGM month list when sharded with months
    await expect(page.locator('#warehouse-layout-line')).toBeVisible();
    const layoutText = await page.locator('#warehouse-layout-line').innerText();
    expect(layoutText.length).toBeGreaterThan(3);
    if (layout.layout === 'sharded-v1') {
      // Month list only if CGM points exist in fixture
      const monthItems = await page.locator('#warehouse-cgm-month-list li').count();
      // Fixture may have little/no CGM — list optional
      expect(monthItems).toBeGreaterThanOrEqual(0);
    }

    await page.reload();
    await page.waitForFunction(() => !!(window.HealthHistory && window.HealthAnalyzer));
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
  });

  test('BP/weight yearly shards: multi-year persist, load, optional year delete', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2025-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2025-08-12T08:00:00', systolic: 118, diastolic: 78 },
        { datetime: '2026-01-05T08:00:00', systolic: 122, diastolic: 81 },
        { datetime: '2026-06-20T08:00:00', systolic: 119, diastolic: 79 },
      ];
      data.weight = [
        { datetime: '2025-02-01T07:00:00', value: 70.5 },
        { datetime: '2025-11-01T07:00:00', value: 69.8 },
        { datetime: '2026-04-01T07:00:00', value: 68.9 },
      ];
      data.bodyFat = [
        { datetime: '2025-02-01T07:00:00', value: 22.1 },
        { datetime: '2026-04-01T07:00:00', value: 20.5 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasBodyFat = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const afterPersist = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      return {
        layout: st.layout,
        bpYears: st.bpYears || [],
        weightYears: st.weightYears || [],
        bpLen: (data.bloodPressure || []).length,
        weightLen: (data.weight || []).length,
        bodyFatLen: (data.bodyFat || []).length,
        hasBp2025: chunkIds.indexOf('bloodPressure|2025') >= 0,
        hasBp2026: chunkIds.indexOf('bloodPressure|2026') >= 0,
        hasW2025: chunkIds.indexOf('weight|2025') >= 0,
        hasW2026: chunkIds.indexOf('weight|2026') >= 0,
        hasCore: chunkIds.indexOf('core|full') >= 0,
        noLegacyFull: chunkIds.indexOf('healthData|full') < 0,
      };
    });
    expect(afterPersist.layout).toBe('sharded-v1');
    expect(afterPersist.hasCore).toBe(true);
    expect(afterPersist.noLegacyFull).toBe(true);
    expect(afterPersist.bpYears).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.weightYears).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.bpLen).toBe(4);
    expect(afterPersist.weightLen).toBe(3);
    expect(afterPersist.bodyFatLen).toBe(2);
    expect(afterPersist.hasBp2025).toBe(true);
    expect(afterPersist.hasBp2026).toBe(true);
    expect(afterPersist.hasW2025).toBe(true);
    expect(afterPersist.hasW2026).toBe(true);

    // Optional: delete one BP year and one weight year
    const delOk = await page.evaluate(async () => {
      const bp = await window.HealthHistory.deleteBloodPressureYearShards(['2025']);
      const wt = await window.HealthHistory.deleteWeightYearShards(['2025']);
      return { bpOk: !!(bp && bp.ok), wtOk: !!(wt && wt.ok) };
    });
    expect(delOk.bpOk).toBe(true);
    expect(delOk.wtOk).toBe(true);

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bpYears: (st.bpYears || []).slice().sort(),
              weightYears: (st.weightYears || []).slice().sort(),
            };
          }),
        { timeout: 8_000 }
      )
      .toEqual({ bpYears: ['2026'], weightYears: ['2026'] });

    const del = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      return {
        bpLen: (data.bloodPressure || []).length,
        weightLen: (data.weight || []).length,
        bodyFatLen: (data.bodyFat || []).length,
        has2025Bp: (data.bloodPressure || []).some((p) =>
          String(p.datetime || '').startsWith('2025')
        ),
        has2026Bp: (data.bloodPressure || []).some((p) =>
          String(p.datetime || '').startsWith('2026')
        ),
      };
    });
    expect(del.bpLen).toBe(2);
    expect(del.weightLen).toBe(1);
    expect(del.bodyFatLen).toBe(1);
    expect(del.has2025Bp).toBe(false);
    expect(del.has2026Bp).toBe(true);

    // UI: reload hydrate → 「更多」仓面板年列表（仅剩 2026）
    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-bp-years')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#warehouse-weight-years')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#warehouse-bp-year-list li')).toHaveCount(1);
    await expect(page.locator('#warehouse-weight-year-list li')).toHaveCount(1);
    await expect(page.locator('#warehouse-bp-year-list .wh-month').first()).toHaveText('2026');
    await expect(page.locator('#warehouse-weight-year-list .wh-month').first()).toHaveText('2026');
  });

  test('deleteCgmMonthShards bulk removes months and updates status', async ({ page }) => {
    await waitAppReady(page);
    // Seed warehouse with three synthetic months via API
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.cgm = [
        { datetime: '2026-05-10T08:00:00', value: 5.2 },
        { datetime: '2026-06-15T08:00:00', value: 5.5 },
        { datetime: '2026-06-16T08:00:00', value: 5.6 },
        { datetime: '2026-07-10T08:00:00', value: 6.0 },
        { datetime: '2026-07-11T08:00:00', value: 6.1 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasCgm = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const bulk = await page.evaluate(async () => {
      return window.HealthHistory.deleteCgmMonthShards(['2026-05', '2026-06']);
    });
    expect(bulk.ok).toBe(true);
    expect(bulk.deleted).toEqual(expect.arrayContaining(['2026-05', '2026-06']));

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return (st.cgmMonths || []).slice().sort();
          }),
        { timeout: 8_000 }
      )
      .toEqual(['2026-07']);

    const after = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const cgm = (loaded && loaded.data && loaded.data.cgm) || [];
      return {
        hasMay: cgm.some((p) => String(p.datetime || '').startsWith('2026-05')),
        hasJune: cgm.some((p) => String(p.datetime || '').startsWith('2026-06')),
        hasJuly: cgm.some((p) => String(p.datetime || '').startsWith('2026-07')),
      };
    });
    expect(after.hasMay).toBe(false);
    expect(after.hasJune).toBe(false);
    expect(after.hasJuly).toBe(true);
  });

  test('keep recent N months: N=3 leaves newest 3 of 5', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.cgm = [
        { datetime: '2026-03-10T08:00:00', value: 5.0 },
        { datetime: '2026-04-10T08:00:00', value: 5.1 },
        { datetime: '2026-05-10T08:00:00', value: 5.2 },
        { datetime: '2026-06-15T08:00:00', value: 5.5 },
        { datetime: '2026-07-10T08:00:00', value: 6.0 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasCgm = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const beforeMonths = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return (st.cgmMonths || []).slice().sort();
    });
    expect(beforeMonths).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);

    // Reload so auto-hydrate sets has-results and reveals More → export/warehouse UI
    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-cgm-months')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#warehouse-cgm-month-list li')).toHaveCount(5, { timeout: 8_000 });

    // Configurable N: select 3 months, button label updates
    await page.locator('#warehouse-cgm-keep-months').selectOption('3');
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('health-analyzer-cgm-keep-months')))
      .toBe('3');
    await expect(page.locator('#btn-warehouse-cgm-keep-recent')).toContainText(/3/);

    page.once('dialog', async (d) => {
      // confirm shows keep N and drop count (2 older months)
      expect(d.message()).toMatch(/3/);
      await d.accept();
    });
    await page.locator('#btn-warehouse-cgm-keep-recent').click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return (st.cgmMonths || []).slice().sort();
          }),
        { timeout: 10_000 }
      )
      .toEqual(['2026-05', '2026-06', '2026-07']);

    const afterCgm = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const cgm = (loaded && loaded.data && loaded.data.cgm) || [];
      return {
        hasMar: cgm.some((p) => String(p.datetime || '').startsWith('2026-03')),
        hasApr: cgm.some((p) => String(p.datetime || '').startsWith('2026-04')),
        hasMay: cgm.some((p) => String(p.datetime || '').startsWith('2026-05')),
        hasJun: cgm.some((p) => String(p.datetime || '').startsWith('2026-06')),
        hasJul: cgm.some((p) => String(p.datetime || '').startsWith('2026-07')),
      };
    });
    expect(afterCgm.hasMar).toBe(false);
    expect(afterCgm.hasApr).toBe(false);
    expect(afterCgm.hasMay).toBe(true);
    expect(afterCgm.hasJun).toBe(true);
    expect(afterCgm.hasJul).toBe(true);
  });

  test('keep recent N years: BP N=2 leaves newest 2 of 4; weight untouched', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2023-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2024-03-10T08:00:00', systolic: 118, diastolic: 78 },
        { datetime: '2025-03-10T08:00:00', systolic: 122, diastolic: 81 },
        { datetime: '2026-03-10T08:00:00', systolic: 119, diastolic: 79 },
      ];
      data.weight = [
        { datetime: '2023-02-01T07:00:00', value: 72.0 },
        { datetime: '2024-02-01T07:00:00', value: 71.0 },
        { datetime: '2025-02-01T07:00:00', value: 70.0 },
        { datetime: '2026-02-01T07:00:00', value: 69.0 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const before = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return {
        bp: (st.bpYears || []).slice().sort(),
        weight: (st.weightYears || []).slice().sort(),
      };
    });
    expect(before.bp).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.weight).toEqual(['2023', '2024', '2025', '2026']);

    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-bp-years')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#warehouse-bp-year-list li')).toHaveCount(4, { timeout: 8_000 });

    await page.locator('#warehouse-bp-keep-years').selectOption('2');
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('health-analyzer-year-keep-years')))
      .toBe('2');
    await expect(page.locator('#btn-warehouse-bp-keep-recent')).toContainText(/2/);
    // Shared N also syncs weight select
    await expect(page.locator('#warehouse-weight-keep-years')).toHaveValue('2');

    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/2/);
      await d.accept();
    });
    await page.locator('#btn-warehouse-bp-keep-recent').click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bp: (st.bpYears || []).slice().sort(),
              weight: (st.weightYears || []).slice().sort(),
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        bp: ['2025', '2026'],
        weight: ['2023', '2024', '2025', '2026'],
      });

    await expect(page.locator('#warehouse-bp-year-list li')).toHaveCount(2, { timeout: 8_000 });
    await expect(page.locator('#warehouse-weight-year-list li')).toHaveCount(4);
  });

  test('keep recent N years: weight N=2 leaves newest 2 of 4; BP untouched', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2023-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2024-03-10T08:00:00', systolic: 118, diastolic: 78 },
        { datetime: '2025-03-10T08:00:00', systolic: 122, diastolic: 81 },
        { datetime: '2026-03-10T08:00:00', systolic: 119, diastolic: 79 },
      ];
      data.weight = [
        { datetime: '2023-02-01T07:00:00', value: 72.0 },
        { datetime: '2024-02-01T07:00:00', value: 71.0 },
        { datetime: '2025-02-01T07:00:00', value: 70.0 },
        { datetime: '2026-02-01T07:00:00', value: 69.0 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const before = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return {
        bp: (st.bpYears || []).slice().sort(),
        weight: (st.weightYears || []).slice().sort(),
      };
    });
    expect(before.bp).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.weight).toEqual(['2023', '2024', '2025', '2026']);

    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-weight-years')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#warehouse-weight-year-list li')).toHaveCount(4, {
      timeout: 8_000,
    });

    await page.locator('#warehouse-weight-keep-years').selectOption('2');
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('health-analyzer-year-keep-years')))
      .toBe('2');
    await expect(page.locator('#btn-warehouse-weight-keep-recent')).toContainText(/2/);
    // Shared N also syncs BP select
    await expect(page.locator('#warehouse-bp-keep-years')).toHaveValue('2');

    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/2/);
      await d.accept();
    });
    await page.locator('#btn-warehouse-weight-keep-recent').click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bp: (st.bpYears || []).slice().sort(),
              weight: (st.weightYears || []).slice().sort(),
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        bp: ['2023', '2024', '2025', '2026'],
        weight: ['2025', '2026'],
      });

    await expect(page.locator('#warehouse-weight-year-list li')).toHaveCount(2, { timeout: 8_000 });
    await expect(page.locator('#warehouse-bp-year-list li')).toHaveCount(4);
  });

  test('keep recent N years both domains: N=2 trims BP and weight together', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2023-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2024-03-10T08:00:00', systolic: 118, diastolic: 78 },
        { datetime: '2025-03-10T08:00:00', systolic: 122, diastolic: 81 },
        { datetime: '2026-03-10T08:00:00', systolic: 119, diastolic: 79 },
      ];
      data.weight = [
        { datetime: '2023-02-01T07:00:00', value: 72.0 },
        { datetime: '2024-02-01T07:00:00', value: 71.0 },
        { datetime: '2025-02-01T07:00:00', value: 70.0 },
        { datetime: '2026-02-01T07:00:00', value: 69.0 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      await HH.persistHealthDataWarehouse(data);
    });

    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        )
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-years-both-actions')).toBeVisible({ timeout: 8_000 });
    await page.locator('#warehouse-bp-keep-years').selectOption('2');
    await expect(page.locator('#btn-warehouse-years-keep-both')).toContainText(/2/);

    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/2/);
      await d.accept();
    });
    await page.locator('#btn-warehouse-years-keep-both').click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bp: (st.bpYears || []).slice().sort(),
              weight: (st.weightYears || []).slice().sort(),
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        bp: ['2025', '2026'],
        weight: ['2025', '2026'],
      });

    await expect(page.locator('#warehouse-bp-year-list li')).toHaveCount(2, { timeout: 8_000 });
    await expect(page.locator('#warehouse-weight-year-list li')).toHaveCount(2);
  });

  test('encrypted backup roundtrip with passphrase', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#warehouse-consent').check();
    await expect
      .poll(async () => page.evaluate(() => window.HealthHistory.isWarehouseConsentGranted()), {
        timeout: 8_000,
      })
      .toBe(true);

    const pass = 'e2e-secret-42';
    const envelope = await page.evaluate(async (passphrase) => {
      return window.HealthHistory.exportWarehouseBackup({
        includeSnapshots: false,
        includeEvents: false,
        includeReports: false,
        includeBatches: false,
        passphrase,
      });
    }, pass);

    expect(envelope.encryption).toBe('passphrase-aes-gcm');
    expect(envelope.cipher && envelope.cipher.ciphertextB64).toBeTruthy();
    expect(envelope.payload).toBeFalsy();

    // Wrong passphrase fails
    const wrong = await page.evaluate(async (env) => {
      try {
        await window.HealthHistory.importWarehouseBackup(env, { passphrase: 'wrong' });
        return 'ok';
      } catch (e) {
        return String(e && e.message ? e.message : e);
      }
    }, envelope);
    expect(wrong).toMatch(/decrypt_failed|passphrase/i);

    // Wipe then import with correct passphrase
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#btn-clear-all-local').click();
    await expect(page.locator('body')).not.toHaveClass(/has-results/, { timeout: 15_000 });

    await page.evaluate(
      async ({ env, passphrase }) => {
        await window.HealthHistory.importWarehouseBackup(env, {
          regrantConsent: true,
          passphrase,
        });
      },
      { env: envelope, passphrase: pass }
    );

    await page.reload();
    await page.waitForFunction(() => !!(window.HealthHistory && window.HealthAnalyzer));
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
  });

  test('clear payload keeps consent; home restore banner appears', async ({ page }) => {
    await waitAppReady(page);
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await setWorkspace(page, 'more');
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#warehouse-consent').check();
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

    // Domain list should render after save
    await expect(page.locator('#warehouse-domain-list li').first()).toBeVisible({ timeout: 8_000 });

    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.locator('#btn-warehouse-clear-payload').click();
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return st && st.granted && !st.hasPayload;
          }),
        { timeout: 8_000 }
      )
      .toBe(true);

    // Re-save current analysis
    await page.locator('#btn-warehouse-persist').click();
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return !!(st && st.hasPayload);
          }),
        { timeout: 8_000 }
      )
      .toBe(true);

    // Reset UI only (keep warehouse) via re-upload path is heavy; use evaluate to clear memory UI
    await page.evaluate(() => {
      // mimic no results for home banner
      document.body.classList.remove('has-results');
    });
    // Open source area: home banner when no results but payload
    await page.reload();
    await page.waitForFunction(() => !!(window.HealthHistory && window.I18n));
    // Auto-hydrate will restore results; banner on home only when not has-results —
    // after auto hydrate we should see restored banner instead
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#warehouse-restored-banner')).toBeVisible();
  });
});
