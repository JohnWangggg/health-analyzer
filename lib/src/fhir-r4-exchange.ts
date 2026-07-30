/**
 * FHIR R4 exchange-gate validator (v1.58–v1.59) — independent of project self-check.
 *
 * Purpose:
 * - Gate "external-exchange" exports with a second, standards-oriented rule set
 * - Does NOT call validateFhirExportBundle (project self-check)
 * - Does NOT upload data / does NOT invoke HL7 Java validator by default
 *
 * v1.59 additions:
 * - exchange purpose: anonymous-share | personal-handoff
 * - Device must be measurement class (Watch/iPhone) with high-confidence extension
 * - Reject HAE / Apple Health aggregate as Observation.device targets
 * v1.62 additions:
 * - anonymous-share must not contain raw sourceName extensions / "sourceName:" notes
 * v1.65 additions:
 * - anonymous-share batch ids must be opaque batch_anon_* (no personal custom ids)
 *
 * This is still NOT a certified HL7 FHIR Validator substitute.
 */

// ============================================================
// Public types
// ============================================================

export type FhirExportTier = 'local-archive' | 'external-exchange';

export const FHIR_EXPORT_TIERS: readonly FhirExportTier[] = [
  'local-archive',
  'external-exchange',
] as const;

/** External-exchange purpose (v1.59) */
export type FhirExchangePurpose = 'anonymous-share' | 'personal-handoff';

export const FHIR_EXCHANGE_PURPOSES: readonly FhirExchangePurpose[] = [
  'anonymous-share',
  'personal-handoff',
] as const;

/** Engine id for exchange gate (bump when rules change) */
export const FHIR_EXCHANGE_GATE_ENGINE = 'health-analyzer-r4-exchange-gate-v5';

const EXT_SOURCE_NAME = 'urn:health-analyzer:extension:source-name';
const EXT_SOURCE_BATCH_IDS = 'urn:health-analyzer:extension:source-batch-ids';

/** Anonymous-safe remapped batch id */
function isOpaqueAnonBatchId(raw: unknown): boolean {
  return /^batch_anon_[0-9a-f]{16,64}$/i.test(String(raw || '').trim());
}

function batchIdLooksPersonal(raw: unknown): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (isOpaqueAnonBatchId(s)) return false;
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(s)) return true; // CJK
  // Default machine ids: batch_<timestamp>_<rand>
  if (/^batch_\d{10,}_[a-z0-9]+$/i.test(s)) return false;
  return true; // custom free-text batch ids not allowed on anonymous share
}

/**
 * Strong local pseudonym ID for personal-handoff (v1.63).
 * Accepts:
 * - RFC4122 UUID (any version 1–8), with or without braces
 * - 32 hex chars (UUID without hyphens)
 * - `pid_` + ≥22 url-safe random chars (generated format)
 * Rejects weak values like "1", "test", "local-patient".
 */
export function isStrongPersistentPatientId(raw: unknown): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (s === 'local-patient') return false;
  if (s.length < 16) return false;
  // UUID with optional braces
  const uuid =
    /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}?$/i;
  if (uuid.test(s)) return true;
  // UUID without hyphens
  if (/^[0-9a-f]{32}$/i.test(s)) return true;
  // Generated prefix form
  if (/^pid_[A-Za-z0-9_-]{22,}$/.test(s)) return true;
  return false;
}

/** Generate a strong local-persisted patient pseudonym id (UUID preferred). */
export function newPersistentPatientId(): string {
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // fallback: pid_ + 24 hex
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `pid_${Array.from(bytes, hex).join('').slice(0, 24)}`;
}

export interface FhirExchangeValidation {
  ok: boolean;
  issues: string[];
  engine: string;
  resourceCounts: Record<string, number>;
}

export interface FhirExchangeGateOptions {
  exportTier?: FhirExportTier | string | null;
  exchangePurpose?: FhirExchangePurpose | string | null;
}

const URN_UUID_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OBS_STATUS = new Set([
  'registered',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'cancelled',
  'entered-in-error',
  'unknown',
]);

const DEVICE_STATUS = new Set(['active', 'inactive', 'entered-in-error', 'unknown']);

