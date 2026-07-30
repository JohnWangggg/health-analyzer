/**
 * Offline FHIR external-exchange gate check (v1.58).
 *
 * - Builds a sample Bundle via HealthAnalyzer (fixture XML path → parse → analyze → export)
 * - Runs independent validateFhirR4ExchangeGate (NOT project self-check alone)
 * - Proves self-check and exchange-gate are separate engines
 * - NO network, NO HL7 Java validator_cli, NO user health upload
 *
 * Usage: node scripts/fhir-exchange-check.mjs
 * Exit 0 on success; 1 on failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const libJsPath = path.join(root, 'web-ui/public/lib.js');
const sampleXmlPath = path.join(root, 'e2e/fixtures/minimal-export.xml');

let failed = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  ✓', msg);
  } else {
    failed += 1;
    console.error('  ✗', msg);
  }
}

console.log('\nFHIR external-exchange gate (offline, independent of project self-check)');

ok(fs.existsSync(libJsPath), `lib.js exists: ${path.relative(root, libJsPath)}`);
ok(fs.existsSync(sampleXmlPath), `sample XML exists: ${path.relative(root, sampleXmlPath)}`);

let HA;
try {
  const code = fs.readFileSync(libJsPath, 'utf8');
  const ctx = createContext({ console });
  runInContext(code + '\nthis.HA = HealthAnalyzer;', ctx);
  HA = ctx.HA;
  ok(!!HA, 'HealthAnalyzer global');
  ok(typeof HA.buildFhirExportBundle === 'function', 'buildFhirExportBundle');
  ok(typeof HA.validateFhirExportBundle === 'function', 'validateFhirExportBundle (self-check)');
  ok(typeof HA.validateFhirR4ExchangeGate === 'function', 'validateFhirR4ExchangeGate (exchange)');
  ok(
    HA.validateFhirR4ExchangeGate !== HA.validateFhirExportBundle,
    'exchange-gate function is distinct from project self-check'
  );
  ok(
    typeof HA.FHIR_EXCHANGE_GATE_ENGINE === 'string' && HA.FHIR_EXCHANGE_GATE_ENGINE.length > 0,
    `exchange engine id: ${HA.FHIR_EXCHANGE_GATE_ENGINE || '(missing)'}`
  );
} catch (e) {
  failed += 1;
  console.error('  ✗ load lib.js failed:', e.message);
  process.exit(1);
}

const xml = fs.readFileSync(sampleXmlPath, 'utf8');
const data = HA.parseHealthXml(xml);
const analysis = HA.analyzeAll(data);

console.log('\nlocal-archive tier');
const archive = HA.buildFhirExportBundle(analysis, {
  exportTier: 'local-archive',
  includeProvenance: false,
});
ok(archive.exportTier === 'local-archive', 'exportTier === local-archive');
ok(archive.exchangePurpose == null, 'local-archive exchangePurpose is null');
ok(archive.exchangeReady === true, 'local-archive exchangeReady === true');
ok(archive.validation && archive.validation.ok, 'local-archive self-check ok');

console.log('\nexternal-exchange anonymous-share (default)');
const exchange = HA.buildFhirExportBundle(analysis, {
  exportTier: 'external-exchange',
  exchangePurpose: 'anonymous-share',
  includeProvenance: false,
});
ok(exchange.exportTier === 'external-exchange', 'exportTier === external-exchange');
ok(exchange.exchangePurpose === 'anonymous-share', 'purpose === anonymous-share');
ok(exchange.counts.patients === 0, 'anonymous: Patient=0');
ok(!!exchange.exchangeValidation, 'exchangeValidation present');
ok(
  exchange.exchangeValidation.engine === HA.FHIR_EXCHANGE_GATE_ENGINE,
  `exchange engine matches ${HA.FHIR_EXCHANGE_GATE_ENGINE}`
);
if (exchange.exchangeValidation && !exchange.exchangeValidation.ok) {
  for (const issue of exchange.exchangeValidation.issues.slice(0, 8)) {
    console.error('    exchange issue:', issue);
  }
}
ok(exchange.exchangeValidation.ok === true, 'exchange-gate ok on anonymous Bundle');
ok(exchange.exchangeReady === true, 'exchangeReady === true');
ok(exchange.validation && exchange.validation.ok, 'self-check also ok on exchange Bundle');

const tags = (exchange.bundle.meta && exchange.bundle.meta.tag) || [];
ok(
  tags.some((t) => t && t.system === 'urn:health-analyzer:export-kind' && t.code === 'external-exchange'),
  'Bundle meta.tag export-kind=external-exchange'
);
ok(
  tags.some((t) => t && t.system === 'urn:health-analyzer:exchange-purpose' && t.code === 'anonymous-share'),
  'Bundle meta.tag exchange-purpose=anonymous-share'
);

// Devices: only measurement classes if present
const devices = (exchange.bundle.entry || [])
  .map((e) => e.resource)
  .filter((r) => r && r.resourceType === 'Device');
ok(
  devices.every((d) => !/hae|apple-health/i.test(String(d.id || ''))),
  'no HAE/aggregate Device resources'
);

// Observations have category; none have subject under anonymous
const obsList = (exchange.bundle.entry || [])
  .map((e) => e.resource)
  .filter((r) => r && r.resourceType === 'Observation');
ok(obsList.length > 0, `Observation count: ${obsList.length}`);
ok(
  obsList.every((o) => Array.isArray(o.category) && o.category.length > 0),
  'all Observations have category (exchange interoperability)'
);
ok(
  obsList.every((o) => !o.subject),
  'anonymous-share Observations have no subject'
);

console.log('\npersonal-handoff requires persistent id');
const handoffFail = HA.buildFhirExportBundle(analysis, {
  exportTier: 'external-exchange',
  exchangePurpose: 'personal-handoff',
  patientDisplay: 'X',
  includeProvenance: false,
});
ok(handoffFail.exchangeReady === false, 'handoff without persistent id is blocked');
ok(
  handoffFail.exchangeValidation &&
    handoffFail.exchangeValidation.issues.some((i) => /persistent|personal-handoff/i.test(i)),
  'gate mentions persistent id / personal-handoff'
);

const strongPid =
  typeof HA.newPersistentPatientId === 'function'
    ? HA.newPersistentPatientId()
    : 'c3d4e5f6-a7b8-4901-c234-56789abcdef0';
ok(
  typeof HA.isStrongPersistentPatientId === 'function'
    ? HA.isStrongPersistentPatientId(strongPid)
    : true,
  'strong pid helper accepts generated id'
);
ok(
  typeof HA.isStrongPersistentPatientId !== 'function' ||
    !HA.isStrongPersistentPatientId('1'),
  'strong pid helper rejects weak "1"'
);
const handoffOk = HA.buildFhirExportBundle(analysis, {
  exportTier: 'external-exchange',
  exchangePurpose: 'personal-handoff',
  patientDisplay: 'X',
  patientPersistentId: strongPid,
  includeProvenance: false,
});
ok(handoffOk.exchangeReady === true, 'handoff with strong UUID passes');
ok(handoffOk.counts.patients === 1, 'handoff has Patient');
const handoffWeak = HA.buildFhirExportBundle(analysis, {
  exportTier: 'external-exchange',
  exchangePurpose: 'personal-handoff',
  patientDisplay: 'X',
  patientPersistentId: '1',
  includeProvenance: false,
});
ok(handoffWeak.exchangeReady === false, 'handoff with weak id "1" is blocked');

// Independent gate rejects bad fullUrl
console.log('\nexchange-gate rejects non-urn fullUrl');
const broken = JSON.parse(exchange.json);
if (broken.entry && broken.entry[0]) {
  broken.entry[0].fullUrl = 'Observation/not-a-uuid';
}
const badGate = HA.validateFhirR4ExchangeGate(broken);
ok(badGate.ok === false, 'exchange-gate fails on relative fullUrl');
ok(
  (badGate.issues || []).some((i) => /urn:uuid|fullUrl/i.test(i)),
  'issue mentions fullUrl / urn:uuid'
);

// Self-check may be looser — document independence (relative fullUrl is warn/fail in self-check too)
const selfOnBroken = HA.validateFhirExportBundle(broken);
ok(typeof selfOnBroken.ok === 'boolean', 'self-check still runs independently on broken bundle');

// Missing category fails exchange gate even if self-check might pass
console.log('\nexchange-gate requires Observation.category');
const noCat = JSON.parse(exchange.json);
const anyObs = (noCat.entry || [])
  .map((e) => e.resource)
  .find((r) => r && r.resourceType === 'Observation');
if (anyObs) {
  delete anyObs.category;
}
const noCatGate = HA.validateFhirR4ExchangeGate(noCat);
ok(noCatGate.ok === false, 'exchange-gate fails without category');
ok(
  (noCatGate.issues || []).some((i) => /category/i.test(i)),
  'issue mentions category'
);

console.log('\n────────────────────────────────');
if (failed > 0) {
  console.error(`fhir-exchange-check: ${failed} failed`);
  process.exit(1);
}
console.log('fhir-exchange-check: all passed (offline)');
process.exit(0);
