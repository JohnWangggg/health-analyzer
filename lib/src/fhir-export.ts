/**
 * 本机 FHIR R4-shaped Observation + Provenance + 可选 DocumentReference / Patient / Device 导出（试验性 v1.58）
 *
 * - 仅生成本地可下载 JSON Bundle；非医院系统对接、非 FHIR 认证提交
 * - Bundle entry.fullUrl 使用 urn:uuid:；Provenance.target 与之匹配
 * - 日汇总用 effectivePeriod；瞬时测点用 effectiveDateTime
 * - v1.53：按 domainSourceBatches 为每个导入批次生成细粒度 Provenance（仅 target 该域 Observation）
 * - v1.55：可选本机伪名 Patient（默认关闭，无身份 / 无 subject）
 * - v1.56：日汇总日期精度；Patient 默认无固定 identifier；birthDate 仅年
 * - v1.57：可选 Device + Observation.device
 * - v1.58：导出档位 local-archive / external-exchange；后者须独立 R4 交换门禁校验
 * - v1.59：Device 仅高置信度测量设备（Watch/iPhone）；HAE/聚合不进 device；
 *          外部交换分 anonymous-share / personal-handoff
 * - 项目自检 validateFhirExportBundle ≠ 官方 HL7 校验器；交换门禁为独立规则引擎
 */

import {
  FullAnalysis,
  BloodPressureRecord,
  CgmPoint,
  WeightRecord,
  SleepDaySummary,
  WatchDayView,
} from './types';
import { getDate } from './parser';
import {
  ImportBatchRecord,
  PROVENANCE_RULE_VERSION,
  normalizeImportBatch,
} from './provenance';
import { buildAgpSvg, buildCgm14DayReport } from './clinical-report';
import {
  FhirExportTier,
  FhirExchangePurpose,
  FhirExchangeValidation,
  FHIR_EXCHANGE_GATE_ENGINE,
  normalizeFhirExportTier,
  normalizeFhirExchangePurpose,
  validateFhirR4ExchangeGate,
} from './fhir-r4-exchange';

export type {
  FhirExportTier,
  FhirExchangePurpose,
  FhirExchangeValidation,
} from './fhir-r4-exchange';
export {
  FHIR_EXPORT_TIERS,
  FHIR_EXCHANGE_PURPOSES,
  FHIR_EXCHANGE_GATE_ENGINE,
  isValidR4DateTime,
  normalizeFhirExportTier,
  normalizeFhirExchangePurpose,
  validateFhirR4ExchangeGate,
} from './fhir-r4-exchange';

// ============================================================
// Constants & public types
// ============================================================

export const FHIR_EXPORT_PROFILE = 'health-analyzer-fhir-export-v1.9.0';
export const FHIR_R4 = 'http://hl7.org/fhir';

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
/** HL7 observation-category codesystem */
const OBS_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const META_SOURCE = 'urn:health-analyzer:local';
const DEVICE_NOTE = 'local Apple Health / HAE import';
/** Observation extension: comma-separated import batch ids for this domain */
const EXT_SOURCE_BATCH_IDS = 'urn:health-analyzer:extension:source-batch-ids';
/** Patient extension: year-only birthDate is approximate */
const EXT_BIRTH_YEAR_ONLY = 'urn:health-analyzer:extension:birth-year-only';
/** Patient extension: local pseudonym disclaimer */
const EXT_PATIENT_DISCLAIMER = 'urn:health-analyzer:extension:patient-disclaimer';
/** Device extension: local device class (not a verified UDI) */
const EXT_DEVICE_CLASS = 'urn:health-analyzer:extension:device-class';
/** Device extension: confidence of device mapping (v1.59 high only wired) */
const EXT_DEVICE_CONFIDENCE = 'urn:health-analyzer:extension:device-confidence';
/** Stable local patient identifier system / value (no real identity) */
const PATIENT_ID_SYSTEM = 'urn:health-analyzer:patient';
const PATIENT_LOCAL_ID = 'patient-local-1';
/** @deprecated Do not use a fixed identifier across exports (merge risk). */
const PATIENT_IDENTIFIER_VALUE_LEGACY = 'local-patient';
const FHIR_ADMIN_GENDERS = new Set(['male', 'female', 'other', 'unknown']);

/**
 * Measurement device classes only (v1.59).
 * HAE / Apple Health aggregate are import channels — use Provenance, not Observation.device.
 * @see https://hl7.org/fhir/R4/device.html (Device = manufactured item that performed the observation)
 */
export type FhirDeviceClass = 'apple-watch' | 'iphone';

export const FHIR_DEVICE_CLASSES: readonly FhirDeviceClass[] = [
  'apple-watch',
  'iphone',
] as const;

/** @deprecated legacy labels — never emit as Device for Observation.device */
export type FhirLegacyImportChannel = 'hae-import' | 'apple-health';

export interface FhirDeviceResolution {
  /** null when confidence is not high enough to wire Observation.device */
  deviceClass: FhirDeviceClass | null;
  confidence: 'high' | 'none';
  /** short machine reason for notes / debugging */
  reason: string;
}

const DEVICE_CLASS_META: Record<
  FhirDeviceClass,
  { id: string; display: string; manufacturer: string; typeText: string }
> = {
  'apple-watch': {
    id: 'device-apple-watch',
    display: 'Apple Watch',
    manufacturer: 'Apple Inc.',
    typeText: 'Wearable smartwatch (Apple Watch class)',
  },
  iphone: {
    id: 'device-iphone',
    display: 'iPhone',
    manufacturer: 'Apple Inc.',
    typeText: 'Smartphone sensor / Health app device (iPhone class)',
  },
};

/** Domains known to be built only from Apple Watch watchDaily / Watch-filtered records */
const HIGH_CONFIDENCE_WATCH_TYPES = new Set([
  'spo2',
  'vo2Max',
  'breathingDisturbance',
  'wristTemperature',
  'nightHeartRate',
  'respiratoryRate',
  'restingHeartRate',
  'sleep',
]);

/**
 * FHIR Observation byType key → analysis domain key (domainSourceBatches / HAE byDomain).
 * Watch-derived daily metrics share the `watch` domain.
 */
export const FHIR_OBS_TYPE_TO_DOMAIN: Record<string, string> = {
  bloodPressure: 'bloodPressure',
  bodyWeight: 'weight',
  glucose: 'cgm',
  steps: 'steps',
  restingHeartRate: 'restingHr',
  sleep: 'sleep',
  spo2: 'watch',
  vo2Max: 'watch',
  breathingDisturbance: 'watch',
  wristTemperature: 'watch',
  nightHeartRate: 'watch',
  respiratoryRate: 'watch',
};

const DEFAULT_MAX_CGM = 2000;
const DEFAULT_MAX_BP = 500;
const DEFAULT_MAX_WEIGHT = 500;
const DEFAULT_MAX_STEPS_DAYS = 366;
const DEFAULT_MAX_RESTING_HR_DAYS = 366;
const DEFAULT_MAX_SPO2_DAYS = 366;
const DEFAULT_MAX_SLEEP_DAYS = 366;
const DEFAULT_MAX_VO2_DAYS = 366;
const DEFAULT_MAX_BREATHING_DAYS = 366;
const DEFAULT_MAX_WRIST_TEMP_DAYS = 366;
const DEFAULT_MAX_NIGHT_HR_DAYS = 366;
const DEFAULT_MAX_RR_DAYS = 366;
/** Clinical document attachment size cap (UTF-8 chars) */
const DEFAULT_MAX_CLINICAL_DOC_CHARS = 400_000;

export interface FhirExportOptions {
  locale?: string;
  /** ISO date YYYY-MM-DD inclusive window; default analysis.dateRange */
  windowStart?: string | null;
  windowEnd?: string | null;
  /** max Observations per domain */
  maxCgm?: number; // default 2000 (evenly sampled if more)
  maxBp?: number; // default 500
  maxWeight?: number; // default 500
  maxStepsDays?: number; // default 366
  maxSpo2Days?: number; // default 366
  maxSleepDays?: number; // default 366
  maxVo2Days?: number; // default 366
  maxBreathingDays?: number; // default 366
  maxWristTempDays?: number; // default 366
  maxNightHrDays?: number; // default 366
  maxRrDays?: number; // default 366
  includeProvenance?: boolean; // default true when batches provided
  importBatches?: ImportBatchRecord[] | null; // from provenance.ts
  /**
   * default false — no Patient resource and no subject on Observations/DocumentReference.
   * When true, emit a local pseudonym Patient and wire subject to its Bundle fullUrl.
   */
  includePatient?: boolean;
  /** display name only, e.g. "Local user" / "匿名-A" — never required real legal name */
  patientDisplay?: string | null;
  /** optional gender: male | female | other | unknown */
  patientGender?: string | null;
  /** optional birthYear only (not full DOB) for privacy */
  patientBirthYear?: number | null;
  /**
   * Emit Device resources and wire Observation.device when **high confidence**
   * (default true). Only Apple Watch / iPhone measurement classes.
   * HAE / multi-source aggregates are NOT Devices (use Provenance).
   */
  includeDevices?: boolean;
  /**
   * When exportTier=external-exchange:
   * - anonymous-share (default): force no Patient / no subject; mark anonymous purpose
   * - personal-handoff: require Patient + subject + persistent local pseudonym id
   */
  exchangePurpose?: FhirExchangePurpose | string | null;
  /**
   * Required for personal-handoff: random local-persisted pseudonym id
   * (never the fixed value "local-patient").
   */
  patientPersistentId?: string | null;
  /**
   * Attach a local clinical review document as DocumentReference (default false).
   * Provide markdown and/or html; content is truncated if over maxClinicalDocChars.
   */
  includeClinicalDocument?: boolean;
  clinicalMarkdown?: string | null;
  clinicalHtml?: string | null;
  maxClinicalDocChars?: number;
  /**
   * Attach printable AGP SVG as a separate DocumentReference when CGM 14d is sufficient.
   * Optional pre-built SVG overrides internal generation.
   */
  includeAgpSvg?: boolean;
  agpSvg?: string | null;
  /** run lightweight structure self-check (default true) */
  validate?: boolean;
  /**
   * Export tier (v1.58):
   * - local-archive (default): personal archive; project self-check only
   * - external-exchange: stricter shaping + independent R4 exchange-gate validation
   */
  exportTier?: FhirExportTier | string | null;
  /**
   * When exportTier=external-exchange, run independent exchange gate (default true).
   * Does not invoke HL7 Java validator; see FHIR_EXCHANGE_GATE_ENGINE.
   */
  runExchangeValidation?: boolean;
}

