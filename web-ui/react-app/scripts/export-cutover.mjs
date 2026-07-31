#!/usr/bin/env node
/**
 * Strategy A cutover: build React with base=/ and publish to web-ui/public root.
 * Legacy PWA stays at web-ui/public/legacy/ (rollback-only).
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

// Build React as site root
runBuild('/', 'production root');

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

writeFileSync(
  join(publicRoot, 'CUTOVER_STAMP.txt'),
  [
    `exportedAt=${new Date().toISOString()}`,
    'base=/',
    'role=react-default-production-root',
    'legacy-rollback=/legacy/',
    'default-production-entry=web-ui/public (React)',
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

const rootIndex = join(publicRoot, 'index.html');
if (!existsSync(rootIndex) || statSync(rootIndex).size < 20) {
  console.error('[export-cutover] root index.html missing after copy');
  process.exit(1);
}

console.log(`[export-cutover] React root → ${publicRoot}`);
console.log('[export-cutover] legacy rollback → /legacy/');
console.log('[export-cutover] open static host at / (React) or /legacy/ (rollback)');