/**
 * R4 dateTime: if hour/minute present, timezone required.
 * Independent copy of the rule (not imported from project self-check).
 * @see https://hl7.org/fhir/R4/datatypes.html#dateTime
 */
export function isValidR4DateTime(value: string): boolean {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^\d{4}$/.test(s)) return true;
  if (/^\d{4}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return /(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(s);
  }
  return false;
}

export function normalizeFhirExportTier(raw: unknown): FhirExportTier {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (s === 'external-exchange' || s === 'exchange' || s === 'external') {
    return 'external-exchange';
  }
  return 'local-archive';
}

export function normalizeFhirExchangePurpose(raw: unknown): FhirExchangePurpose {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (
    s === 'personal-handoff' ||
    s === 'handoff' ||
    s === 'personal' ||
    s === 'identified'
  ) {
    return 'personal-handoff';
  }
  // default for external exchange: anonymous share
  return 'anonymous-share';
}

function pushIssue(issues: string[], msg: string): void {
  issues.push(msg);
}

function readMetaTagCode(
  bundle: Record<string, unknown>,
  system: string
): string | null {
  const meta = bundle.meta as { tag?: { system?: string; code?: string }[] } | undefined;
  if (!meta || !Array.isArray(meta.tag)) return null;
  for (const t of meta.tag) {
    if (t && String(t.system || '') === system && t.code != null) {
      return String(t.code);
    }
  }
  return null;
}

const MEASUREMENT_DEVICE_IDS = new Set(['device-apple-watch', 'device-iphone']);
const FORBIDDEN_DEVICE_IDS = new Set([
  'device-hae-import',
  'device-apple-health',
  'device-hae',
]);

/**
 * Independent R4-oriented exchange gate for health-analyzer Bundles.
 * Stricter than project self-check on:
 * - fullUrl must be urn:uuid:
 * - Observation.category required
 * - Observation.code.coding system+code required
 * - valueQuantity.system should be UCUM when quantity present
 * - dateTime timezone rule (R4)
 * - cross-references must resolve to entry fullUrl
 * - v1.59 purpose + high-confidence Device rules
 */
