#!/usr/bin/env node
/**
 * Build React app with base=/next/ and copy into web-ui/public/next/
 * so a single static host serves legacy `/` and React `/next/`.
 * Then rebuild dist with base=/ so local `react:preview` stays usable.
 *
 * Usage: node scripts/export-next.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');
const dist = join(appRoot, 'dist');
const out = join(appRoot, '..', 'public', 'next');

function runBuild(base, label) {
  console.log(`[export-next] building with VITE_BASE=${base} (${label}) …`);
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
    console.error('[export-next] dist missing after build');
    process.exit(1);
  }
}

runBuild('/next/', 'export');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });

writeFileSync(
  join(out, 'DUAL_TRACK_STAMP.txt'),
  [
    `exportedAt=${new Date().toISOString()}`,
    'base=/next/',
    'role=react-preview-under-legacy-public',
    'default-production-entry=web-ui/public (not this folder alone)',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`[export-next] copied dist → ${out}`);

// Restore standalone dist for preview/privacy on base=/
runBuild('/', 'restore standalone dist');
console.log('[export-next] restored web-ui/react-app/dist with base=/');
console.log('[export-next] open legacy host and visit /next/');
