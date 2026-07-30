// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { setWorkspace, goToFhirExport } = require('./helpers');

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

    // v1.66: Today workspace shows overview + signals
    await expect(page.locator('#step-signals')).toBeVisible();
    await expect(page.locator('#result-bottom-nav, #result-side-nav').first()).toBeVisible();

    // Trends / Reports / More sections exist and become visible via workspace switch
    await setWorkspace(page, 'trends');
    await expect(page.locator('#step-charts')).toBeVisible();
    await expect(page.locator('#step-summary')).toBeVisible();

    await setWorkspace(page, 'reports');
    await expect(page.locator('#step-prompt')).toBeVisible();
    await expect(page.locator('#step-reports')).toBeVisible();

    await setWorkspace(page, 'more');
    await expect(page.locator('#step-export')).toBeVisible();
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
      const devices = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Device'
      );
      const deviceUrls = new Set(devices.map((e) => String(e.fullUrl || '')));
      const obsWithDev = obs.filter(
        (e) => e.resource && e.resource.device && e.resource.device.reference
      );
      const noDevices = HA.buildFhirExportBundle(analysis, {
        includeDevices: false,
        includeProvenance: false,
      });
      const noDevEntries = (noDevices.bundle && noDevices.bundle.entry) || [];
      return {
        resourceType: out.bundle && out.bundle.resourceType,
        type: out.bundle && out.bundle.type,
        obsCount: obs.length,
        provCount: prov.length,
        countsObs: out.counts && out.counts.observations,
        countsDevices: out.counts && out.counts.devices,
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
        hasDevices: devices.length > 0,
        deviceRefsOk:
          obsWithDev.length > 0 &&
          obsWithDev.every((e) => deviceUrls.has(String(e.resource.device.reference))),
        noDevicesWhenOff:
          (noDevices.counts && noDevices.counts.devices === 0) &&
          noDevEntries.every((e) => !e.resource || e.resource.resourceType !== 'Device'),
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
    expect(result.hasDevices).toBe(true);
    expect(result.deviceRefsOk).toBe(true);
    expect(result.noDevicesWhenOff).toBe(true);
    expect(result.countsDevices).toBeGreaterThan(0);
    expect(result.validationOk).toBe(true);
    expect(result.hasBtn).toBe(true);
  });

  /**
   * v1.56–1.59: assert the *downloaded* Bundle JSON (not only in-page construct),
   * covering date-precision Period, Patient merge-safe semantics, Device wiring,
   * and external-exchange success / gate-block branches.
   */
  test('v1.56–1.59: FHIR export download period/Patient/Device + exchange branches', async ({
    page,
  }) => {
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

    await goToFhirExport(page);
    await expect(page.locator('#btn-export-fhir')).toBeVisible({ timeout: 10_000 });
    // v1.58 tiers
    await expect(page.locator('#fhir-tier-archive')).toBeAttached();
    await expect(page.locator('#fhir-tier-exchange')).toBeAttached();
    await expect(page.locator('#fhir-tier-archive')).toBeChecked();

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

      // v1.57: Devices on by default (UI checkbox checked)
      const devices = entries.filter(
        (e) => e && e.resource && e.resource.resourceType === 'Device'
      );
      expect(devices.length).toBeGreaterThan(0);
      const deviceFullUrls = new Set(devices.map((e) => String(e.fullUrl || '')));
      const obsWithDevice = entries.filter(
        (e) =>
          e &&
          e.resource &&
          e.resource.resourceType === 'Observation' &&
          e.resource.device &&
          e.resource.device.reference
      );
      expect(obsWithDevice.length).toBeGreaterThan(0);
      expect(
        obsWithDevice.every((e) => deviceFullUrls.has(String(e.resource.device.reference)))
      ).toBe(true);
      const deviceNames = devices
        .map((e) => {
          const dn = e.resource.deviceName;
          return Array.isArray(dn) && dn[0] ? String(dn[0].name || '') : '';
        })
        .join(' ');
      // Only high-confidence measurement devices (not HAE / aggregate)
      expect(/Apple Watch|iPhone/i.test(deviceNames)).toBe(true);
      expect(/Health Auto Export|HAE/i.test(deviceNames)).toBe(false);
      expect(
        devices.every((e) => !/hae|apple-health/i.test(String(e.resource.id || '')))
      ).toBe(true);
    }

    // --- External exchange anonymous: download succeeds, no Patient ---
    await page.locator('#fhir-tier-exchange').check();
    await page.locator('#fhir-purpose-anonymous').check();
    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-fhir').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const suggested = download.suggestedFilename();
      expect(suggested).toMatch(/fhir-exchange-bundle/i);
      const bundle = JSON.parse(fs.readFileSync(/** @type {string} */ (p), 'utf8'));
      const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
      expect(
        entries.filter((e) => e.resource && e.resource.resourceType === 'Patient').length
      ).toBe(0);
      expect(
        entries
          .filter((e) => e.resource && e.resource.resourceType === 'Observation')
          .every((e) => !e.resource.subject)
      ).toBe(true);
      const purposeTag = ((bundle.meta && bundle.meta.tag) || []).find(
        (t) => t && t.system === 'urn:health-analyzer:exchange-purpose'
      );
      expect(purposeTag && purposeTag.code).toBe('anonymous-share');
    }

    // --- External exchange personal-handoff: weak id blocked ---
    await page.locator('#fhir-purpose-handoff').check();
    await page.locator('#fhir-patient-display').fill('E2E-Handoff');
    // field is readonly; inject weak id via evaluate
    await page.evaluate(() => {
      const el = document.getElementById('fhir-patient-persistent-id');
      if (el) {
        el.removeAttribute('readonly');
        el.value = '1';
      }
      try {
        localStorage.setItem('health-analyzer-fhir-patient-persistent-id', '1');
      } catch {
        /* ignore */
      }
    });
    {
      let gotDownload = false;
      page.once('download', () => {
        gotDownload = true;
      });
      await page.locator('#btn-export-fhir').click();
      await expect
        .poll(async () => page.locator('#export-status').innerText(), { timeout: 8_000 })
        .toMatch(/交换门禁|未下载|blocked|exchange|失败|FAIL|伪名|persistent|UUID|weak|弱/i);
      await page.waitForTimeout(400);
      expect(gotDownload).toBe(false);
    }

    // --- personal-handoff: generate strong UUID then download ok ---
    await page.locator('#btn-fhir-pid-generate').click();
    const generatedPid = await page.locator('#fhir-patient-persistent-id').inputValue();
    expect(generatedPid.length).toBeGreaterThan(15);
    expect(generatedPid).not.toBe('1');
    {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        page.locator('#btn-export-fhir').click(),
      ]);
      const p = await download.path();
      expect(p).toBeTruthy();
      const bundle = JSON.parse(fs.readFileSync(/** @type {string} */ (p), 'utf8'));
      const patient = (bundle.entry || [])
        .map((e) => e.resource)
        .find((r) => r && r.resourceType === 'Patient');
      expect(patient).toBeTruthy();
      expect(
        (patient.identifier || []).some((id) => id && id.value === generatedPid)
      ).toBe(true);
    }

    // reset to archive for remaining Patient checkbox path
    await page.locator('#fhir-tier-archive').check();

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
