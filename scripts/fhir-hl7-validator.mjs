/**
 * Offline HL7 FHIR Validator CLI check (v1.60).
 *
 * Validates a committed synthetic R4 Bundle fixture with the official
 * validator_cli.jar (hapifhir/org.hl7.fhir.core). No personal health data.
 *
 * Relationship to project checks:
 * - scripts/fhir-structure-check.mjs  → project self-check
 * - scripts/fhir-exchange-check.mjs   → independent exchange-gate (custom rules)
 * - THIS SCRIPT                     → official HL7 Java validator (structure/datatypes)
 *
 * Offline-by-default:
 * - Uses -tx n/a (no remote terminology server / no user data upload)
 * - Local package cache under tools/fhir-package-cache (first run may download
 *   public FHIR package definitions; not patient data)
 *
 * Environment:
 * - FHIR_HL7_REQUIRED=1     fail if Java/jar missing (CI strict mode)
 * - FHIR_HL7_SKIP=1         always soft-skip (exit 0)
 * - FHIR_VALIDATOR_JAR=path  override jar path
 * - FHIR_VALIDATOR_VERSION=4.0.1  FHIR version for validator (default 4.0.1)
 * - FHIR_HL7_NO_DOWNLOAD=1  do not fetch jar when missing
 * - FHIR_VALIDATOR_URL=url  override download URL
 *
 * Usage:
 *   node scripts/fhir-hl7-validator.mjs
 *   node scripts/fhir-hl7-validator.mjs --from-export
 *     (build exchange Bundle from e2e minimal XML, strip private extensions, validate)
 *   npm run test:fhir:hl7
 *   FHIR_HL7_REQUIRED=1 npm run test:fhir:hl7
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const toolsDir = path.join(root, 'tools');
const defaultJar = path.join(toolsDir, 'validator_cli.jar');
const fixturePath = path.join(
  root,
  'lib/test/fixtures/fhir-hl7-r4-minimal.json'
);
const sampleXmlPath = path.join(root, 'e2e/fixtures/minimal-export.xml');
const libJsPath = path.join(root, 'web-ui/public/lib.js');
const packageCache = path.join(toolsDir, 'fhir-package-cache');
const FROM_EXPORT =
  process.argv.includes('--from-export') || process.env.FHIR_HL7_FROM_EXPORT === '1';

/** Prefer a pin-friendly "latest" URL; override with FHIR_VALIDATOR_URL */
const DEFAULT_JAR_URL =
  process.env.FHIR_VALIDATOR_URL ||
  'https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar';

const FHIR_VERSION = process.env.FHIR_VALIDATOR_VERSION || '4.0.1';
const REQUIRED = process.env.FHIR_HL7_REQUIRED === '1';
const FORCE_SKIP = process.env.FHIR_HL7_SKIP === '1';
const NO_DOWNLOAD = process.env.FHIR_HL7_NO_DOWNLOAD === '1';

function log(msg) {
  console.log(msg);
}
function err(msg) {
  console.error(msg);
}

function softSkip(reason) {
  log(`\n[fhir-hl7-validator] SKIP: ${reason}`);
  log(
    '  Project self-check + exchange-gate still apply via npm run test:fhir'
  );
  log(
    '  Strict CI: FHIR_HL7_REQUIRED=1 npm run test:fhir:hl7 (needs Java + jar)'
  );
  process.exit(0);
}

function fail(reason, code = 1) {
  err(`\n[fhir-hl7-validator] FAIL: ${reason}`);
  process.exit(code);
}

