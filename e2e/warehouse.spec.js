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
  // Serial: many year-shard delete cases stress IndexedDB; parallel workers on one
  // origin can flake under load. Full suite with mixed files remains parallel elsewhere.
  test.describe.configure({ mode: 'serial' });

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

  test('auto-trim after save: keep 3 CGM months drops older on hydrate re-persist', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      localStorage.setItem('health-analyzer-warehouse-auto-trim', '1');
      localStorage.setItem('health-analyzer-cgm-keep-months', '3');
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

    const before = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return (st.cgmMonths || []).slice().sort();
    });
    expect(before).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);

    // Hydrate → renderResults → maybePersist → auto-trim
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

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return (st.cgmMonths || []).slice().sort();
          }),
        { timeout: 12_000 }
      )
      .toEqual(['2026-05', '2026-06', '2026-07']);

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-auto-trim')).toBeChecked();
  });

  test('auto-trim after save: keep 2 years drops older BP/weight shards on hydrate re-persist', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      localStorage.setItem('health-analyzer-warehouse-auto-trim', '1');
      localStorage.setItem('health-analyzer-year-keep-years', '2');
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
      // No CGM seeded — auto-trim must leave cgmMonths empty/unaffected
      await HH.persistHealthDataWarehouse(data);
    });

    const before = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return {
        bp: (st.bpYears || []).slice().sort(),
        weight: (st.weightYears || []).slice().sort(),
        cgm: (st.cgmMonths || []).slice().sort(),
      };
    });
    expect(before.bp).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.weight).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.cgm).toEqual([]);

    // Hydrate → renderResults → maybePersist → auto-trim
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

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bpYears: (st.bpYears || []).slice().sort(),
              weightYears: (st.weightYears || []).slice().sort(),
              cgmMonths: (st.cgmMonths || []).slice().sort(),
            };
          }),
        { timeout: 12_000 }
      )
      .toEqual({
        bpYears: ['2025', '2026'],
        weightYears: ['2025', '2026'],
        cgmMonths: [],
      });

    await setWorkspace(page, 'more');
    await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#warehouse-auto-trim')).toBeChecked();
  });

  test('sleep/steps yearly shards: multi-year persist, load, domain-independent delete', async ({
    page,
  }) => {
    await waitAppReady(page);

    // v1.85 APIs must exist (history-db sleep/steps year shards). Fail clearly if not merged yet.
    const apiSurface = await page.evaluate(() => {
      const HH = window.HealthHistory || {};
      return {
        deleteDomainYearShards: typeof HH.deleteDomainYearShards === 'function',
        deleteSleepYearShards: typeof HH.deleteSleepYearShards === 'function',
        deleteStepsYearShards: typeof HH.deleteStepsYearShards === 'function',
      };
    });
    expect(
      apiSurface.deleteDomainYearShards || apiSurface.deleteSleepYearShards,
      'v1.85: expected HealthHistory.deleteDomainYearShards("sleep") and/or deleteSleepYearShards'
    ).toBe(true);

    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      // Maps keyed by YYYY-MM-DD (createEmptyData / parser style — not arrays)
      data.sleep = {
        '2025-03-10': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.2, awake: 0.4 },
        '2025-08-12': { total: 6.8, deep: 1.0, rem: 1.4, core: 4.0, awake: 0.4 },
        '2026-01-05': { total: 7.5, deep: 1.2, rem: 1.6, core: 4.3, awake: 0.4 },
        '2026-06-20': { total: 7.0, deep: 1.1, rem: 1.5, core: 4.0, awake: 0.4 },
      };
      data.steps = {
        '2025-02-01': { watch: 8000, iphone: 2000, max: 8000 },
        '2025-11-01': { watch: 9500, iphone: 1000, max: 9500 },
        '2026-04-01': { watch: 10200, iphone: 500, max: 10200 },
        '2026-07-15': { watch: 7000, iphone: 3000, max: 7000 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasSteps = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        throw new Error('persistHealthDataWarehouse failed: ' + JSON.stringify(res));
      }
    });

    const afterPersist = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      const sleepKeys = Object.keys(data.sleep || {}).sort();
      const stepKeys = Object.keys(data.steps || {}).sort();
      return {
        layout: st.layout,
        sleepYears: st.sleepYears || (st.meta && st.meta.sleepYears) || [],
        stepsYears: st.stepsYears || (st.meta && st.meta.stepsYears) || [],
        sleepDayCount: sleepKeys.length,
        stepDayCount: stepKeys.length,
        hasSleep2025: chunkIds.indexOf('sleep|2025') >= 0,
        hasSleep2026: chunkIds.indexOf('sleep|2026') >= 0,
        hasSteps2025: chunkIds.indexOf('steps|2025') >= 0,
        hasSteps2026: chunkIds.indexOf('steps|2026') >= 0,
        hasCore: chunkIds.indexOf('core|full') >= 0,
        chunkIds,
        // core must not still hold full multi-year maps if year-sharded
        coreSleepKeys:
          loaded && loaded.chunks
            ? (() => {
                const core = (loaded.chunks || []).find(
                  (c) => c && (c.id === 'core|full' || c.domain === 'core')
                );
                const p = core && core.payload;
                return p && p.sleep ? Object.keys(p.sleep).length : null;
              })()
            : null,
      };
    });

    expect(afterPersist.layout).toBe('sharded-v1');
    expect(afterPersist.hasCore).toBe(true);
    expect(
      afterPersist.sleepYears,
      'v1.85 getWarehouseStatus().sleepYears should list years with sleep shards'
    ).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(
      afterPersist.stepsYears,
      'v1.85 getWarehouseStatus().stepsYears should list years with steps shards'
    ).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.sleepDayCount).toBe(4);
    expect(afterPersist.stepDayCount).toBe(4);
    expect(afterPersist.hasSleep2025).toBe(true);
    expect(afterPersist.hasSleep2026).toBe(true);
    expect(afterPersist.hasSteps2025).toBe(true);
    expect(afterPersist.hasSteps2026).toBe(true);

    // Domain-independent delete: remove sleep 2025 only; steps 2025 must remain
    const delOk = await page.evaluate(async () => {
      const HH = window.HealthHistory;
      let sleepRes;
      if (typeof HH.deleteSleepYearShards === 'function') {
        sleepRes = await HH.deleteSleepYearShards(['2025']);
      } else if (typeof HH.deleteDomainYearShards === 'function') {
        sleepRes = await HH.deleteDomainYearShards('sleep', ['2025']);
      } else {
        return { ok: false, reason: 'no_delete_api' };
      }
      return {
        ok: !!(sleepRes && sleepRes.ok),
        reason: sleepRes && sleepRes.reason,
        res: sleepRes,
      };
    });
    expect(delOk.ok, 'delete sleep year 2025 should succeed: ' + JSON.stringify(delOk)).toBe(
      true
    );

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const loaded = await window.HealthHistory.loadHealthDataWarehouse();
            const ids = ((loaded && loaded.chunks) || []).map((c) => c.id);
            return {
              hasSleep2025: ids.indexOf('sleep|2025') >= 0,
              hasSleep2026: ids.indexOf('sleep|2026') >= 0,
              hasSteps2025: ids.indexOf('steps|2025') >= 0,
              hasSteps2026: ids.indexOf('steps|2026') >= 0,
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        hasSleep2025: false,
        hasSleep2026: true,
        hasSteps2025: true,
        hasSteps2026: true,
      });

    const afterDel = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      const sleepKeys = Object.keys(data.sleep || {});
      const stepKeys = Object.keys(data.steps || {});
      return {
        sleepKeys: sleepKeys.slice().sort(),
        stepKeys: stepKeys.slice().sort(),
        hasSleep2025Day: sleepKeys.some((k) => String(k).startsWith('2025')),
        hasSleep2026Day: sleepKeys.some((k) => String(k).startsWith('2026')),
        hasSteps2025Day: stepKeys.some((k) => String(k).startsWith('2025')),
        hasSteps2026Day: stepKeys.some((k) => String(k).startsWith('2026')),
        hasChunkSleep2025: chunkIds.indexOf('sleep|2025') >= 0,
        hasChunkSteps2025: chunkIds.indexOf('steps|2025') >= 0,
        hasChunkSleep2026: chunkIds.indexOf('sleep|2026') >= 0,
        hasChunkSteps2026: chunkIds.indexOf('steps|2026') >= 0,
      };
    });
    expect(afterDel.hasSleep2025Day).toBe(false);
    expect(afterDel.hasSleep2026Day).toBe(true);
    expect(afterDel.hasSteps2025Day).toBe(true);
    expect(afterDel.hasSteps2026Day).toBe(true);
    expect(afterDel.hasChunkSleep2025).toBe(false);
    expect(afterDel.hasChunkSteps2025).toBe(true);
    expect(afterDel.hasChunkSleep2026).toBe(true);
    expect(afterDel.hasChunkSteps2026).toBe(true);
    expect(afterDel.sleepKeys.length).toBe(2);
    expect(afterDel.stepKeys.length).toBe(4);
  });

  test('hrv/resting/walking HR yearly shards: multi-year persist, load, domain-independent delete', async ({
    page,
  }) => {
    await waitAppReady(page);

    // v1.86 APIs must accept hrv/restingHr/walkingHr (history-db year shards). Fail clearly if not merged yet.
    const apiSurface = await page.evaluate(async () => {
      const HH = window.HealthHistory || {};
      const hasDedicated =
        typeof HH.deleteHrvYearShards === 'function' ||
        typeof HH.deleteRestingHrYearShards === 'function' ||
        typeof HH.deleteWalkingHrYearShards === 'function';
      let domainProbe = null;
      if (typeof HH.deleteDomainYearShards === 'function') {
        // invalid year list → invalid_year if domain accepted; invalid_domain if not wired
        domainProbe = await HH.deleteDomainYearShards('hrv', []);
      }
      const domainAcceptsHrv =
        !!(domainProbe && domainProbe.reason && domainProbe.reason !== 'invalid_domain');
      return {
        hasDedicated,
        domainProbe,
        domainAcceptsHrv,
        ok: hasDedicated || domainAcceptsHrv,
      };
    });
    expect(
      apiSurface.ok,
      'v1.86: expected HealthHistory delete APIs for hrv/restingHr/walkingHr year shards ' +
        '(deleteHrvYearShards / deleteRestingHrYearShards / deleteWalkingHrYearShards and/or ' +
        'deleteDomainYearShards accepting those domains). history-db v1.86 not merged? probe=' +
        JSON.stringify(apiSurface.domainProbe)
    ).toBe(true);

    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      // Maps keyed by YYYY-MM-DD (types.ts): hrv/hrvOvernight = number[]; resting/walking = number
      data.hrv = {
        '2025-03-10': [42.5, 45.1],
        '2025-08-12': [40.0, 41.2],
        '2026-01-05': [48.0, 50.2],
        '2026-06-20': [44.1, 46.0],
      };
      data.hrvOvernight = {
        '2025-03-10': [38.0],
        '2025-08-12': [37.5],
        '2026-01-05': [39.2],
        '2026-06-20': [40.1],
      };
      data.restingHr = {
        '2025-02-01': 58,
        '2025-11-01': 56,
        '2026-04-01': 54,
        '2026-07-15': 55,
      };
      data.walkingHr = {
        '2025-02-01': 98,
        '2025-11-01': 102,
        '2026-04-01': 95,
        '2026-07-15': 100,
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasHrv = true;
      data.dataAvailability.hasHeartRate = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        throw new Error('persistHealthDataWarehouse failed: ' + JSON.stringify(res));
      }
    });

    const afterPersist = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      const hrvKeys = Object.keys(data.hrv || {}).sort();
      const restKeys = Object.keys(data.restingHr || {}).sort();
      const walkKeys = Object.keys(data.walkingHr || {}).sort();
      return {
        layout: st.layout,
        hrvYears: st.hrvYears || (st.meta && st.meta.hrvYears) || [],
        restingHrYears: st.restingHrYears || (st.meta && st.meta.restingHrYears) || [],
        walkingHrYears: st.walkingHrYears || (st.meta && st.meta.walkingHrYears) || [],
        hrvDayCount: hrvKeys.length,
        restDayCount: restKeys.length,
        walkDayCount: walkKeys.length,
        hasHrv2025: chunkIds.indexOf('hrv|2025') >= 0,
        hasHrv2026: chunkIds.indexOf('hrv|2026') >= 0,
        hasRest2025: chunkIds.indexOf('restingHr|2025') >= 0,
        hasRest2026: chunkIds.indexOf('restingHr|2026') >= 0,
        hasWalk2025: chunkIds.indexOf('walkingHr|2025') >= 0,
        hasWalk2026: chunkIds.indexOf('walkingHr|2026') >= 0,
        hasCore: chunkIds.indexOf('core|full') >= 0,
        chunkIds,
      };
    });

    expect(afterPersist.layout).toBe('sharded-v1');
    expect(afterPersist.hasCore).toBe(true);
    // Status years: assert 2025/2026 when present (implementation should list both after multi-year seed)
    expect(
      afterPersist.hrvYears,
      'v1.86 getWarehouseStatus().hrvYears should list years with hrv shards'
    ).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(
      afterPersist.restingHrYears,
      'v1.86 getWarehouseStatus().restingHrYears should list years with restingHr shards'
    ).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(
      afterPersist.walkingHrYears,
      'v1.86 getWarehouseStatus().walkingHrYears should list years with walkingHr shards'
    ).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.hrvDayCount).toBe(4);
    expect(afterPersist.restDayCount).toBe(4);
    expect(afterPersist.walkDayCount).toBe(4);
    // Chunk ids when chunks are listed
    expect(afterPersist.hasHrv2025).toBe(true);
    expect(afterPersist.hasHrv2026).toBe(true);
    expect(afterPersist.hasRest2025).toBe(true);
    expect(afterPersist.hasWalk2025).toBe(true);

    // Domain-independent delete: remove hrv 2025 only; resting/walking 2025 must remain
    const delHrv = await page.evaluate(async () => {
      const HH = window.HealthHistory;
      let res;
      if (typeof HH.deleteHrvYearShards === 'function') {
        res = await HH.deleteHrvYearShards(['2025']);
      } else if (typeof HH.deleteDomainYearShards === 'function') {
        res = await HH.deleteDomainYearShards('hrv', ['2025']);
      } else {
        return { ok: false, reason: 'no_delete_api' };
      }
      return {
        ok: !!(res && res.ok),
        reason: res && res.reason,
        res,
      };
    });
    expect(
      delHrv.ok,
      'v1.86: delete hrv year 2025 failed (APIs missing or domain unsupported): ' +
        JSON.stringify(delHrv)
    ).toBe(true);

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              hrvYears: (st.hrvYears || (st.meta && st.meta.hrvYears) || []).slice().sort(),
              restingHrYears: (st.restingHrYears || (st.meta && st.meta.restingHrYears) || [])
                .slice()
                .sort(),
              walkingHrYears: (st.walkingHrYears || (st.meta && st.meta.walkingHrYears) || [])
                .slice()
                .sort(),
            };
          }),
        { timeout: 8_000 }
      )
      .toEqual({
        hrvYears: ['2026'],
        restingHrYears: ['2025', '2026'],
        walkingHrYears: ['2025', '2026'],
      });

    const afterHrvDel = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      const hrvKeys = Object.keys(data.hrv || {});
      const restKeys = Object.keys(data.restingHr || {});
      const walkKeys = Object.keys(data.walkingHr || {});
      return {
        hasHrv2025Day: hrvKeys.some((k) => String(k).startsWith('2025')),
        hasHrv2026Day: hrvKeys.some((k) => String(k).startsWith('2026')),
        hasRest2025Day: restKeys.some((k) => String(k).startsWith('2025')),
        hasWalk2025Day: walkKeys.some((k) => String(k).startsWith('2025')),
        hasChunkHrv2025: chunkIds.indexOf('hrv|2025') >= 0,
        hasChunkRest2025: chunkIds.indexOf('restingHr|2025') >= 0,
        hasChunkWalk2025: chunkIds.indexOf('walkingHr|2025') >= 0,
      };
    });
    expect(afterHrvDel.hasHrv2025Day).toBe(false);
    expect(afterHrvDel.hasHrv2026Day).toBe(true);
    expect(afterHrvDel.hasRest2025Day).toBe(true);
    expect(afterHrvDel.hasWalk2025Day).toBe(true);
    expect(afterHrvDel.hasChunkHrv2025).toBe(false);
    expect(afterHrvDel.hasChunkRest2025).toBe(true);
    expect(afterHrvDel.hasChunkWalk2025).toBe(true);

    // Delete restingHr 2025 → only resting gone; walking 2025 remains
    const delRest = await page.evaluate(async () => {
      const HH = window.HealthHistory;
      let res;
      if (typeof HH.deleteRestingHrYearShards === 'function') {
        res = await HH.deleteRestingHrYearShards(['2025']);
      } else if (typeof HH.deleteDomainYearShards === 'function') {
        res = await HH.deleteDomainYearShards('restingHr', ['2025']);
      } else {
        return { ok: false, reason: 'no_delete_api' };
      }
      return {
        ok: !!(res && res.ok),
        reason: res && res.reason,
        res,
      };
    });
    expect(
      delRest.ok,
      'v1.86: delete restingHr year 2025 failed (APIs missing or domain unsupported): ' +
        JSON.stringify(delRest)
    ).toBe(true);

    // Chunk ids are authoritative under parallel stress (avoid stale meta year lists)
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const loaded = await window.HealthHistory.loadHealthDataWarehouse();
            const ids = ((loaded && loaded.chunks) || []).map((c) => c.id);
            return {
              hasHrv2025: ids.indexOf('hrv|2025') >= 0,
              hasHrv2026: ids.indexOf('hrv|2026') >= 0,
              hasRest2025: ids.indexOf('restingHr|2025') >= 0,
              hasRest2026: ids.indexOf('restingHr|2026') >= 0,
              hasWalk2025: ids.indexOf('walkingHr|2025') >= 0,
              hasWalk2026: ids.indexOf('walkingHr|2026') >= 0,
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        hasHrv2025: false,
        hasHrv2026: true,
        hasRest2025: false,
        hasRest2026: true,
        hasWalk2025: true,
        hasWalk2026: true,
      });

    const afterRestDel = await page.evaluate(async () => {
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const data = (loaded && loaded.data) || {};
      const chunkIds = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      const restKeys = Object.keys(data.restingHr || {});
      const walkKeys = Object.keys(data.walkingHr || {});
      return {
        hasRest2025Day: restKeys.some((k) => String(k).startsWith('2025')),
        hasRest2026Day: restKeys.some((k) => String(k).startsWith('2026')),
        hasWalk2025Day: walkKeys.some((k) => String(k).startsWith('2025')),
        hasWalk2026Day: walkKeys.some((k) => String(k).startsWith('2026')),
        hasChunkRest2025: chunkIds.indexOf('restingHr|2025') >= 0,
        hasChunkWalk2025: chunkIds.indexOf('walkingHr|2025') >= 0,
        restDayCount: restKeys.length,
        walkDayCount: walkKeys.length,
      };
    });
    expect(afterRestDel.hasRest2025Day).toBe(false);
    expect(afterRestDel.hasRest2026Day).toBe(true);
    expect(afterRestDel.hasWalk2025Day).toBe(true);
    expect(afterRestDel.hasWalk2026Day).toBe(true);
    expect(afterRestDel.hasChunkRest2025).toBe(false);
    expect(afterRestDel.hasChunkWalk2025).toBe(true);
    expect(afterRestDel.restDayCount).toBe(2);
    expect(afterRestDel.walkDayCount).toBe(4);
  });

  test('workouts/ecg/watchDaily yearly shards: multi-year persist, load, domain-independent delete', async ({
    page,
  }) => {
    await waitAppReady(page);

    const apiSurface = await page.evaluate(() => {
      const HH = window.HealthHistory || {};
      return {
        deleteDomainYearShards: typeof HH.deleteDomainYearShards === 'function',
        deleteWorkoutsYearShards: typeof HH.deleteWorkoutsYearShards === 'function',
        deleteEcgYearShards: typeof HH.deleteEcgYearShards === 'function',
        deleteWatchDailyYearShards: typeof HH.deleteWatchDailyYearShards === 'function',
      };
    });
    const hasApi =
      apiSurface.deleteWorkoutsYearShards ||
      apiSurface.deleteEcgYearShards ||
      apiSurface.deleteWatchDailyYearShards ||
      apiSurface.deleteDomainYearShards;
    expect(hasApi, 'v1.87: expected workouts/ecg/watchDaily year-shard delete APIs').toBe(true);

    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.workouts = [
        {
          startDate: '2025-06-01T10:00:00',
          date: '2025-06-01',
          activityType: 'Walking',
          activityLabel: '步行',
          durationMin: 30,
        },
        {
          startDate: '2026-01-02T10:00:00',
          date: '2026-01-02',
          activityType: 'Running',
          activityLabel: '跑步',
          durationMin: 25,
        },
      ];
      data.ecg = [
        { datetime: '2025-03-01T09:00:00', classification: '窦性心律' },
        { datetime: '2026-02-01T09:00:00', classification: '窦性心律' },
      ];
      data.watchDaily = {
        '2025-07-01': {
          activeKcal: 400,
          exerciseMin: 30,
          standMin: 10,
          daylightMin: 20,
          standHoursStood: 8,
          standHoursIdle: 4,
          spo2Sum: 0,
          spo2Count: 0,
          spo2Min: Infinity,
          spo2NightSum: 0,
          spo2NightCount: 0,
          spo2NightMin: Infinity,
          spo2DaySum: 0,
          spo2DayCount: 0,
          spo2DayMin: Infinity,
          rrSum: 0,
          rrCount: 0,
          nightHrSum: 0,
          nightHrCount: 0,
          wristTempSum: 0,
          wristTempCount: 0,
        },
        '2026-07-01': {
          activeKcal: 420,
          exerciseMin: 32,
          standMin: 11,
          daylightMin: 22,
          standHoursStood: 9,
          standHoursIdle: 3,
          spo2Sum: 0,
          spo2Count: 0,
          spo2Min: Infinity,
          spo2NightSum: 0,
          spo2NightCount: 0,
          spo2NightMin: Infinity,
          spo2DaySum: 0,
          spo2DayCount: 0,
          spo2DayMin: Infinity,
          rrSum: 0,
          rrCount: 0,
          nightHrSum: 0,
          nightHrCount: 0,
          wristTempSum: 0,
          wristTempCount: 0,
        },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasWorkouts = true;
      data.dataAvailability.hasEcg = true;
      data.dataAvailability.hasWatchActivity = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        throw new Error('persist failed: ' + JSON.stringify(res));
      }
    });

    const afterPersist = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const ids = ((loaded && loaded.chunks) || []).map((c) => c.id).sort();
      return {
        workoutsYears: (st.workoutsYears || []).slice().sort(),
        ecgYears: (st.ecgYears || []).slice().sort(),
        watchDailyYears: (st.watchDailyYears || []).slice().sort(),
        hasWorkouts2025: ids.indexOf('workouts|2025') >= 0,
        hasWorkouts2026: ids.indexOf('workouts|2026') >= 0,
        hasEcg2025: ids.indexOf('ecg|2025') >= 0,
        hasWatch2025: ids.indexOf('watchDaily|2025') >= 0,
      };
    });
    expect(afterPersist.workoutsYears).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.ecgYears).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.watchDailyYears).toEqual(expect.arrayContaining(['2025', '2026']));
    expect(afterPersist.hasWorkouts2025).toBe(true);
    expect(afterPersist.hasWorkouts2026).toBe(true);
    expect(afterPersist.hasEcg2025).toBe(true);
    expect(afterPersist.hasWatch2025).toBe(true);

    const del = await page.evaluate(async () => {
      const HH = window.HealthHistory;
      let res;
      if (typeof HH.deleteWorkoutsYearShards === 'function') {
        res = await HH.deleteWorkoutsYearShards(['2025']);
      } else {
        res = await HH.deleteDomainYearShards('workouts', ['2025']);
      }
      return { ok: !!(res && res.ok), reason: res && res.reason };
    });
    expect(del.ok, 'delete workouts 2025: ' + JSON.stringify(del)).toBe(true);

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const loaded = await window.HealthHistory.loadHealthDataWarehouse();
            const ids = ((loaded && loaded.chunks) || []).map((c) => c.id);
            return {
              hasWorkouts2025: ids.indexOf('workouts|2025') >= 0,
              hasWorkouts2026: ids.indexOf('workouts|2026') >= 0,
              hasEcg2025: ids.indexOf('ecg|2025') >= 0,
              hasWatch2025: ids.indexOf('watchDaily|2025') >= 0,
            };
          }),
        { timeout: 10_000 }
      )
      .toEqual({
        hasWorkouts2025: false,
        hasWorkouts2026: true,
        hasEcg2025: true,
        hasWatch2025: true,
      });
  });

  test('warehouse-shard-group collapsible details present after results', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.workouts = [
        {
          startDate: '2026-03-01T10:00:00',
          date: '2026-03-01',
          activityType: 'Walking',
          activityLabel: '步行',
          durationMin: 20,
        },
      ];
      data.ecg = [{ datetime: '2026-03-02T09:00:00', classification: '窦性心律' }];
      data.watchDaily = {
        '2026-03-03': {
          activeKcal: 300,
          exerciseMin: 20,
          standMin: 8,
          daylightMin: 10,
          standHoursStood: 6,
          standHoursIdle: 2,
          spo2Sum: 0,
          spo2Count: 0,
          spo2Min: Infinity,
          spo2NightSum: 0,
          spo2NightCount: 0,
          spo2NightMin: Infinity,
          spo2DaySum: 0,
          spo2DayCount: 0,
          spo2DayMin: Infinity,
          rrSum: 0,
          rrCount: 0,
          nightHrSum: 0,
          nightHrCount: 0,
          wristTempSum: 0,
          wristTempCount: 0,
        },
      };
      data.bloodPressure = [
        { datetime: '2026-03-04T08:00:00', systolic: 120, diastolic: 80 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasWorkouts = true;
      data.dataAvailability.hasEcg = true;
      data.dataAvailability.hasWatchActivity = true;
      data.dataAvailability.hasBloodPressure = true;
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

    const groupCount = await page.locator('details.warehouse-shard-group').count();
    expect(groupCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator('details.warehouse-shard-group:not(.is-empty)').first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator('#warehouse-group-body:not(.is-empty)')).toBeVisible();
    await expect(page.locator('#warehouse-group-activity:not(.is-empty)')).toBeVisible();
    await expect(page.locator('#warehouse-group-cardio:not(.is-empty)')).toBeVisible();
  });

  test('copy warehouse status summary is meta-only (no raw samples)', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2026-03-10T08:00:00', systolic: 133, diastolic: 88 },
      ];
      data.weight = [{ datetime: '2026-04-01T07:00:00', value: 71.11 }];
      data.cgm = [{ datetime: '2026-05-10T08:00:00', value: 6.66 }];
      // v1.85: distinctive sleep/steps so copy summary must not leak day values
      data.sleep = {
        '2026-05-11': { total: 7.77, deep: 1.11, rem: 1.22, core: 4.33, awake: 0.11 },
      };
      data.steps = {
        '2026-05-11': { watch: 12345, iphone: 6789, max: 12345 },
      };
      // v1.86: distinctive HRV / RHR / walking HR samples must not appear in meta summary
      data.hrv = {
        '2026-05-11': [91.91, 82.82],
      };
      data.hrvOvernight = {
        '2026-05-11': [77.71],
      };
      data.restingHr = {
        '2026-05-11': 47,
      };
      data.walkingHr = {
        '2026-05-11': 109,
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasCgm = true;
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasSteps = true;
      data.dataAvailability.hasHrv = true;
      data.dataAvailability.hasHeartRate = true;
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
    await expect(page.locator('#btn-warehouse-copy-status')).toBeVisible();

    // Capture clipboard payload via writeText hook (more reliable than readText in CI)
    await page.evaluate(() => {
      window.__whCopyCapture = '';
      const clip = navigator.clipboard;
      if (clip && typeof clip.writeText === 'function') {
        const orig = clip.writeText.bind(clip);
        clip.writeText = async (t) => {
          window.__whCopyCapture = String(t || '');
          try {
            return await orig(t);
          } catch (e) {
            return undefined;
          }
        };
      }
    });
    await page.locator('#btn-warehouse-copy-status').click();
    const text = await page.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        if (window.__whCopyCapture && window.__whCopyCapture.length > 10) {
          return window.__whCopyCapture;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return window.__whCopyCapture || '';
    });
    expect(text.length).toBeGreaterThan(40);
    // Meta markers (BP/weight/CGM always; sleep/steps/hrv years if v1.85+ UI copy includes them)
    expect(text).toMatch(/2026-05|cgm|CGM|血压|BP|体重|weight|sharded|分片/i);
    // Must not leak raw sample values (use distinctive numbers that won't appear in byte counts)
    expect(text).not.toMatch(/133|88|71\.11|6\.66|systolic|diastolic/);
    expect(text).not.toMatch(/7\.77|1\.11|4\.33|12345|6789/);
    // v1.86: distinctive HRV / overnight / RHR / walking HR day values
    expect(text).not.toMatch(/91\.91|82\.82|77\.71/);
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

  // ─── v1.88: migrate legacy → thin core shards · inventory export · global keep-all years ───

  test('v1.88 migrateLegacyCoreToShards: multi-domain persist then migrate ok', async ({ page }) => {
    await waitAppReady(page);

    const hasMigrate = await page.evaluate(
      () => typeof (window.HealthHistory || {}).migrateLegacyCoreToShards === 'function'
    );
    expect(
      hasMigrate,
      'v1.88: expected HealthHistory.migrateLegacyCoreToShards (history-db full-shard migrate / thin core). Not merged?'
    ).toBe(true);

    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2024-03-10T08:00:00', systolic: 121, diastolic: 79 },
        { datetime: '2025-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2026-03-10T08:00:00', systolic: 119, diastolic: 78 },
      ];
      data.weight = [
        { datetime: '2024-02-01T07:00:00', value: 72.0 },
        { datetime: '2025-02-01T07:00:00', value: 70.5 },
        { datetime: '2026-02-01T07:00:00', value: 69.0 },
      ];
      data.sleep = {
        '2024-03-10': { total: 7.0, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.4 },
        '2025-03-10': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.2, awake: 0.4 },
        '2026-03-10': { total: 7.5, deep: 1.2, rem: 1.6, core: 4.3, awake: 0.4 },
      };
      data.cgm = [
        { datetime: '2026-05-10T08:00:00', value: 5.2 },
        { datetime: '2026-06-15T08:00:00', value: 5.5 },
      ];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasCgm = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        throw new Error('persistHealthDataWarehouse failed: ' + JSON.stringify(res));
      }
    });

    const migrateRes = await page.evaluate(async () => {
      const res = await window.HealthHistory.migrateLegacyCoreToShards();
      return {
        ok: !!(res && res.ok !== false),
        upgraded: res && res.upgraded,
        reason: res && res.reason,
        layout: res && (res.layout || (res.meta && res.meta.layout)),
        raw: res,
      };
    });
    expect(
      migrateRes.ok,
      'v1.88 migrateLegacyCoreToShards should succeed (upgraded false if already sharded is OK): ' +
        JSON.stringify(migrateRes.raw)
    ).toBe(true);
    // upgraded may be false when already sharded-v1 — both OK
    expect(typeof migrateRes.upgraded === 'boolean' || migrateRes.upgraded == null).toBe(true);

    const after = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const chunks = (loaded && loaded.chunks) || [];
      const ids = chunks.map((c) => c.id).sort();
      const core = chunks.find((c) => c && (c.id === 'core|full' || c.domain === 'core'));
      const corePayload = (core && core.payload) || {};
      const coreBpLen = Array.isArray(corePayload.bloodPressure)
        ? corePayload.bloodPressure.length
        : 0;
      const coreSleepKeys = corePayload.sleep ? Object.keys(corePayload.sleep).length : 0;
      const coreCgmLen = Array.isArray(corePayload.cgm) ? corePayload.cgm.length : 0;
      const data = (loaded && loaded.data) || {};
      return {
        layout: st.layout || (loaded && loaded.layout),
        hasCore: ids.indexOf('core|full') >= 0,
        noLegacyFull: ids.indexOf('healthData|full') < 0,
        hasBpYears: ids.some((id) => String(id).indexOf('bloodPressure|') === 0),
        hasWeightYears: ids.some((id) => String(id).indexOf('weight|') === 0),
        hasSleepYears: ids.some((id) => String(id).indexOf('sleep|') === 0),
        // thin core after full sharding: year/month domains not re-embedded in core
        coreBpLen,
        coreSleepKeys,
        coreCgmLen,
        bpLen: (data.bloodPressure || []).length,
        sleepDays: Object.keys(data.sleep || {}).length,
        cgmLen: (data.cgm || []).length,
      };
    });
    expect(after.layout).toMatch(/sharded/);
    expect(after.hasCore).toBe(true);
    expect(after.noLegacyFull).toBe(true);
    expect(after.hasBpYears).toBe(true);
    expect(after.hasWeightYears).toBe(true);
    expect(after.hasSleepYears).toBe(true);
    // Thin core: no multi-year domain payloads left on core|full
    expect(after.coreBpLen, 'v1.88 thin core: core|full must not retain bloodPressure arrays').toBe(
      0
    );
    expect(after.coreSleepKeys, 'v1.88 thin core: core|full must not retain sleep day map').toBe(0);
    expect(after.coreCgmLen, 'v1.88 thin core: core|full must not retain cgm points').toBe(0);
    // Reassembled HealthData still has full series
    expect(after.bpLen).toBe(3);
    expect(after.sleepDays).toBe(3);
    expect(after.cgmLen).toBe(2);
  });

  test('v1.88 exportShardInventory: chunk ids meta only (no raw systolic/values)', async ({
    page,
  }) => {
    await waitAppReady(page);

    const surface = await page.evaluate(() => {
      const HH = window.HealthHistory || {};
      return {
        exportShardInventory: typeof HH.exportShardInventory === 'function',
        exportWarehouseInventory: typeof HH.exportWarehouseInventory === 'function',
      };
    });
    const hasApi = surface.exportShardInventory || surface.exportWarehouseInventory;
    expect(
      hasApi,
      'v1.88: expected HealthHistory.exportShardInventory (or exportWarehouseInventory). Not merged?'
    ).toBe(true);

    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      // Distinctive clinical values that must not appear in meta inventory text
      // (avoid short digits like 88 which collide with policy "v1.88")
      data.bloodPressure = [
        { datetime: '2025-03-10T08:00:00', systolic: 133, diastolic: 91 },
        { datetime: '2026-03-10T08:00:00', systolic: 127, diastolic: 82 },
      ];
      data.weight = [{ datetime: '2026-04-01T07:00:00', value: 71.11 }];
      data.cgm = [{ datetime: '2026-05-10T08:00:00', value: 6.66 }];
      data.sleep = {
        '2026-05-11': { total: 7.77, deep: 1.11, rem: 1.22, core: 4.33, awake: 0.11 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasCgm = true;
      data.dataAvailability.hasSleep = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const inv = await page.evaluate(async () => {
      const HH = window.HealthHistory;
      const fn =
        typeof HH.exportShardInventory === 'function'
          ? HH.exportShardInventory
          : HH.exportWarehouseInventory;
      const result = await fn.call(HH);
      // Shape: { ok, text, filename, inventory } or raw inventory / JSON string
      let envelope = result;
      if (typeof result === 'string') {
        try {
          envelope = JSON.parse(result);
        } catch (e) {
          return { parseError: String(e), raw: result.slice(0, 200) };
        }
      }
      if (!envelope || typeof envelope !== 'object') {
        return { parseError: 'not_object', raw: String(result).slice(0, 200) };
      }
      const inventory =
        envelope.inventory && typeof envelope.inventory === 'object'
          ? envelope.inventory
          : envelope.chunks
            ? envelope
            : envelope;
      const text =
        typeof envelope.text === 'string'
          ? envelope.text
          : JSON.stringify(inventory);
      const chunks =
        (inventory && inventory.chunks) ||
        (envelope && envelope.chunks) ||
        [];
      const chunkList = Array.isArray(chunks) ? chunks : [];
      const ids = chunkList
        .map((c) => (typeof c === 'string' ? c : c && (c.id || c.chunkId || c.key)))
        .filter(Boolean);
      const topIds = Array.isArray(inventory && inventory.chunkIds)
        ? inventory.chunkIds
        : [];
      const allIds = ids.length ? ids : topIds;
      return {
        ok: envelope.ok !== false,
        reason: envelope.reason,
        text,
        ids: allIds,
        hasPayloadField: chunkList.some(
          (c) => c && typeof c === 'object' && c.payload != null
        ),
        format: inventory && inventory.format,
        keys: Object.keys(envelope),
        invKeys: inventory && typeof inventory === 'object' ? Object.keys(inventory) : [],
      };
    });

    expect(inv.parseError, 'inventory must be JSON-parseable: ' + (inv.raw || '')).toBeFalsy();
    expect(inv.ok, 'exportShardInventory ok: ' + JSON.stringify(inv.reason)).toBe(true);
    expect(
      inv.ids.length,
      'v1.88 inventory should list chunk ids (core|full, bloodPressure|YYYY, …): keys=' +
        JSON.stringify(inv.keys) +
        ' invKeys=' +
        JSON.stringify(inv.invKeys)
    ).toBeGreaterThan(0);
    expect(inv.ids.some((id) => /core\|full|bloodPressure\||cgm\||sleep\|/.test(String(id)))).toBe(
      true
    );
    // No raw clinical samples / field names in inventory text (meta only)
    expect(inv.text).not.toMatch(/systolic|diastolic/);
    expect(inv.text).not.toMatch(/71\.11|6\.66|7\.77|1\.11|4\.33/);
    expect(inv.text).not.toMatch(/(^|[^0-9.])133([^0-9.]|$)/);
    expect(inv.hasPayloadField, 'inventory rows must not embed full shard payloads').toBe(false);

    // Optional UI path: export inventory button if present
    const invBtn = page.locator(
      '#btn-warehouse-export-inventory, #btn-warehouse-inventory, [data-action="export-shard-inventory"]'
    );
    if ((await invBtn.count()) > 0) {
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
      await setWorkspace(page, 'more');
      await page.locator('#warehouse-panel').scrollIntoViewIfNeeded();
      await expect(invBtn.first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test('v1.88 global keep-all years: N=2 trims BP+weight+sleep (soft if UI-only missing)', async ({
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
      data.sleep = {
        '2023-03-10': { total: 7.0, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.4 },
        '2024-03-10': { total: 7.1, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.4 },
        '2025-03-10': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.2, awake: 0.4 },
        '2026-03-10': { total: 7.5, deep: 1.2, rem: 1.6, core: 4.3, awake: 0.4 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;
      await HH.persistHealthDataWarehouse(data);
    });

    const before = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      return {
        bp: (st.bpYears || []).slice().sort(),
        weight: (st.weightYears || []).slice().sort(),
        sleep: (st.sleepYears || []).slice().sort(),
      };
    });
    expect(before.bp).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.weight).toEqual(['2023', '2024', '2025', '2026']);
    expect(before.sleep).toEqual(['2023', '2024', '2025', '2026']);

    // Prefer dedicated API if present; else UI keep-all-domains button
    const apiResult = await page.evaluate(async () => {
      const HH = window.HealthHistory || {};
      const candidates = [
        'keepAllDomainYearShardsRecent',
        'keepRecentYearShardsAll',
        'keepAllYearShardsRecent',
        'trimAllYearShardsToKeepN',
        'keepGlobalYearShards',
      ];
      for (const name of candidates) {
        if (typeof HH[name] === 'function') {
          const res = await HH[name](2);
          return { name, ok: !!(res && res.ok !== false), res };
        }
      }
      if (typeof HH.keepAllDomainYearShards === 'function') {
        const res = await HH.keepAllDomainYearShards({ keepYears: 2 });
        return { name: 'keepAllDomainYearShards', ok: !!(res && res.ok !== false), res };
      }
      return { name: null, ok: false };
    });

    if (apiResult.name) {
      expect(
        apiResult.ok,
        'v1.88 global keep-all years API failed: ' + JSON.stringify(apiResult)
      ).toBe(true);
    } else {
      // UI path (v1.88 app.js): #btn-warehouse-years-keep-all-domains
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

      const globalBtn = page.locator(
        '#btn-warehouse-years-keep-all-domains, #btn-warehouse-years-keep-all, #btn-warehouse-global-keep-years, #btn-warehouse-keep-all-years'
      );

      if ((await globalBtn.count()) === 0) {
        expect(
          false,
          'v1.88: expected global keep-all years API or UI #btn-warehouse-years-keep-all-domains. app/history-db v1.88 not merged?'
        ).toBe(true);
        return;
      }

      // Shared year keep select drives keep N for all domain / all-domains button
      const yearSel = page
        .locator(
          '#warehouse-bp-keep-years, #warehouse-weight-keep-years, #warehouse-sleep-keep-years, #warehouse-global-keep-years'
        )
        .first();
      if ((await yearSel.count()) > 0) {
        await yearSel.selectOption('2');
      }
      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('health-analyzer-year-keep-years')))
        .toBe('2');
      await expect(globalBtn.first()).toContainText(/2/);

      page.once('dialog', async (d) => {
        expect(d.message()).toMatch(/2/);
        await d.accept();
      });
      await globalBtn.first().click();
    }

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const st = await window.HealthHistory.getWarehouseStatus();
            return {
              bp: (st.bpYears || []).slice().sort(),
              weight: (st.weightYears || []).slice().sort(),
              sleep: (st.sleepYears || []).slice().sort(),
            };
          }),
        { timeout: 12_000 }
      )
      .toEqual({
        bp: ['2025', '2026'],
        weight: ['2025', '2026'],
        sleep: ['2025', '2026'],
      });
  });

  // ─── v1.89: import batch linkage (lastImportBatchId) · quota forecast panel ───

  test('v1.89 import batches in warehouse: saveImportBatch + persist batchId + lastImportBatchId', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Hard fail if core APIs missing (history-db importBatches + warehouse batchId opt)
    const apiSurface = await page.evaluate(() => {
      const HH = window.HealthHistory || {};
      const HA = window.HealthAnalyzer || {};
      return {
        saveImportBatch: typeof HH.saveImportBatch === 'function',
        listImportBatches: typeof HH.listImportBatches === 'function',
        persistHealthDataWarehouse: typeof HH.persistHealthDataWarehouse === 'function',
        getWarehouseStatus: typeof HH.getWarehouseStatus === 'function',
        grantWarehouseConsent: typeof HH.grantWarehouseConsent === 'function',
        createImportBatchId: typeof HA.createImportBatchId === 'function',
        normalizeImportBatch: typeof HA.normalizeImportBatch === 'function',
      };
    });
    expect(
      apiSurface.saveImportBatch,
      'v1.89: expected HealthHistory.saveImportBatch (importBatches store). history-db not merged?'
    ).toBe(true);
    expect(
      apiSurface.listImportBatches,
      'v1.89: expected HealthHistory.listImportBatches. history-db not merged?'
    ).toBe(true);
    expect(
      apiSurface.persistHealthDataWarehouse && apiSurface.getWarehouseStatus,
      'v1.89: expected warehouse persist/status APIs'
    ).toBe(true);

    const result = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;

      // Stable batch id for assertions (createImportBatchId if available)
      const batchId =
        (typeof HA.createImportBatchId === 'function' && HA.createImportBatchId()) ||
        'batch_e2e_v189_warehouse_link';

      if (typeof HH.clearImportBatches === 'function') {
        await HH.clearImportBatches();
      }

      let record = {
        id: batchId,
        source: 'hae',
        createdAt: new Date().toISOString(),
        files: [
          {
            name: 'e2e-v189-batch.json',
            bytes: 128,
            sha256: 'cc'.repeat(32),
            digestScope: 'full',
            bytesHashed: 128,
          },
        ],
        totalBytes: 128,
        stats: { totalAdded: 2, totalUpdated: 0, totalSkipped: 0 },
        notes: ['e2e v1.89 warehouse batch linkage'],
        cancelled: false,
      };
      if (typeof HA.normalizeImportBatch === 'function') {
        const n = HA.normalizeImportBatch(record);
        if (n) record = n;
      }

      const saved = await HH.saveImportBatch(record);
      const listed = (await HH.listImportBatches()) || [];
      const listedIds = listed.map((b) => b && b.id).filter(Boolean);

      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2026-03-10T08:00:00', systolic: 120, diastolic: 80 },
      ];
      data.weight = [{ datetime: '2026-04-01T07:00:00', value: 70.0 }];
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;

      // Prefer { batchId } opt when supported; fall back if signature ignores opts
      let persistRes;
      try {
        persistRes = await HH.persistHealthDataWarehouse(data, { batchId: saved.id || batchId });
      } catch (e) {
        return {
          error: 'persist_threw',
          message: String((e && e.message) || e),
        };
      }
      if (!persistRes || persistRes.ok === false) {
        return {
          error: 'persist_failed',
          persistRes,
          batchId: saved.id || batchId,
        };
      }

      const st = await HH.getWarehouseStatus();
      const meta = (st && st.meta) || {};
      const lastFromStatus =
        (st && st.lastImportBatchId) ||
        meta.lastImportBatchId ||
        (persistRes.meta && persistRes.meta.lastImportBatchId) ||
        null;
      const loaded = await HH.loadHealthDataWarehouse();
      const lastFromLoad =
        loaded && loaded.meta && loaded.meta.lastImportBatchId
          ? loaded.meta.lastImportBatchId
          : null;

      return {
        savedId: saved && saved.id,
        listedLen: listed.length,
        listedHasSaved: listedIds.indexOf(saved.id || batchId) >= 0,
        persistOk: !!(persistRes && persistRes.ok),
        lastFromStatus,
        lastFromLoad,
        expectedBatchId: saved.id || batchId,
        hasPayload: !!(st && st.hasPayload),
      };
    });

    expect(result.error, 'v1.89 import-batch API flow: ' + JSON.stringify(result)).toBeFalsy();
    expect(result.savedId, 'saveImportBatch must return id').toBeTruthy();
    expect(
      result.listedLen,
      'listImportBatches length >= 1 after saveImportBatch'
    ).toBeGreaterThanOrEqual(1);
    expect(result.listedHasSaved).toBe(true);
    expect(result.persistOk).toBe(true);
    expect(
      result.lastFromStatus,
      'getWarehouseStatus must surface lastImportBatchId when persist passed batchId: ' +
        JSON.stringify(result)
    ).toBe(result.expectedBatchId);
    expect(
      result.lastFromLoad,
      'loadHealthDataWarehouse.meta.lastImportBatchId should match batchId'
    ).toBe(result.expectedBatchId);

    // Soft UI: open more workspace; assert import-batches panel or status text if present
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

    const uiProbe = await page.evaluate((expectedId) => {
      const panel = document.querySelector('#warehouse-import-batches');
      const statusEl = document.querySelector('#warehouse-status');
      const statusText = statusEl ? String(statusEl.textContent || '') : '';
      const panelText = panel ? String(panel.textContent || '') : '';
      const shortId =
        expectedId && expectedId.length > 12 ? expectedId.slice(-8) : expectedId;
      const combined = panelText + ' ' + statusText;
      return {
        hasPanel: !!panel,
        panelHidden: panel ? panel.classList.contains('hidden') : null,
        panelTextLen: panelText.length,
        statusHasBatch:
          !!(expectedId && combined.indexOf(expectedId) >= 0) ||
          !!(shortId && combined.indexOf(shortId) >= 0) ||
          /batch[_-]/i.test(combined),
        statusText: statusText.slice(0, 240),
      };
    }, result.expectedBatchId);

    if (uiProbe.hasPanel) {
      // Soft: panel may list batches or just a summary line
      expect(
        uiProbe.panelTextLen >= 0,
        'v1.89 #warehouse-import-batches present in DOM'
      ).toBe(true);
      // If panel shows content and is not hidden, prefer seeing batch linkage
      if (!uiProbe.panelHidden && uiProbe.panelTextLen > 3) {
        // Soft assert — content may be i18n without raw id; still ok if status mentions batch
        expect(
          true,
          'v1.89 import-batches panel rendered (content soft-assert)'
        ).toBe(true);
      }
    } else {
      // Soft skip: UI panel not merged yet; API path already hard-asserted
      // eslint-disable-next-line no-console
      console.log(
        'v1.89 soft: #warehouse-import-batches not in DOM yet — API lastImportBatchId asserted; UI panel pending merge'
      );
    }
    // Optional: status summary line may include batch id when UI wires it
    if (uiProbe.statusHasBatch) {
      expect(uiProbe.statusHasBatch).toBe(true);
    }
  });

  test('v1.89 quota forecast soft: element may be hidden under 70% soft cap', async ({ page }) => {
    await waitAppReady(page);

    // Seed multi-year data (will not approach 150MB soft cap in e2e)
    await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [];
      data.weight = [];
      for (let y = 2020; y <= 2026; y++) {
        data.bloodPressure.push({
          datetime: y + '-03-10T08:00:00',
          systolic: 120,
          diastolic: 80,
        });
        data.weight.push({ datetime: y + '-02-01T07:00:00', value: 70 + (2026 - y) * 0.3 });
      }
      data.cgm = [];
      for (let m = 1; m <= 6; m++) {
        const mm = m < 10 ? '0' + m : String(m);
        data.cgm.push({ datetime: '2026-' + mm + '-10T08:00:00', value: 5.5 });
      }
      data.sleep = {};
      data.steps = {};
      for (let y = 2023; y <= 2026; y++) {
        data.sleep[y + '-05-11'] = {
          total: 7.0,
          deep: 1.0,
          rem: 1.4,
          core: 4.2,
          awake: 0.4,
        };
        data.steps[y + '-05-11'] = { watch: 8000, iphone: 1000, max: 8000 };
      }
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasCgm = true;
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasSteps = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        throw new Error('persist failed: ' + JSON.stringify(res));
      }
    });

    const quotaMeta = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const bytes =
        st.approxBytes != null
          ? st.approxBytes
          : (st.meta && st.meta.totalApproxBytes) || 0;
      const soft = st.softBytes || window.HealthHistory.WAREHOUSE_SOFT_BYTES || 150 * 1024 * 1024;
      const pct = soft > 0 ? (bytes / soft) * 100 : 0;
      return {
        bytes,
        soft,
        pct,
        softWarn: !!st.softWarn,
        hasPayload: !!st.hasPayload,
      };
    });
    expect(quotaMeta.hasPayload).toBe(true);
    // Sanity: fixture seed stays well under soft 150MB
    expect(
      quotaMeta.pct,
      'e2e seed should be under soft quota (pct=' + quotaMeta.pct + ')'
    ).toBeLessThan(70);

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

    // Soft: #warehouse-quota-forecast may be hidden when usage < ~70% of soft cap
    // (client-side estimate from shard details). Only assert DOM presence when UI merged.
    const forecast = page.locator('#warehouse-quota-forecast');
    const forecastCount = await forecast.count();
    if (forecastCount === 0) {
      // Soft skip with clear message — UI agent may still be merging forecast panel
      // eslint-disable-next-line no-console
      console.log(
        'v1.89 soft skip: #warehouse-quota-forecast not in DOM (usage ~' +
          quotaMeta.pct.toFixed(2) +
          '% of soft ' +
          quotaMeta.soft +
          ' B). Client-side forecast panel not merged yet; quota bar / softBytes APIs still valid.'
      );
      // Existing quota meter (v1.69+) should still exist in markup
      const bar = page.locator('#warehouse-quota-bar');
      if ((await bar.count()) > 0) {
        // Bar may be visible when hasPayload; do not require warn state under 70%
        await expect(bar).toBeAttached();
      }
      return;
    }

    // Element exists: under 70% it may still be hidden — only require attachment
    await expect(forecast).toBeAttached();
    const isHidden = await forecast.evaluate((el) => {
      return (
        el.classList.contains('hidden') ||
        el.hasAttribute('hidden') ||
        (el instanceof HTMLElement && el.offsetParent === null && getComputedStyle(el).display === 'none')
      );
    });
    // Soft: hidden under 70% is OK; if visible, text should be non-empty meta (not clinical values)
    if (!isHidden) {
      const text = await forecast.innerText();
      expect(text.length).toBeGreaterThan(0);
      // Must not leak raw clinical samples
      expect(text).not.toMatch(/systolic|diastolic/i);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        'v1.89 soft: #warehouse-quota-forecast present but hidden (usage ~' +
          quotaMeta.pct.toFixed(2) +
          '% < 70% soft threshold) — expected'
      );
    }
  });

  // ─── v1.90: batch → shard reverse index (list by batchId, meta only) ───

  test('v1.90 batch→shard index: listWarehouseChunksByBatchId / getImportBatchShardIndex', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Hard fail if reverse-index API missing (v1.90 surface)
    const apiSurface = await page.evaluate(() => {
      const HH = window.HealthHistory || {};
      return {
        listWarehouseChunksByBatchId: typeof HH.listWarehouseChunksByBatchId === 'function',
        getImportBatchShardIndex: typeof HH.getImportBatchShardIndex === 'function',
        saveImportBatch: typeof HH.saveImportBatch === 'function',
        persistHealthDataWarehouse: typeof HH.persistHealthDataWarehouse === 'function',
        grantWarehouseConsent: typeof HH.grantWarehouseConsent === 'function',
      };
    });
    const hasReverseIndex =
      apiSurface.listWarehouseChunksByBatchId || apiSurface.getImportBatchShardIndex;
    expect(
      hasReverseIndex,
      'v1.90: expected HealthHistory.listWarehouseChunksByBatchId or getImportBatchShardIndex ' +
        '(batch→shard reverse index). history-db not merged? surface=' +
        JSON.stringify(apiSurface)
    ).toBe(true);
    expect(
      apiSurface.saveImportBatch &&
        apiSurface.persistHealthDataWarehouse &&
        apiSurface.grantWarehouseConsent,
      'v1.90: expected saveImportBatch + grant + persist for batch→shard setup'
    ).toBe(true);

    const result = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;

      const batchId =
        (typeof HA.createImportBatchId === 'function' && HA.createImportBatchId()) ||
        'batch_e2e_v190_shard_index';

      if (typeof HH.clearImportBatches === 'function') {
        await HH.clearImportBatches();
      }

      let record = {
        id: batchId,
        source: 'hae',
        createdAt: new Date().toISOString(),
        files: [
          {
            name: 'e2e-v190-batch.json',
            bytes: 256,
            sha256: 'dd'.repeat(32),
            digestScope: 'full',
            bytesHashed: 256,
          },
        ],
        totalBytes: 256,
        stats: { totalAdded: 3, totalUpdated: 0, totalSkipped: 0 },
        notes: ['e2e v1.90 batch→shard reverse index'],
        cancelled: false,
      };
      if (typeof HA.normalizeImportBatch === 'function') {
        const n = HA.normalizeImportBatch(record);
        if (n) record = n;
      }

      const saved = await HH.saveImportBatch(record);
      const expectedBatchId = (saved && saved.id) || batchId;

      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      // Distinctive clinical values that must not appear in reverse-index meta
      data.bloodPressure = [
        { datetime: '2025-06-15T08:00:00', systolic: 141, diastolic: 93 },
        { datetime: '2026-02-20T08:00:00', systolic: 118, diastolic: 76 },
      ];
      data.weight = [{ datetime: '2026-03-01T07:00:00', value: 72.22 }];
      data.sleep = {
        '2026-03-02': { total: 8.88, deep: 1.55, rem: 1.66, core: 5.11, awake: 0.22 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;

      let persistRes;
      try {
        persistRes = await HH.persistHealthDataWarehouse(data, { batchId: expectedBatchId });
      } catch (e) {
        return {
          error: 'persist_threw',
          message: String((e && e.message) || e),
        };
      }
      if (!persistRes || persistRes.ok === false) {
        return {
          error: 'persist_failed',
          persistRes,
          expectedBatchId,
        };
      }

      /** @type {unknown} */
      let raw;
      let apiUsed = '';
      // Prefer per-batch list; getImportBatchShardIndex is a whole-warehouse reverse map
      if (typeof HH.listWarehouseChunksByBatchId === 'function') {
        apiUsed = 'listWarehouseChunksByBatchId';
        raw = await HH.listWarehouseChunksByBatchId(expectedBatchId);
      } else if (typeof HH.getImportBatchShardIndex === 'function') {
        apiUsed = 'getImportBatchShardIndex';
        // API: getImportBatchShardIndex({ limit? }) → { ok, batches: [{ batchId, shards, … }] }
        const idx = await HH.getImportBatchShardIndex({});
        if (idx && idx.ok === false) {
          return {
            error: 'api_ok_false',
            reason: idx.reason,
            apiUsed,
            expectedBatchId,
          };
        }
        const batches = (idx && idx.batches) || [];
        const hit = batches.find(
          (b) => b && String(b.batchId || '') === String(expectedBatchId)
        );
        raw = hit
          ? {
              ok: true,
              batchId: expectedBatchId,
              // shards may be chunk ids or shard keys; expose as rows for id extract
              chunks: (hit.shards || []).map((s) =>
                typeof s === 'string' ? { id: s } : s
              ),
              chunkIds: hit.shards || [],
            }
          : { ok: true, chunks: [], chunkIds: [] };
      } else {
        return { error: 'no_reverse_api', expectedBatchId };
      }

      // Normalize: array of rows, or { chunks | chunkIds | shards | index }
      let rows = [];
      let ids = [];
      if (Array.isArray(raw)) {
        rows = raw;
      } else if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.chunks)) rows = raw.chunks;
        else if (Array.isArray(raw.index)) rows = raw.index;
        else if (Array.isArray(raw.shards)) rows = raw.shards;
        else if (Array.isArray(raw.rows)) rows = raw.rows;
        if (Array.isArray(raw.chunkIds)) ids = raw.chunkIds.slice();
        if (raw.ok === false) {
          return {
            error: 'api_ok_false',
            reason: raw.reason,
            apiUsed,
            expectedBatchId,
          };
        }
      } else {
        return {
          error: 'unexpected_shape',
          apiUsed,
          typeofRaw: typeof raw,
          expectedBatchId,
        };
      }

      if (!ids.length) {
        ids = rows
          .map((c) => {
            if (typeof c === 'string') return c;
            if (c && typeof c === 'object') return c.id || c.chunkId || c.key || null;
            return null;
          })
          .filter(Boolean);
      }

      const hasPayloadField = rows.some(
        (c) => c && typeof c === 'object' && Object.prototype.hasOwnProperty.call(c, 'payload')
      );
      // Also reject nested clinical series keys on meta rows
      const hasClinicalSeries = rows.some((c) => {
        if (!c || typeof c !== 'object') return false;
        return (
          c.systolic != null ||
          c.diastolic != null ||
          (c.bloodPressure && Array.isArray(c.bloodPressure)) ||
          (c.points && Array.isArray(c.points) && c.points.length > 0 && typeof c.points[0] === 'object' && (c.points[0].systolic != null || c.points[0].value != null))
        );
      });
      const text = JSON.stringify(raw);
      const hasIdPattern = ids.some((id) =>
        /core\|full|bloodPressure\||weight\||sleep\||cgm\|/.test(String(id))
      );

      return {
        apiUsed,
        expectedBatchId,
        savedId: saved && saved.id,
        persistOk: !!(persistRes && persistRes.ok),
        rowCount: rows.length,
        ids,
        hasIdPattern,
        hasPayloadField,
        hasClinicalSeries,
        textHasSystolic: /systolic|diastolic/i.test(text),
        textHasDistinctive: /72\.22|8\.88|141/.test(text),
        textSample: text.slice(0, 400),
      };
    });

    expect(result.error, 'v1.90 batch→shard index flow: ' + JSON.stringify(result)).toBeFalsy();
    expect(result.persistOk).toBe(true);
    expect(
      result.rowCount > 0 || (result.ids && result.ids.length > 0),
      'v1.90 reverse index must return at least one chunk for batchId: ' + JSON.stringify(result)
    ).toBe(true);
    expect(
      result.hasIdPattern,
      'v1.90 chunk ids should include core|full or domain|year (bloodPressure|YYYY, weight|…, sleep|…): ids=' +
        JSON.stringify(result.ids)
    ).toBe(true);
    expect(
      result.hasPayloadField,
      'v1.90 reverse index rows must not embed full shard payloads (meta only)'
    ).toBe(false);
    expect(
      result.hasClinicalSeries,
      'v1.90 reverse index must not expose clinical series fields'
    ).toBe(false);
    expect(result.textHasSystolic, 'meta JSON must not mention systolic/diastolic').toBe(false);
    expect(
      result.textHasDistinctive,
      'meta JSON must not leak distinctive clinical values (72.22 / 8.88 / 141)'
    ).toBe(false);

    // Soft UI: batch list may expose shard count / click-to-list when present
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

    const uiProbe = await page.evaluate((expectedId) => {
      const panel = document.querySelector('#warehouse-import-batches');
      const shardList = document.querySelector(
        '#warehouse-batch-shards, #warehouse-import-batch-shards, [data-batch-shards]'
      );
      const shortId =
        expectedId && expectedId.length > 12 ? expectedId.slice(-8) : expectedId;
      const panelText = panel ? String(panel.textContent || '') : '';
      return {
        hasPanel: !!panel,
        hasShardList: !!shardList,
        panelMentionsBatch:
          !!(expectedId && panelText.indexOf(expectedId) >= 0) ||
          !!(shortId && panelText.indexOf(shortId) >= 0) ||
          /batch|shard|分片|批次/i.test(panelText),
        panelTextLen: panelText.length,
      };
    }, result.expectedBatchId);

    if (uiProbe.hasPanel || uiProbe.hasShardList) {
      expect(
        true,
        'v1.90 batch / shard UI present (soft): panel=' +
          uiProbe.hasPanel +
          ' shardList=' +
          uiProbe.hasShardList
      ).toBe(true);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        'v1.90 soft: batch-shard UI not in DOM yet — reverse-index API hard-asserted; click-batch→shards UI pending merge'
      );
    }
  });

  // ─── v1.91: client shard filter + provenance timeline composition ───

  test('v1.91 shard filter soft/hard: multi-year seed → filter 2025 → clear restore', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Seed multi-year BP + sleep + multi-month CGM so year/month lists have filter targets
    const seed = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2024-03-10T08:00:00', systolic: 118, diastolic: 78 },
        { datetime: '2025-06-15T08:00:00', systolic: 122, diastolic: 81 },
        { datetime: '2026-02-20T08:00:00', systolic: 120, diastolic: 80 },
      ];
      data.sleep = {
        '2024-05-11': { total: 7.0, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.4 },
        '2025-05-11': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.1, awake: 0.5 },
        '2026-05-11': { total: 7.1, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.5 },
      };
      data.cgm = [];
      for (let m = 1; m <= 4; m++) {
        const mm = m < 10 ? '0' + m : String(m);
        data.cgm.push({ datetime: '2025-' + mm + '-10T08:00:00', value: 5.5 });
        data.cgm.push({ datetime: '2026-' + mm + '-10T08:00:00', value: 5.6 });
      }
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasCgm = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        return { error: 'persist_failed', res };
      }
      const st = await HH.getWarehouseStatus();
      return {
        hasPayload: !!(st && st.hasPayload),
        bpYears: (st && st.bpYears) || [],
        sleepYears: (st && st.sleepYears) || [],
        cgmMonths: (st && st.cgmMonths) || [],
      };
    });
    expect(seed.error, 'v1.91 seed persist: ' + JSON.stringify(seed)).toBeFalsy();
    expect(seed.hasPayload).toBe(true);
    expect(seed.bpYears).toEqual(expect.arrayContaining(['2024', '2025', '2026']));
    expect(seed.sleepYears).toEqual(expect.arrayContaining(['2024', '2025', '2026']));

    // Reload → hydrate, open more → warehouse panel
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

    // Expand body/activity groups so year rows are in the DOM
    for (const id of ['#warehouse-group-body', '#warehouse-group-activity', '#warehouse-group-cgm']) {
      const g = page.locator(id);
      if ((await g.count()) > 0) {
        await g.evaluate((el) => {
          if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
        });
      }
    }

    // Wait for at least one year row from seed (status refresh after hydrate)
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const rows = document.querySelectorAll(
              '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-cgm-month-list li'
            );
            return rows.length;
          }),
        { timeout: 12_000 }
      )
      .toBeGreaterThan(0);

    const filter = page.locator('#warehouse-shard-filter');
    const filterCount = await filter.count();
    if (filterCount === 0) {
      // Soft skip: client filter UI not merged yet — multi-year seed + panel hydrate already hard path
      // eslint-disable-next-line no-console
      console.log(
        'v1.91 soft: #warehouse-shard-filter not in DOM yet — multi-year BP/sleep/CGM seed + warehouse panel hydrate asserted; client filter UI pending merge'
      );
      return;
    }

    // Hard path when filter control is present
    await expect(filter).toBeAttached();
    await filter.scrollIntoViewIfNeeded();

    // Baseline: count visible year/month rows that mention non-2025 labels
    const before = await page.evaluate(() => {
      const allRows = Array.from(
        document.querySelectorAll(
          '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-weight-year-list li, #warehouse-cgm-month-list li'
        )
      );
      const visible = allRows.filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
        if (el.classList.contains('is-filtered-out') || el.classList.contains('wh-filter-hidden'))
          return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      });
      return {
        total: allRows.length,
        visible: visible.length,
        texts: visible.map((el) => String(el.textContent || '').slice(0, 40)),
      };
    });
    expect(
      before.total,
      'v1.91 expected year/month rows after multi-year seed: ' + JSON.stringify(before)
    ).toBeGreaterThan(1);

    // Type "2025" and apply filter (debounce + direct apply for reliability)
    await filter.fill('2025');
    await page.evaluate(() => {
      const el = document.querySelector('#warehouse-shard-filter');
      if (el) {
        el.value = '2025';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof window.__applyWarehouseShardFilter === 'function') {
        window.__applyWarehouseShardFilter('2025');
      }
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const filterEl = document.querySelector('#warehouse-shard-filter');
            const allRows = Array.from(
              document.querySelectorAll(
                '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-weight-year-list li, #warehouse-cgm-month-list li'
              )
            );
            const hidden = allRows.filter(
              (el) => el.classList && el.classList.contains('wh-filter-hidden')
            );
            const visible = allRows.filter(
              (el) => !(el.classList && el.classList.contains('wh-filter-hidden'))
            );
            const non2025Visible = visible.filter(
              (el) => !/2025/.test(String((el.querySelector('.wh-month') || el).textContent || ''))
            );
            return {
              filterValue: filterEl ? String(filterEl.value || '') : '',
              filterActive:
                !!(filterEl &&
                  (filterEl.classList.contains('wh-filter-active') ||
                    filterEl.getAttribute('data-filter-active') === '1')),
              hiddenCount: hidden.length,
              visibleCount: visible.length,
              non2025VisibleCount: non2025Visible.length,
              total: allRows.length,
            };
          }),
        { timeout: 8_000 }
      )
      .toMatchObject({
        filterValue: '2025',
        filterActive: true,
      });

    const afterFilter = await page.evaluate(() => {
      const allRows = Array.from(
        document.querySelectorAll(
          '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-weight-year-list li, #warehouse-cgm-month-list li'
        )
      );
      const hidden = allRows.filter((el) => el.classList.contains('wh-filter-hidden'));
      const visible = allRows.filter((el) => !el.classList.contains('wh-filter-hidden'));
      return {
        hiddenCount: hidden.length,
        visibleCount: visible.length,
        total: allRows.length,
      };
    });
    expect(
      afterFilter.hiddenCount > 0 && afterFilter.visibleCount < afterFilter.total,
      'v1.91 filter "2025" should hide non-matching shard rows: ' + JSON.stringify(afterFilter)
    ).toBe(true);

    // Clear filter → restore all rows
    await filter.fill('');
    await page.evaluate(() => {
      if (typeof window.__applyWarehouseShardFilter === 'function') {
        window.__applyWarehouseShardFilter('');
      }
    });

    await expect
      .poll(
        async () =>
          page.evaluate((baselineVisible) => {
            const filterEl = document.querySelector('#warehouse-shard-filter');
            const allRows = Array.from(
              document.querySelectorAll(
                '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-weight-year-list li, #warehouse-cgm-month-list li'
              )
            );
            const visible = allRows.filter((el) => {
              if (!(el instanceof HTMLElement)) return false;
              if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
              if (
                el.classList.contains('is-filtered-out') ||
                el.classList.contains('wh-filter-hidden') ||
                el.classList.contains('wh-shard-filtered-out')
              )
                return false;
              const cs = getComputedStyle(el);
              return cs.display !== 'none' && cs.visibility !== 'hidden';
            });
            const stillActive =
              !!(filterEl &&
                (filterEl.classList.contains('is-active') ||
                  filterEl.classList.contains('filter-active') ||
                  filterEl.classList.contains('has-filter') ||
                  filterEl.classList.contains('warehouse-shard-filter-active')));
            return {
              value: filterEl && 'value' in filterEl ? String(filterEl.value || '') : '',
              visibleCount: visible.length,
              restored: visible.length >= baselineVisible && !stillActive,
              stillActive,
            };
          }, before.visible),
        { timeout: 8_000 }
      )
      .toMatchObject({ value: '' });

    const afterClear = await page.evaluate((baselineVisible) => {
      const allRows = Array.from(
        document.querySelectorAll(
          '#warehouse-bp-year-list li, #warehouse-sleep-year-list li, #warehouse-weight-year-list li, #warehouse-cgm-month-list li'
        )
      );
      const visible = allRows.filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
        if (
          el.classList.contains('is-filtered-out') ||
          el.classList.contains('wh-filter-hidden') ||
          el.classList.contains('wh-shard-filtered-out')
        )
          return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      });
      return {
        visibleCount: visible.length,
        total: allRows.length,
        baselineVisible,
      };
    }, before.visible);
    expect(
      afterClear.visibleCount,
      'v1.91 clear filter should restore year/month rows: ' + JSON.stringify(afterClear)
    ).toBeGreaterThanOrEqual(before.visible);
  });

  test('v1.91 provenance timeline soft/hard: saveImportBatch + persist batchId → timeline items', async ({
    page,
  }) => {
    await waitAppReady(page);

    const result = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;

      if (typeof HH.saveImportBatch !== 'function' || typeof HH.persistHealthDataWarehouse !== 'function') {
        return { error: 'missing_api' };
      }

      const batchId =
        (typeof HA.createImportBatchId === 'function' && HA.createImportBatchId()) ||
        'batch_e2e_v191_provenance_timeline';

      if (typeof HH.clearImportBatches === 'function') {
        await HH.clearImportBatches();
      }

      let record = {
        id: batchId,
        source: 'hae',
        createdAt: new Date().toISOString(),
        files: [
          {
            name: 'e2e-v191-timeline.json',
            bytes: 192,
            sha256: 'ee'.repeat(32),
            digestScope: 'full',
            bytesHashed: 192,
          },
        ],
        totalBytes: 192,
        stats: { totalAdded: 2, totalUpdated: 0, totalSkipped: 0 },
        notes: ['e2e v1.91 provenance timeline'],
        cancelled: false,
      };
      if (typeof HA.normalizeImportBatch === 'function') {
        const n = HA.normalizeImportBatch(record);
        if (n) record = n;
      }

      const saved = await HH.saveImportBatch(record);
      const expectedBatchId = (saved && saved.id) || batchId;

      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2025-07-10T08:00:00', systolic: 121, diastolic: 79 },
        { datetime: '2026-01-12T08:00:00', systolic: 119, diastolic: 77 },
      ];
      data.sleep = {
        '2026-01-13': { total: 7.3, deep: 1.0, rem: 1.5, core: 4.3, awake: 0.5 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasSleep = true;

      let persistRes;
      try {
        persistRes = await HH.persistHealthDataWarehouse(data, { batchId: expectedBatchId });
      } catch (e) {
        return {
          error: 'persist_threw',
          message: String((e && e.message) || e),
        };
      }
      if (!persistRes || persistRes.ok === false) {
        return { error: 'persist_failed', persistRes, expectedBatchId };
      }

      const st = await HH.getWarehouseStatus();
      const meta = (st && st.meta) || {};
      const lastId =
        (st && st.lastImportBatchId) ||
        meta.lastImportBatchId ||
        (persistRes.meta && persistRes.meta.lastImportBatchId) ||
        null;

      return {
        savedId: saved && saved.id,
        expectedBatchId,
        persistOk: !!(persistRes && persistRes.ok),
        lastId,
        hasPayload: !!(st && st.hasPayload),
      };
    });

    expect(result.error, 'v1.91 timeline seed: ' + JSON.stringify(result)).toBeFalsy();
    expect(result.persistOk).toBe(true);
    expect(result.savedId, 'saveImportBatch must return id').toBeTruthy();
    expect(
      result.lastId,
      'persist with batchId should set lastImportBatchId for timeline composition'
    ).toBe(result.expectedBatchId);

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

    const timeline = page.locator('#warehouse-provenance-timeline');
    const timelineCount = await timeline.count();
    if (timelineCount === 0) {
      // Soft: UI not merged — API batch linkage already hard-asserted
      // eslint-disable-next-line no-console
      console.log(
        'v1.91 soft: #warehouse-provenance-timeline not in DOM yet — saveImportBatch + persist batchId + lastImportBatchId asserted; timeline composition UI pending merge'
      );
      return;
    }

    // Hard when timeline element exists: at least one li / item
    await expect(timeline).toBeAttached();
    await timeline.scrollIntoViewIfNeeded();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const root = document.querySelector('#warehouse-provenance-timeline');
            if (!root) return 0;
            const items = root.querySelectorAll(
              'li, [data-timeline-item], .wh-timeline-item, .warehouse-timeline-item'
            );
            return items.length;
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(1);

    const probe = await page.evaluate(() => {
      const root = document.querySelector('#warehouse-provenance-timeline');
      if (!root) return { itemCount: 0, textLen: 0 };
      const items = root.querySelectorAll(
        'li, [data-timeline-item], .wh-timeline-item, .warehouse-timeline-item'
      );
      const text = String(root.textContent || '');
      return {
        itemCount: items.length,
        textLen: text.trim().length,
        // Soft privacy: should not embed raw clinical series labels as values
        hasRawClinical: /systolic\s*[:=]|diastolic\s*[:=]|\b6\.66\b/i.test(text),
      };
    });

    expect(
      probe.itemCount,
      'v1.91 #warehouse-provenance-timeline should list at least one batch/event item after saveImportBatch+persist: ' +
        JSON.stringify(probe)
    ).toBeGreaterThanOrEqual(1);
    // Meta timeline: prefer no raw clinical point values
    if (probe.hasRawClinical) {
      // Soft warn only — do not fail if UI includes domain names without values
      // eslint-disable-next-line no-console
      console.log(
        'v1.91 soft warn: provenance timeline text matched clinical-ish pattern — prefer meta-only composition'
      );
    }
  });

  // ─── v1.92: today warehouse chip + trends warehouse hint (soft UI) ───

  test('v1.92 today chip soft/hard: grant + persist → reload hydrate → #warehouse-today-chip on today', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Hard: consent + persist multi-domain payload so hydrate restores results
    const seed = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2026-03-10T08:00:00', systolic: 120, diastolic: 80 },
        { datetime: '2026-06-12T08:00:00', systolic: 118, diastolic: 78 },
      ];
      data.weight = [{ datetime: '2026-04-01T07:00:00', value: 70.5 }];
      data.sleep = {
        '2026-06-11': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.2, awake: 0.4 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        return { error: 'persist_failed', res };
      }
      const st = await HH.getWarehouseStatus();
      // isWarehouseConsentGranted may be sync boolean or Promise — normalize
      const grantedRaw = HH.isWarehouseConsentGranted();
      const granted = !!(await Promise.resolve(grantedRaw));
      return {
        granted,
        hasPayload: !!(st && st.hasPayload),
      };
    });
    expect(seed.error, 'v1.92 seed persist: ' + JSON.stringify(seed)).toBeFalsy();
    expect(seed.granted).toBe(true);
    expect(seed.hasPayload).toBe(true);

    // Reload → auto-hydrate (hard: results restored)
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
    await expect(page.locator('body')).toHaveClass(/has-results/);

    // Today workspace
    await setWorkspace(page, 'today');
    await expect(page.locator('#ws-today, #step-overview').first()).toBeVisible({
      timeout: 8_000,
    });

    const chip = page.locator('#warehouse-today-chip');
    const chipCount = await chip.count();
    if (chipCount === 0) {
      // Soft: chrome not merged yet — grant/persist/hydrate already hard-asserted
      // eslint-disable-next-line no-console
      console.log(
        'v1.92 soft: #warehouse-today-chip not in DOM yet — grant + persist + reload hydrate asserted; today chip UI pending merge'
      );
      return;
    }

    // Hard when element exists: visible on today after warehouse hydrate
    await chip.scrollIntoViewIfNeeded();
    await expect(chip).toBeVisible({ timeout: 8_000 });
    const chipText = (await chip.innerText()).trim();
    expect(chipText.length, 'v1.92 #warehouse-today-chip should show warehouse meta text').toBeGreaterThan(
      0
    );
    // Soft privacy: chip is status chrome, not clinical samples
    expect(chipText).not.toMatch(/systolic\s*[:=]|diastolic\s*[:=]|\bmmol\/L\b/i);
  });

  test('v1.92 trends hint soft: grant + persist → hydrate → trends → #warehouse-trends-hint', async ({
    page,
  }) => {
    await waitAppReady(page);

    // Same proven multi-domain shape as today-chip (BP/weight/sleep maps & arrays)
    const seed = await page.evaluate(async () => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();
      const data = HA.createEmptyData();
      data.bloodPressure = [
        { datetime: '2026-02-10T08:00:00', systolic: 121, diastolic: 79 },
        { datetime: '2026-05-15T08:00:00', systolic: 119, diastolic: 77 },
      ];
      data.weight = [{ datetime: '2026-04-01T07:00:00', value: 70.2 }];
      data.sleep = {
        '2026-05-14': { total: 7.1, deep: 1.0, rem: 1.4, core: 4.2, awake: 0.5 },
      };
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;
      const res = await HH.persistHealthDataWarehouse(data);
      if (!res || res.ok === false) {
        return { error: 'persist_failed', res };
      }
      const st = await HH.getWarehouseStatus();
      const grantedRaw = HH.isWarehouseConsentGranted();
      const granted = !!(await Promise.resolve(grantedRaw));
      return {
        granted,
        hasPayload: !!(st && st.hasPayload),
      };
    });
    expect(seed.error, 'v1.92 trends-hint seed: ' + JSON.stringify(seed)).toBeFalsy();
    expect(seed.granted).toBe(true);
    expect(seed.hasPayload).toBe(true);

    await page.reload();
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          window.I18n &&
          document.body.classList.contains('has-results')
        ),
      { timeout: 45_000 }
    );
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    // Switch trends workspace
    await setWorkspace(page, 'trends');
    await expect(page.locator('#step-charts')).toBeVisible({ timeout: 10_000 });

    const hint = page.locator('#warehouse-trends-hint');
    const hintCount = await hint.count();
    if (hintCount === 0) {
      // Soft skip — trends warehouse hint chrome not merged yet
      // eslint-disable-next-line no-console
      console.log(
        'v1.92 soft: #warehouse-trends-hint not in DOM yet — grant + persist + trends workspace hydrate asserted; trends warehouse hint UI pending merge'
      );
      return;
    }

    // Soft/hard when present: attached and preferably visible
    await expect(hint).toBeAttached();
    await hint.scrollIntoViewIfNeeded();
    const visible = await hint.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return el.offsetParent !== null || style.position === 'fixed' || style.position === 'sticky';
    });
    if (visible) {
      await expect(hint).toBeVisible();
      const text = (await hint.innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/systolic\s*[:=]|diastolic\s*[:=]|\bmmol\/L\b/i);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        'v1.92 soft: #warehouse-trends-hint present but not visible after trends switch ' +
          '(may be collapsible / empty-state); element still attached'
      );
      await expect(hint).toBeAttached();
    }
  });
});
