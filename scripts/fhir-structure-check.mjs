/**
 * Offline FHIR Bundle structure self-check (v1.54).
 *
 * - Loads committed golden fixture (no user health data)
 * - Validates via HealthAnalyzer.validateFhirExportBundle from built lib.js
 * - NO network calls, NO online validators, NO upload
 *
 * Usage: node scripts/fhir-structure-check.mjs
 * Exit 0 on success; 1 on failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'lib/test/fixtures/fhir-bundle-structure.json');
const libJsPath = path.join(root, 'web-ui/public/legacy/lib.js');

const URN_UUID_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let failed = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  ✓', msg);
  } else {
    failed += 1;
    console.error('  ✗', msg);
  }
}

console.log('\nFHIR structure fixture (offline, no network)');

// —— load fixture ——
ok(fs.existsSync(fixturePath), `fixture exists: ${path.relative(root, fixturePath)}`);
let bundle;
try {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  bundle = JSON.parse(raw);
  ok(bundle && bundle.resourceType === 'Bundle', 'fixture resourceType === Bundle');
  ok(bundle.type === 'collection', 'fixture type === collection');
  ok(Array.isArray(bundle.entry) && bundle.entry.length >= 3, `fixture entry count: ${bundle.entry?.length}`);
} catch (e) {
  failed += 1;
  console.error('  ✗ fixture load/parse failed:', e.message);
  process.exit(1);
}

// —— structural shape checks (independent of validator impl) ——
console.log('\nfixture shape');
const entries = bundle.entry || [];
const fullUrls = entries.map((e) => String(e?.fullUrl || ''));
ok(
  fullUrls.every((u) => URN_UUID_RE.test(u)),
  `all fullUrl are urn:uuid: (${fullUrls.length})`
);
ok(new Set(fullUrls).size === fullUrls.length, 'fullUrl values are unique');

const steps = entries
  .map((e) => e?.resource)
  .find((r) => r && r.resourceType === 'Observation' && String(r.id || '').startsWith('obs-steps-'));
ok(!!steps, 'has steps Observation (obs-steps-*)');
ok(
  steps &&
    steps.effectivePeriod &&
    steps.effectivePeriod.start &&
    steps.effectivePeriod.end,
  'steps Observation has effectivePeriod.start/end'
);
ok(!steps?.effectiveDateTime, 'steps Observation does not use effectiveDateTime');
// v1.56: daily period uses date precision only (no time without timezone)
ok(
  steps &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(steps.effectivePeriod.start)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(steps.effectivePeriod.end)),
  'steps effectivePeriod uses date precision YYYY-MM-DD (no unzoned time)'
);

const glucose = entries
  .map((e) => e?.resource)
  .find((r) => r && r.resourceType === 'Observation' && String(r.id || '').startsWith('obs-glucose-'));
ok(!!glucose, 'has glucose Observation (obs-glucose-*)');
ok(!!glucose?.effectiveDateTime, 'glucose Observation has effectiveDateTime');
ok(
  glucose &&
    (/(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(String(glucose.effectiveDateTime)) ||
      /^\d{4}-\d{2}-\d{2}$/.test(String(glucose.effectiveDateTime))),
  'glucose effectiveDateTime has timezone when time is present'
);

const prov = entries.map((e) => e?.resource).find((r) => r && r.resourceType === 'Provenance');
ok(!!prov, 'has Provenance');
const targets = Array.isArray(prov?.target) ? prov.target.map((t) => String(t?.reference || '')) : [];
ok(targets.length >= 2, `Provenance targets ≥ 2 (got ${targets.length})`);
const fullUrlSet = new Set(fullUrls);
ok(
  targets.every((t) => fullUrlSet.has(t)),
  'Provenance targets match entry fullUrls'
);

// —— validate via built lib.js (same surface as UI) ——
console.log('\nvalidateFhirExportBundle via web-ui/public/legacy/lib.js');
ok(fs.existsSync(libJsPath), `lib.js exists: ${path.relative(root, libJsPath)}`);

try {
  const code = fs.readFileSync(libJsPath, 'utf8');
  const ctx = createContext({ console });
  runInContext(code + '\nthis.HA = HealthAnalyzer;', ctx);
  const mod = ctx.HA;
  ok(mod && typeof mod.validateFhirExportBundle === 'function', 'HealthAnalyzer.validateFhirExportBundle');

  const validation = mod.validateFhirExportBundle(bundle);
  ok(validation && validation.ok === true, `validation.ok === true`);
  if (validation && !validation.ok) {
    for (const issue of validation.issues || []) {
      console.error('    issue:', issue);
    }
  }
  ok(
    validation && Array.isArray(validation.issues) && validation.issues.length === 0,
    `validation.issues empty (${(validation?.issues || []).length})`
  );
  const counts = validation?.resourceCounts || {};
  ok((counts.Observation || 0) >= 2, `resourceCounts.Observation ≥ 2 (${counts.Observation || 0})`);
  ok((counts.Provenance || 0) >= 1, `resourceCounts.Provenance ≥ 1 (${counts.Provenance || 0})`);

  // Negative: empty collection must fail (guards against no-op validator)
  const bad = mod.validateFhirExportBundle({
    resourceType: 'Bundle',
    type: 'collection',
    entry: [],
  });
  ok(bad && bad.ok === false, 'empty Bundle fails validation (sanity)');
} catch (e) {
  failed += 1;
  console.error('  ✗ lib.js validate failed:', e.message);
}

console.log('\n────────────────────────────────');
if (failed) {
  console.error(`fhir-structure-check: ${failed} failed`);
  process.exit(1);
}
console.log('fhir-structure-check: all passed (offline)');
process.exit(0);