export function validateFhirR4ExchangeGate(
  bundle: Record<string, unknown> | null | undefined,
  gateOpts?: FhirExchangeGateOptions
): FhirExchangeValidation {
  const issues: string[] = [];
  const resourceCounts: Record<string, number> = {};
  const engine = FHIR_EXCHANGE_GATE_ENGINE;

  if (!bundle || typeof bundle !== 'object') {
    return {
      ok: false,
      issues: ['bundle missing or not an object'],
      engine,
      resourceCounts,
    };
  }

  const tierFromMeta = readMetaTagCode(bundle, 'urn:health-analyzer:export-kind');
  const purposeFromMeta = readMetaTagCode(bundle, 'urn:health-analyzer:exchange-purpose');
  const tier = normalizeFhirExportTier(
    gateOpts?.exportTier != null ? gateOpts.exportTier : tierFromMeta || 'local-archive'
  );
  const isExchange = tier === 'external-exchange';
  const purpose = isExchange
    ? normalizeFhirExchangePurpose(
        gateOpts?.exchangePurpose != null
          ? gateOpts.exchangePurpose
          : purposeFromMeta || 'anonymous-share'
      )
    : null;

  if (isExchange && !purposeFromMeta) {
    pushIssue(
      issues,
      'external-exchange Bundle missing meta.tag exchange-purpose (anonymous-share | personal-handoff)'
    );
  }
  if (isExchange && purposeFromMeta && purposeFromMeta !== purpose) {
    // prefer explicit gate option when both present; still require valid purpose tag
    if (
      purposeFromMeta !== 'anonymous-share' &&
      purposeFromMeta !== 'personal-handoff'
    ) {
      pushIssue(
        issues,
        `unknown exchange-purpose tag: ${purposeFromMeta}`
      );
    }
  }

  if (bundle.resourceType !== 'Bundle') {
    pushIssue(issues, `resourceType expected Bundle, got ${String(bundle.resourceType)}`);
  }
  // collection is correct for personal multi-resource archive exchange (not transaction)
  if (bundle.type !== 'collection') {
    pushIssue(
      issues,
      `Bundle.type expected collection for exchange archive, got ${String(bundle.type)}`
    );
  }
  if (bundle.timestamp != null && !isValidR4DateTime(String(bundle.timestamp))) {
    pushIssue(issues, `Bundle.timestamp invalid dateTime: ${String(bundle.timestamp)}`);
  }

  const entry = Array.isArray(bundle.entry) ? (bundle.entry as Record<string, unknown>[]) : [];
  if (!entry.length) {
    pushIssue(issues, 'Bundle.entry is empty');
  }

  const fullUrls = new Set<string>();
  const patientFullUrls = new Set<string>();
  const deviceFullUrls = new Set<string>();

  // Pass 1: identity + resource counts
  for (let i = 0; i < entry.length; i++) {
    const e = entry[i] || {};
    const fullUrl = e.fullUrl != null ? String(e.fullUrl) : '';
    if (!fullUrl) {
      pushIssue(issues, `entry[${i}] missing fullUrl`);
    } else if (!URN_UUID_RE.test(fullUrl)) {
      pushIssue(
        issues,
        `entry[${i}] fullUrl must be urn:uuid: for external exchange (got ${fullUrl})`
      );
    } else if (fullUrls.has(fullUrl)) {
      pushIssue(issues, `duplicate fullUrl ${fullUrl}`);
    } else {
      fullUrls.add(fullUrl);
    }

    const r = (e.resource || null) as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') {
      pushIssue(issues, `entry[${i}] missing resource`);
      continue;
    }
    const rt = String(r.resourceType || '');
    if (!rt) {
      pushIssue(issues, `entry[${i}] resource missing resourceType`);
      continue;
    }
    resourceCounts[rt] = (resourceCounts[rt] || 0) + 1;
    if (r.id == null || String(r.id).trim() === '') {
      pushIssue(issues, `entry[${i}] ${rt} missing id`);
    }
    if (rt === 'Patient' && fullUrl) patientFullUrls.add(fullUrl);
    if (rt === 'Device' && fullUrl) deviceFullUrls.add(fullUrl);
  }

  // Pass 2: resource-specific R4 structure
  for (let i = 0; i < entry.length; i++) {
    const e = entry[i] || {};
    const r = (e.resource || null) as Record<string, unknown> | null;
    if (!r) continue;
    const rt = String(r.resourceType || '');
    const id = r.id != null ? String(r.id) : String(i);

    if (rt === 'Observation') {
      const status = r.status != null ? String(r.status) : '';
      if (!status || !OBS_STATUS.has(status)) {
        pushIssue(issues, `Observation/${id} status missing or not in R4 ObservationStatus`);
      }

      // category: 0..* in core R4 but preferred; exchange gate requires ≥1 for interoperability
      if (!Array.isArray(r.category) || r.category.length === 0) {
        pushIssue(issues, `Observation/${id} missing category (required for external-exchange)`);
      } else {
        const cat0 = r.category[0] as { coding?: { system?: string; code?: string }[] };
        const hasCatCode =
          cat0 &&
          Array.isArray(cat0.coding) &&
          cat0.coding.some((c) => c && c.system && c.code);
        if (!hasCatCode) {
          pushIssue(issues, `Observation/${id} category[0] needs coding.system+code`);
        }
      }

      const code = r.code as { coding?: { system?: string; code?: string }[]; text?: string } | undefined;
      if (!code || typeof code !== 'object') {
        pushIssue(issues, `Observation/${id} missing code`);
      } else {
        const codings = Array.isArray(code.coding) ? code.coding : [];
        const okCoding = codings.some((c) => c && c.system && c.code);
        if (!okCoding) {
          pushIssue(issues, `Observation/${id} code.coding needs system+code`);
        }
      }

      if (r.effectiveDateTime == null && r.effectivePeriod == null) {
        pushIssue(issues, `Observation/${id} missing effectiveDateTime/effectivePeriod`);
      }
      if (r.effectiveDateTime != null && !isValidR4DateTime(String(r.effectiveDateTime))) {
        pushIssue(
          issues,
          `Observation/${id} effectiveDateTime fails R4 dateTime (timezone required when time present): ${r.effectiveDateTime}`
        );
      }
      if (r.effectivePeriod && typeof r.effectivePeriod === 'object') {
        const p = r.effectivePeriod as { start?: string; end?: string };
        if (!p.start || !p.end) {
          pushIssue(issues, `Observation/${id} effectivePeriod needs start and end`);
        } else {
          if (!isValidR4DateTime(String(p.start))) {
            pushIssue(issues, `Observation/${id} effectivePeriod.start invalid R4 dateTime: ${p.start}`);
          }
          if (!isValidR4DateTime(String(p.end))) {
            pushIssue(issues, `Observation/${id} effectivePeriod.end invalid R4 dateTime: ${p.end}`);
          }
        }
      }

      const hasValue =
        r.valueQuantity != null ||
        r.valueString != null ||
        r.valueCodeableConcept != null ||
        (Array.isArray(r.component) && r.component.length > 0);
      if (!hasValue) {
        pushIssue(issues, `Observation/${id} missing value/component`);
      }
      if (r.valueQuantity && typeof r.valueQuantity === 'object') {
        const vq = r.valueQuantity as { value?: unknown; system?: string; code?: string };
        if (vq.value == null || !Number.isFinite(Number(vq.value))) {
          pushIssue(issues, `Observation/${id} valueQuantity.value missing/not numeric`);
        }
        if (vq.system != null && String(vq.system) !== 'http://unitsofmeasure.org') {
          pushIssue(
            issues,
            `Observation/${id} valueQuantity.system should be UCUM (http://unitsofmeasure.org)`
          );
        }
        if (vq.system == null || vq.code == null) {
          pushIssue(issues, `Observation/${id} valueQuantity should include UCUM system+code`);
        }
      }

      // subject / device refs
      if (r.subject && typeof r.subject === 'object') {
        const ref = String((r.subject as { reference?: string }).reference || '');
        if (ref && !fullUrls.has(ref)) {
          pushIssue(issues, `Observation/${id} subject.reference not in Bundle fullUrl set`);
        } else if (ref && patientFullUrls.size > 0 && !patientFullUrls.has(ref)) {
          pushIssue(issues, `Observation/${id} subject.reference must resolve to Patient fullUrl`);
        }
      }
      if (r.device && typeof r.device === 'object') {
        const ref = String((r.device as { reference?: string }).reference || '');
        if (ref && !fullUrls.has(ref)) {
          pushIssue(issues, `Observation/${id} device.reference not in Bundle fullUrl set`);
        } else if (ref && deviceFullUrls.size > 0 && !deviceFullUrls.has(ref)) {
          pushIssue(issues, `Observation/${id} device.reference must resolve to Device fullUrl`);
        }
      }
    } else if (rt === 'Device') {
      const status = r.status != null ? String(r.status) : '';
      if (status && !DEVICE_STATUS.has(status)) {
        pushIssue(issues, `Device/${id} unexpected status ${status}`);
      }
      const hasIdentity =
        (Array.isArray(r.deviceName) && r.deviceName.length > 0) ||
        r.type != null ||
        r.manufacturer != null;
      if (!hasIdentity) {
        pushIssue(issues, `Device/${id} needs deviceName, type, or manufacturer`);
      }
      // v1.59: only measurement device classes; reject import-channel "devices"
      if (FORBIDDEN_DEVICE_IDS.has(id) || /hae|apple-health|aggregate/i.test(id)) {
        pushIssue(
          issues,
          `Device/${id} is an import channel / aggregate, not a measurement Device — omit from Observation.device`
        );
      }
      if (isExchange) {
        const exts = Array.isArray(r.extension) ? r.extension : [];
        const classExt = exts.find(
          (x: { url?: string; valueCode?: string }) =>
            x && String(x.url || '') === 'urn:health-analyzer:extension:device-class'
        ) as { valueCode?: string } | undefined;
        const confExt = exts.find(
          (x: { url?: string; valueCode?: string }) =>
            x && String(x.url || '') === 'urn:health-analyzer:extension:device-confidence'
        ) as { valueCode?: string } | undefined;
        const cls = classExt && classExt.valueCode != null ? String(classExt.valueCode) : '';
        if (cls && cls !== 'apple-watch' && cls !== 'iphone') {
          pushIssue(
            issues,
            `Device/${id} device-class "${cls}" not allowed for exchange (only apple-watch|iphone)`
          );
        }
        if (!MEASUREMENT_DEVICE_IDS.has(id) && (!cls || (cls !== 'apple-watch' && cls !== 'iphone'))) {
          // allow if id is custom but class is ok; otherwise flag
          if (!cls) {
            pushIssue(
              issues,
              `Device/${id} missing high-confidence measurement class extension for exchange`
            );
          }
        }
        if (confExt && String(confExt.valueCode || '') !== 'high') {
          pushIssue(
            issues,
            `Device/${id} device-confidence must be high for exchange (got ${confExt.valueCode})`
          );
        }
        if (!confExt) {
          pushIssue(
            issues,
            `Device/${id} missing device-confidence=high extension (reject global-inference devices)`
          );
        }
      }
    } else if (rt === 'Patient') {
      if (
        Array.isArray(r.identifier) &&
        r.identifier.some(
          (idObj: { value?: string }) => idObj && String(idObj.value || '') === 'local-patient'
        )
      ) {
        pushIssue(
          issues,
          `Patient/${id} uses fixed identifier "local-patient" (merge risk for external exchange)`
        );
      }
      if (r.birthDate != null) {
        const bd = String(r.birthDate);
        if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(bd)) {
          pushIssue(issues, `Patient/${id} birthDate invalid R4 date: ${bd}`);
        }
      }
    } else if (rt === 'Provenance') {
      if (r.recorded == null || !isValidR4DateTime(String(r.recorded))) {
        pushIssue(issues, `Provenance/${id} recorded missing or invalid dateTime`);
      }
      if (!Array.isArray(r.agent) || !r.agent.length) {
        pushIssue(issues, `Provenance/${id} missing agent`);
      }
      if (!Array.isArray(r.target) || !r.target.length) {
        pushIssue(issues, `Provenance/${id} missing target`);
      } else {
        for (const t of r.target as { reference?: string }[]) {
          const ref = String((t && t.reference) || '');
          if (!ref) {
            pushIssue(issues, `Provenance/${id} target missing reference`);
          } else if (!fullUrls.has(ref)) {
            pushIssue(
              issues,
              `Provenance/${id} target ${ref} does not match entry.fullUrl`
            );
          }
        }
      }
    } else if (rt === 'DocumentReference') {
      if (!Array.isArray(r.content) || !r.content.length) {
        pushIssue(issues, `DocumentReference/${id} missing content`);
      } else {
        const att = (r.content[0] as { attachment?: { data?: string; contentType?: string } })
          ?.attachment;
        if (!att || !att.data) {
          pushIssue(issues, `DocumentReference/${id} content[0].attachment.data missing`);
        }
        if (att && !att.contentType) {
          pushIssue(issues, `DocumentReference/${id} attachment.contentType missing`);
        }
      }
    }
  }

  // Exchange expects at least one Observation
  if (isExchange && (resourceCounts.Observation || 0) < 1) {
    pushIssue(issues, 'external-exchange Bundle must contain ≥1 Observation');
  }

  // --- v1.59 / v1.62 purpose semantics ---
  if (isExchange && purpose === 'anonymous-share') {
    if ((resourceCounts.Patient || 0) > 0) {
      pushIssue(
        issues,
        'anonymous-share must not include Patient resource (no subject identity)'
      );
    }
    for (let i = 0; i < entry.length; i++) {
      const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
      if (!r) continue;
      const rt = String(r.resourceType || '');
      const id = r.id != null ? String(r.id) : String(i);

      if (rt === 'Observation' && r.subject != null) {
        pushIssue(
          issues,
          `Observation/${id} must not have subject under anonymous-share`
        );
      }

      // v1.62 privacy: raw Apple sourceName must not leave the device on anonymous share
      if (Array.isArray(r.extension)) {
        for (const ext of r.extension as { url?: string; valueString?: string }[]) {
          if (!ext) continue;
          const url = String(ext.url || '');
          if (url === EXT_SOURCE_NAME) {
            pushIssue(
              issues,
              `${rt}/${id} anonymous-share must not include source-name extension (raw sourceName may re-identify)`
            );
          }
          // v1.65: source-batch-ids must be opaque remapped ids only
          if (url === EXT_SOURCE_BATCH_IDS) {
            const parts = String(ext.valueString || '')
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean);
            for (const bid of parts) {
              if (batchIdLooksPersonal(bid) || !isOpaqueAnonBatchId(bid)) {
                pushIssue(
                  issues,
                  `${rt}/${id} anonymous-share source-batch-ids must use opaque batch_anon_* ids (got ${bid.slice(0, 48)})`
                );
              }
            }
          }
        }
      }
      if (Array.isArray(r.note)) {
        for (const n of r.note as { text?: string }[]) {
          const t = n && n.text != null ? String(n.text) : '';
          if (/^sourceName\s*:/i.test(t.trim()) || t.includes('sourceName:')) {
            pushIssue(
              issues,
              `${rt}/${id} anonymous-share must not include sourceName note (raw sourceName may re-identify)`
            );
          }
        }
      }

      // Provenance must not embed import file names or personal batch ids
      if (rt === 'Provenance' && Array.isArray(r.entity)) {
        for (const ent of r.entity as {
          what?: { display?: string; identifier?: { value?: string } };
        }[]) {
          const disp = ent && ent.what && ent.what.display != null ? String(ent.what.display) : '';
          // Channel-only is "hae" or "apple_xml"; file lists contain ": " + name or ".json"/".zip"
          if (/\.(json|xml|zip|csv)\b/i.test(disp) || /:\s+.+\./.test(disp)) {
            pushIssue(
              issues,
              `Provenance/${id} anonymous-share entity display must not include import file names (${disp.slice(0, 60)})`
            );
          }
          const bid =
            ent && ent.what && ent.what.identifier && ent.what.identifier.value != null
              ? String(ent.what.identifier.value)
              : '';
          if (bid && (batchIdLooksPersonal(bid) || !isOpaqueAnonBatchId(bid))) {
            pushIssue(
              issues,
              `Provenance/${id} anonymous-share entity identifier must be opaque batch_anon_* (got ${bid.slice(0, 48)})`
            );
          }
        }
      }
    }
  }

  if (isExchange && purpose === 'personal-handoff') {
    if ((resourceCounts.Patient || 0) < 1) {
      pushIssue(
        issues,
        'personal-handoff requires Patient resource and Observation.subject'
      );
    } else {
      // every Observation must have subject → Patient
      for (let i = 0; i < entry.length; i++) {
        const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
        if (!r || r.resourceType !== 'Observation') continue;
        const sub = r.subject as { reference?: string } | undefined;
        const ref = sub && sub.reference != null ? String(sub.reference) : '';
        if (!ref) {
          pushIssue(
            issues,
            `Observation/${String(r.id || i)} missing subject (required for personal-handoff)`
          );
        } else if (patientFullUrls.size > 0 && !patientFullUrls.has(ref)) {
          pushIssue(
            issues,
            `Observation/${String(r.id || i)} subject must resolve to Patient fullUrl`
          );
        }
      }
      // Patient must carry a *strong* persistent identifier (v1.63 — reject weak ids like "1")
      for (let i = 0; i < entry.length; i++) {
        const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
        if (!r || r.resourceType !== 'Patient') continue;
        const ids = Array.isArray(r.identifier) ? r.identifier : [];
        const strong = ids.some(
          (idObj: { value?: string }) => idObj && isStrongPersistentPatientId(idObj.value)
        );
        if (!strong) {
          pushIssue(
            issues,
            `Patient/${String(r.id || i)} personal-handoff requires strong persistent id (UUID or pid_…; not weak values like "1" or local-patient)`
          );
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    engine,
    resourceCounts,
  };
}
