/**
 * Lightweight smoke checks (no browser automation):
 * - React i18n key parity (zh-CN / en)
 * - idb schema reference present
 * - browser IIFE (lib/dist) exposes HealthAnalyzer
 * - React cutover root shape (if export-cutover was run)
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

// —— React messages key parity ——
console.log('\nReact i18n key parity');
const messagesPath = path.join(
  root,
  'web-ui/react-app/src/i18n/messages.ts',
);
ok(fs.existsSync(messagesPath), 'react messages.ts exists');
if (fs.existsSync(messagesPath)) {
  const src = fs.readFileSync(messagesPath, 'utf8');
  // Extract string keys from zh and en tables via 'key': patterns inside const blocks
  const zhBlock = src.match(/const zh[^=]*=\s*\{([\s\S]*?)\n\};\s*\n\s*const en/m);
  const enBlock = src.match(/const en[^=]*=\s*\{([\s\S]*?)\n\};\s*\n\s*const TABLES/m);
  function keysOf(block) {
    if (!block) return new Set();
    return new Set(
      [...block.matchAll(/'([^'\\]+)'\s*:/g)].map((x) => x[1]),
    );
  }
  const Kzh = keysOf(zhBlock?.[1] || '');
  const Ken = keysOf(enBlock?.[1] || '');
  ok(Kzh.size > 80, `zh-CN keys: ${Kzh.size}`);
  ok(Ken.size > 80, `en keys: ${Ken.size}`);
  ok(Kzh.size === Ken.size, `zh-CN/en equal (${Kzh.size}/${Ken.size})`);
  const missEn = [...Kzh].filter((k) => !Ken.has(k));
  const missZh = [...Ken].filter((k) => !Kzh.has(k));
  ok(missEn.length === 0, `no keys missing in en (${missEn.length})`);
  ok(missZh.length === 0, `no keys missing in zh (${missZh.length})`);
  if (missEn.length)
    console.error('    missing en:', missEn.slice(0, 12).join(', '));
  if (missZh.length)
    console.error('    missing zh:', missZh.slice(0, 12).join(', '));
}

// —— Schema reference (post-legacy-removal authority) ——
console.log('\nidb schema reference');
const schemaRef = path.join(
  root,
  'web-ui/idb-schema/history-db.reference.js',
);
ok(fs.existsSync(schemaRef) && fs.statSync(schemaRef).size > 1000, 'history-db.reference.js');

// —— legacy redirect stub only ——
console.log('\nlegacy redirect stub');
const legacyIndex = path.join(root, 'web-ui/public/legacy/index.html');
ok(fs.existsSync(legacyIndex), 'legacy/index.html exists');
if (fs.existsSync(legacyIndex)) {
  const lh = fs.readFileSync(legacyIndex, 'utf8');
  ok(
    /refresh|location\.replace|返回新版|Return to Health/i.test(lh),
    'legacy is redirect stub',
  );
  ok(!lh.includes('id="file-input"'), 'legacy is not full upload shell');
  ok(!fs.existsSync(path.join(root, 'web-ui/public/legacy/app.js')), 'legacy app.js removed');
}

// —— React production root (after npm run react:export-cutover) ——
console.log('\nweb-ui/public React root (cutover)');
const rootIndex = path.join(root, 'web-ui/public/index.html');
const hasRootReact = fs.existsSync(rootIndex) && fs.statSync(rootIndex).size > 20;
if (hasRootReact) {
  const rootHtml = fs.readFileSync(rootIndex, 'utf8');
  ok(
    /root|assets\/|type="module"|react/i.test(rootHtml) &&
      !rootHtml.includes('id="file-input"'),
    'root index.html looks like React shell',
  );
  const stamp = path.join(root, 'web-ui/public/CUTOVER_STAMP.txt');
  ok(
    !fs.existsSync(stamp) ||
      fs.readFileSync(stamp, 'utf8').includes('react-default'),
    'CUTOVER_STAMP present or optional',
  );
} else {
  console.log(
    '  · root React index not built yet (run npm run react:export-cutover before deploy)',
  );
}

// —— analysis locale via browser IIFE ——
console.log('\nbrowser IIFE locale smoke');
const iifeCandidates = [
  path.join(root, 'lib/dist/browser.iife.js'),
  path.join(root, 'web-ui/public/legacy/lib.js'),
];
const iifePath = iifeCandidates.find((p) => fs.existsSync(p));
ok(!!iifePath, `browser IIFE exists (${iifePath ? path.relative(root, iifePath) : 'missing — run npm --prefix lib run build'})`);
if (iifePath) {
  try {
    const { createContext, runInContext } = await import('node:vm');
    const code = fs.readFileSync(iifePath, 'utf8');
    const ctx = createContext({ console });
    runInContext(code + '\nthis.HA = HealthAnalyzer;', ctx);
    const mod = ctx.HA;
    ok(
      mod && typeof mod.calcRecoveryWeek === 'function',
      'HealthAnalyzer.calcRecoveryWeek',
    );
    ok(
      mod && typeof mod.toTraditionalTitle === 'function',
      'HealthAnalyzer.toTraditionalTitle',
    );

    const sleepByDate = {};
    const stepsByDate = {};
    const hrvByDate = {};
    const restingHrByDate = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2026, 5, 1));
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      sleepByDate[date] = {
        total: 7.5,
        core: 4,
        deep: 1.2,
        rem: 1.5,
        awake: 0.3,
      };
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
    ok(
      tw && /恢復|負荷|資料|平衡|活動/.test(tw.statusLabel),
      `zh-TW status: ${tw?.statusLabel}`,
    );
    ok(mod.toTraditionalTitle('恢复') === '恢復', 'toTraditionalTitle(恢复)');
  } catch (e) {
    failed += 1;
    console.error('  ✗ browser IIFE smoke failed:', e.message);
  }
}

console.log('\n────────────────────────────────');
if (failed) {
  console.error(`smoke: ${failed} failed`);
  process.exit(1);
}
console.log('smoke: all passed');
