// @ts-check
/**
 * P2 clinical export privacy + HAE / events regression E2E.
 * Prefer this file (avoid clobbering smoke.spec.js / risk.spec.js).
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { setWorkspace, goToReports } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');
const HAE_MINI = path.join(__dirname, 'fixtures/hae-mini.json');

/** Distinctive title — must not appear in default (redacted) clinical export */
const SECRET_TITLE = 'E2E_SECRET_EVENT_XYZ';
/** In-range date for minimal-export.xml (2026-07-10 .. 2026-07-23) */
const SECRET_DATE = '2026-07-15';

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/legacy/');
  await page.waitForFunction(
    () =>
      !!(
        window.HealthAnalyzer &&
        window.I18n &&
        typeof window.HealthAnalyzer.generateClinicalReviewMarkdown === 'function'
      )
  );
  // History / events module (IndexedDB)
  await page.waitForFunction(
    () =>
      !!(
        window.HealthHistory &&
        typeof window.HealthHistory.saveHealthEvent === 'function' &&
        typeof window.HealthHistory.listHealthEvents === 'function'
      )
  );
}

/** @param {import('@playwright/test').Page} page */
async function selectXmlOnly(page) {
  const advanced = page.locator('#advanced-source');
  await advanced.locator('summary').click();
  await page.locator('input[name="source"][value="xml_only"]').check();
}

/**
 * Seed one secret illness event into IndexedDB via HealthHistory.
 * Date is fixed inside the minimal fixture dateRange so includeEvents can assert content.
 * @param {import('@playwright/test').Page} page
 * @param {{ title?: string, date?: string }} [opts]
 */
