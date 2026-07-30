/**
 * 本机 FHIR R4-shaped Observation + Provenance + 可选 DocumentReference 导出（试验性 v1.49）
 *
 * - 仅生成本地可下载 JSON Bundle；非医院系统对接、非 FHIR 认证提交
 * - 资源为 experimental / trial-use 形状，供个人归档与互操作试验
 * - 不产出诊断、用药建议或临床认证声明
 * - 默认由调用方/UI 选择导出；本模块仅在被调用时构建
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

// ============================================================
// Constants & public types
// ============================================================

export const FHIR_EXPORT_PROFILE = 'health-analyzer-fhir-export-v1.1';
export const FHIR_R4 = 'http://hl7.org/fhir';

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const META_SOURCE = 'urn:health-analyzer:local';
const DEVICE_NOTE = 'local Apple Health / HAE import';

const DEFAULT_MAX_CGM = 2000;
const DEFAULT_MAX_BP = 500;
const DEFAULT_MAX_WEIGHT = 500;
const DEFAULT_MAX_STEPS_DAYS = 366;
const DEFAULT_MAX_RESTING_HR_DAYS = 366;
const DEFAULT_MAX_SPO2_DAYS = 366;
const DEFAULT_MAX_SLEEP_DAYS = 366;
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
  includeProvenance?: boolean; // default true when batches provided
  importBatches?: ImportBatchRecord[] | null; // from provenance.ts
  patientDisplay?: string | null; // optional "local-patient" display only
  /**
   * Attach a local clinical review document as DocumentReference (default false).
   * Provide markdown and/or html; content is truncated if over maxClinicalDocChars.
   */
  includeClinicalDocument?: boolean;
  clinicalMarkdown?: string | null;
  clinicalHtml?: string | null;
  maxClinicalDocChars?: number;
}