export interface FhirExportValidation {
  ok: boolean;
  issues: string[];
  resourceCounts: Record<string, number>;
}

export interface FhirExportResult {
  bundle: Record<string, unknown>; // FHIR Bundle
  json: string; // pretty JSON
  counts: {
    observations: number;
    provenances: number;
    documentReferences: number;
    patients: number;
    devices: number;
    byType: Record<string, number>;
  };
  notes: string[];
  /** Resolved export tier */
  exportTier: FhirExportTier;
  /** Resolved exchange purpose (null when local-archive) */
  exchangePurpose: FhirExchangePurpose | null;
  /** Project self-check (not official HL7 validator) */
  validation?: FhirExportValidation;
  /**
   * Independent R4 exchange-gate result (present when tier=external-exchange
   * or runExchangeValidation forced).
   */
  exchangeValidation?: FhirExchangeValidation;
  /**
   * true when local-archive, or when external-exchange exchangeValidation.ok.
   * UI should block download of external-exchange when false.
   */
  exchangeReady: boolean;
}

// ============================================================
// Helpers
// ============================================================

/** Best-effort Apple Health / local datetime → ISO-8601 string */
export function toIsoDateTime(appleDt: string): string {
  if (appleDt == null) return '';
  const s = String(appleDt).trim();
  if (!s) return '';

  // Already ISO-ish with T
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const withColonTz = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const ms = Date.parse(withColonTz);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
    return withColonTz;
  }

  // Apple: "YYYY-MM-DD HH:mm:ss ±HHmm" or without tz
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}):?(\d{2}))?/
  );
  if (m) {
    const date = m[1];
    const time = m[2];
    if (m[3] != null && m[4] != null) {
      const iso = `${date}T${time}${m[3]}:${m[4]}`;
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
      return iso;
    }
    // No tz: treat as local wall time → leave as dateTtime (no Z claim)
    const localish = `${date}T${time}`;
    const ms = Date.parse(localish);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
    return localish;
  }

  // Date-only → midnight UTC for effectiveDateTime stability
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }

  const ms = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return s;
}

function inWindow(dateYmd: string, start: string, end: string): boolean {
  if (!dateYmd || dateYmd.length < 10) return false;
  const d = dateYmd.slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** Evenly sample array to at most max items (preserve first & last when possible) */
function sampleEvenly<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return items.slice();
  if (max === 1) return [items[0]];
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * last) / (max - 1));
    out.push(items[idx]);
  }
  // de-dupe consecutive identical refs if round collisions
  const deduped: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    const idx = Math.round((i * last) / (max - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    deduped.push(out[i]);
  }
  // If collisions dropped below max, fill remaining from unused indices
  if (deduped.length < max) {
    for (let i = 0; i < items.length && deduped.length < max; i++) {
      if (!seen.has(i)) {
        seen.add(i);
        deduped.push(items[i]);
      }
    }
  }
  return deduped;
}

function loincCoding(code: string, display: string): Record<string, unknown> {
  return {
    coding: [
      {
        system: LOINC,
        code,
        display,
      },
    ],
    text: display,
  };
}

function quantity(
  value: number,
  unit: string,
  code: string,
  system = UCUM
): Record<string, unknown> {
  return {
    value,
    unit,
    system,
    code,
  };
}

/** observation-category for interoperability (required by external-exchange gate) */
function observationCategory(byTypeKey: string): Record<string, unknown> {
  const key = String(byTypeKey || '');
  let code = 'vital-signs';
  let display = 'Vital Signs';
  if (key === 'glucose') {
    code = 'laboratory';
    display = 'Laboratory';
  } else if (key === 'steps' || key === 'sleep') {
    code = 'activity';
    display = 'Activity';
  }
  return {
    coding: [
      {
        system: OBS_CATEGORY_SYSTEM,
        code,
        display,
      },
    ],
    text: display,
  };
}

function attachObservationCategory(obs: Record<string, unknown>, byTypeKey: string): void {
  if (Array.isArray(obs.category) && obs.category.length > 0) return;
  obs.category = [observationCategory(byTypeKey)];
}

/** RFC4122-ish UUID for Bundle fullUrl (crypto.randomUUID when available) */
export function newBundleUuid(): string {
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // fallback: not crypto-strong, adequate for local export identity
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, hex).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type EffectiveSpec =
  | { kind: 'instant'; value: string }
  | { kind: 'period'; start: string; end: string; summaryNote?: string };

/**
 * Calendar-day period for daily aggregates.
 * Uses **date precision only** (YYYY-MM-DD) so FHIR dateTime rules do not require a timezone.
 * (R4: if hour/minute are present, timezone is mandatory.)
 */
export function dayEffectivePeriod(dateYmd: string): { start: string; end: string } {
  const d = String(dateYmd || '').slice(0, 10);
  return {
    start: d,
    end: d,
  };
}

/**
 * R4 dateTime: if precision includes hour/minute, a timezone offset or Z is required.
 * Date-only (YYYY / YYYY-MM / YYYY-MM-DD) is allowed without zone.
 */
export function isValidFhirDateTime(value: string): boolean {
  const s = String(value || '').trim();
  if (!s) return false;
  // year / year-month / full date
  if (/^\d{4}$/.test(s)) return true;
  if (/^\d{4}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  // dateTime with time → must end with Z or ±HH:MM (or ±HHMM)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return /(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(s);
  }
  return false;
}

function baseObservation(
  id: string,
  code: Record<string, unknown>,
  effective: EffectiveSpec
): Record<string, unknown> {
  const obs: Record<string, unknown> = {
    resourceType: 'Observation',
    id,
    meta: {
      source: META_SOURCE,
      profile: [`${FHIR_R4}/StructureDefinition/Observation`],
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
      ],
    },
    status: 'final',
    code,
    note: [{ text: DEVICE_NOTE }],
  };
  if (effective.kind === 'instant') {
    obs.effectiveDateTime = effective.value;
  } else {
    obs.effectivePeriod = { start: effective.start, end: effective.end };
    if (effective.summaryNote) {
      (obs.note as { text: string }[]).push({ text: effective.summaryNote });
    }
  }
  return obs;
}

/**
 * Bundle entry with FHIR-compliant fullUrl identity (urn:uuid:...).
 * Logical resource.id retained for human debugging; internal refs use fullUrl.
 */
function entryFor(
  resource: Record<string, unknown>,
  idToFullUrl: Map<string, string>
): Record<string, unknown> {
  const rt = String(resource.resourceType || 'Resource');
  const id = String(resource.id || '');
  const fullUrl = `urn:uuid:${newBundleUuid()}`;
  if (id) {
    idToFullUrl.set(`${rt}/${id}`, fullUrl);
  }
  return { fullUrl, resource };
}

/**
 * Local measurement Device for Observation.device (v1.59: high-confidence only).
 * Pseudonym device class — not a verified UDI / serial / model.
 */
export function buildLocalDeviceResource(
  deviceClass: FhirDeviceClass
): Record<string, unknown> {
  const meta = DEVICE_CLASS_META[deviceClass];
  if (!meta) {
    throw new Error(`unknown FhirDeviceClass: ${String(deviceClass)}`);
  }
  return {
    resourceType: 'Device',
    id: meta.id,
    meta: {
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
      ],
    },
    status: 'active',
    manufacturer: meta.manufacturer,
    deviceName: [{ name: meta.display, type: 'user-friendly-name' }],
    type: { text: meta.typeText },
    extension: [
      {
        url: EXT_DEVICE_CLASS,
        valueCode: deviceClass,
      },
      {
        url: EXT_DEVICE_CONFIDENCE,
        valueCode: 'high',
      },
      {
        url: 'urn:health-analyzer:extension:device-disclaimer',
        valueString:
          'High-confidence measurement device class only (Apple Watch / iPhone). Not a verified UDI or serial. Import channels (HAE / Apple Health aggregate) are not Devices — see Provenance.',
      },
    ],
    note: [
      {
        text: 'Wired only when source confidence is high (watch-only domains or exclusive steps source).',
      },
    ],
  };
}

/** Logical Device/{id} for a class key */
export function deviceLogicalId(deviceClass: FhirDeviceClass): string {
  return DEVICE_CLASS_META[deviceClass].id;
}

export function deviceDisplayName(deviceClass: FhirDeviceClass): string {
  return DEVICE_CLASS_META[deviceClass].display;
}

/**
 * v1.59 high-confidence device resolution for Observation.device.
 * - Only apple-watch / iphone (measurement devices)
 * - Never HAE / Apple Health aggregate (import channels → Provenance)
 * - BP / CGM / weight: no per-record source retained → omit device
 */
