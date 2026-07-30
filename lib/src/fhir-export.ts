/**
 * 本机 FHIR R4-shaped Observation + Provenance 导出（试验性 v1.48）
 *
 * - 仅生成本地可下载 JSON Bundle；非医院系统对接、非 FHIR 认证提交
 * - 资源为 experimental / trial-use 形状，供个人归档与互操作试验
 * - 不产出诊断、用药建议或临床认证声明
 * - 默认由调用方/UI 选择导出；本模块仅在被调用时构建
 */

import { FullAnalysis, BloodPressureRecord, CgmPoint, WeightRecord } from './types';
import { getDate } from './parser';
import {
  ImportBatchRecord,
  PROVENANCE_RULE_VERSION,
  normalizeImportBatch,
} from './provenance';

// ============================================================
// Constants & public types
// ============================================================

export const FHIR_EXPORT_PROFILE = 'health-analyzer-fhir-export-v1';
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
  includeProvenance?: boolean; // default true when batches provided
  importBatches?: ImportBatchRecord[] | null; // from provenance.ts
  patientDisplay?: string | null; // optional "local-patient" display only
}

export interface FhirExportResult {
  bundle: Record<string, unknown>; // FHIR Bundle
  json: string; // pretty JSON
  counts: { observations: number; provenances: number; byType: Record<string, number> };
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

// ============================================================
// Main export
// ============================================================

/**
 * Build a local FHIR R4-shaped Bundle (collection) of Observations
 * and optional Provenance. Not for unvalidated clinical submission.
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
    const target = observations.map((o) => ({
      reference: `Observation/${o.id}`,
    }));

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
        text: 'assemble local Observations from Apple Health / HAE import',
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
          display: 'health-analyzer FHIR export profile v1',
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
    byType,
  };

  notes.push(
    `exported Observations=${counts.observations} Provenance=${counts.provenances} ` +
      `(bp=${byType.bloodPressure}, weight=${byType.bodyWeight}, glucose=${byType.glucose}, ` +
      `steps=${byType.steps}, restingHr=${byType.restingHeartRate})`
  );

  const json = JSON.stringify(bundle, null, 2);

  return { bundle, json, counts, notes };
}
