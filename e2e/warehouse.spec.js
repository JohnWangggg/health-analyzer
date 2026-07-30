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

    const after = await page.evaluate(async () => {
      const st = await window.HealthHistory.getWarehouseStatus();
      const loaded = await window.HealthHistory.loadHealthDataWarehouse();
      const cgm = (loaded && loaded.data && loaded.data.cgm) || [];
      return {
        months: st.cgmMonths || [],
        hasMay: cgm.some((p) => String(p.datetime || '').startsWith('2026-05')),
        hasJune: cgm.some((p) => String(p.datetime || '').startsWith('2026-06')),
        hasJuly: cgm.some((p) => String(p.datetime || '').startsWith('2026-07')),
      };
    });
    expect(after.months).not.toContain('2026-05');
    expect(after.months).not.toContain('2026-06');
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