function findJava() {
  const candidates = [
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'),
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java.exe'),
    'java',
  ].filter(Boolean);

  for (const java of candidates) {
    const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
    // java -version writes to stderr
    if (r.status === 0 || /version/i.test(String(r.stderr || r.stdout || ''))) {
      return java;
    }
  }
  return null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.partial`;
    // Prefer curl (more reliable for large GitHub release redirects)
    const curl = spawnSync(
      'curl',
      [
        '-fsSL',
        '--retry',
        '5',
        '--retry-delay',
        '2',
        '-A',
        'health-analyzer-fhir-hl7-validator',
        '-o',
        tmp,
        url,
      ],
      { encoding: 'utf8', timeout: 600_000 }
    );
    if (curl.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 1_000_000) {
      fs.renameSync(tmp, dest);
      resolve(dest);
      return;
    }
    // Fallback: Node https
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    const mod = url.startsWith('http://') ? http : https;
    const follow = (u, redirects) => {
      if (redirects > 8) {
        reject(new Error('too many redirects'));
        return;
      }
      const req = mod.get(
        u,
        { headers: { 'User-Agent': 'health-analyzer-fhir-hl7-validator' } },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(
              new Error(
                `HTTP ${res.statusCode} for ${u}` +
                  (curl.stderr ? `; curl: ${curl.stderr}` : '')
              )
            );
            return;
          }
          const out = fs.createWriteStream(tmp);
          res.pipe(out);
          out.on('finish', () => {
            out.close(() => {
              fs.renameSync(tmp, dest);
              resolve(dest);
            });
          });
          out.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(300_000, () => req.destroy(new Error('download timeout')));
    };
    follow(url, 0);
  });
}

async function ensureJar(jarPath) {
  if (fs.existsSync(jarPath) && fs.statSync(jarPath).size > 1_000_000) {
    log(`  ✓ jar present: ${path.relative(root, jarPath)} (${fs.statSync(jarPath).size} bytes)`);
    return jarPath;
  }
  if (NO_DOWNLOAD) {
    return null;
  }
  log(`  · downloading validator_cli.jar …`);
  log(`    ${DEFAULT_JAR_URL}`);
  fs.mkdirSync(path.dirname(jarPath), { recursive: true });
  await downloadFile(DEFAULT_JAR_URL, jarPath);
  const size = fs.statSync(jarPath).size;
  if (size < 1_000_000) {
    try {
      fs.unlinkSync(jarPath);
    } catch {
      /* ignore */
    }
    throw new Error(`downloaded jar too small (${size} bytes)`);
  }
  log(`  ✓ downloaded: ${path.relative(root, jarPath)} (${size} bytes)`);
  return jarPath;
}

function runValidator(java, jarPath, fixture) {
  fs.mkdirSync(packageCache, { recursive: true });
  const reportHtml = path.join(toolsDir, 'fhir-hl7-validator-report.html');
  // Official CLI: -tx n/a disables remote terminology (no patient data upload).
  // First run may still download public FHIR package definitions into the local
  // package cache directory — never personal health data.
  const args = [
    '-jar',
    jarPath,
    fixture,
    '-version',
    FHIR_VERSION,
    '-tx',
    'n/a',
    '-html-output',
    reportHtml,
  ];

  log(
    `\n  $ ${java} -jar ${path.relative(root, jarPath)} ${path.relative(
      root,
      fixture
    )} -version ${FHIR_VERSION} -tx n/a`
  );
  const r = spawnSync(java, args, {
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      FHIR_PACKAGE_CACHE_PATH: packageCache,
    },
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600_000,
  });

  const stdout = String(r.stdout || '');
  const stderr = String(r.stderr || '');
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);

  return {
    status: r.status,
    stdout,
    stderr,
    error: r.error,
  };
}

function summarizeOutcome(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  const hasError =
    /\bError\b/i.test(text) &&
    !/0 Errors/i.test(text) &&
    !/Information/i.test(text.slice(0, 20));
  // Prefer official summary lines when present
  const summary =
    text.match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i) ||
    text.match(/Error@|Error\s*:/i);
  return { hasError, summary: summary && summary[0] };
}

function buildStrippedExportFixture() {
  if (!fs.existsSync(libJsPath)) {
    throw new Error(`lib.js missing: ${libJsPath} (run npm run build:lib)`);
  }
  if (!fs.existsSync(sampleXmlPath)) {
    throw new Error(`sample XML missing: ${sampleXmlPath}`);
  }
  const code = fs.readFileSync(libJsPath, 'utf8');
  const ctx = createContext({ console });
  runInContext(code + '\nthis.HA = HealthAnalyzer;', ctx);
  const HA = ctx.HA;
  if (!HA || typeof HA.buildFhirExportBundle !== 'function') {
    throw new Error('HealthAnalyzer.buildFhirExportBundle unavailable');
  }
  if (typeof HA.stripPrivateFhirExtensions !== 'function') {
    throw new Error('HealthAnalyzer.stripPrivateFhirExtensions unavailable (rebuild lib)');
  }
  const xml = fs.readFileSync(sampleXmlPath, 'utf8');
  const data = HA.parseHealthXml(xml);
  const analysis = HA.analyzeAll(data);
  // Use personal-handoff + synthetic persistent id so LOINC-matched vital-sign
  // profiles (bp / bodyweight) that require Observation.subject can pass Base R4.
  // Fixture patient is not a real identity (local random id only).
  const out = HA.buildFhirExportBundle(analysis, {
    exportTier: 'external-exchange',
    exchangePurpose: 'personal-handoff',
    patientDisplay: 'HL7-Fixture-Anon',
    patientPersistentId:
      typeof HA.newPersistentPatientId === 'function'
        ? HA.newPersistentPatientId()
        : 'd4e5f6a7-b8c9-4012-d345-6789abcdef01',
    includeProvenance: false,
    includeDevices: true,
  });
  if (!out.exchangeReady) {
    throw new Error(
      `exchange gate blocked export: ${(out.exchangeValidation && out.exchangeValidation.issues) || []}`
    );
  }
  // stripPrivateFhirExtensions also drops private tags/profiles and collection Bundle.total (bdl-1)
  const stripped = HA.stripPrivateFhirExtensions(out.bundle);
  const outPath = path.join(toolsDir, 'fhir-hl7-from-export.json');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(stripped, null, 2));
  return outPath;
}

async function main() {
  log('\nHL7 FHIR Validator CLI (official, offline-oriented, no personal data)');

  if (FORCE_SKIP) {
    softSkip('FHIR_HL7_SKIP=1');
  }

  let targetPath = fixturePath;
  if (FROM_EXPORT) {
    log('  mode: --from-export (build + stripPrivateFhirExtensions)');
    try {
      targetPath = buildStrippedExportFixture();
      log(`  ✓ wrote stripped export: ${path.relative(root, targetPath)}`);
    } catch (e) {
      const msg = `from-export prepare failed: ${e.message || e}`;
      if (REQUIRED) fail(msg);
      softSkip(msg);
    }
  } else {
    log('  fixture: lib/test/fixtures/fhir-hl7-r4-minimal.json');
    if (!fs.existsSync(fixturePath)) {
      fail(`fixture missing: ${fixturePath}`);
    }
  }

  // Sanity: no personal-looking content
  const raw = fs.readFileSync(targetPath, 'utf8');
  if (/@gmail\.|身份证|patient-name|John Doe/i.test(raw)) {
    fail('fixture appears to contain personal data — abort');
  }
  log('  ✓ target exists and passes personal-data smoke scan');

  const java = findJava();
  if (!java) {
    const msg =
      'Java runtime not found (install Temurin/OpenJDK, or set JAVA_HOME)';
    if (REQUIRED) fail(msg);
    softSkip(msg);
  }
  log(`  ✓ java: ${java}`);

  const jarPath = process.env.FHIR_VALIDATOR_JAR
    ? path.resolve(process.env.FHIR_VALIDATOR_JAR)
    : defaultJar;

  try {
    const jar = await ensureJar(jarPath);
    if (!jar) {
      const msg = `validator jar missing at ${jarPath} (set FHIR_VALIDATOR_JAR or allow download)`;
      if (REQUIRED) fail(msg);
      softSkip(msg);
    }
  } catch (e) {
    const msg = `jar download/prepare failed: ${e.message || e}`;
    if (REQUIRED) fail(msg);
    softSkip(msg);
  }

  const result = runValidator(java, jarPath, targetPath);
  if (result.error) {
    const msg = `failed to spawn validator: ${result.error.message}`;
    if (REQUIRED) fail(msg);
    softSkip(msg);
  }

  // Exit codes: 0 = success; non-zero = validation problems (or CLI error)
  if (result.status === 0) {
    log('\n────────────────────────────────');
    log('fhir-hl7-validator: PASS (official HL7 validator_cli, -tx n/a)');
    log(
      '  Note: still validate project semantics via structure + exchange-gate scripts'
    );
    process.exit(0);
  }

  const { summary } = summarizeOutcome(result.stdout, result.stderr);
  err('\n────────────────────────────────');
  err(
    `fhir-hl7-validator: FAIL (exit ${result.status})${summary ? ` — ${summary}` : ''}`
  );
  err(`  report (if written): tools/fhir-hl7-validator-report.html`);
  process.exit(1);
}

main().catch((e) => {
  err(String(e && e.stack ? e.stack : e));
  process.exit(REQUIRED ? 1 : 0);
});