export function resolveObservationDevice(
  byTypeKey: string,
  opts?: {
    stepsDay?: { watch?: number; iphone?: number; max?: number } | null;
    /** ignored for device mapping (v1.59); kept for call-site compatibility */
    hasHaeImport?: boolean;
  }
): FhirDeviceResolution {
  const key = String(byTypeKey || '');
  if (HIGH_CONFIDENCE_WATCH_TYPES.has(key)) {
    return {
      deviceClass: 'apple-watch',
      confidence: 'high',
      reason: 'watch-sourced-domain',
    };
  }
  if (key === 'steps') {
    const day = opts?.stepsDay;
    const w = day && Number.isFinite(Number(day.watch)) ? Number(day.watch) : 0;
    const p = day && Number.isFinite(Number(day.iphone)) ? Number(day.iphone) : 0;
    if (w > 0 && p <= 0) {
      return { deviceClass: 'apple-watch', confidence: 'high', reason: 'steps-watch-only' };
    }
    if (p > 0 && w <= 0) {
      return { deviceClass: 'iphone', confidence: 'high', reason: 'steps-iphone-only' };
    }
    if (w > 0 && p > 0) {
      return {
        deviceClass: null,
        confidence: 'none',
        reason: 'steps-multi-source-omit-device',
      };
    }
    return { deviceClass: null, confidence: 'none', reason: 'steps-source-unknown' };
  }
  // BP / glucose / weight: sourceName not retained on records — do not invent Device
  if (key === 'bloodPressure' || key === 'glucose' || key === 'bodyWeight') {
    return {
      deviceClass: null,
      confidence: 'none',
      reason: 'per-sample-source-not-retained',
    };
  }
  return { deviceClass: null, confidence: 'none', reason: 'no-high-confidence-mapping' };
}

/**
 * @deprecated use resolveObservationDevice; returns null when confidence is not high.
 */
export function resolveObservationDeviceClass(
  byTypeKey: string,
  opts?: {
    hasHaeImport?: boolean;
    stepsDay?: { watch?: number; iphone?: number; max?: number } | null;
  }
): FhirDeviceClass | null {
  return resolveObservationDevice(byTypeKey, opts).deviceClass;
}

/**
 * Local pseudonym Patient for optional Bundle subject wiring.
 * - Default: **no identifier** (avoids cross-person merge on fixed `local-patient`)
 * - Optional persistentId: only when caller supplies a real random local id for cross-bundle link
 * - birthDate uses year precision only (YYYY), never fabricated Jan 1
 */
export function buildLocalPatientResource(opts?: {
  display?: string | null;
  gender?: string | null;
  birthYear?: number | null;
  /**
   * When set, write identifier with this value (should be random & local-persisted).
   * When omitted, no Patient.identifier is written (default, safer for multi-user archives).
   */
  persistentId?: string | null;
}): Record<string, unknown> {
  const display =
    opts?.display != null && String(opts.display).trim()
      ? String(opts.display).trim()
      : 'Local patient';
  const patient: Record<string, unknown> = {
    resourceType: 'Patient',
    id: PATIENT_LOCAL_ID,
    meta: {
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
      ],
    },
    name: [{ text: display }],
    extension: [
      {
        url: EXT_PATIENT_DISCLAIMER,
        valueString:
          'Local pseudonym only; not a verified identity. Optional subject for personal archive — never a legal name requirement. No shared default identifier across exports.',
      },
    ],
  };

  const pid =
    opts?.persistentId != null && String(opts.persistentId).trim()
      ? String(opts.persistentId).trim()
      : '';
  if (pid && pid !== PATIENT_IDENTIFIER_VALUE_LEGACY) {
    patient.identifier = [
      {
        system: PATIENT_ID_SYSTEM,
        value: pid,
      },
    ];
  }

  const genderRaw = opts?.gender != null ? String(opts.gender).trim().toLowerCase() : '';
  if (genderRaw && FHIR_ADMIN_GENDERS.has(genderRaw)) {
    patient.gender = genderRaw;
  }

  const by = opts?.birthYear;
  if (by != null && Number.isFinite(by)) {
    const year = Math.trunc(Number(by));
    if (year >= 1900 && year <= 2100) {
      // FHIR date allows year-only precision — do not fabricate YYYY-01-01
      patient.birthDate = String(year);
      (patient.extension as Record<string, unknown>[]).push({
        url: EXT_BIRTH_YEAR_ONLY,
        valueString: 'year-only precision (not day-of-year)',
      });
    }
  }

  return patient;
}

function batchDisplay(b: ImportBatchRecord): string {
  const fileNames = (b.files || []).map((f) => f.name).filter(Boolean);
  const filesPart =
    fileNames.length === 0
      ? 'no-files'
      : fileNames.length <= 3
        ? fileNames.join(', ')
        : `${fileNames.slice(0, 3).join(', ')} +${fileNames.length - 3}`;
  return `${b.source}: ${filesPart}`;
}

/** Short stable suffix for Provenance resource id */
export function shortImportBatchIdForProv(id: string): string {
  const s = String(id || '');
  const m = s.match(/^batch_(\d+)_(.+)$/i);
  if (m) return `${m[1].slice(-6)}_${String(m[2]).slice(0, 8)}`;
  return s.length > 20 ? s.slice(0, 20) : s || 'unknown';
}

function hasDomainSourceBatches(
  map: Record<string, string[]> | null | undefined
): boolean {
  if (!map || typeof map !== 'object') return false;
  return Object.keys(map).some((k) => Array.isArray(map[k]) && map[k]!.length > 0);
}

function attachSourceBatchExtension(
  obs: Record<string, unknown>,
  domain: string,
  domainSourceBatches: Record<string, string[]> | undefined
): void {
  if (!domainSourceBatches) return;
  const raw = domainSourceBatches[domain];
  if (!Array.isArray(raw) || !raw.length) return;
  const ids = raw.map((x) => String(x)).filter(Boolean);
  if (!ids.length) return;
  const ext = Array.isArray(obs.extension)
    ? (obs.extension as Record<string, unknown>[])
    : [];
  ext.push({
    url: EXT_SOURCE_BATCH_IDS,
    valueString: ids.join(','),
  });
  obs.extension = ext;
}

function buildAssemblerProvenance(params: {
  id: string;
  target: { reference: string }[];
  entities: Record<string, unknown>[];
  recorded: string;
}): Record<string, unknown> {
  const prov: Record<string, unknown> = {
    resourceType: 'Provenance',
    id: params.id,
    meta: {
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
        {
          system: 'urn:health-analyzer:rule-version',
          code: PROVENANCE_RULE_VERSION,
          display: PROVENANCE_RULE_VERSION,
        },
      ],
    },
    target: params.target,
    recorded: params.recorded,
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
          code: 'CREATE',
          display: 'create',
        },
      ],
      text: 'assemble local Observations / DocumentReference from Apple Health / HAE import',
    },
    agent: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'assembler',
              display: 'Assembler',
            },
          ],
          text: 'assembler',
        },
        who: {
          display: 'Health Analyzer',
          identifier: {
            system: 'urn:health-analyzer:software',
            value: FHIR_EXPORT_PROFILE,
          },
        },
      },
    ],
    reason: [
      {
        text:
          'Local processing and personal archive only; not clinical authentication or certified FHIR submission.',
      },
    ],
    extension: [
      {
        url: 'urn:health-analyzer:extension:export-disclaimer',
        valueString:
          'Local processing only; not clinical authentication. Experimental FHIR R4-shaped export.',
      },
    ],
  };
  if (params.entities.length) {
    prov.entity = params.entities;
  }
  return prov;
}

function entityForBatch(b: ImportBatchRecord): Record<string, unknown> {
  return {
    role: 'source',
    what: {
      identifier: {
        system: 'urn:health-analyzer:import-batch',
        value: b.id,
      },
      display: batchDisplay(b),
    },
  };
}

// ============================================================
// Domain builders
// ============================================================

function buildBpObservation(r: BloodPressureRecord, index: number): Record<string, unknown> {
  const id = `obs-bp-${index}`;
  // Prefer precise datetime; date-only falls back to day period
  const hasTime = r.datetime && /\d{2}:\d{2}/.test(r.datetime);
  const effective: EffectiveSpec = hasTime
    ? { kind: 'instant', value: toIsoDateTime(r.datetime || r.date) }
    : {
        kind: 'period',
        ...dayEffectivePeriod(r.date || getDate(r.datetime)),
        summaryNote: 'blood pressure (date-only; period = calendar day)',
      };
  const obs = baseObservation(id, loincCoding('85354-9', 'Blood pressure panel'), effective);
  obs.component = [
    {
      code: loincCoding('8480-6', 'Systolic blood pressure'),
      valueQuantity: quantity(r.systolic, 'mmHg', 'mm[Hg]'),
    },
    {
      code: loincCoding('8462-4', 'Diastolic blood pressure'),
      valueQuantity: quantity(r.diastolic, 'mmHg', 'mm[Hg]'),
    },
  ];
  return obs;
}

function buildWeightObservation(r: WeightRecord, index: number): Record<string, unknown> {
  const id = `obs-weight-${index}`;
  const hasTime = r.datetime && /\d{2}:\d{2}/.test(r.datetime);
  const effective: EffectiveSpec = hasTime
    ? { kind: 'instant', value: toIsoDateTime(r.datetime || r.date) }
    : {
        kind: 'period',
        ...dayEffectivePeriod(r.date || getDate(r.datetime)),
        summaryNote: 'body weight (date-only; period = calendar day)',
      };
  const obs = baseObservation(id, loincCoding('29463-7', 'Body weight'), effective);
  obs.valueQuantity = quantity(r.value, 'kg', 'kg');
  return obs;
}

function buildGlucoseObservation(p: CgmPoint, index: number): Record<string, unknown> {
  const id = `obs-glucose-${index}`;
  const effective: EffectiveSpec = {
    kind: 'instant',
    value: toIsoDateTime(p.datetime),
  };
  // 2339-0 Glucose [Moles/volume] in Blood; mmol/L canonical in this app
  const obs = baseObservation(id, loincCoding('2339-0', 'Glucose [Moles/volume] in Blood'), effective);
  obs.valueQuantity = quantity(p.value, 'mmol/L', 'mmol/L');
  return obs;
}

function dailyPeriod(date: string, summaryNote: string): EffectiveSpec {
  return {
    kind: 'period',
    ...dayEffectivePeriod(date),
    summaryNote,
  };
}

