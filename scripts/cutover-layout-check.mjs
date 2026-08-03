/**
 * Structural cutover gate: production public tree shape.
 * Exit 0 if React-shaped root exists (after export-cutover).
 * legacy/ is a redirect stub only (full app removed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'web-ui/public');
const index = path.join(pub, 'index.html');
const legacy = path.join(pub, 'legacy/index.html');
let fail = 0;
function ok(c, m) {
  if (c) console.log('  ✓', m);
  else {
    fail++;
    console.error('  ✗', m);
  }
}
console.log('cutover layout check');
ok(fs.existsSync(index), 'root index.html exists (run react:export-cutover)');
if (fs.existsSync(index)) {
  const html = fs.readFileSync(index, 'utf8');
  ok(html.includes('id="root"') || /type="module"/.test(html), 'root is React shell');
  ok(!html.includes('id="file-input"'), 'root is not legacy upload shell');
}
const spa404 = path.join(pub, '404.html');
ok(fs.existsSync(spa404), '404.html SPA fallback exists (GitHub Pages deep links)');
ok(fs.existsSync(legacy), 'legacy/index.html redirect stub exists');
if (fs.existsSync(legacy)) {
  const lh = fs.readFileSync(legacy, 'utf8');
  ok(
    /refresh|location\.replace|返回新版|Return to Health/i.test(lh),
    'legacy is redirect/stub (not full upload shell)',
  );
  ok(!lh.includes('id="file-input"'), 'legacy is not full upload shell');
}
// Schema authority lives outside legacy UI tree
ok(
  fs.existsSync(path.join(root, 'web-ui/idb-schema/history-db.reference.js')),
  'idb-schema/history-db.reference.js (schema authority)',
);
const stamp = path.join(pub, 'CUTOVER_STAMP.txt');
if (fs.existsSync(stamp)) {
  const st = fs.readFileSync(stamp, 'utf8');
  ok(st.includes('react-default'), 'CUTOVER_STAMP role');
  ok(/base=\//.test(st), 'CUTOVER_STAMP records base');
}
process.exit(fail ? 1 : 0);
