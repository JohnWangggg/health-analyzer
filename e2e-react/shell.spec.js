// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { zipSync } = require('../web-ui/react-app/node_modules/fflate');

const fixtureXml = fs.readFileSync(
  path.join(__dirname, '../e2e/fixtures/minimal-export.xml'),
);

test.describe('React dual-track shell', () => {
  test('fixture load + routes + sheet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('desktop-sidebar')).toBeVisible();
    await expect(page.getByTestId('mobile-bottom-nav')).toBeAttached();

    await page.getByTestId('open-about-sheet').click();
    await expect(page.getByTestId('sheet-panel')).toBeVisible();
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('sheet-panel')).toHaveCount(0);

    // shell i18n: switch to EN and back
    await page.getByTestId('locale-select').selectOption('en');
    await expect(page.getByTestId('load-fixture')).toContainText(/fixture|demo/i);
    await page.getByTestId('locale-select').selectOption('zh-CN');

    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    const cgm = await page.getByTestId('kpi-cgm').innerText();
    expect(Number(cgm)).toBeGreaterThan(0);

    // Overview density MVP+: status band, signals, primary CTAs
    await expect(page.getByTestId('status-band')).toBeVisible();
    const priorityTitle = await page.getByTestId('priority-title').innerText();
    expect(priorityTitle.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId('kpi-freshness')).toBeVisible();
    await expect(page.getByTestId('signal-list')).toBeVisible();
    await expect(page.getByTestId('primary-actions')).toBeVisible();

    await page.locator('[data-testid="desktop-sidebar"] [data-workspace-nav="trends"]').click();
    await expect(page.getByTestId('page-trends')).toBeVisible();
    await expect(page.getByTestId('domain-switcher')).toBeVisible();
    await expect(page.getByTestId('trend-domain-steps')).toBeVisible();
    await expect(page.getByTestId('trend-table-fallback')).toBeVisible();

    await page.locator('[data-testid="desktop-sidebar"] [data-workspace-nav="reports"]').click();
    await expect(page.getByTestId('report-preview')).toBeVisible();
    const md = await page.getByTestId('report-preview').innerText();
    expect(md.length).toBeGreaterThan(40);
    await page.getByTestId('report-copy').click();
    await expect(page.getByTestId('report-action-status')).toContainText('复制', {
      timeout: 5_000,
    });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('report-download').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test('XML and ZIP import via adapter', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'minimal-export.xml',
      mimeType: 'text/xml',
      buffer: fixtureXml,
    });
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('analyze-via')).toBeVisible();

    const zipped = zipSync({
      'export.xml': new Uint8Array(fixtureXml),
    });
    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipped),
    });
    await expect(page.getByTestId('analyze-via')).toContainText('ZIP', {
      timeout: 20_000,
    });
    const cgm = await page.getByTestId('kpi-cgm').innerText();
    expect(Number(cgm)).toBeGreaterThan(0);
  });

  test('save snapshot then data page lists it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-range')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('save-snapshot').click();
    await expect(page.getByTestId('snapshot-status')).toContainText('快照', {
      timeout: 10_000,
    });

    await page.locator('[data-testid="desktop-sidebar"] [data-workspace-nav="data"]').click();
    await page.getByTestId('probe-idb').click();
    await expect(page.getByTestId('snapshot-list')).toBeVisible({
      timeout: 10_000,
    });
    const text = await page.getByTestId('snapshot-list').innerText();
    expect(text.length).toBeGreaterThan(10);
  });

  test('HAE import and sharded warehouse persist/load roundtrip', async ({
    page,
  }) => {
    await page.goto('/');
    const haePath = path.join(__dirname, '../e2e/fixtures/hae-mini.json');
    await page.setInputFiles('[data-testid="import-hae-input"]', haePath);
    await expect(page.getByTestId('analyze-via')).toContainText('HAE', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('kpi-cgm')).toBeVisible();
    const cgm1 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm1).toBeGreaterThan(0);
    await expect(page.getByTestId('hae-notes')).toBeVisible();

    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 15_000 },
    );

    await page.getByTestId('clear-session').click();
    await expect(page.getByTestId('overview-empty')).toBeVisible();

    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('analyze-via')).toContainText('数据仓', {
      timeout: 20_000,
    });
    const cgm2 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm2).toBeCloseTo(cgm1, 1);
  });
});
