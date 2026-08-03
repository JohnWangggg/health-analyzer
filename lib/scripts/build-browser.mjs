/**
 * 浏览器 lib IIFE 构建脚本
 * 主输出：lib/dist/browser.iife.js（CI / fhir 脚本权威路径）
 * 可选镜像：web-ui/public/legacy/lib.js（若 legacy 树仍存在）
 * React 默认入口使用 @health-analyzer/lib 源码打包，不读此文件。
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const libRoot = join(__dirname, '..');
const outFile = join(libRoot, 'dist/browser.iife.js');
const legacyMirror = join(libRoot, '../web-ui/public/legacy/lib.js');
const entry = join(libRoot, 'src/browser.ts');

mkdirSync(dirname(outFile), { recursive: true });

const require = createRequire(import.meta.url);

function tryEsbuild() {
  try {
    return require('esbuild');
  } catch {
    return null;
  }
}

const BANNER = `/**
 * 健康分析库 - 浏览器版本（由 TypeScript 源构建）
 * 请勿手改本文件：修改 lib/src 后在 lib/ 下运行 npm run build:browser
 */
`;

async function buildWithEsbuild(esbuild) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'HealthAnalyzer',
    outfile: outFile,
    platform: 'browser',
    target: ['es2020'],
    banner: { js: BANNER },
    logLevel: 'info',
  });
  console.log(`[build:browser] esbuild -> ${outFile}`);
}

function stripEsm(code) {
  return code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+async\s+function\s+/gm, 'async function ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+\{[\s\S]*?\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '');
}

function buildWithTscFallback() {
  const tmpOut = join(libRoot, '.browser-dist');
  rmSync(tmpOut, { recursive: true, force: true });

  const tscBin = join(libRoot, 'node_modules/.bin/tsc');
  const r = spawnSync(
    tscBin,
    [
      '--target', 'ES2020',
      '--module', 'ESNext',
      '--moduleResolution', 'node',
      '--outDir', tmpOut,
      '--rootDir', join(libRoot, 'src'),
      '--strict',
      '--esModuleInterop',
      '--skipLibCheck',
      '--declaration', 'false',
      '--sourceMap', 'false',
      join(libRoot, 'src/parser.ts'),
      join(libRoot, 'src/stats.ts'),
      join(libRoot, 'src/types.ts'),
      join(libRoot, 'src/prompts/llm-prompt.ts'),
      join(libRoot, 'src/browser.ts'),
    ],
    { cwd: libRoot, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    throw new Error('tsc fallback failed');
  }

  const order = [
    'parser.js',
    'stats.js',
    'prompts/llm-prompt.js',
  ];

  const parts = [
    BANNER.trim(),
    '(function(global) {',
    "  'use strict';",
    '',
  ];

  for (const rel of order) {
    const f = join(tmpOut, rel);
    if (!existsSync(f)) throw new Error(`missing ${f}`);
    parts.push(`  // --- ${rel} ---`);
    const body = stripEsm(readFileSync(f, 'utf8'))
      .split('\n')
      .map((line) => (line.length ? '  ' + line : ''))
      .join('\n');
    parts.push(body);
    parts.push('');
  }

  parts.push(`
  global.HealthAnalyzer = {
    parseHealthXml: parseHealthXml,
    parseHealthXmlAsync: parseHealthXmlAsync,
    parseXmlStream: parseXmlStream,
    parseBytesStream: parseBytesStream,
    parseEcgCsv: parseEcgCsv,
    analyzeAll: analyzeAll,
    calcCgmStats: calcCgmStats,
    calcBloodPressureStats: calcBloodPressureStats,
    calcBpStats: calcBloodPressureStats,
    summarizeHrvByDay: summarizeHrvByDay,
    generateLLMPrompt: generateLLMPrompt,
    generateDataOnly: generateDataOnly,
    formatAnalysisForLLM: formatAnalysisForLLM,
    extractXmlFromZip: extractXmlFromZip,
    SHORT_SYSTEM_PROMPT: SHORT_SYSTEM_PROMPT,
    MAIN_PROMPT_TEMPLATE: MAIN_PROMPT_TEMPLATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
`.trim());

  writeFileSync(outFile, parts.join('\n') + '\n', 'utf8');
  rmSync(tmpOut, { recursive: true, force: true });
  console.log(`[build:browser] tsc-fallback -> ${outFile}`);
}

const esbuild = tryEsbuild();
if (esbuild) {
  await buildWithEsbuild(esbuild);
} else {
  console.warn('[build:browser] esbuild not found, using tsc fallback');
  buildWithTscFallback();
}

// Optional legacy mirror only when full legacy app still present (not redirect-only)
try {
  const legacyApp = join(libRoot, '../web-ui/public/legacy/app.js');
  if (existsSync(legacyApp)) {
    mkdirSync(dirname(legacyMirror), { recursive: true });
    copyFileSync(outFile, legacyMirror);
    console.log(`[build:browser] mirrored -> ${legacyMirror}`);
  } else {
    console.log('[build:browser] skip legacy mirror (UI removed)');
  }
} catch (e) {
  console.warn('[build:browser] legacy mirror skipped:', e?.message || e);
}