function buildStepsObservation(date: string, steps: number, index: number): Record<string, unknown> {
  const id = `obs-steps-${index}`;
  // 55423-8 Number of steps in 24 hour Measured — daily total, not midnight instant
  const obs = baseObservation(
    id,
    loincCoding('55423-8', 'Number of steps in 24 hour Measured'),
    dailyPeriod(date, 'daily total steps (24h window / calendar day aggregate)')
  );
  obs.valueQuantity = quantity(steps, '/d', '/d');
  return obs;
}

function buildRestingHrObservation(
  date: string,
  bpm: number,
  index: number
): Record<string, unknown> {
  const id = `obs-resting-hr-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('8867-4', 'Heart rate'),
    dailyPeriod(date, 'resting heart rate (daily summary aggregate, not a single midnight sample)')
  );
  obs.valueQuantity = quantity(bpm, 'beats/min', '/min');
  return obs;
}

/** Daily SpO2 mean from Watch day view — LOINC 59408-5 */
function buildSpo2Observation(date: string, spo2Pct: number, index: number): Record<string, unknown> {
  const id = `obs-spo2-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('59408-5', 'Oxygen saturation in Arterial blood by Pulse oximetry'),
    dailyPeriod(date, 'daily mean SpO₂ (Watch summary aggregate)')
  );
  obs.valueQuantity = quantity(spo2Pct, '%', '%');
  return obs;
}

/**
 * Sleep duration + stage components when available.
 * LOINC 93832-4 Sleep duration; stages as components (deep/REM/core/awake hours).
 */
function buildSleepObservation(
  date: string,
  sleep: SleepDaySummary,
  index: number
): Record<string, unknown> {
  const id = `obs-sleep-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('93832-4', 'Sleep duration'),
    dailyPeriod(date, 'daily sleep summary (total + stages when present); overnight/window aggregate')
  );
  if (sleep.total != null && Number.isFinite(sleep.total)) {
    obs.valueQuantity = quantity(sleep.total, 'h', 'h');
  }
  const components: Record<string, unknown>[] = [];
  const stage = (
    code: string,
    display: string,
    hours: number | undefined
  ) => {
    if (hours == null || !Number.isFinite(hours)) return;
    components.push({
      code: loincCoding(code, display),
      valueQuantity: quantity(hours, 'h', 'h'),
    });
  };
  // Stage LOINCs approximate; labeled in text for local archive clarity
  stage('93829-0', 'Deep sleep duration', sleep.deep);
  stage('93830-8', 'REM sleep duration', sleep.rem);
  stage('93831-6', 'Light/core sleep duration', sleep.core);
  stage('93828-2', 'Awake duration in sleep period', sleep.awake);
  if (components.length) obs.component = components;
  return obs;
}

/** VO2 max (mL/kg/min) — LOINC 19916-4 Oxygen consumption */
function buildVo2Observation(date: string, vo2: number, index: number): Record<string, unknown> {
  const id = `obs-vo2-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('19916-4', 'Oxygen consumption'),
    dailyPeriod(date, 'VO₂ max estimate from Watch / fitness (device estimate, not CPET); daily summary')
  );
  obs.valueQuantity = quantity(vo2, 'mL/kg/min', 'mL/kg/min');
  return obs;
}

/** Apple Sleeping Breathing Disturbances — local experimental code */
function buildBreathingDisturbanceObservation(
  date: string,
  value: number,
  index: number
): Record<string, unknown> {
  const id = `obs-breathing-${index}`;
  const obs = baseObservation(
    id,
    {
      coding: [
        {
          system: 'urn:health-analyzer:metric',
          code: 'apple_sleeping_breathing_disturbances',
          display: 'Sleep breathing disturbances (device index)',
        },
      ],
      text: 'Sleep breathing disturbances (device index)',
    },
    dailyPeriod(
      date,
      'Apple Watch sleeping breathing disturbances index; overnight summary; not a diagnosis'
    )
  );
  obs.valueQuantity = quantity(value, '1', '1');
  return obs;
}

/**
 * Wrist temperature — NOT LOINC body temperature when value may be a relative baseline delta.
 * Uses experimental local coding to avoid misreading +0.3 as 0.3°C absolute.
 */
function buildWristTempObservation(
  date: string,
  celsius: number,
  index: number
): Record<string, unknown> {
  const id = `obs-wrist-temp-${index}`;
  const obs = baseObservation(
    id,
    {
      coding: [
        {
          system: 'urn:health-analyzer:metric',
          code: 'apple_sleeping_wrist_temperature',
          display: 'Sleeping wrist temperature (device; may be relative delta)',
        },
      ],
      text: 'Sleeping wrist temperature (device; may be relative delta)',
    },
    dailyPeriod(
      date,
      'wrist temperature daily mean; value may be absolute °C or relative baseline delta depending on OS/source — not confirmed absolute body temperature'
    )
  );
  // UCUM Cel only if value looks like absolute body temp; else unitless experimental
  const looksAbsolute = celsius >= 30 && celsius <= 45;
  if (looksAbsolute) {
    obs.valueQuantity = quantity(celsius, 'Cel', 'Cel');
    (obs.note as { text: string }[]).push({
      text: 'value in plausible absolute °C range; still experimental wrist reading',
    });
  } else {
    obs.valueQuantity = {
      value: celsius,
      unit: 'device-unit',
      system: 'urn:health-analyzer:unit',
      code: 'wrist-temp-delta-or-raw',
    };
    (obs.note as { text: string }[]).push({
      text: 'value outside typical absolute body-temp range; treated as device raw/relative unit, not LOINC 8310-5 body temperature',
    });
  }
  obs.method = {
    text: 'Apple Watch sleeping wrist temperature',
  };
  return obs;
}

