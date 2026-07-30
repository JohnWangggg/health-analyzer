// @ts-check
const { test, expect } = require('@playwright/test');
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

  test('after parse, buildFhirExportBundle returns Observation Bundle (v1.48)', async ({ page }) => {
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
      return {
        resourceType: out.bundle && out.bundle.resourceType,
        type: out.bundle && out.bundle.type,
        obsCount: obs.length,
        provCount: prov.length,
        countsObs: out.counts && out.counts.observations,
        hasJson: typeof out.json === 'string' && out.json.includes('Bundle'),
        hasBtn: !!document.getElementById('btn-export-fhir'),
      };
    }, xml);

    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('collection');
    expect(result.obsCount).toBeGreaterThan(0);
    expect(result.provCount).toBe(0);
    expect(result.countsObs).toBeGreaterThan(0);
    expect(result.hasJson).toBe(true);
    expect(result.hasBtn).toBe(true);
  });
});
