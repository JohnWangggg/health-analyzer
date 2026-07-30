// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

test.describe('health-analyzer PWA smoke', () => {
  test('loads shell: title, upload, locale control', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#drop-zone')).toBeVisible();
    await expect(page.locator('#locale-select')).toBeVisible();
    await expect(page.locator('#file-input')).toBeAttached();
    // Core libs loaded
    await expect
      .poll(async () => page.evaluate(() => !!(window.HealthAnalyzer && window.I18n)))
      .toBe(true);
  });

  test('locale switch updates document language and chrome', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.I18n && typeof window.I18n.setLocale === 'function');

    await page.locator('#locale-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText(/Apple Health|Health/i);

    await page.locator('#locale-select').selectOption('zh-TW');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.locator('h1')).toContainText(/健康|分析/);

    await page.locator('#locale-select').selectOption('zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });

  test('theme toggle cycles without error', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#theme-toggle');
    await expect(btn).toBeVisible();
    await btn.click();
    await btn.click();
    await btn.click();
    // Still interactive
    await expect(btn).toBeEnabled();
  });

  test('parse minimal XML → shows results overview', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.HealthAnalyzer && window.I18n);

    // Prefer XML-only import path
    const advanced = page.locator('#advanced-source');
    await advanced.locator('summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();

    await page.locator('#file-input').setInputFiles(FIXTURE);

    // Wait for results
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    // KPI or insights should render something
    const hasKpi = await page.locator('#kpi-grid .kpi-card, #kpi-grid > *').count();
    const hasInsights = await page.locator('#insight-list .insight-item, #insight-list li').count();
    expect(hasKpi + hasInsights).toBeGreaterThan(0);

    // Summary section un-hidden
    await expect(page.locator('#step-summary')).toBeVisible();
    await expect(page.locator('#step-signals')).toBeVisible();
    await expect(page.locator('#step-charts')).toBeVisible();
    await expect(page.locator('#step-prompt')).toBeVisible();
  });

  test('after parse, English locale refreshes analysis chrome', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.HealthAnalyzer && window.I18n);

    await page.locator('#advanced-source summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });

    await page.locator('#locale-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Signals section title / empty or cards in English UI chrome
    await expect(page.locator('#step-signals h2')).toContainText(/signal|Cross/i);

    // Recovery status in EN if recovery KPI present
    const recoveryText = await page.locator('#kpi-grid').innerText().catch(() => '');
    if (/recovery|load|Recovery/i.test(recoveryText)) {
      expect(recoveryText).not.toMatch(/恢复|负荷/);
    }
  });

  test('after parse, buildFhirExportBundle returns Observation Bundle (v1.48+)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          typeof window.HealthAnalyzer.parseHealthXml === 'function' &&
          typeof window.HealthAnalyzer.analyzeAll === 'function' &&
          typeof window.HealthAnalyzer.buildFhirExportBundle === 'function'
        )
    );

    const xml = require('fs').readFileSync(FIXTURE, 'utf8');
    const result = await page.evaluate((xmlText) => {
      const HA = window.HealthAnalyzer;
      const data = HA.parseHealthXml(xmlText);
      // ensure a daily aggregate exists for effectivePeriod date-precision checks
      if (data && data.steps) {
        data.steps['2026-07-15'] = { watch: 5000, iphone: 0, max: 5000 };
      }
      const analysis = HA.analyzeAll(data);
      const out = HA.buildFhirExportBundle(analysis, {
        includeProvenance: false,
      });
      const entries = (out.bundle && out.bundle.entry) || [];
      const obs = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Observation'
      );
      const prov = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Provenance'
      );
      const steps = entries
        .map((e) => e && e.resource)
        .find((r) => r && String(r.id || '').startsWith('obs-steps-'));
      const periodStart = steps && steps.effectivePeriod && steps.effectivePeriod.start;
      const patients = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Patient'
      );
      const withPatient = HA.buildFhirExportBundle(analysis, {
        includePatient: true,
        patientDisplay: 'E2E-Anon',
        patientBirthYear: 1991,
        includeProvenance: false,
      });
      const patientRes = ((withPatient.bundle && withPatient.bundle.entry) || [])
        .map((e) => e.resource)
        .find((r) => r && r.resourceType === 'Patient');
      return {
        resourceType: out.bundle && out.bundle.resourceType,
        type: out.bundle && out.bundle.type,
        obsCount: obs.length,
        provCount: prov.length,
        countsObs: out.counts && out.counts.observations,
        hasJson: typeof out.json === 'string' && out.json.includes('Bundle'),
        hasBtn: !!document.getElementById('btn-export-fhir'),
        fullUrlsOk: entries.every((e) => /^urn:uuid:/i.test(String(e.fullUrl || ''))),
        stepsPeriodDateOnly: periodStart ? /^\d{4}-\d{2}-\d{2}$/.test(String(periodStart)) : true,
        defaultNoPatient: patients.length === 0,
        patientBirthYearOnly: patientRes && String(patientRes.birthDate || '') === '1991',
        patientNoFixedId:
          patientRes &&
          (!patientRes.identifier ||
            !patientRes.identifier.some((id) => id && id.value === 'local-patient')),
        validationOk: !!(out.validation && out.validation.ok),
      };
    }, xml);

    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('collection');
    expect(result.obsCount).toBeGreaterThan(0);
    expect(result.provCount).toBe(0);
    expect(result.countsObs).toBeGreaterThan(0);
    expect(result.hasJson).toBe(true);
    expect(result.fullUrlsOk).toBe(true);
    expect(result.stepsPeriodDateOnly).toBe(true);
    expect(result.defaultNoPatient).toBe(true);
    expect(result.patientBirthYearOnly).toBe(true);
    expect(result.patientNoFixedId).toBe(true);
    expect(result.validationOk).toBe(true);
    expect(result.hasBtn).toBe(true);
  });

  /**
   * v1.56: assert the *downloaded* Bundle JSON (not only in-page construct),
   * covering date-precision Period and Patient merge-safe semantics.
   */
  test('v1.56: FHIR export download Bundle period TZ + Patient semantics', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.I18n &&
          typeof window.HealthAnalyzer.buildFhirExportBundle === 'function'
        )
    );

    const advanced = page.locator('#advanced-source');
    await advanced.locator('summary').click();
    await page.locator('input[name="source"][value="xml_only"]').check();
    await page.locator('#file-input').setInputFiles(FIXTURE);
    await expect(page.locator('#step-overview')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toHaveClass(/has-results/);

    await page.locator('#step-export').scrollIntoViewIfNeeded();
    await expect(page.locator('#btn-export-fhir')).toBeVisible({ timeout: 10_000 });

    // --- Default download: no Patient ---
    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-fhir').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const bundle = JSON.parse(fs.readFileSync(/** @type {string} */ (p), 'utf8'));
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('collection');
      const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => /^urn:uuid:/i.test(String(e.fullUrl || '')))).toBe(true);

      const patients = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Patient'
      );
      expect(patients.length).toBe(0);

      // Timed effective* must carry TZ; daily periods use date-only precision
      for (const e of entries) {
        const r = e && e.resource;
        if (!r || r.resourceType !== 'Observation') continue;
        if (r.effectiveDateTime != null) {
          const edt = String(r.effectiveDateTime);
          const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(edt);
          const timedWithTz =
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(edt) &&
            /(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(edt);
          expect(dateOnly || timedWithTz).toBe(true);
        }
        if (r.effectivePeriod && r.effectivePeriod.start != null) {
          const start = String(r.effectivePeriod.start);
          // Must not be unzoned wall time like 2026-07-10T00:00:00
          expect(start).not.toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);
          if (/T/.test(start)) {
            expect(start).toMatch(/(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/);
          } else {
            expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        }
      }

      const steps = entries
        .map((e) => e && e.resource)
        .find((r) => r && String(r.id || '').startsWith('obs-steps-'));
      if (steps && steps.effectivePeriod) {
        expect(String(steps.effectivePeriod.start)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(String(steps.effectivePeriod.end)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }

    // --- With Patient: no fixed local-patient identifier ---
    await page.locator('#fhir-include-patient').check();
    await page.locator('#fhir-patient-display').fill('E2E-Download-Anon');
    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-fhir').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const bundle = JSON.parse(fs.readFileSync(/** @type {string} */ (p), 'utf8'));
      const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
      const patientRes = entries
        .map((e) => e && e.resource)
        .find((r) => r && r.resourceType === 'Patient');
      expect(patientRes).toBeTruthy();
      expect(patientRes.name && patientRes.name[0] && patientRes.name[0].text).toContain(
        'E2E-Download-Anon'
      );
      // Merge-safe: no shared fixed identifier across exports
      const ids = Array.isArray(patientRes.identifier) ? patientRes.identifier : [];
      expect(ids.some((id) => id && id.value === 'local-patient')).toBe(false);
      // If birthDate present, year-only is preferred (UI does not set birth year by default)
      if (patientRes.birthDate != null) {
        expect(String(patientRes.birthDate)).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
        // Must not look like fabricated midnights from year-only → Jan 1
        // (UI currently omits birthYear; if present as full date, still allow legitimate dates)
      }
      // Subjects should resolve to Patient fullUrl when Patient is present
      const patientFullUrl = entries.find(
        (e) => e && e.resource && e.resource.resourceType === 'Patient'
      )?.fullUrl;
      const obsWithSubject = entries.filter(
        (e) =>
          e &&
          e.resource &&
          e.resource.resourceType === 'Observation' &&
          e.resource.subject &&
          e.resource.subject.reference
      );
      if (patientFullUrl && obsWithSubject.length) {
        expect(
          obsWithSubject.every((e) => e.resource.subject.reference === patientFullUrl)
        ).toBe(true);
      }
    }
  });
});