/** Night heart rate mean (Watch night window) — LOINC 8867-4 with night note */
function buildNightHrObservation(
  date: string,
  bpm: number,
  index: number
): Record<string, unknown> {
  const id = `obs-night-hr-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('8867-4', 'Heart rate'),
    dailyPeriod(
      date,
      'night-time heart rate mean (Watch night window summary aggregate); not resting HR; not a midnight instant'
    )
  );
  obs.valueQuantity = quantity(bpm, 'beats/min', '/min');
  return obs;
}

/** Respiratory rate mean — LOINC 9279-1 */
function buildRespiratoryRateObservation(
  date: string,
  rate: number,
  index: number
): Record<string, unknown> {
  const id = `obs-rr-${index}`;
  const obs = baseObservation(
    id,
    loincCoding('9279-1', 'Respiratory rate'),
    dailyPeriod(date, 'respiratory rate daily mean (Watch summary aggregate)')
  );
  obs.valueQuantity = quantity(rate, '/min', '/min');
  return obs;
}

/**
 * Lightweight structural self-check for local Bundle (NOT official FHIR validator).
 * Catches missing resourceType/id/status/target wiring; does not guarantee IG compliance.
 */
const URN_UUID_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateFhirExportBundle(
  bundle: Record<string, unknown> | null | undefined
): FhirExportValidation {
  const issues: string[] = [];
  const resourceCounts: Record<string, number> = {};
  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, issues: ['bundle missing or not an object'], resourceCounts };
  }
  if (bundle.resourceType !== 'Bundle') {
    issues.push(`resourceType expected Bundle, got ${String(bundle.resourceType)}`);
  }
  if (bundle.type !== 'collection') {
    issues.push(`Bundle.type expected collection, got ${String(bundle.type)}`);
  }
  const entry = Array.isArray(bundle.entry) ? (bundle.entry as Record<string, unknown>[]) : [];
  if (!entry.length) {
    issues.push('Bundle.entry is empty');
  }
  const logicalIds = new Set<string>();
  const fullUrls = new Set<string>();
  const fullUrlList: string[] = [];

  for (let i = 0; i < entry.length; i++) {
    const e = entry[i] || {};
    const fullUrl = e.fullUrl != null ? String(e.fullUrl) : '';
    if (!fullUrl) {
      issues.push(`entry[${i}] missing fullUrl`);
    } else {
      const isUri =
        URN_UUID_RE.test(fullUrl) ||
        /^https?:\/\//i.test(fullUrl) ||
        /^urn:/i.test(fullUrl);
      if (!isUri) {
        issues.push(`entry[${i}] fullUrl is not a URI: ${fullUrl}`);
      }
      if (!URN_UUID_RE.test(fullUrl) && !/^https?:\/\//i.test(fullUrl)) {
        // warn-level: relative Resource/id is not preferred for collection identity
        if (/^[A-Za-z]+\/[\w.-]+$/.test(fullUrl)) {
          issues.push(
            `entry[${i}] fullUrl looks like relative Resource/id (${fullUrl}); prefer urn:uuid:`
          );
        }
      }
      if (fullUrls.has(fullUrl)) {
        issues.push(`duplicate fullUrl ${fullUrl}`);
      }
      fullUrls.add(fullUrl);
      fullUrlList.push(fullUrl);
    }

    const r = (e.resource || null) as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') {
      issues.push(`entry[${i}] missing resource`);
      continue;
    }
    const rt = String(r.resourceType || '');
    resourceCounts[rt] = (resourceCounts[rt] || 0) + 1;
    const id = r.id != null ? String(r.id) : '';
    if (!rt) issues.push(`entry[${i}] resource missing resourceType`);
    if (!id) issues.push(`entry[${i}] ${rt || 'Resource'} missing id`);
    else {
      const key = `${rt}/${id}`;
      if (logicalIds.has(key)) issues.push(`duplicate resource id ${key}`);
      logicalIds.add(key);
    }

    if (rt === 'Observation') {
      if (r.status !== 'final' && r.status !== 'preliminary' && r.status !== 'amended') {
        issues.push(`Observation/${id || i} unexpected status ${String(r.status)}`);
      }
      if (!r.code) issues.push(`Observation/${id || i} missing code`);
      if (!r.effectiveDateTime && !r.effectivePeriod) {
        issues.push(`Observation/${id || i} missing effectiveDateTime/effectivePeriod`);
      }
      if (r.effectiveDateTime != null) {
        const edt = String(r.effectiveDateTime);
        if (!isValidFhirDateTime(edt)) {
          issues.push(
            `Observation/${id || i} effectiveDateTime invalid or missing timezone when time present: ${edt}`
          );
        }
      }
      if (r.effectivePeriod && typeof r.effectivePeriod === 'object') {
        const p = r.effectivePeriod as { start?: string; end?: string };
        if (!p.start || !p.end) {
          issues.push(`Observation/${id || i} effectivePeriod needs start and end`);
        } else {
          if (!isValidFhirDateTime(String(p.start))) {
            issues.push(
              `Observation/${id || i} effectivePeriod.start invalid/missing TZ when timed: ${p.start}`
            );
          }
          if (!isValidFhirDateTime(String(p.end))) {
            issues.push(
              `Observation/${id || i} effectivePeriod.end invalid/missing TZ when timed: ${p.end}`
            );
          }
        }
      }
      const hasValue =
        r.valueQuantity != null ||
        r.valueString != null ||
        (Array.isArray(r.component) && r.component.length > 0);
      if (!hasValue) issues.push(`Observation/${id || i} missing value/component`);
    } else if (rt === 'Provenance') {
      if (!r.recorded) issues.push(`Provenance/${id || i} missing recorded`);
      if (!Array.isArray(r.agent) || !r.agent.length) {
        issues.push(`Provenance/${id || i} missing agent`);
      }
      if (!Array.isArray(r.target) || !r.target.length) {
        issues.push(`Provenance/${id || i} missing target`);
      }
    } else if (rt === 'DocumentReference') {
      if (r.status !== 'current' && r.status !== 'superseded' && r.status !== 'entered-in-error') {
        issues.push(`DocumentReference/${id || i} unexpected status ${String(r.status)}`);
      }
      if (!Array.isArray(r.content) || !r.content.length) {
        issues.push(`DocumentReference/${id || i} missing content`);
      } else {
        const att = (r.content[0] as { attachment?: { data?: string; contentType?: string } })
          ?.attachment;
        if (!att || !att.data) {
          issues.push(`DocumentReference/${id || i} content[0].attachment.data missing`);
        }
      }
    } else if (rt === 'Patient') {
      // identifier optional (v1.56: default no shared identifier to avoid cross-person merge)
      if (r.birthDate != null) {
        const bd = String(r.birthDate);
        // year-only or full date; reject fabricated patterns only via guidance in builder
        if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(bd)) {
          issues.push(`Patient/${id || i} birthDate invalid: ${bd}`);
        }
      }
      if (
        Array.isArray(r.identifier) &&
        r.identifier.some(
          (idObj: { value?: string }) =>
            idObj && String(idObj.value || '') === PATIENT_IDENTIFIER_VALUE_LEGACY
        )
      ) {
        issues.push(
          `Patient/${id || i} uses fixed identifier "local-patient" (merge risk; omit or use random persistent id)`
        );
      }
    } else if (rt === 'Device') {
      if (r.status != null && r.status !== 'active' && r.status !== 'inactive' && r.status !== 'entered-in-error') {
        issues.push(`Device/${id || i} unexpected status ${String(r.status)}`);
      }
      const hasName =
        (Array.isArray(r.deviceName) && r.deviceName.length > 0) ||
        r.type != null ||
        r.manufacturer != null;
      if (!hasName) {
        issues.push(`Device/${id || i} missing deviceName/type/manufacturer`);
      }
    }
  }

  // Patient fullUrls (for subject resolution when Patient is present)
  const patientFullUrls = new Set<string>();
  const deviceFullUrls = new Set<string>();
  for (let i = 0; i < entry.length; i++) {
    const e = entry[i] || {};
    const r = (e.resource || null) as Record<string, unknown> | null;
    if (!r || e.fullUrl == null) continue;
    if (r.resourceType === 'Patient') patientFullUrls.add(String(e.fullUrl));
    if (r.resourceType === 'Device') deviceFullUrls.add(String(e.fullUrl));
  }

  // Observation / DocumentReference subject.reference must resolve when present;
  // if Patient is in the Bundle, subject must point at Patient entry fullUrl.
  for (let i = 0; i < entry.length; i++) {
    const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
    if (!r) continue;
    const rt = String(r.resourceType || '');
    if (rt !== 'Observation' && rt !== 'DocumentReference') continue;
    const sub = r.subject as { reference?: string; display?: string } | undefined;
    if (!sub || typeof sub !== 'object') continue;
    const ref = sub.reference != null ? String(sub.reference) : '';
    if (!ref) continue;
    if (!fullUrls.has(ref)) {
      issues.push(
        `${rt}/${String(r.id || i)} subject.reference ${ref} does not match any entry.fullUrl`
      );
    } else if (patientFullUrls.size > 0 && !patientFullUrls.has(ref)) {
      issues.push(
        `${rt}/${String(r.id || i)} subject.reference ${ref} must resolve to Patient entry fullUrl`
      );
    }
  }

  // Observation.device.reference must resolve to a Device entry fullUrl when present
  for (let i = 0; i < entry.length; i++) {
    const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
    if (!r || r.resourceType !== 'Observation') continue;
    const dev = r.device as { reference?: string } | undefined;
    if (!dev || typeof dev !== 'object') continue;
    const ref = dev.reference != null ? String(dev.reference) : '';
    if (!ref) continue;
    if (!fullUrls.has(ref)) {
      issues.push(
        `Observation/${String(r.id || i)} device.reference ${ref} does not match any entry.fullUrl`
      );
    } else if (deviceFullUrls.size > 0 && !deviceFullUrls.has(ref)) {
      issues.push(
        `Observation/${String(r.id || i)} device.reference ${ref} must resolve to Device entry fullUrl`
      );
    }
  }

  // Provenance targets must resolve to entry fullUrl (Bundle-local identity)
  for (let i = 0; i < entry.length; i++) {
    const r = (entry[i]?.resource || null) as Record<string, unknown> | null;
    if (!r || r.resourceType !== 'Provenance') continue;
    const pid = String(r.id || i);
    for (const t of (Array.isArray(r.target) ? r.target : []) as { reference?: string }[]) {
      const ref = String((t && t.reference) || '');
      if (!ref) {
        issues.push(`Provenance/${pid} target missing reference`);
        continue;
      }
      if (!fullUrls.has(ref)) {
        issues.push(
          `Provenance/${pid} target ${ref} does not match any entry.fullUrl (use urn:uuid: identities)`
        );
      }
    }
  }

  return { ok: issues.length === 0, issues, resourceCounts };
}

function buildAgpSvgDocumentReference(
  svg: string,
  notes: string[]
): Record<string, unknown> | null {
  const body = String(svg || '').trim();
  if (!body.startsWith('<svg') && !body.includes('<svg')) {
    notes.push('includeAgpSvg set but SVG empty or invalid');
    return null;
  }
  const recorded = new Date().toISOString();
  return {
    resourceType: 'DocumentReference',
    id: 'docref-agp-svg-1',
    meta: {
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
      ],
    },
    status: 'current',
    docStatus: 'preliminary',
    type: {
      coding: [
        {
          system: LOINC,
          code: '18748-4',
          display: 'Diagnostic imaging study',
        },
      ],
      text: 'CGM AGP 14-day hourly percentile schematic (SVG)',
    },
    category: [
      {
        text: 'agp-schematic (local archive)',
      },
    ],
    date: recorded,
    description:
      'Printable AGP-style SVG (P5–P95 bands) generated locally; not a certified AGP software report.',
    content: [
      {
        attachment: {
          contentType: 'image/svg+xml',
          title: 'cgm-agp-14d.svg',
          data: utf8ToBase64(body),
          size: utf8ByteLength(body),
        },
      },
    ],
    extension: [
      {
        url: 'urn:health-analyzer:extension:document-disclaimer',
        valueString:
          'Local AGP schematic only; experimental. Not FDA/CE certified CGM report software.',
      },
    ],
  };
}

/** UTF-8 bytes (TextEncoder is available in modern Node + browsers) */
function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** UTF-8 → base64 (browser btoa or Node buffer polyfill via globalThis) */
function utf8ToBase64(text: string): string {
  const bytes = utf8Bytes(text);
  const g = globalThis as unknown as {
    Buffer?: { from: (u: Uint8Array) => { toString: (enc: string) => string } };
    btoa?: (s: string) => string;
  };
  if (g.Buffer && typeof g.Buffer.from === 'function') {
    return g.Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof g.btoa === 'function') return g.btoa(binary);
  // Minimal base64 fallback
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return out;
}

function utf8ByteLength(text: string): number {
  return utf8Bytes(text).length;
}

function buildClinicalDocumentReference(
  markdown: string | null | undefined,
  html: string | null | undefined,
  maxChars: number,
  notes: string[]
): Record<string, unknown> | null {
  const md = markdown != null ? String(markdown) : '';
  const ht = html != null ? String(html) : '';
  if (!md.trim() && !ht.trim()) {
    notes.push('includeClinicalDocument set but no clinicalMarkdown/clinicalHtml provided');
    return null;
  }
  const content: Record<string, unknown>[] = [];
  const attach = (data: string, contentType: string, title: string) => {
    let body = data;
    if (body.length > maxChars) {
      body = body.slice(0, maxChars);
      notes.push(
        `Clinical ${contentType} truncated to ${maxChars} chars for DocumentReference attachment`
      );
    }
    content.push({
      attachment: {
        contentType,
        title,
        data: utf8ToBase64(body),
        size: utf8ByteLength(body),
      },
    });
  };
  if (md.trim()) attach(md, 'text/markdown', 'clinical-review.md');
  if (ht.trim()) attach(ht, 'text/html', 'clinical-review.html');

  const recorded = new Date().toISOString();
  return {
    resourceType: 'DocumentReference',
    id: 'docref-clinical-review-1',
    meta: {
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: 'Experimental local FHIR-shaped export',
        },
      ],
    },
    status: 'current',
    docStatus: 'preliminary',
    type: {
      coding: [
        {
          system: LOINC,
          code: '11506-3',
          display: 'Progress note',
        },
      ],
      text: 'Local structured health review / clinic report (experimental)',
    },
    category: [
      {
        coding: [
          {
            system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
            code: 'clinical-note',
            display: 'Clinical Note',
          },
        ],
        text: 'clinical-note (local archive)',
      },
    ],
    date: recorded,
    description:
      'Locally generated clinical review document; not a certified medical record; no diagnosis or medication advice.',
    content,
    extension: [
      {
        url: 'urn:health-analyzer:extension:document-disclaimer',
        valueString:
          'Generated on-device by Health Analyzer for personal archive only. Not clinical authentication.',
      },
    ],
  };
}

// ============================================================
// Main export
// ============================================================

/**
 * Build a local FHIR R4-shaped Bundle (collection) of Observations,
 * optional DocumentReference (clinical review), and optional Provenance.
 * Not for unvalidated clinical submission.
 */
export function buildFhirExportBundle(
  analysis: FullAnalysis,
  options?: FhirExportOptions
): FhirExportResult {
  const notes: string[] = [];
  notes.push(
    'experimental FHIR R4-shaped local export; not for unvalidated clinical submission'
  );
  notes.push(
    'Not a certified FHIR implementation; resources are trial-use shaped for personal archive only.'
  );
  notes.push('Local-only JSON; no hospital system integration or remote POST.');

  const opts = options || {};
  const exportTier: FhirExportTier = normalizeFhirExportTier(opts.exportTier);
  const isExchange = exportTier === 'external-exchange';
  const exchangePurpose: FhirExchangePurpose | null = isExchange
    ? normalizeFhirExchangePurpose(opts.exchangePurpose)
    : null;
  if (isExchange) {
    notes.push(
      `export tier: external-exchange (${exchangePurpose}) — independent R4 exchange-gate required; not HL7 Java validator`
    );
  } else {
    notes.push('export tier: local-archive — personal archive; project self-check only');
  }

  const maxCgm = Math.max(0, opts.maxCgm ?? DEFAULT_MAX_CGM);
  const maxBp = Math.max(0, opts.maxBp ?? DEFAULT_MAX_BP);
  const maxWeight = Math.max(0, opts.maxWeight ?? DEFAULT_MAX_WEIGHT);
  const maxStepsDays = Math.max(0, opts.maxStepsDays ?? DEFAULT_MAX_STEPS_DAYS);
  const maxRestingHrDays = DEFAULT_MAX_RESTING_HR_DAYS;
  const maxSpo2Days = Math.max(0, opts.maxSpo2Days ?? DEFAULT_MAX_SPO2_DAYS);
  const maxSleepDays = Math.max(0, opts.maxSleepDays ?? DEFAULT_MAX_SLEEP_DAYS);
  const maxVo2Days = Math.max(0, opts.maxVo2Days ?? DEFAULT_MAX_VO2_DAYS);
  const maxBreathingDays = Math.max(0, opts.maxBreathingDays ?? DEFAULT_MAX_BREATHING_DAYS);
  const maxWristTempDays = Math.max(0, opts.maxWristTempDays ?? DEFAULT_MAX_WRIST_TEMP_DAYS);
  const maxNightHrDays = Math.max(0, opts.maxNightHrDays ?? DEFAULT_MAX_NIGHT_HR_DAYS);
  const maxRrDays = Math.max(0, opts.maxRrDays ?? DEFAULT_MAX_RR_DAYS);
  const maxClinicalDocChars = Math.max(
    1000,
    opts.maxClinicalDocChars ?? DEFAULT_MAX_CLINICAL_DOC_CHARS
  );

  const range = analysis.dateRange || { start: '', end: '' };
  const windowStart = (opts.windowStart != null && opts.windowStart !== ''
    ? String(opts.windowStart).slice(0, 10)
    : range.start || ''
  ).slice(0, 10);
  const windowEnd = (opts.windowEnd != null && opts.windowEnd !== ''
    ? String(opts.windowEnd).slice(0, 10)
    : range.end || ''
  ).slice(0, 10);

  if (windowStart || windowEnd) {
    notes.push(
      `analysis window filter: ${windowStart || '…'} .. ${windowEnd || '…'} (inclusive YYYY-MM-DD)`
    );
  }

  const data = analysis.data;
  const byType: Record<string, number> = {
    bloodPressure: 0,
    bodyWeight: 0,
    glucose: 0,
    steps: 0,
    restingHeartRate: 0,
    spo2: 0,
    sleep: 0,
    vo2Max: 0,
    breathingDisturbance: 0,
    wristTemperature: 0,
    nightHeartRate: 0,
    respiratoryRate: 0,
    clinicalDocument: 0,
    agpSvg: 0,
  };
  const observations: Record<string, unknown>[] = [];
  /** Parallel to observations: analysis domain key for provenance / extensions */
  const observationDomains: string[] = [];
  /** Parallel to observations: device class when includeDevices */
  const observationDeviceClasses: (FhirDeviceClass | null)[] = [];
  const domainSourceBatches = analysis.domainSourceBatches;

  // Device wiring (v1.59): high-confidence measurement devices only (Watch/iPhone)
  const includeDevices = opts.includeDevices !== false;
  const batchesEarly = (Array.isArray(opts.importBatches) ? opts.importBatches : [])
    .map((b) => normalizeImportBatch(b))
    .filter((b): b is ImportBatchRecord => !!b);
  const hasHaeImport = batchesEarly.some((b) => b.source === 'hae');
  if (hasHaeImport) {
    notes.push(
      'HAE import batches present — recorded in Provenance when enabled; not used as Observation.device'
    );
  }

  const pushObs = (
    obs: Record<string, unknown>,
    byTypeKey: string,
    deviceHint?: {
      stepsDay?: { watch?: number; iphone?: number; max?: number } | null;
      deviceClass?: FhirDeviceClass | null;
    }
  ): void => {
    const domain = FHIR_OBS_TYPE_TO_DOMAIN[byTypeKey] || byTypeKey;
    attachObservationCategory(obs, byTypeKey);
    attachSourceBatchExtension(obs, domain, domainSourceBatches);
    observations.push(obs);
    observationDomains.push(domain);
    byType[byTypeKey] = (byType[byTypeKey] || 0) + 1;
    if (!includeDevices) {
      observationDeviceClasses.push(null);
      return;
    }
    if (deviceHint && deviceHint.deviceClass != null) {
      observationDeviceClasses.push(deviceHint.deviceClass);
      return;
    }
    const resolved = resolveObservationDevice(byTypeKey, {
      stepsDay: deviceHint?.stepsDay,
    });
    observationDeviceClasses.push(
      resolved.confidence === 'high' ? resolved.deviceClass : null
    );
  };

  // --- Blood pressure ---
  const bpAll = (data?.bloodPressure || []).filter((r) =>
    inWindow(r.date || getDate(r.datetime), windowStart, windowEnd)
  );
  let bp = bpAll;
  if (bpAll.length > maxBp) {
    bp = sampleEvenly(bpAll, maxBp);
    notes.push(`BP capped: ${bpAll.length} → ${bp.length} (maxBp=${maxBp}, even sample)`);
  }
  for (let i = 0; i < bp.length; i++) {
    pushObs(buildBpObservation(bp[i], i), 'bloodPressure');
  }

  // --- Weight ---
  const wtAll = (data?.weight || []).filter((r) =>
    inWindow(r.date || getDate(r.datetime), windowStart, windowEnd)
  );
  let wt = wtAll;
  if (wtAll.length > maxWeight) {
    wt = sampleEvenly(wtAll, maxWeight);
    notes.push(
      `Weight capped: ${wtAll.length} → ${wt.length} (maxWeight=${maxWeight}, even sample)`
    );
  }
  for (let i = 0; i < wt.length; i++) {
    pushObs(buildWeightObservation(wt[i], i), 'bodyWeight');
  }

  // --- CGM / glucose ---
  const cgmAll = (data?.cgm || []).filter((p) =>
    inWindow(getDate(p.datetime), windowStart, windowEnd)
  );
  let cgm = cgmAll;
  if (cgmAll.length > maxCgm) {
    cgm = sampleEvenly(cgmAll, maxCgm);
    notes.push(`CGM capped: ${cgmAll.length} → ${cgm.length} (maxCgm=${maxCgm}, even sample)`);
  }
  for (let i = 0; i < cgm.length; i++) {
    pushObs(buildGlucoseObservation(cgm[i], i), 'glucose');
  }

  // --- Steps daily ---
  const stepsMap = analysis.stepsByDate || {};
  const stepDates = Object.keys(stepsMap)
    .filter((d) => inWindow(d, windowStart, windowEnd) && Number.isFinite(stepsMap[d]))
    .sort();
  let stepDatesUsed = stepDates;
  if (stepDates.length > maxStepsDays) {
    stepDatesUsed = sampleEvenly(stepDates, maxStepsDays);
    notes.push(
      `Steps days capped: ${stepDates.length} → ${stepDatesUsed.length} (maxStepsDays=${maxStepsDays})`
    );
  }
  for (let i = 0; i < stepDatesUsed.length; i++) {
    const d = stepDatesUsed[i];
    const stepsDay = data?.steps && data.steps[d] ? data.steps[d] : null;
    pushObs(buildStepsObservation(d, stepsMap[d], i), 'steps', { stepsDay });
  }

  // --- Resting HR (optional easy domain) ---
  const rhrMap = analysis.restingHrByDate || data?.restingHr || {};
  const rhrDates = Object.keys(rhrMap)
    .filter((d) => inWindow(d, windowStart, windowEnd) && Number.isFinite(rhrMap[d]))
    .sort();
  let rhrDatesUsed = rhrDates;
  if (rhrDates.length > maxRestingHrDays) {
    rhrDatesUsed = sampleEvenly(rhrDates, maxRestingHrDays);
    notes.push(
      `Resting HR days capped: ${rhrDates.length} → ${rhrDatesUsed.length} (max=${maxRestingHrDays})`
    );
  }
  for (let i = 0; i < rhrDatesUsed.length; i++) {
    const d = rhrDatesUsed[i];
    pushObs(buildRestingHrObservation(d, rhrMap[d], i), 'restingHeartRate');
  }

  // --- SpO2 daily mean (Watch stats days) ---
  const watchDays: WatchDayView[] = analysis.watchStats?.days || [];
  const spo2Days = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.spo2Mean != null &&
        Number.isFinite(d.spo2Mean)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let spo2Used = spo2Days;
  if (spo2Days.length > maxSpo2Days) {
    spo2Used = sampleEvenly(spo2Days, maxSpo2Days);
    notes.push(
      `SpO2 days capped: ${spo2Days.length} → ${spo2Used.length} (maxSpo2Days=${maxSpo2Days})`
    );
  }
  for (let i = 0; i < spo2Used.length; i++) {
    const d = spo2Used[i];
    pushObs(buildSpo2Observation(d.date, d.spo2Mean as number, i), 'spo2');
  }

  // --- Sleep daily ---
  const sleepMap = analysis.sleepByDate || data?.sleep || {};
  const sleepDates = Object.keys(sleepMap)
    .filter((d) => {
      if (!inWindow(d, windowStart, windowEnd)) return false;
      const s = sleepMap[d];
      return s && s.total != null && Number.isFinite(s.total);
    })
    .sort();
  let sleepDatesUsed = sleepDates;
  if (sleepDates.length > maxSleepDays) {
    sleepDatesUsed = sampleEvenly(sleepDates, maxSleepDays);
    notes.push(
      `Sleep days capped: ${sleepDates.length} → ${sleepDatesUsed.length} (maxSleepDays=${maxSleepDays})`
    );
  }
  for (let i = 0; i < sleepDatesUsed.length; i++) {
    const d = sleepDatesUsed[i];
    pushObs(buildSleepObservation(d, sleepMap[d], i), 'sleep');
  }

  // --- VO2 max (Watch days with vo2Max) ---
  const vo2Days = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.vo2Max != null &&
        Number.isFinite(d.vo2Max)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let vo2Used = vo2Days;
  if (vo2Days.length > maxVo2Days) {
    vo2Used = sampleEvenly(vo2Days, maxVo2Days);
    notes.push(
      `VO2 days capped: ${vo2Days.length} → ${vo2Used.length} (maxVo2Days=${maxVo2Days})`
    );
  }
  for (let i = 0; i < vo2Used.length; i++) {
    const d = vo2Used[i];
    pushObs(buildVo2Observation(d.date, d.vo2Max as number, i), 'vo2Max');
  }

  // --- Breathing disturbances (device index) ---
  const brDays = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.breathingDisturbance != null &&
        Number.isFinite(d.breathingDisturbance)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let brUsed = brDays;
  if (brDays.length > maxBreathingDays) {
    brUsed = sampleEvenly(brDays, maxBreathingDays);
    notes.push(
      `Breathing disturbance days capped: ${brDays.length} → ${brUsed.length} (maxBreathingDays=${maxBreathingDays})`
    );
  }
  for (let i = 0; i < brUsed.length; i++) {
    const d = brUsed[i];
    pushObs(
      buildBreathingDisturbanceObservation(d.date, d.breathingDisturbance as number, i),
      'breathingDisturbance'
    );
  }

  // --- Wrist temperature (°C) ---
  const wtTempDays = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.wristTempMean != null &&
        Number.isFinite(d.wristTempMean)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let wtTempUsed = wtTempDays;
  if (wtTempDays.length > maxWristTempDays) {
    wtTempUsed = sampleEvenly(wtTempDays, maxWristTempDays);
    notes.push(
      `Wrist temp days capped: ${wtTempDays.length} → ${wtTempUsed.length} (maxWristTempDays=${maxWristTempDays})`
    );
  }
  for (let i = 0; i < wtTempUsed.length; i++) {
    const d = wtTempUsed[i];
    pushObs(buildWristTempObservation(d.date, d.wristTempMean as number, i), 'wristTemperature');
  }

  // --- Night heart rate mean ---
  const nightHrDays = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.nightHrMean != null &&
        Number.isFinite(d.nightHrMean)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let nightHrUsed = nightHrDays;
  if (nightHrDays.length > maxNightHrDays) {
    nightHrUsed = sampleEvenly(nightHrDays, maxNightHrDays);
    notes.push(
      `Night HR days capped: ${nightHrDays.length} → ${nightHrUsed.length} (maxNightHrDays=${maxNightHrDays})`
    );
  }
  for (let i = 0; i < nightHrUsed.length; i++) {
    const d = nightHrUsed[i];
    pushObs(buildNightHrObservation(d.date, d.nightHrMean as number, i), 'nightHeartRate');
  }

  // --- Respiratory rate mean ---
  const rrDays = watchDays
    .filter(
      (d) =>
        d &&
        d.date &&
        inWindow(d.date, windowStart, windowEnd) &&
        d.rrMean != null &&
        Number.isFinite(d.rrMean)
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let rrUsed = rrDays;
  if (rrDays.length > maxRrDays) {
    rrUsed = sampleEvenly(rrDays, maxRrDays);
    notes.push(
      `Respiratory rate days capped: ${rrDays.length} → ${rrUsed.length} (maxRrDays=${maxRrDays})`
    );
  }
  for (let i = 0; i < rrUsed.length; i++) {
    const d = rrUsed[i];
    pushObs(buildRespiratoryRateObservation(d.date, d.rrMean as number, i), 'respiratoryRate');
  }

  // --- DocumentReference (clinical review + optional AGP SVG) ---
  const documentReferences: Record<string, unknown>[] = [];
  if (opts.includeClinicalDocument) {
    const doc = buildClinicalDocumentReference(
      opts.clinicalMarkdown,
      opts.clinicalHtml,
      maxClinicalDocChars,
      notes
    );
    if (doc) {
      documentReferences.push(doc);
      byType.clinicalDocument = 1;
    }
  }

  if (opts.includeAgpSvg) {
    let svg = opts.agpSvg != null ? String(opts.agpSvg) : '';
    if (!svg.trim()) {
      try {
        const cgm14 = buildCgm14DayReport(analysis, {
          windowEnd: windowEnd || undefined,
          locale: opts.locale,
        });
        if (cgm14 && cgm14.sufficient) {
          svg = buildAgpSvg(cgm14, { locale: opts.locale });
        } else if (cgm14 && !cgm14.sufficient) {
          notes.push('AGP SVG skipped: CGM 14-day coverage insufficient for standardized bands');
        } else {
          notes.push('AGP SVG skipped: no CGM data for 14-day report');
        }
      } catch (e) {
        notes.push(
          `AGP SVG generation failed: ${e && (e as Error).message ? (e as Error).message : String(e)}`
        );
      }
    }
    const agpDoc = buildAgpSvgDocumentReference(svg, notes);
    if (agpDoc) {
      documentReferences.push(agpDoc);
      byType.agpSvg = 1;
    }
  }

  // --- Patient / subject (v1.59 exchange purposes) ---
  // anonymous-share: force no Patient
  // personal-handoff: require Patient + persistentId
  let wantPatient = opts.includePatient === true;
  if (isExchange && exchangePurpose === 'anonymous-share') {
    if (wantPatient) {
      notes.push(
        'anonymous-share: includePatient ignored — forced no subject for anonymous data share'
      );
    }
    wantPatient = false;
  }
  if (isExchange && exchangePurpose === 'personal-handoff') {
    wantPatient = true;
  }

  const persistentIdRaw =
    opts.patientPersistentId != null && String(opts.patientPersistentId).trim()
      ? String(opts.patientPersistentId).trim()
      : '';
  const persistentId =
    persistentIdRaw && persistentIdRaw !== PATIENT_IDENTIFIER_VALUE_LEGACY
      ? persistentIdRaw
      : '';

  let patientResource: Record<string, unknown> | null = null;
  let patientDisplayText = 'Local patient';
  if (wantPatient) {
    patientDisplayText =
      opts.patientDisplay != null && String(opts.patientDisplay).trim()
        ? String(opts.patientDisplay).trim()
        : 'Local patient';
    patientResource = buildLocalPatientResource({
      display: patientDisplayText,
      gender: opts.patientGender,
      birthYear: opts.patientBirthYear,
      persistentId: persistentId || null,
    });
    notes.push(
      'includePatient: local pseudonym Patient (not verified identity); subjects wire to Patient fullUrl'
    );
    if (isExchange && exchangePurpose === 'personal-handoff' && !persistentId) {
      notes.push(
        'personal-handoff: patientPersistentId missing — exchange-gate will block (need random local id)'
      );
    }
  } else if (opts.patientDisplay && !(isExchange && exchangePurpose === 'anonymous-share')) {
    notes.push(
      'patientDisplay ignored for subject wiring (includePatient is false; default has no identity)'
    );
  }

  // --- Optional Devices (v1.59: high-confidence Watch/iPhone only) ---
  const usedDeviceClasses = new Set<FhirDeviceClass>();
  if (includeDevices) {
    for (const cls of observationDeviceClasses) {
      if (cls) usedDeviceClasses.add(cls);
    }
  }
  const deviceResources: Record<string, unknown>[] = [];
  if (includeDevices && usedDeviceClasses.size > 0) {
    for (const cls of FHIR_DEVICE_CLASSES) {
      if (!usedDeviceClasses.has(cls)) continue;
      deviceResources.push(buildLocalDeviceResource(cls));
    }
    const wired = observationDeviceClasses.filter(Boolean).length;
    const total = observationDeviceClasses.length;
    notes.push(
      `includeDevices: ${deviceResources.length} high-confidence Device class(es) (${[
        ...usedDeviceClasses,
      ].join(', ')}); wired ${wired}/${total} Observations (omit when source uncertain)`
    );
  } else if (!includeDevices) {
    notes.push('includeDevices: false — no Device resources / no Observation.device');
  } else {
    notes.push(
      'includeDevices: no high-confidence measurement devices for this export (HAE/aggregate not Devices)'
    );
  }

  // --- Provenance ---
  const batches = batchesEarly;

  const includeProvenance =
    opts.includeProvenance === false
      ? false
      : opts.includeProvenance === true
        ? true
        : batches.length > 0; // default true when batches provided

  const provenances: Record<string, unknown>[] = [];

  // --- Bundle entries with urn:uuid fullUrl (identity for collection) ---
  // Patient → Devices → Observations / DocumentReference → Provenance.
  // Provenance targets assembler agent + obs/docs only (prefer not targeting Patient/Device).
  const timestamp = new Date().toISOString();
  const idToFullUrl = new Map<string, string>();
  const resourceEntries: Record<string, unknown>[] = [];

  if (patientResource) {
    resourceEntries.push(entryFor(patientResource, idToFullUrl));
    const patientFullUrl =
      idToFullUrl.get(`Patient/${PATIENT_LOCAL_ID}`) || `Patient/${PATIENT_LOCAL_ID}`;
    const subject = {
      reference: patientFullUrl,
      display: patientDisplayText,
    };
    for (const obs of observations) {
      obs.subject = subject;
    }
    for (const doc of documentReferences) {
      doc.subject = subject;
    }
  }

  for (const dev of deviceResources) {
    resourceEntries.push(entryFor(dev, idToFullUrl));
  }

  // Wire Observation.device to Device fullUrl after Device entries exist
  if (includeDevices && deviceResources.length > 0) {
    for (let i = 0; i < observations.length; i++) {
      const cls = observationDeviceClasses[i];
      if (!cls) continue;
      const logical = `Device/${deviceLogicalId(cls)}`;
      const fullUrl = idToFullUrl.get(logical);
      if (!fullUrl) continue;
      observations[i].device = {
        reference: fullUrl,
        display: deviceDisplayName(cls),
      };
    }
  }

  for (const o of observations) {
    resourceEntries.push(entryFor(o, idToFullUrl));
  }
  for (const d of documentReferences) {
    resourceEntries.push(entryFor(d, idToFullUrl));
  }

  if (includeProvenance) {
    const recorded = new Date().toISOString();
    const fullTargetAll = () => [
      ...observations.map((o) => ({
        reference: idToFullUrl.get(`Observation/${o.id}`) || `Observation/${o.id}`,
      })),
      ...documentReferences.map((d) => ({
        reference:
          idToFullUrl.get(`DocumentReference/${d.id}`) || `DocumentReference/${d.id}`,
      })),
    ];

    const useFineGrained =
      batches.length > 0 && hasDomainSourceBatches(domainSourceBatches);

    if (useFineGrained) {
      // v1.53: one Provenance per import batch; target only Observations for domains
      // that list this batch id (do not stamp every CGM point with every batch).
      notes.push(
        'fine-grained provenance: one Provenance per import batch (domainSourceBatches)'
      );
      let linkedAny = false;
      for (const b of batches) {
        const bid = String(b.id);
        const targets: { reference: string }[] = [];
        for (let i = 0; i < observations.length; i++) {
          const domain = observationDomains[i];
          const list = (domainSourceBatches && domainSourceBatches[domain]) || [];
          if (!list.map(String).includes(bid)) continue;
          const o = observations[i];
          targets.push({
            reference: idToFullUrl.get(`Observation/${o.id}`) || `Observation/${o.id}`,
          });
        }
        if (!targets.length) {
          notes.push(
            `batch ${bid}: no domain-matched Observations; provenance skipped for this batch`
          );
          continue;
        }
        linkedAny = true;
        provenances.push(
          buildAssemblerProvenance({
            id: `prov-batch-${shortImportBatchIdForProv(bid)}`,
            target: targets,
            entities: [entityForBatch(b)],
            recorded,
          })
        );
      }
      if (!linkedAny) {
        // Domain map present but no links → coarse fallback so export still has provenance
        notes.push(
          'domain map available but no batch-observation links; coarse provenance fallback'
        );
        const entities = batches.map(entityForBatch);
        provenances.push(
          buildAssemblerProvenance({
            id: 'prov-export-1',
            target: fullTargetAll(),
            entities,
            recorded,
          })
        );
      }
    } else {
      // Coarse: single Provenance targeting all Observations (+ DocumentReference)
      if (batches.length > 0 && !hasDomainSourceBatches(domainSourceBatches)) {
        notes.push('domain map unavailable; coarse provenance');
      }
      const entities = batches.map(entityForBatch);
      if (!entities.length) {
        notes.push(
          'Provenance included without import batch entities (no importBatches provided).'
        );
      }
      provenances.push(
        buildAssemblerProvenance({
          id: 'prov-export-1',
          target: fullTargetAll(),
          entities,
          recorded,
        })
      );
    }
  }

  const entries = [
    ...resourceEntries,
    ...provenances.map((p) => entryFor(p, idToFullUrl)),
  ];

  const bundle: Record<string, unknown> = {
    resourceType: 'Bundle',
    id: `hae-fhir-export-${timestamp.slice(0, 10)}`,
    meta: {
      lastUpdated: timestamp,
      source: META_SOURCE,
      tag: [
        {
          system: 'urn:health-analyzer:tag',
          code: FHIR_EXPORT_PROFILE,
          display: `health-analyzer FHIR export profile ${FHIR_EXPORT_PROFILE}`,
        },
        {
          system: 'urn:health-analyzer:rule-version',
          code: PROVENANCE_RULE_VERSION,
          display: PROVENANCE_RULE_VERSION,
        },
        {
          system: 'urn:health-analyzer:export-kind',
          code: exportTier,
          display:
            exportTier === 'external-exchange'
              ? 'External exchange candidate (must pass independent exchange-gate; not hospital submission)'
              : 'Local archive collection (not transaction/submission)',
        },
        ...(exchangePurpose
          ? [
              {
                system: 'urn:health-analyzer:exchange-purpose',
                code: exchangePurpose,
                display:
                  exchangePurpose === 'anonymous-share'
                    ? 'Anonymous data share (no subject / no Patient)'
                    : 'Personal data handoff (Patient subject + local persistent pseudonym id)',
              },
            ]
          : []),
      ],
      // profile is informal — not a published IG
      profile: [`urn:health-analyzer:StructureDefinition/${FHIR_EXPORT_PROFILE}`],
    },
    type: 'collection',
    timestamp,
    total: entries.length,
    entry: entries,
  };

  const counts = {
    observations: observations.length,
    provenances: provenances.length,
    documentReferences: documentReferences.length,
    patients: patientResource ? 1 : 0,
    devices: deviceResources.length,
    byType,
  };

  notes.push(
    `exported Observations=${counts.observations} DocumentReference=${counts.documentReferences} ` +
      `Patient=${counts.patients} Device=${counts.devices} Provenance=${counts.provenances} ` +
      `tier=${exportTier}` +
      (exchangePurpose ? ` purpose=${exchangePurpose}` : '') +
      ` (bp=${byType.bloodPressure}, weight=${byType.bodyWeight}, glucose=${byType.glucose}, ` +
      `steps=${byType.steps}, restingHr=${byType.restingHeartRate}, spo2=${byType.spo2}, ` +
      `sleep=${byType.sleep}, vo2=${byType.vo2Max}, breathing=${byType.breathingDisturbance}, ` +
      `wristTemp=${byType.wristTemperature}, nightHr=${byType.nightHeartRate}, rr=${byType.respiratoryRate}, ` +
      `clinicalDoc=${byType.clinicalDocument}, agpSvg=${byType.agpSvg})`
  );

  let validation: FhirExportValidation | undefined;
  if (opts.validate !== false) {
    validation = validateFhirExportBundle(bundle);
    if (validation.ok) {
      notes.push('structure self-check: ok (project check — not official HL7 FHIR validator)');
    } else {
      notes.push(
        `structure self-check: ${validation.issues.length} issue(s) — ${validation.issues
          .slice(0, 3)
          .join('; ')}`
      );
    }
  }

  // Independent exchange gate (separate module from project self-check)
  const runExchange =
    opts.runExchangeValidation === true ||
    (isExchange && opts.runExchangeValidation !== false);
  let exchangeValidation: FhirExchangeValidation | undefined;
  if (runExchange) {
    exchangeValidation = validateFhirR4ExchangeGate(bundle, {
      exportTier,
      exchangePurpose: exchangePurpose || undefined,
    });
    if (exchangeValidation.ok) {
      notes.push(
        `exchange-gate (${FHIR_EXCHANGE_GATE_ENGINE}): ok — still not HL7 validator_cli`
      );
    } else {
      notes.push(
        `exchange-gate (${FHIR_EXCHANGE_GATE_ENGINE}): FAIL ${exchangeValidation.issues.length} issue(s) — ${exchangeValidation.issues
          .slice(0, 3)
          .join('; ')}`
      );
    }
  }

  // local-archive is always "ready" for personal download; exchange requires gate pass
  const exchangeReady = !isExchange
    ? true
    : !!(exchangeValidation && exchangeValidation.ok);

  if (isExchange && !exchangeReady) {
    notes.push(
      'external-exchange blocked: exchange-gate failed — do not share this Bundle externally'
    );
  }

  const json = JSON.stringify(bundle, null, 2);

  return {
    bundle,
    json,
    counts,
    notes,
    exportTier,
    exchangePurpose,
    validation,
    exchangeValidation,
    exchangeReady,
  };
}
