/**
 * Local parse + analyzeAll performance baseline (no upload, no network).
 *
 * Measures wall-clock ms for parseHealthXml / analyzeAll on a local XML export,
 * plus record counts and process.memoryUsage deltas. Default fixture is tiny;
 * point at a large local export for real baselines (never commit large fixtures).
 *
 * Usage:
 *   npm run perf:parse
 *   npm run perf:parse -- --repeat=5
 *   npm run perf:parse -- --file=/path/to/export.xml
 *   PERF_XML_PATH=/path/to/export.xml npm run perf:parse -- --repeat=3
 *
 * Requires built browser bundle: web-ui/public/lib.js (npm run build:lib).
 * Exit 0 on success; 1 on load/parse failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const DEFAULT_FIXTURE = path.join(root, 'e2e/fixtures/minimal-export.xml');
const LIB_JS = path.join(root, 'web-ui/public/lib.js');
const LIB_DIR = path.join(root, 'lib');

function parseArgs(argv) {
  let repeat = 1;
  let file = process.env.PERF_XML_PATH || process.env.HEALTH_XML_PATH || '';
  let preferCjs = process.env.PERF_USE_CJS === '1';
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--cjs') {
      preferCjs = true;
      continue;
    }
    const mRepeat = arg.match(/^--repeat=(\d+)$/);
    if (mRepeat) {
      repeat = Math.max(1, parseInt(mRepeat[1], 10) || 1);
      continue;
    }
    const mFile = arg.match(/^--file=(.+)$/);
    if (mFile) {
      file = mFile[1];
      continue;
    }
    if (!arg.startsWith('-') && !file) {
      file = arg;
      continue;
    }
    console.error(`Unknown arg: ${arg}`);
    help = true;
  }

  return {
    repeat,
    file: file ? path.resolve(file) : DEFAULT_FIXTURE,
    preferCjs,
    help,
  };
}

function printHelp() {
  console.log(`perf-parse-baseline — local parse/analyzeAll baseline

Usage:
  node scripts/perf-parse-baseline.mjs [options] [xmlPath]
  npm run perf:parse -- [options]

Options:
  --file=PATH     Apple Health export.xml (or unzipped export). Default:
                  e2e/fixtures/minimal-export.xml
  --repeat=N      Run N times; report median (default 1)
  --cjs           Prefer temporary CJS build of lib/ (else web-ui/public/lib.js)
  -h, --help      Show this help

Env:
  PERF_XML_PATH / HEALTH_XML_PATH   Same as --file
  PERF_USE_CJS=1                    Same as --cjs

Notes:
  - Default fixture is small (CI-friendly). For large ZIP/XML baselines, unzip
    locally and pass --file=…; do not commit large personal exports.
  - Needs web-ui/public/lib.js (run: npm run build:lib) unless --cjs succeeds.
  - Privacy: reads local files only; no network / no upload.
`);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function fmtMs(n) {
  return `${n.toFixed(n >= 100 ? 1 : 2)} ms`;
}

function fmtBytes(n) {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (v < 1024) return `${sign}${v} B`;
  if (v < 1024 * 1024) return `${sign}${(v / 1024).toFixed(1)} KB`;
  return `${sign}${(v / (1024 * 1024)).toFixed(2)} MB`;
}

function memSnapshot() {
  const m = process.memoryUsage();
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
  };
}

function memDelta(before, after) {
  return {
    rss: after.rss - before.rss,
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
  };
}

function countRecords(data) {
  const hrvVals = Object.values(data.hrv || {}).reduce((n, arr) => n + (arr?.length || 0), 0);
  const hrvOnVals = Object.values(data.hrvOvernight || {}).reduce(
    (n, arr) => n + (arr?.length || 0),
    0
  );
  const counts = {
    cgm: data.cgm?.length ?? 0,
    bloodPressure: data.bloodPressure?.length ?? 0,
    weight: data.weight?.length ?? 0,
    bodyFat: data.bodyFat?.length ?? 0,
    hrvSamples: hrvVals,
    hrvOvernightSamples: hrvOnVals,
    restingHrDays: Object.keys(data.restingHr || {}).length,
    walkingHrDays: Object.keys(data.walkingHr || {}).length,
    stepsDays: Object.keys(data.steps || {}).length,
    sleepDays: Object.keys(data.sleep || {}).length,
    watchDays: Object.keys(data.watchDaily || {}).length,
    workouts: data.workouts?.length ?? 0,
    ecg: data.ecg?.length ?? 0,
  };
  const total =
    counts.cgm +
    counts.bloodPressure +
    counts.weight +
    counts.bodyFat +
    counts.hrvSamples +
    counts.hrvOvernightSamples +
    counts.restingHrDays +
    counts.walkingHrDays +
    counts.stepsDays +
    counts.sleepDays +
    counts.watchDays +
    counts.workouts +
    counts.ecg;
  return { ...counts, total };
}

function loadFromLibJs() {
  if (!fs.existsSync(LIB_JS)) {
    throw new Error(
      `Missing ${path.relative(root, LIB_JS)}. Run: npm run build:lib`
    );
  }
  const code = fs.readFileSync(LIB_JS, 'utf8');
  const ctx = createContext({
    console,
    performance: globalThis.performance,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Map,
    Set,
    Promise,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Error,
    TypeError,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    NaN,
    undefined,
  });
  runInContext(code + '\nthis.__HA = HealthAnalyzer;', ctx);
  const HA = ctx.__HA;
  if (!HA || typeof HA.parseHealthXml !== 'function' || typeof HA.analyzeAll !== 'function') {
    throw new Error('HealthAnalyzer.parseHealthXml / analyzeAll not found in lib.js');
  }
  return {
    source: path.relative(root, LIB_JS),
    parseHealthXml: HA.parseHealthXml.bind(HA),
    analyzeAll: HA.analyzeAll.bind(HA),
  };
}

function loadFromCjsBuild() {
  const outDir = path.join(LIB_DIR, '.perf-dist');
  const tsconfig = path.join(LIB_DIR, 'tsconfig.json');
  if (!fs.existsSync(path.join(LIB_DIR, 'src/index.ts'))) {
    throw new Error('lib/src not found for CJS build');
  }

  // Clean previous temp build (ignore errors)
  fs.rmSync(outDir, { recursive: true, force: true });

  const tscLocal = path.join(LIB_DIR, 'node_modules/typescript/bin/tsc');
  const tscBin = fs.existsSync(tscLocal) ? tscLocal : 'tsc';
  const r = spawnSync(
    tscBin,
    [
      '-p',
      tsconfig,
      '--module',
      'commonjs',
      '--moduleResolution',
      'node',
      '--outDir',
      outDir,
      '--declaration',
      'false',
      '--declarationMap',
      'false',
      '--sourceMap',
      'false',
    ],
    { cwd: LIB_DIR, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(
      `CJS tsc build failed (status ${r.status}):\n${r.stderr || r.stdout || ''}`
    );
  }

  const require = createRequire(pathToFileURL(path.join(outDir, 'index.js')).href);
  const lib = require(path.join(outDir, 'index.js'));
  if (typeof lib.parseHealthXml !== 'function' || typeof lib.analyzeAll !== 'function') {
    throw new Error('parseHealthXml / analyzeAll missing from CJS build');
  }
  return {
    source: path.relative(root, outDir),
    parseHealthXml: lib.parseHealthXml,
    analyzeAll: lib.analyzeAll,
    cleanup: () => fs.rmSync(outDir, { recursive: true, force: true }),
  };
}

function loadApi(preferCjs) {
  if (preferCjs) {
    try {
      return loadFromCjsBuild();
    } catch (e) {
      console.warn(`[perf] --cjs failed (${e.message}); falling back to lib.js`);
    }
  }
  return loadFromLibJs();
}

function nowMs() {
  return performance.now();
}

function runOnce(api, xmlText) {
  // Drop references between stages so heap delta is more meaningful
  let data;
  let analysis;

  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  const memBeforeParse = memSnapshot();
  const t0 = nowMs();
  data = api.parseHealthXml(xmlText);
  const parseMs = nowMs() - t0;
  const memAfterParse = memSnapshot();

  const memBeforeAnalyze = memSnapshot();
  const t1 = nowMs();
  analysis = api.analyzeAll(data);
  const analyzeMs = nowMs() - t1;
  const memAfterAnalyze = memSnapshot();

  const records = countRecords(data);
  const dateRange = analysis?.dateRange || null;

  // Keep analysis briefly so it is not optimized away; drop after snapshot
  const analysisKeys = analysis ? Object.keys(analysis).length : 0;
  data = null;
  analysis = null;

  return {
    parseMs,
    analyzeMs,
    totalMs: parseMs + analyzeMs,
    records,
    dateRange,
    analysisKeys,
    memParse: memDelta(memBeforeParse, memAfterParse),
    memAnalyze: memDelta(memBeforeAnalyze, memAfterAnalyze),
    memTotal: memDelta(memBeforeParse, memAfterAnalyze),
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!fs.existsSync(opts.file)) {
    console.error(`XML not found: ${opts.file}`);
    console.error('Pass --file=… or PERF_XML_PATH=… (default is the tiny e2e fixture).');
    process.exit(1);
  }

  const st = fs.statSync(opts.file);
  const xmlText = fs.readFileSync(opts.file, 'utf8');
  const lines = xmlText.split('\n').length;

  console.log('=== perf-parse-baseline ===');
  console.log(`file:     ${opts.file}`);
  console.log(
    `size:     ${fmtBytes(st.size)} · ${lines} lines · defaultFixture=${
      path.resolve(opts.file) === path.resolve(DEFAULT_FIXTURE)
    }`
  );
  console.log(`repeat:   ${opts.repeat}${opts.repeat > 1 ? ' (report median)' : ''}`);
  if (typeof globalThis.gc !== 'function') {
    console.log('hint:     node --expose-gc for optional GC between runs (memory quieter)');
  }

  let api;
  try {
    api = loadApi(opts.preferCjs);
  } catch (e) {
    console.error('Failed to load lib:', e.message || e);
    process.exit(1);
  }
  console.log(`lib:      ${api.source}`);

  // Warm-up (not scored) — JIT / first-read effects
  try {
    const warm = api.parseHealthXml(xmlText);
    api.analyzeAll(warm);
  } catch (e) {
    console.error('Warm-up parse/analyze failed:', e.message || e);
    process.exit(1);
  }

  const runs = [];
  for (let i = 0; i < opts.repeat; i++) {
    try {
      const r = runOnce(api, xmlText);
      runs.push(r);
      console.log(
        `  run ${i + 1}/${opts.repeat}: parse ${fmtMs(r.parseMs)} · analyze ${fmtMs(
          r.analyzeMs
        )} · total ${fmtMs(r.totalMs)} · records ${r.records.total} · heapΔ ${fmtBytes(
          r.memTotal.heapUsed
        )}`
      );
    } catch (e) {
      console.error(`Run ${i + 1} failed:`, e.message || e);
      process.exit(1);
    }
  }

  const last = runs[runs.length - 1];
  const parseMed = median(runs.map((r) => r.parseMs));
  const analyzeMed = median(runs.map((r) => r.analyzeMs));
  const totalMed = median(runs.map((r) => r.totalMs));
  const heapMed = median(runs.map((r) => r.memTotal.heapUsed));
  const rssMed = median(runs.map((r) => r.memTotal.rss));

  console.log('\n--- summary (median of runs) ---');
  console.log(`parse_ms:     ${parseMed.toFixed(2)}`);
  console.log(`analyze_ms:   ${analyzeMed.toFixed(2)}`);
  console.log(`total_ms:     ${totalMed.toFixed(2)}`);
  console.log(`records:      ${last.records.total}`);
  if (last.dateRange?.start || last.dateRange?.end) {
    console.log(`date_range:   ${last.dateRange.start || '?'} → ${last.dateRange.end || '?'}`);
  }
  console.log('record_breakdown:');
  for (const [k, v] of Object.entries(last.records)) {
    if (k === 'total') continue;
    if (v) console.log(`  ${k}: ${v}`);
  }
  console.log('memory_delta (median total parse→analyze end):');
  console.log(`  heapUsed:   ${fmtBytes(heapMed)}`);
  console.log(`  rss:        ${fmtBytes(rssMed)}`);
  console.log('memory_delta (last run parse only / analyze only):');
  console.log(
    `  parse heap:   ${fmtBytes(last.memParse.heapUsed)} · rss ${fmtBytes(last.memParse.rss)}`
  );
  console.log(
    `  analyze heap: ${fmtBytes(last.memAnalyze.heapUsed)} · rss ${fmtBytes(last.memAnalyze.rss)}`
  );

  // Machine-readable one-liner for paste into notes / PR
  const jsonLine = {
    file: opts.file,
    bytes: st.size,
    lines,
    source: api.source,
    repeat: opts.repeat,
    parse_ms_median: Number(parseMed.toFixed(3)),
    analyze_ms_median: Number(analyzeMed.toFixed(3)),
    total_ms_median: Number(totalMed.toFixed(3)),
    records: last.records.total,
    heap_delta_median: Math.round(heapMed),
    rss_delta_median: Math.round(rssMed),
  };
  console.log('\njson:', JSON.stringify(jsonLine));

  if (api.cleanup) {
    try {
      api.cleanup();
    } catch {
      /* ignore */
    }
  }
}

main();
