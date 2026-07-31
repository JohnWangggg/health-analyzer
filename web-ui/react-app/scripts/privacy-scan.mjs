#!/usr/bin/env node
/**
 * Privacy scan for React preview dist — fails if third-party CDN / analytics
 * hosts or remote runtime resource loads appear.
 *
 * Usage: node scripts/privacy-scan.mjs [distDir]
 *
 * Policy (dual-track):
 * - Forbidden: CDN/font/analytics hosts even in comments of runtime assets
 * - Runtime remote loads (script/link/import/fetch to absolute https) fail
 * - Source maps (*.map) are not runtime; skipped
 * - Framework error-message doc links (react.dev etc.) are allowlisted when
 *   they are not used as module loaders
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = process.argv[2]
  ? process.argv[2]
  : join(__dirname, '..', 'dist');

const FORBIDDEN = [
  /unpkg\.com/i,
  /jsdelivr\.net/i,
  /cdn\.jsdelivr/i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /www\.google-analytics\.com/i,
  /sentry\.io/i,
  /browser\.sentry-cdn/i,
  /segment\.(io|com)/i,
  /mixpanel\.com/i,
  /amplitude\.com/i,
  /hotjar\.com/i,
  /clarity\.ms/i,
  /cdnjs\.cloudflare\.com/i,
  /ajax\.googleapis\.com/i,
  /connect\.facebook\.net/i,
  /static\.cloudflareinsights\.com/i,
  /cloudflareinsights/i,
];

/** Doc / license hosts that libraries embed as strings — not runtime loads. */
const ALLOW_HOSTS = new Set([
  'react.dev',
  'reactjs.org',
  'reactrouter.com',
  'github.com',
  'raw.githubusercontent.com',
  'www.w3.org',
  'w3.org',
  'schema.org',
  'www.schema.org',
  'html.spec.whatwg.org',
  'fetch.spec.whatwg.org',
  'dom.spec.whatwg.org',
  'url.spec.whatwg.org',
  'streams.spec.whatwg.org',
  'developer.mozilla.org',
  'developers.google.com',
  'bugs.chromium.org',
  'bugs.webkit.org',
  'w3c.github.io',
  'opensource.org',
  'bit.ly',
  'goo.gl',
  'vite.dev',
  'vitejs.dev',
  'nodejs.org',
  'www.npmjs.com',
  'npmjs.com',
]);

// Runtime load patterns (absolute URL used as a network dependency)
const RUNTIME_LOAD =
  /(?:import\s*\(|importScripts\s*\(|fetch\s*\(|new\s+Worker\s*\(|(?:src|href)\s*=\s*["'`])\s*["'`]https?:\/\/([^/"'`]+)/gi;

const TEXT_EXT = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.webmanifest',
  '.txt',
  '.svg',
]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function extOf(p) {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i).toLowerCase() : '';
}

if (!existsSync(distDir)) {
  console.error(`[privacy-scan] dist not found: ${distDir}`);
  console.error('Run `npm run build` first.');
  process.exit(2);
}

const files = walk(distDir).filter((f) => {
  const ext = extOf(f);
  if (ext === '.map') return false; // source maps are not runtime
  return TEXT_EXT.has(ext);
});
const hits = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const rel = relative(distDir, file);

  for (const re of FORBIDDEN) {
    re.lastIndex = 0;
    if (re.test(text)) {
      hits.push({ file: rel, kind: 'forbidden-host', pattern: String(re) });
    }
  }

  let m;
  RUNTIME_LOAD.lastIndex = 0;
  while ((m = RUNTIME_LOAD.exec(text)) !== null) {
    const host = m[1].toLowerCase().replace(/:\d+$/, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('[::1]')
    ) {
      continue;
    }
    if (ALLOW_HOSTS.has(host)) {
      // Even allowlisted hosts as *runtime loads* are suspicious — flag
      hits.push({ file: rel, kind: 'runtime-remote-load', pattern: host });
      continue;
    }
    hits.push({ file: rel, kind: 'runtime-remote-load', pattern: host });
  }

  // Also flag any non-allowlisted absolute https host string in HTML (script/link)
  if (extOf(file) === '.html' || extOf(file) === '.webmanifest') {
    const abs = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
    let am;
    while ((am = abs.exec(text)) !== null) {
      const host = am[1].toLowerCase();
      if (ALLOW_HOSTS.has(host)) continue;
      if (host === 'localhost') continue;
      hits.push({ file: rel, kind: 'html-remote-host', pattern: host });
    }
  }
}

// Deduplicate
const seen = new Set();
const uniqueHits = [];
for (const h of hits) {
  const key = `${h.kind}|${h.pattern}|${h.file}`;
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueHits.push(h);
}

const report = {
  distDir,
  fileCount: files.length,
  hitCount: uniqueHits.length,
  hits: uniqueHits,
  ok: uniqueHits.length === 0,
  scannedAt: new Date().toISOString(),
  note: 'Skipped *.map; forbidden CDN/analytics hard-fail; runtime load patterns only for remote https',
};

const summary = [
  `privacy-scan dist=${distDir}`,
  `files=${files.length} hits=${uniqueHits.length} ok=${report.ok}`,
  report.note,
  ...uniqueHits.map((h) => `  HIT ${h.kind} ${h.pattern} @ ${h.file}`),
].join('\n');

console.log(summary);

if (!report.ok) {
  process.exit(1);
}
