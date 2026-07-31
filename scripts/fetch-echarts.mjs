#!/usr/bin/env node
/**
 * Download Apache ECharts min bundle into web-ui/public/vendor/ for offline PWA use.
 * No runtime CDN — run once (or when bumping the version pin below).
 *
 * Usage: node scripts/fetch-echarts.mjs
 * npm run vendor:echarts
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ECHARTS_VERSION = '5.5.1';
// Prefer jsDelivr npm mirror; fall back to unpkg
const URLS = [
  `https://cdn.jsdelivr.net/npm/echarts@${ECHARTS_VERSION}/dist/echarts.min.js`,
  `https://unpkg.com/echarts@${ECHARTS_VERSION}/dist/echarts.min.js`,
  `https://registry.npmjs.org/echarts/-/echarts-${ECHARTS_VERSION}.tgz`, // not used directly
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'web-ui', 'public', 'vendor', 'echarts.min.js');

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  const body = res.body;
  if (!body) throw new Error('Empty body');
  await pipeline(Readable.fromWeb(body), createWriteStream(dest));
}

async function main() {
  let lastErr;
  for (const url of URLS.slice(0, 2)) {
    try {
      process.stderr.write(`Fetching ${url} …\n`);
      await download(url, outPath);
      const size = statSync(outPath).size;
      if (size < 100_000) throw new Error(`File too small (${size} bytes) — not a valid echarts.min.js`);
      process.stderr.write(`Wrote ${outPath} (${(size / 1024 / 1024).toFixed(2)} MB)\n`);
      process.stderr.write(
        `Note: echarts.min.js is large (~1MB) — OK for local PWA; never load from CDN at runtime.\n`
      );
      return;
    } catch (e) {
      lastErr = e;
      process.stderr.write(`Failed: ${e && e.message ? e.message : e}\n`);
    }
  }
  if (existsSync(outPath) && statSync(outPath).size > 100_000) {
    process.stderr.write(`Keeping existing vendor file at ${outPath}\n`);
    process.exit(0);
  }
  console.error('Could not download ECharts:', lastErr);
  process.exit(1);
}

main();
