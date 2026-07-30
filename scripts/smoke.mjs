/**
 * Lightweight smoke checks (no browser automation):
 * - i18n key parity (zh-CN / zh-TW / en)
 * - web-ui static assets present
 * - built lib.js exposes HealthAnalyzer
 * - recovery statusLabel EN / zh-TW via dist (if built)
 *
 * Usage: node scripts/smoke.mjs
 * Exit 0 on success.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
let failed = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  ✓', msg);
  } else {
    failed += 1;
    console.error('  ✗', msg);
  }
}

// —— i18n parity ——
console.log('\ni18n key parity');
const i18nPath = path.join(root, 'web-ui/public/i18n.js');
const i18nSrc = fs.readFileSync(i18nPath, 'utf8');

function extractLocale(name) {
  const re =
    name === 'en'
      ? /\ben\s*:\s*\{/
      : new RegExp(`(['"])${name}\\1\\s*:\\s*\\{`);
  const m = i18nSrc.match(re);
  if (!m) return '';
  const brace = i18nSrc.indexOf('{', m.index);
  let i = brace;
  let depth = 0;
  for (; i < i18nSrc.length; i++) {
    const c = i18nSrc[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i18nSrc.slice(brace + 1, i);
    } else if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < i18nSrc.length) {
        if (i18nSrc[i] === '\\') {
          i += 2;
          continue;
        }
        if (i18nSrc[i] === q) break;
        i++;
      }
    }
  }
  return '';
}

function keysOf(block) {
  return new Set([...block.matchAll(/'([^'\\]+)'\s*:/g)].map((x) => x[1]));
}

const Kzh = keysOf(extractLocale('zh-CN'));
const Ktw = keysOf(extractLocale('zh-TW'));
const Ken = keysOf(extractLocale('en'));
ok(Kzh.size > 400, `zh-CN keys: ${Kzh.size}`);
ok(Kzh.size === Ken.size, `zh-CN/en equal (${Kzh.size}/${Ken.size})`);
ok(Kzh.size === Ktw.size, `zh-CN/zh-TW equal (${Kzh.size}/${Ktw.size})`);
const missEn = [...Kzh].filter((k) => !Ken.has(k));
const missTw = [...Kzh].filter((k) => !Ktw.has(k));
ok(missEn.length === 0, `no keys missing in en (${missEn.length})`);
ok(missTw.length === 0, `no keys missing in zh-TW (${missTw.length})`);
if (missEn.length) console.error('    missing en:', missEn.slice(0, 12).join(', '));
if (missTw.length) console.error('    missing tw:', missTw.slice(0, 12).join(', '));

// —— static assets ——
console.log('\nweb-ui static assets');
const assets = [
  'index.html',
  'app.js',
  'lib.js',
  'i18n.js',
  'styles.css',
  'charts.js',
  'sw.js',
  'history-db.js',
  'parse-worker.js',
  'hae-worker.js',
  'fflate.min.js',
  'manifest.json',
];
for (const a of assets) {
  const p = path.join(root, 'web-ui/public', a);
  ok(fs.existsSync(p) && fs.statSync(p).size > 20, a);
}

const html = fs.readFileSync(path.join(root, 'web-ui/public/index.html'), 'utf8');
for (const src of ['lib.js', 'app.js', 'i18n.js', 'styles.css']) {
  ok(html.includes(src), `index.html references ${src}`);
}

const libJs = fs.readFileSync(path.join(root, 'web-ui/public/lib.js'), 'utf8');
ok(/HealthAnalyzer|createL|analyzeAll/.test(libJs), 'lib.js contains analyzer exports');
ok(libJs.length > 50_000, `lib.js size ok (${libJs.length} bytes)`);

// —— analysis locale via browser IIFE (lib.js) ——
console.log('\nlib.js locale smoke');
try {
  const { createContext, runInContext } = await import('node:vm');
  const code = fs.readFileSync(path.join(root, 'web-ui/public/lib.js'), 'utf8');
  const ctx = createContext({ console });
  runInContext(code + '\nthis.HA = HealthAnalyzer;', ctx);
  const mod = ctx.HA;
  ok(mod && typeof mod.calcRecoveryWeek === 'function', 'HealthAnalyzer.calcRecoveryWeek');
  ok(mod && typeof mod.toTraditionalTitle === 'function', 'HealthAnalyzer.toTraditionalTitle');

  const sleepByDate = {};
  const stepsByDate = {};
  const hrvByDate = {};
  const restingHrByDate = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    sleepByDate[date] = { total: 7.5, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 };
    stepsByDate[date] = 8000;
    hrvByDate[date] = { allMean: 42, overnightMean: 45, count: 10 };
    restingHrByDate[date] = 56;
  }
  const partial = {
    dateRange: { start: '2026-06-01', end: '2026-06-14' },
    hrvByDate,
    restingHrByDate,
    stepsByDate,
    sleepByDate,
  };
  const en = mod.calcRecoveryWeek(partial, { locale: 'en' });
  const tw = mod.calcRecoveryWeek(partial, { locale: 'zh-TW' });
  ok(en && /[A-Za-z]/.test(en.statusLabel), `EN status: ${en?.statusLabel}`);
  ok(tw && /恢復|負荷|資料|平衡|活動/.test(tw.statusLabel), `zh-TW status: ${tw?.statusLabel}`);
  ok(tw && !/恢复|负荷|数据不足/.test(tw.statusLabel), 'zh-TW status has no simplified recovery words');
  ok(mod.toTraditionalTitle('恢复') === '恢復', 'toTraditionalTitle(恢复)');
  // residual-scan samples (should be fully traditionalized)
  const samples = [
    ['数值受睡眠、训练与疾病影响，单日波动不必过度解读。', /數值.*訓練.*波動.*過度解讀/],
    ['单次异常需结合症状与复测，不能替代门诊。', /複測.*門診/],
    ['不下诊断、不开药、不替代门诊', /診斷.*開藥.*門診/],
    ['近 30 日 0 场', /0 場/],
    ['（暂无摘要）', /暫無摘要/],
    ['恢复指标偏弱，优先睡眠与减负', /恢復指標.*優先.*減負/],
  ];
  for (const [src, re] of samples) {
    const tw = mod.toTraditionalTitle(src);
    ok(re.test(tw) && !/训练|复测|门诊|开药|暂无|指标|减负|波动|解读/.test(tw), `TW sample: ${tw.slice(0, 36)}…`);
  }
} catch (e) {
  failed += 1;
  console.error('  ✗ lib.js smoke failed:', e.message);
}

console.log('\n────────────────────────────────');
if (failed) {
  console.error(`smoke: ${failed} failed`);
  process.exit(1);
}
console.log('smoke: all passed');