export interface FhirExportResult {
  bundle: Record<string, unknown>; // FHIR Bundle
  json: string; // pretty JSON
  counts: {
    observations: number;
    provenances: number;
    documentReferences: number;
    byType: Record<string, number>;
  };
  notes: string[];
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

function baseObservation(
  id: string,
  code: Record<string, unknown>,
  effectiveDateTime: string
): Record<string, unknown> {
  return {
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
    effectiveDateTime,
    note: [{ text: DEVICE_NOTE }],
  };
}

function entryFor(resource: Record<string, unknown>): Record<string, unknown> {
  const rt = String(resource.resourceType || 'Resource');
  const id = String(resource.id || '');
  const fullUrl = id ? `${rt}/${id}` : `urn:uuid:${rt}-${Math.random().toString(36).slice(2, 10)}`;
  return { fullUrl, resource };
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

// ============================================================
// Domain builders
// ============================================================

function buildBpObservation(r: BloodPressureRecord, index: number): Record<string, unknown> {
  const id = `obs-bp-${index}`;
  const effective = toIsoDateTime(r.datetime || r.date);
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
  const effective = toIsoDateTime(r.datetime || r.date);
  const obs = baseObservation(id, loincCoding('29463-7', 'Body weight'), effective);
  obs.valueQuantity = quantity(r.value, 'kg', 'kg');
  return obs;
}

function buildGlucoseObservation(p: CgmPoint, index: number): Record<string, unknown> {
  const id = `obs-glucose-${index}`;
  const effective = toIsoDateTime(p.datetime);
  // 2339-0 Glucose [Moles/volume] in Blood; mmol/L canonical in this app
  const obs = baseObservation(id, loincCoding('2339-0', 'Glucose [Moles/volume] in Blood'), effective);
  obs.valueQuantity = quantity(p.value, 'mmol/L', 'mmol/L');
  return obs;
}

function buildStepsObservation(date: string, steps: number, index: number): Record<string, unknown> {
  const id = `obs-steps-${index}`;
  const effective = toIsoDateTime(date);
  // 55423-8 Number of steps in 24 hour Measured
  const obs = baseObservation(
    id,
    loincCoding('55423-8', 'Number of steps in 24 hour Measured'),
    effective
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
  const effective = toIsoDateTime(date);
  const obs = baseObservation(id, loincCoding('8867-4', 'Heart rate'), effective);
  obs.valueQuantity = quantity(bpm, 'beats/min', '/min');
  // Clarify resting via category/text extension note
  (obs.note as { text: string }[]).push({ text: 'resting heart rate (daily summary)' });
  return obs;
}

/** Daily SpO2 mean from Watch day view — LOINC 59408-5 */
function buildSpo2Observation(date: string, spo2Pct: number, index: number): Record<string, unknown> {
  const id = `obs-spo2-${index}`;
  const effective = toIsoDateTime(date);
  const obs = baseObservation(
    id,
    loincCoding('59408-5', 'Oxygen saturation in Arterial blood by Pulse oximetry'),
    effective
  );
  obs.valueQuantity = quantity(spo2Pct, '%', '%');
  (obs.note as { text: string }[]).push({ text: 'daily mean SpO₂ (Watch summary)' });
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
  const effective = toIsoDateTime(date);
  const obs = baseObservation(
    id,
    loincCoding('93832-4', 'Sleep duration'),
    effective
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
  (obs.note as { text: string }[]).push({
    text: 'daily sleep summary (total + stages when present); experimental mapping',
  });
  return obs;
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
  const maxCgm = Math.max(0, opts.maxCgm ?? DEFAULT_MAX_CGM);
  const maxBp = Math.max(0, opts.maxBp ?? DEFAULT_MAX_BP);
  const maxWeight = Math.max(0, opts.maxWeight ?? DEFAULT_MAX_WEIGHT);
  const maxStepsDays = Math.max(0, opts.maxStepsDays ?? DEFAULT_MAX_STEPS_DAYS);
  const maxRestingHrDays = DEFAULT_MAX_RESTING_HR_DAYS;
  const maxSpo2Days = Math.max(0, opts.maxSpo2Days ?? DEFAULT_MAX_SPO2_DAYS);
  const maxSleepDays = Math.max(0, opts.maxSleepDays ?? DEFAULT_MAX_SLEEP_DAYS);
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
    clinicalDocument: 0,
  };
  const observations: Record<string, unknown>[] = [];

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
    observations.push(buildBpObservation(bp[i], i));
    byType.bloodPressure += 1;
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
    observations.push(buildWeightObservation(wt[i], i));
    byType.bodyWeight += 1;
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
    observations.push(buildGlucoseObservation(cgm[i], i));
    byType.glucose += 1;
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
    observations.push(buildStepsObservation(d, stepsMap[d], i));
    byType.steps += 1;
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
    observations.push(buildRestingHrObservation(d, rhrMap[d], i));
    byType.restingHeartRate += 1;
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
    observations.push(buildSpo2Observation(d.date, d.spo2Mean as number, i));
    byType.spo2 += 1;
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
    observations.push(buildSleepObservation(d, sleepMap[d], i));
    byType.sleep += 1;
  }

  // Optional subject display on each observation
  if (opts.patientDisplay) {
    const subject = {
      display: String(opts.patientDisplay),
      reference: 'Patient/local-patient',
    };
    for (const obs of observations) {
      obs.subject = subject;
    }
  }

  // --- DocumentReference (clinical review, opt-in) ---
  const documentReferences: Record<string, unknown>[] = [];
  if (opts.includeClinicalDocument) {
    const doc = buildClinicalDocumentReference(
      opts.clinicalMarkdown,
      opts.clinicalHtml,
      maxClinicalDocChars,
      notes
    );
    if (doc) {
      if (opts.patientDisplay) {
        doc.subject = {
          display: String(opts.patientDisplay),
          reference: 'Patient/local-patient',
        };
      }
      documentReferences.push(doc);
      byType.clinicalDocument = 1;
    }
  }

  // --- Provenance ---
  const batchesRaw = opts.importBatches;
  const batches = (Array.isArray(batchesRaw) ? batchesRaw : [])
    .map((b) => normalizeImportBatch(b))
    .filter((b): b is ImportBatchRecord => !!b);

  const includeProvenance =
    opts.includeProvenance === false
      ? false
      : opts.includeProvenance === true
        ? true
        : batches.length > 0; // default true when batches provided

  const provenances: Record<string, unknown>[] = [];

  if (includeProvenance) {
    const recorded = new Date().toISOString();
    const target = [
      ...observations.map((o) => ({
        reference: `Observation/${o.id}`,
      })),
      ...documentReferences.map((d) => ({
        reference: `DocumentReference/${d.id}`,
      })),
    ];

    const entities: Record<string, unknown>[] = batches.map((b) => ({
      role: 'source',
      what: {
        identifier: {
          system: 'urn:health-analyzer:import-batch',
          value: b.id,
        },
        display: batchDisplay(b),
      },
    }));

    // One Provenance for transform/assemble (+ source entities from import batches)
    const prov: Record<string, unknown> = {
      resourceType: 'Provenance',
      id: 'prov-export-1',
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
      target,
      recorded,
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
      // R4 Provenance.reason is CodeableConcept[]; also put narrative in extension for clarity
      extension: [
        {
          url: 'urn:health-analyzer:extension:export-disclaimer',
          valueString:
            'Local processing only; not clinical authentication. Experimental FHIR R4-shaped export.',
        },
      ],
    };

    if (entities.length) {
      prov.entity = entities;
    } else {
      notes.push(
        'Provenance included without import batch entities (no importBatches provided).'
      );
    }

    provenances.push(prov);
  }

  // --- Bundle ---
  const timestamp = new Date().toISOString();
  const entries = [
    ...observations.map(entryFor),
    ...documentReferences.map(entryFor),
    ...provenances.map(entryFor),
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
          display: 'health-analyzer FHIR export profile v1.1',
        },
        {
          system: 'urn:health-analyzer:rule-version',
          code: PROVENANCE_RULE_VERSION,
          display: PROVENANCE_RULE_VERSION,
        },
        {
          system: 'urn:health-analyzer:export-kind',
          code: 'local-collection',
          display: 'Local collection (not transaction/submission)',
        },
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
    byType,
  };

  notes.push(
    `exported Observations=${counts.observations} DocumentReference=${counts.documentReferences} ` +
      `Provenance=${counts.provenances} ` +
      `(bp=${byType.bloodPressure}, weight=${byType.bodyWeight}, glucose=${byType.glucose}, ` +
      `steps=${byType.steps}, restingHr=${byType.restingHeartRate}, spo2=${byType.spo2}, ` +
      `sleep=${byType.sleep}, clinicalDoc=${byType.clinicalDocument})`
  );

  const json = JSON.stringify(bundle, null, 2);

  return { bundle, json, counts, notes };
}
