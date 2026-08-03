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

    // Overview density MVP+: status band, today strip, signals, primary CTAs
    await expect(page.getByTestId('status-band')).toBeVisible();
    const priorityTitle = await page.getByTestId('priority-title').innerText();
    expect(priorityTitle.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId('kpi-freshness')).toBeVisible();
    await expect(page.getByTestId('today-strip')).toBeVisible();
    await expect(page.getByTestId('today-strip-range')).toBeVisible();
    await expect(page.getByTestId('signal-list')).toBeVisible();
    await expect(page.getByTestId('primary-actions')).toBeVisible();
    await expect(page.getByTestId('kpi-visibility-bar')).toBeVisible();
    await expect(page.getByTestId('llm-prompt-bar')).toBeVisible();
    await expect(page.getByTestId('llm-prompt-copy')).toBeVisible();
    // Personal context (legacy-compatible localStorage)
    await expect(page.getByTestId('user-context-panel')).toBeAttached();
    await page.getByTestId('user-context-panel').locator('summary').click();
    await page.getByTestId('user-ctx-focus').fill('e2e-focus');
    await page.getByTestId('user-ctx-save').click();
    await expect(page.getByTestId('user-ctx-status')).toContainText(
      /保存|Saved|本机/i,
      { timeout: 5_000 },
    );
    await page.getByTestId('llm-prompt-copy').click();
    await expect(page.getByTestId('llm-prompt-status')).toContainText(
      /复制|Copied|字|char/i,
      { timeout: 5_000 },
    );
    await expect(page.getByTestId('kpi-card-cgm')).toBeVisible();

    // Workspace keyboard shortcuts: Alt+1..4
    await page.keyboard.press('Alt+Digit2');
    await expect(page.getByTestId('page-trends')).toBeVisible();
    await page.keyboard.press('Alt+Digit1');
    await expect(page.getByTestId('page-overview')).toBeVisible();

    // KPI card deep-link → Trends domain
    await page.getByTestId('kpi-card-cgm').click();
    await expect(page.getByTestId('page-trends')).toBeVisible();
    await expect(page.getByTestId('trend-domain-cgmDailyMean')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.locator('[data-testid="desktop-sidebar"] [data-workspace-nav="trends"]').click();
    await expect(page.getByTestId('page-trends')).toBeVisible();
    await expect(page.getByTestId('domain-switcher')).toBeVisible();
    await expect(page.getByTestId('trend-domain-steps')).toBeVisible();
    await expect(page.getByTestId('trend-domain-sleepTotal')).toBeVisible();
    await expect(page.getByTestId('trend-domain-hrv')).toBeVisible();
    // Fixture has CGM — tab marked as having data (domain presence UX)
    await expect(page.getByTestId('trend-domain-cgmDailyMean')).toHaveAttribute(
      'data-has-data',
      '1',
    );
    await expect(page.getByTestId('trend-table-fallback')).toBeVisible();

    await page.locator('[data-testid="desktop-sidebar"] [data-workspace-nav="reports"]').click();
    await expect(page.getByTestId('report-preview')).toBeVisible();
    await expect(page.getByTestId('report-meta')).toBeVisible();
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
    await expect(page.getByTestId('keep-n-panel')).toBeVisible();
    await expect(page.getByTestId('keep-n-preset-compact')).toBeVisible();
    await expect(page.getByTestId('keep-n-preset-tight')).toBeVisible();
    await page.getByTestId('keep-n-preset-tight').click();
    await expect(page.getByTestId('keep-n-months')).toHaveValue('3');
    await expect(page.getByTestId('keep-n-years')).toHaveValue('1');
    await page.getByTestId('keep-n-preset-compact').click();
    await expect(page.getByTestId('keep-n-months')).toHaveValue('6');
    await expect(page.getByTestId('soft-quota-panel')).toBeVisible();
    await expect(page.getByTestId('backup-panel')).toBeVisible();
    await expect(page.getByTestId('backup-export')).toBeVisible();
    await expect(page.getByTestId('shard-cleanup-panel')).toBeVisible();
    await expect(page.getByTestId('shard-list-refresh')).toBeVisible();
    await page.getByTestId('probe-idb').click();
    await expect(page.getByTestId('snapshot-list')).toBeVisible({
      timeout: 10_000,
    });
    const text = await page.getByTestId('snapshot-list').innerText();
    expect(text.length).toBeGreaterThan(10);
  });

  test('persist warehouse then multi-select delete a domain shard', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 15_000 },
    );

    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="data"]')
      .click();
    await expect(page.getByTestId('shard-cleanup-panel')).toBeVisible();
    await page.getByTestId('shard-list-refresh').click();
    await expect(page.getByTestId('shard-cleanup-groups')).toBeVisible({
      timeout: 10_000,
    });
    const beforeText = await page.getByTestId('shard-total-count').innerText();
    const beforeN = Number((beforeText.match(/(\d+)/) || [])[1] || 0);
    expect(beforeN).toBeGreaterThan(0);

    const firstCb = page.locator('[data-testid="shard-cb"]').first();
    await expect(firstCb).toBeVisible();
    await firstCb.check();

    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.getByTestId('shard-delete-selected').click();
    await expect(page.getByTestId('shard-cleanup-status')).toContainText(
      /删除|deleted|已/i,
      { timeout: 10_000 },
    );

    await page.getByTestId('shard-list-refresh').click();
    await expect(page.getByTestId('shard-total-count')).toBeVisible();
    const afterText = await page.getByTestId('shard-total-count').innerText();
    const afterN = Number((afterText.match(/(\d+)/) || [])[1] || 0);
    expect(afterN).toBe(beforeN - 1);

    // Warehouse still loadable after partial delete
    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="overview"]')
      .click();
    await page.getByTestId('clear-session').click();
    await expect(page.getByTestId('overview-empty')).toBeVisible();
    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('analyze-via')).toContainText('数据仓', {
      timeout: 20_000,
    });
  });

  test('warehouse plain backup export then import restores load', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    const cgm1 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm1).toBeGreaterThan(0);

    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 15_000 },
    );

    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="data"]')
      .click();
    await expect(page.getByTestId('backup-panel')).toBeVisible();

    // Plain backup (empty passphrase)
    await page.getByTestId('backup-passphrase').fill('');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('backup-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.hae-backup\.json$/i);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();
    await expect(page.getByTestId('backup-status')).toContainText(/导出|export|下载|download/i, {
      timeout: 10_000,
    });

    // Wipe shared IDB so import is the only restore path
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('health-analyzer-history');
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve(undefined);
      });
    });

    await page.getByTestId('backup-import-input').setInputFiles(backupPath);
    await page.getByTestId('backup-import').click();
    await expect(page.getByTestId('backup-status')).toContainText(/导入|import/i, {
      timeout: 15_000,
    });

    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="overview"]')
      .click();
    await page.getByTestId('clear-session').click();
    await expect(page.getByTestId('overview-empty')).toBeVisible();
    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('analyze-via')).toContainText('数据仓', {
      timeout: 20_000,
    });
    const cgm2 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm2).toBeCloseTo(cgm1, 1);
  });

  test('warehouse encrypted backup export/import with passphrase', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('load-fixture').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    const cgm1 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm1).toBeGreaterThan(0);
    await page.getByTestId('persist-warehouse').click();
    await expect(page.getByTestId('warehouse-persist-status')).toContainText(
      'sharded-v1',
      { timeout: 15_000 },
    );

    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="data"]')
      .click();
    await page.getByTestId('backup-passphrase').fill('e2e-secret-pass');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('backup-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-enc.*\.hae-backup\.json$/i);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('health-analyzer-history');
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve(undefined);
      });
    });

    // Wrong passphrase should fail
    await page.getByTestId('backup-passphrase').fill('wrong-pass');
    await page.getByTestId('backup-import-input').setInputFiles(backupPath);
    await page.getByTestId('backup-import').click();
    await expect(page.getByTestId('backup-status')).toContainText(
      /失败|fail|decrypt/i,
      { timeout: 10_000 },
    );

    // Correct passphrase restores
    await page.getByTestId('backup-passphrase').fill('e2e-secret-pass');
    await page.getByTestId('backup-import-input').setInputFiles(backupPath);
    await page.getByTestId('backup-import').click();
    await expect(page.getByTestId('backup-status')).toContainText(/导入|import/i, {
      timeout: 15_000,
    });

    await page
      .locator('[data-testid="desktop-sidebar"] [data-workspace-nav="overview"]')
      .click();
    await page.getByTestId('clear-session').click();
    await page.getByTestId('load-warehouse').click();
    await expect(page.getByTestId('kpi-cgm')).toBeVisible({ timeout: 20_000 });
    const cgm2 = Number(await page.getByTestId('kpi-cgm').innerText());
    expect(cgm2).toBeCloseTo(cgm1, 1);
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
