#!/usr/bin/env node
/**
 * Strategy A cutover: build React and publish to web-ui/public root.
 * Legacy PWA stays at web-ui/public/legacy/ (rollback-only).
 *
 * Base path:
 *   - VITE_BASE env wins (e.g. / or /health-analyzer/)
 *   - else GITHUB_PAGES_BASE
 *   - else if GITHUB_REPOSITORY=owner/name → /name/ (project Pages)
 *   - else /
 *
 * Also writes 404.html (= index.html) for GitHub Pages SPA deep links.
 *
 * Usage: node scripts/export-cutover.mjs
 *        npm run react:export-cutover  (from repo root)
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');
const dist = join(appRoot, 'dist');
const publicRoot = join(appRoot, '..', 'public');
const legacyDir = join(publicRoot, 'legacy');

/** Root-level names owned by React cutover build (safe to replace). */
const REACT_ROOT_NAMES = new Set([
  'assets',
  'index.html',
  '404.html',
  'sw.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icons.svg',
  'CUTOVER_STAMP.txt',
  'registerSW.js',
]);

function isWorkboxFile(name) {
  return /^workbox-.*\.js$/.test(name);
}

/** Normalize base to always start and end with / (except leave as-is for weird cases). */
function normalizeBase(raw) {
  let b = String(raw || '/').trim() || '/';
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

function resolveBase() {
  if (process.env.VITE_BASE) return normalizeBase(process.env.VITE_BASE);
  if (process.env.GITHUB_PAGES_BASE) {
    return normalizeBase(process.env.GITHUB_PAGES_BASE);
  }
  // Only for GitHub Pages *deploy* job — not CI e2e (local static serve is root /)
  // https://user.github.io/<repo>/ requires base=/<repo>/
  if (
    process.env.GITHUB_PAGES_DEPLOY === 'true' &&
    process.env.GITHUB_REPOSITORY
  ) {
    const name = process.env.GITHUB_REPOSITORY.split('/')[1];
    if (name) return normalizeBase(`/${name}/`);
  }
  return '/';
}

function runBuild(base, label) {
  console.log(`[export-cutover] building with VITE_BASE=${base} (${label}) …`);
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: appRoot,
    env: { ...process.env, VITE_BASE: base },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) {
    process.exit(build.status || 1);
  }
  if (!existsSync(dist)) {
    console.error('[export-cutover] dist missing after build');
    process.exit(1);
  }
}

if (!existsSync(join(legacyDir, 'index.html'))) {
  console.error(
    '[export-cutover] missing web-ui/public/legacy/index.html — legacy rollback tree required',
  );
  process.exit(1);
}

mkdirSync(publicRoot, { recursive: true });

const base = resolveBase();
runBuild(base, 'production cutover');

// Clear previous React root artifacts only (never touch legacy/)
for (const name of readdirSync(publicRoot)) {
  if (name === 'legacy' || name === 'next') continue;
  if (REACT_ROOT_NAMES.has(name) || isWorkboxFile(name)) {
    const p = join(publicRoot, name);
    rmSync(p, { recursive: true, force: true });
  }
}

// Copy dist → public root
for (const name of readdirSync(dist)) {
  const from = join(dist, name);
  const to = join(publicRoot, name);
  if (name === 'legacy') {
    console.warn('[export-cutover] skip dist/legacy name collision');
    continue;
  }
  cpSync(from, to, { recursive: true });
}

// GitHub Pages SPA: unknown paths serve 404.html → same shell as index
const rootIndex = join(publicRoot, 'index.html');
if (!existsSync(rootIndex) || statSync(rootIndex).size < 20) {
  console.error('[export-cutover] root index.html missing after copy');
  process.exit(1);
}
cpSync(rootIndex, join(publicRoot, '404.html'));

const legacyRollback =
  base === '/' ? '/legacy/' : `${base.replace(/\/$/, '')}/legacy/`;

writeFileSync(
  join(publicRoot, 'CUTOVER_STAMP.txt'),
  [
    `exportedAt=${new Date().toISOString()}`,
    `base=${base}`,
    'role=react-default-production-root',
    `legacy-rollback=${legacyRollback}`,
    'default-production-entry=web-ui/public (React)',
    'spa-fallback=404.html',
    '',
  ].join('\n'),
  'utf8',
);

// Optional: remove obsolete /next/ preview tree
const nextDir = join(publicRoot, 'next');
if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log('[export-cutover] removed obsolete public/next/');
}

// Sanity: asset paths in index should respect base (when base !== /)
const indexHtml = readFileSync(rootIndex, 'utf8');
if (base !== '/' && !indexHtml.includes(base.replace(/\/$/, '') + '/assets') && !indexHtml.includes(`"${base}`)) {
  console.warn(
    `[export-cutover] warning: index.html may not reference base=${base}; check Vite build`,
  );
}

console.log(`[export-cutover] React root → ${publicRoot}`);
console.log(`[export-cutover] base=${base}`);
console.log(`[export-cutover] legacy rollback → ${legacyRollback}`);
console.log('[export-cutover] wrote 404.html for SPA deep links (GitHub Pages)');
