/**
 * Warehouse persist / load / status timing baseline (local, no upload).
 *
 * history-db.js is a browser IIFE (IndexedDB) — this script drives Chromium via
 * Playwright against the static PWA, seeds synthetic multi-year data, and prints
 * JSON timings. Does not execute IDB logic in Node.
 *
 * Usage:
 *   npm run perf:warehouse
 *   node scripts/perf-warehouse-baseline.mjs
 *   node scripts/perf-warehouse-baseline.mjs --years=5 --json
 *   BASE_URL=http://127.0.0.1:4173 node scripts/perf-warehouse-baseline.mjs
 *
 * Exit 0 on success; 1 on failure. Privacy: synthetic points only; no network upload.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'web-ui/public');

function parseArgs(argv) {
  let years = 4;
  let json = false;
  let help = false;
  let baseUrl = process.env.BASE_URL || process.env.PERF_BASE_URL || '';
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--json') json = true;
    else {
      const mY = arg.match(/^--years=(\d+)$/);
      if (mY) years = Math.max(2, Math.min(12, parseInt(mY[1], 10) || 4));
      const mU = arg.match(/^--url=(.+)$/);
      if (mU) baseUrl = mU[1];
    }
  }
  return { years, json, help, baseUrl };
}

function printHelp() {
  console.log(`perf-warehouse-baseline — local warehouse IDB timing (Playwright)

Usage:
  npm run perf:warehouse
  node scripts/perf-warehouse-baseline.mjs [--years=N] [--json] [--url=URL]

Options:
  --years=N   Synthetic calendar years of BP/weight/sleep (default 4, max 12)
  --json      One JSON object on stdout
  --url=URL   Use existing server (skip static serve). Env: BASE_URL
  -h, --help  This help

Notes:
  - Requires @playwright/test (or playwright) + chromium.
  - history-db is browser-only; Node does not import IDB.
  - Also run e2e: npx playwright test e2e/warehouse.spec.js
`);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };
  return map[ext] || 'application/octet-stream';
}

/** Minimal static server for web-ui/public (no SPA rewrite). */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(publicDir, safe);
        if (!filePath.startsWith(publicDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(readFileSync(filePath));
      } catch (e) {
        res.writeHead(500);
        res.end(String(e && e.message ? e.message : e));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function loadPlaywright() {
  const require = createRequire(pathToFileURL(path.join(root, 'package.json')).href);
  try {
    const pw = require('playwright');
    return pw;
  } catch {
    try {
      const core = require('@playwright/test');
      // @playwright/test re-exports chromium via playwright-core path
      const { chromium } = require('playwright-core');
      return { chromium, ...core };
    } catch (e) {
      throw new Error(
        'Playwright not found. From health-analyzer root: npm install && npx playwright install chromium. ' +
          (e && e.message ? e.message : e)
      );
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!existsSync(path.join(publicDir, 'history-db.js')) || !existsSync(path.join(publicDir, 'index.html'))) {
    console.error('Missing web-ui/public (history-db.js / index.html).');
    process.exit(1);
  }

  const log = opts.json ? (...a) => console.error(...a) : (...a) => console.log(...a);
  log('=== perf-warehouse-baseline ===');
  log(`public:  ${publicDir}`);
  log(`years:   ${opts.years}`);

  let ownServer = null;
  let baseURL = opts.baseUrl;
  if (!baseURL) {
    ownServer = await startStaticServer();
    baseURL = ownServer.url;
    log(`server:  ${baseURL} (ephemeral)`);
  } else {
    log(`server:  ${baseURL} (external)`);
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'zh-CN',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  try {
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      () =>
        !!(
          window.HealthAnalyzer &&
          window.HealthHistory &&
          typeof window.HealthHistory.grantWarehouseConsent === 'function' &&
          typeof window.HealthHistory.persistHealthDataWarehouse === 'function' &&
          typeof window.HealthHistory.loadHealthDataWarehouse === 'function' &&
          typeof window.HealthHistory.getWarehouseStatus === 'function'
        ),
      { timeout: 30_000 }
    );

    const timing = await page.evaluate(async (yearCount) => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      await HH.grantWarehouseConsent();

      const data = HA.createEmptyData();
      const thisYear = new Date().getFullYear();
      const years = [];
      for (let i = yearCount - 1; i >= 0; i--) years.push(String(thisYear - i));

      data.bloodPressure = [];
      data.weight = [];
      data.sleep = {};
      data.steps = {};
      data.cgm = [];
      years.forEach((y, yi) => {
        for (let m = 1; m <= 3; m++) {
          const mm = String(m).padStart(2, '0');
          data.bloodPressure.push({
            datetime: `${y}-${mm}-10T08:00:00`,
            systolic: 118 + (yi % 5),
            diastolic: 76 + (yi % 3),
          });
          data.weight.push({ datetime: `${y}-${mm}-01T07:00:00`, value: 70 - yi * 0.2 });
          data.sleep[`${y}-${mm}-10`] = {
            total: 7 + (yi % 3) * 0.1,
            deep: 1.1,
            rem: 1.4,
            core: 4.1,
            awake: 0.4,
          };
          data.steps[`${y}-${mm}-10`] = { watch: 8000 + yi * 100, iphone: 1000, max: 8000 + yi * 100 };
        }
        // one CGM month per year
        data.cgm.push({ datetime: `${y}-06-15T08:00:00`, value: 5.5 + yi * 0.05 });
      });
      data.dataAvailability = data.dataAvailability || {};
      data.dataAvailability.hasBloodPressure = true;
      data.dataAvailability.hasWeight = true;
      data.dataAvailability.hasSleep = true;
      data.dataAvailability.hasSteps = true;
      data.dataAvailability.hasCgm = true;

      const t0 = performance.now();
      const persistRes = await HH.persistHealthDataWarehouse(data);
      const persistMs = performance.now() - t0;
      if (!persistRes || persistRes.ok === false) {
        throw new Error('persist failed: ' + JSON.stringify(persistRes));
      }

      const t1 = performance.now();
      const loaded = await HH.loadHealthDataWarehouse();
      const loadMs = performance.now() - t1;

      const t2 = performance.now();
      const status = await HH.getWarehouseStatus();
      const statusMs = performance.now() - t2;

      const chunkCount = loaded && loaded.chunks ? loaded.chunks.length : 0;
      const bpLen = (loaded && loaded.data && loaded.data.bloodPressure) || [];
      const apis = {
        migrateLegacyCoreToShards: typeof HH.migrateLegacyCoreToShards === 'function',
        exportShardInventory: typeof HH.exportShardInventory === 'function',
        splitHealthDataShards: typeof HH.splitHealthDataShards === 'function',
      };

      let migrateMs = null;
      let inventoryMs = null;
      if (apis.migrateLegacyCoreToShards) {
        const tm = performance.now();
        await HH.migrateLegacyCoreToShards();
        migrateMs = performance.now() - tm;
      }
      if (apis.exportShardInventory) {
        const ti = performance.now();
        await HH.exportShardInventory();
        inventoryMs = performance.now() - ti;
      }

      return {
        persistMs: Number(persistMs.toFixed(2)),
        loadMs: Number(loadMs.toFixed(2)),
        statusMs: Number(statusMs.toFixed(2)),
        migrateMs: migrateMs != null ? Number(migrateMs.toFixed(2)) : null,
        inventoryMs: inventoryMs != null ? Number(inventoryMs.toFixed(2)) : null,
        layout: status && status.layout,
        chunkCount,
        bpPoints: bpLen.length,
        years,
        approxBytes: (status && (status.approxBytes || (status.meta && status.meta.totalApproxBytes))) || null,
        apis,
      };
    }, opts.years);

    const summary = {
      tool: 'perf-warehouse-baseline',
      baseURL,
      years: opts.years,
      ...timing,
      totalMs: Number(
        (
          timing.persistMs +
          timing.loadMs +
          timing.statusMs +
          (timing.migrateMs || 0) +
          (timing.inventoryMs || 0)
        ).toFixed(2)
      ),
      note: 'Synthetic multi-year warehouse timings via Playwright + IndexedDB. No upload.',
    };

    if (opts.json) {
      console.log(JSON.stringify(summary));
    } else {
      log('\n--- summary ---');
      log(`layout:       ${summary.layout}`);
      log(`chunks:       ${summary.chunkCount}`);
      log(`bp_points:    ${summary.bpPoints}`);
      log(`persist_ms:   ${summary.persistMs}`);
      log(`load_ms:      ${summary.loadMs}`);
      log(`status_ms:    ${summary.statusMs}`);
      if (summary.migrateMs != null) log(`migrate_ms:   ${summary.migrateMs}`);
      if (summary.inventoryMs != null) log(`inventory_ms: ${summary.inventoryMs}`);
      log(`total_ms:     ${summary.totalMs}`);
      log(`apis:         ${JSON.stringify(summary.apis)}`);
      log('\njson:', JSON.stringify(summary));
    }
  } finally {
    await browser.close().catch(() => {});
    if (ownServer) {
      await new Promise((r) => ownServer.server.close(() => r()));
    }
  }
}

main().catch((e) => {
  console.error('perf-warehouse-baseline failed:', e && e.message ? e.message : e);
  process.exit(1);
});