async function seedSecretEvent(page, opts = {}) {
  const title = opts.title || SECRET_TITLE;
  const date = opts.date || SECRET_DATE;
  await page.evaluate(
    async ({ title, date }) => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      let event;
      if (typeof HA.normalizeHealthEvent === 'function') {
        event = HA.normalizeHealthEvent({
          kind: 'illness',
          date,
          title,
          source: 'manual',
        });
      }
      if (!event) {
        event = {
          id: `ev_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'illness',
          date,
          endDate: '',
          title,
          note: '',
          intensity: null,
          source: 'manual',
          createdAt: new Date().toISOString(),
        };
      }
      await HH.saveHealthEvent(event);
      return event.id;
    },
    { title, date }
  );
}

/**
 * Build analysis in-page from fixture XML text (does not rely on window.__currentAnalysis).
 * @param {import('@playwright/test').Page} page
 * @param {string} xmlText
 */
async function analyzeXmlInPage(page, xmlText) {
  return page.evaluate(async (xml) => {
    const HA = window.HealthAnalyzer;
    const data = HA.parseHealthXml(xml);
    return HA.analyzeAll(data);
  }, xmlText);
}

test.describe('clinical privacy: default export redacts events', () => {
  test('default clinical export does not attach events (API path)', async ({ page }) => {
    await waitAppReady(page);
    const xmlText = fs.readFileSync(FIXTURE, 'utf8');

    await seedSecretEvent(page);
    const listed = await page.evaluate(async () => {
      const rows = await window.HealthHistory.listHealthEvents();
      return rows.map((r) => r.title);
    });
    expect(listed).toContain(SECRET_TITLE);

    const result = await page.evaluate(
      async ({ xml, secret }) => {
        const HA = window.HealthAnalyzer;
        const analysis = HA.analyzeAll(HA.parseHealthXml(xml));
        const events = await window.HealthHistory.listHealthEvents();

        // 1) Default opts {} — no includeEvents
        const def = HA.generateClinicalReviewMarkdown(analysis, null, {});
        // 2) events present but includeEvents omitted → still redacted
        const withEventsNoFlag = HA.generateClinicalReviewMarkdown(analysis, null, {
          events,
        });
        // 3) Explicit includeEvents: true → must surface secret when in range
        const withInclude = HA.generateClinicalReviewMarkdown(analysis, null, {
          includeEvents: true,
          events,
        });
        return {
          dateRange: analysis.dateRange || null,
          defHasSecret: def.includes(secret),
          defHasTimeline:
            /事件时间线|Events timeline/i.test(def) && def.includes(secret),
          noFlagHasSecret: withEventsNoFlag.includes(secret),
          includeHasSecret: withInclude.includes(secret),
          includeHasTimeline: /事件时间线|Events timeline/i.test(withInclude),
          defLen: def.length,
          includeLen: withInclude.length,
        };
      },
      { xml: xmlText, secret: SECRET_TITLE }
    );

    expect(result.defLen).toBeGreaterThan(100);
    expect(result.defHasSecret).toBe(false);
    expect(result.noFlagHasSecret).toBe(false);
    // In-range secret + includeEvents → title must appear
    expect(result.includeHasSecret).toBe(true);
    expect(result.includeHasTimeline).toBe(true);
  });
});

test.describe('clinical privacy: includeEvents UI checkbox', () => {
  test('checkbox defaults unchecked; checking includes secret in MD download', async ({
    page,
  }) => {
    await waitAppReady(page);
    await seedSecretEvent(page);

    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    await goToReports(page);
    await expect(page.locator('#btn-export-clinical-md')).toBeVisible({ timeout: 10_000 });

    const eventsCb = page.locator('#clinical-include-events');
    await expect(eventsCb).toBeAttached();
    await expect(eventsCb).not.toBeChecked();

    // Default export (unchecked) must not contain secret
    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-clinical-md').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const text = fs.readFileSync(/** @type {string} */ (p), 'utf8');
      expect(text.length).toBeGreaterThan(50);
      expect(text).not.toContain(SECRET_TITLE);
    }

    // Check include-events and re-export
    await eventsCb.check();
    await expect(eventsCb).toBeChecked();

    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-clinical-md').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const text = fs.readFileSync(/** @type {string} */ (p), 'utf8');
      expect(text).toContain(SECRET_TITLE);
      expect(text).toMatch(/事件时间线|Events timeline/i);
    }
  });
});

test.describe('clinical privacy: clear-all removes events', () => {
  test('clear-all local data empties events; includeEvents export has no secret', async ({
    page,
  }) => {
    await waitAppReady(page);
    await seedSecretEvent(page);

    let count = await page.evaluate(async () => {
      const rows = await window.HealthHistory.listHealthEvents();
      return rows.filter((r) => r.title === 'E2E_SECRET_EVENT_XYZ').length;
    });
    expect(count).toBeGreaterThan(0);

    // Need analysis so export section is meaningful; clear also resets results
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    const wipeBtn = page.locator('#btn-clear-all-local');
    test.skip(!(await wipeBtn.count()), 'btn-clear-all-local not in DOM');

    await setWorkspace(page, 'more');
    await page.locator('#step-export').scrollIntoViewIfNeeded();
    await expect(wipeBtn).toBeVisible({ timeout: 10_000 });

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await wipeBtn.click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const rows = await window.HealthHistory.listHealthEvents();
            return rows.length;
          }),
        { timeout: 10_000 }
      )
      .toBe(0);

    // After wipe, re-analyze and assert includeEvents with empty list has no secret
    await selectXmlOnly(page);
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await goToReports(page);
    await page.locator('#clinical-include-events').check();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.locator('#btn-export-clinical-md').click(),
    ]);
    const p = await download.path();
    const text = fs.readFileSync(/** @type {string} */ (p), 'utf8');
    expect(text).not.toContain(SECRET_TITLE);

    // Also API: empty events + includeEvents
    const xmlText = fs.readFileSync(FIXTURE, 'utf8');
    const api = await page.evaluate(
      async ({ xml, secret }) => {
        const HA = window.HealthAnalyzer;
        const analysis = HA.analyzeAll(HA.parseHealthXml(xml));
        const events = await window.HealthHistory.listHealthEvents();
        const md = HA.generateClinicalReviewMarkdown(analysis, null, {
          includeEvents: true,
          events,
        });
        return { empty: events.length === 0, hasSecret: md.includes(secret) };
      },
      { xml: xmlText, secret: SECRET_TITLE }
    );
    expect(api.empty).toBe(true);
    expect(api.hasSecret).toBe(false);
  });
});

test.describe('HAE merge light regression', () => {
  test('mergeHaeJsonIntoData blood_glucose → cgm; second merge increases skipped', async ({
    page,
  }) => {
    await waitAppReady(page);
    const haeJson = fs.readFileSync(HAE_MINI, 'utf8');

    const result = await page.evaluate(async (jsonText) => {
      const HA = window.HealthAnalyzer;
      if (typeof HA.createEmptyData !== 'function' || typeof HA.mergeHaeJsonIntoData !== 'function') {
        return { error: 'missing createEmptyData or mergeHaeJsonIntoData' };
      }
      const data = HA.createEmptyData('2026-07-23');
      const first = HA.mergeHaeJsonIntoData(data, jsonText);
      const cgmAfterFirst = data.cgm ? data.cgm.length : 0;
      const second = HA.mergeHaeJsonIntoData(data, jsonText);
      return {
        firstAdded: first.totalAdded,
        firstSkipped: first.totalSkipped,
        cgmAfterFirst,
        secondAdded: second.totalAdded,
        secondSkipped: second.totalSkipped,
        cgmAfterSecond: data.cgm ? data.cgm.length : 0,
        hasCgm: !!(data.dataAvailability && data.dataAvailability.hasCgm),
      };
    }, haeJson);

    expect(result.error).toBeUndefined();
    expect(result.cgmAfterFirst).toBeGreaterThan(0);
    expect(result.firstAdded).toBeGreaterThan(0);
    expect(result.secondSkipped).toBeGreaterThan(0);
    expect(result.secondAdded === 0 || result.secondAdded < result.firstAdded).toBe(true);
    expect(result.cgmAfterSecond).toBe(result.cgmAfterFirst);

    // Optional: analyzeAll after merge yields analysis with CGM domain
    const analyzed = await page.evaluate(async (jsonText) => {
      const HA = window.HealthAnalyzer;
      const data = HA.createEmptyData('2026-07-23');
      HA.mergeHaeJsonIntoData(data, jsonText);
      const analysis = HA.analyzeAll(data);
      const cgmLen =
        (analysis.data && analysis.data.cgm && analysis.data.cgm.length) ||
        (data.cgm && data.cgm.length) ||
        0;
      return { cgmLen, hasDateRange: !!(analysis.dateRange && analysis.dateRange.start) };
    }, haeJson);
    expect(analyzed.cgmLen).toBeGreaterThan(0);
  });
});
