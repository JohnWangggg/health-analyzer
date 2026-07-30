/**
 * 规范化健康复盘 / 就诊报告（v1.39）
 * - CGM 14 天质量门槛（≥70% 有效覆盖才作趋势结论）
 * - 家庭血压采集流程是否合格（3–7 天早晚）
 * - 打印友好 Markdown / HTML
 * 非诊断；不给出调药建议。
 */

import {
  FullAnalysis,
  UserContext,
  BloodPressureRecord,
  CgmTirMethod,
} from './types';
import { getDate, getHour, parseAppleDate } from './parser';
import {
  addDaysIso,
  calendarWindowEndInclusive,
  countDaysWithData,
} from './window';
import { createL, normalizeLocale, LocaleOptions, AppLocale } from './locale';
import { buildInsightBullets } from './insights';
import {
  detectCrossSignals,
  CrossSignal,
  SignalEvidence,
} from './signals';
import { formatUserContext } from './prompts/llm-prompt';
import {
  ImportBatchRecord,
  formatProvenanceAppendixMarkdown,
} from './provenance';
import {
  HealthEvent,
  filterEventsInRange,
  formatEventsMarkdown,
} from './events';

/** 国际共识：评估窗口 14 天；有效覆盖建议 ≥70% */
export const CGM_REPORT_DAYS = 14;
export const CGM_MIN_COVERAGE_PCT = 70;
/** 期望每日佩戴小时（用于覆盖率分母；与时间加权 wear 对比） */
export const CGM_EXPECTED_HOURS_PER_DAY = 24;

export interface CgmHourlyBin {
  hour: number; // 0-23
  mean: number | null;
  count: number;
  /** AGP-style percentiles (mmol/L); null if count too small */
  p5: number | null;
  p25: number | null;
  p50: number | null; // median
  p75: number | null;
  p95: number | null;
}

export interface Cgm14DayReport {
  windowStart: string;
  windowEnd: string;
  pointCount: number;
  calendarDays: number;
  daysWithData: number;
  wearHours: number;
  expectedHours: number;
  /** wearHours / expectedHours * 100 */
  coveragePct: number | null;
  /** 覆盖 ≥70% 且单位可靠且有足够点数 */
  sufficient: boolean;
  insufficientReasons: string[];
  unitReliable: boolean;
  tirMethod: CgmTirMethod;
  mean: number | null;
  cv: number | null;
  min: number | null;
  max: number | null;
  /** Time in Range 3.9–10.0 mmol/L */
  tir: number | null;
  /** Time Below Range <3.9 */
  tbr: number | null;
  /** Time Below Range very low <3.0 */
  tbrVery: number | null;
  /** Time Above Range >10.0 */
  tar: number | null;
  /** >7.8 mmol/L share（辅助） */
  tarMild: number | null;
  hourlyProfile: CgmHourlyBin[];
}

export type HomeBpMode = 'home_protocol' | 'imported_mixed' | 'insufficient';

export interface HomeBpDayDetail {
  date: string;
  amCount: number;
  pmCount: number;
  amDouble: boolean;
  pmDouble: boolean;
  amMeanSys: number | null;
  amMeanDia: number | null;
  pmMeanSys: number | null;
  pmMeanDia: number | null;
}

export interface HomeBpAssessment {
  windowStart: string;
  windowEnd: string;
  protocolDays: number;
  daysWithAm: number;
  daysWithPm: number;
  daysWithBoth: number;
  daysWithAmDouble: number;
  daysWithPmDouble: number;
  /** 近 3 天均有早晚读数 */
  qualifies3d: boolean;
  /** 近 7 天中 ≥5 天有早晚（略放宽：至少 5/7 完整天） */
  qualifies7d: boolean;
  mode: HomeBpMode;
  dayDetails: HomeBpDayDetail[];
  noteZh: string;
  noteEn: string;
}

export interface ClinicalReportOptions extends LocaleOptions {
  /** 是否附带用药/病史等敏感个人背景（默认 false） */
  includeSensitiveContext?: boolean;
  /** 是否附带逐条原始样本表（默认 false） */
  includeRawSamples?: boolean;
  /**
   * 是否附带本机事件时间线（默认 false）。
   * 事件可含症状、漏服、疾病与备注，属敏感内容；须显式勾选。
   */
  includeEvents?: boolean;
  /** CGM 窗口末日；默认分析 dateRange.end */
  cgmWindowEnd?: string;
  /** 家庭血压评估天数 3|7，默认 7 */
  bpProtocolDays?: 3 | 7;
  /**
   * 用户本机健康事件时间线（仅时间共现复盘，不作因果/调药建议）。
   * 仅当 includeEvents === true 时写入报告；并按分析 dateRange 过滤（空结果不回退全量）。
   */
  events?: HealthEvent[] | null;
  /**
   * 是否附带本机导入批次可追溯附录（默认 false）。
   * 仅记录导入来源/文件摘要/合并统计；非 FHIR、非医疗认证。
   */
  includeProvenanceAppendix?: boolean;
  /** 本机导入批次列表（仅当 includeProvenanceAppendix 时写入） */
  importBatches?: ImportBatchRecord[] | null;
}

function mean(values: number[]): number | null {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Linear-interpolation percentile on a pre-sorted ascending array.
 * @param sortedAsc values sorted ascending
 * @param p percentile in [0, 100] (e.g. 50 for median)
 */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pct = Math.max(0, Math.min(100, p)) / 100;
  const idx = pct * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const t = idx - lo;
  return sortedAsc[lo] * (1 - t) + sortedAsc[hi] * t;
}

function hourlyBinFromValues(hour: number, vals: number[]): CgmHourlyBin {
  const finite = vals.filter(Number.isFinite);
  const count = finite.length;
  const m = mean(finite);
  const empty: CgmHourlyBin = {
    hour,
    mean: m != null ? round2(m) : null,
    count,
    p5: null,
    p25: null,
    p50: null,
    p75: null,
    p95: null,
  };
  if (count < 3) return empty;
  const sorted = [...finite].sort((a, b) => a - b);
  const pct = (p: number) => {
    const v = percentile(sorted, p);
    return v == null ? null : round2(v);
  };
  return {
    ...empty,
    p5: pct(5),
    p25: pct(25),
    p50: pct(50),
    p75: pct(75),
    p95: pct(95),
  };
}

const CGM_MAX_GAP_MS = 15 * 60 * 1000;
const CGM_LAST_SAMPLE_MS = 5 * 60 * 1000;

function timeWeightedShares(
  sorted: { datetime: string; value: number }[]
): {
  wearMs: number;
  tir: number;
  tbr: number;
  tbrVery: number;
  tar: number;
  tarMild: number;
  mean: number | null;
  cv: number | null;
  min: number | null;
  max: number | null;
} {
  if (!sorted.length) {
    return {
      wearMs: 0,
      tir: 0,
      tbr: 0,
      tbrVery: 0,
      tar: 0,
      tarMild: 0,
      mean: null,
      cv: null,
      min: null,
      max: null,
    };
  }
  let wearMs = 0;
  let tirMs = 0;
  let tbrMs = 0;
  let tbrVeryMs = 0;
  let tarMs = 0;
  let tarMildMs = 0;
  const vals: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i].value;
    vals.push(v);
    const t0 = parseAppleDate(sorted[i].datetime);
    let dt: number;
    if (i + 1 < sorted.length) {
      dt = Math.max(0, parseAppleDate(sorted[i + 1].datetime) - t0);
      if (dt > CGM_MAX_GAP_MS) dt = CGM_MAX_GAP_MS;
    } else {
      dt = CGM_LAST_SAMPLE_MS;
    }
    if (dt <= 0) continue;
    wearMs += dt;
    if (v >= 3.9 && v <= 10.0) tirMs += dt;
    if (v < 3.9) tbrMs += dt;
    if (v < 3.0) tbrVeryMs += dt;
    if (v > 10.0) tarMs += dt;
    if (v > 7.8) tarMildMs += dt;
  }
  const den = wearMs || 1;
  const m = mean(vals);
  let cv: number | null = null;
  if (m != null && m > 0 && vals.length) {
    const variance = vals.reduce((a, x) => a + (x - m) ** 2, 0) / vals.length;
    cv = (Math.sqrt(variance) / m) * 100;
  }
  return {
    wearMs,
    tir: (tirMs / den) * 100,
    tbr: (tbrMs / den) * 100,
    tbrVery: (tbrVeryMs / den) * 100,
    tar: (tarMs / den) * 100,
    tarMild: (tarMildMs / den) * 100,
    mean: m,
    cv,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
  };
}

/**
 * CGM 近 14 自然日标准化报告块
 */
export function buildCgm14DayReport(
  analysis: FullAnalysis,
  options?: { windowEnd?: string; locale?: AppLocale | string }
): Cgm14DayReport | null {
  const cgm = analysis.data?.cgm || [];
  if (!cgm.length) return null;
  const L = createL(normalizeLocale(options?.locale));
  const end =
    options?.windowEnd ||
    analysis.dateRange?.end ||
    getDate(cgm[cgm.length - 1].datetime);
  const { start, end: winEnd } = calendarWindowEndInclusive(end, CGM_REPORT_DAYS);
  const inWin = cgm
    .filter((p) => {
      const d = getDate(p.datetime);
      return d >= start && d <= winEnd;
    })
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const unitReliable = analysis.cgmStats?.unitReliable !== false;
  const daysWithData = countDaysWithData(
    inWin.map((p) => getDate(p.datetime)),
    start,
    winEnd
  );
  const tw = timeWeightedShares(inWin);
  const wearHours = tw.wearMs / 3600000;
  const expectedHours = CGM_REPORT_DAYS * CGM_EXPECTED_HOURS_PER_DAY;
  const coveragePct =
    expectedHours > 0 ? Math.min(100, (wearHours / expectedHours) * 100) : null;

  const insufficientReasons: string[] = [];
  if (!unitReliable) {
    insufficientReasons.push(
      L('血糖单位不可靠', 'Glucose units unreliable')
    );
  }
  if (coveragePct == null || coveragePct < CGM_MIN_COVERAGE_PCT) {
    insufficientReasons.push(
      L(
        `有效覆盖 ${coveragePct != null ? coveragePct.toFixed(0) : '—'}% < ${CGM_MIN_COVERAGE_PCT}%（国际共识建议 ≥70% / 约 14 天）`,
        `Effective coverage ${coveragePct != null ? coveragePct.toFixed(0) : '—'}% < ${CGM_MIN_COVERAGE_PCT}% (consensus suggests ≥70% over ~14 days)`
      )
    );
  }
  if (inWin.length < 48) {
    insufficientReasons.push(
      L(`采样点过少（n=${inWin.length}）`, `Too few samples (n=${inWin.length})`)
    );
  }

  const sufficient = insufficientReasons.length === 0;

  // 小时曲线：本地小时 0–23
  const hourBuckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const p of inWin) {
    const h = getHour(p.datetime);
    if (h >= 0 && h < 24 && Number.isFinite(p.value)) hourBuckets[h].push(p.value);
  }
  const hourlyProfile: CgmHourlyBin[] = hourBuckets.map((vals, hour) =>
    hourlyBinFromValues(hour, vals)
  );

  const tirMethod: CgmTirMethod =
    analysis.cgmStats?.coverage?.reliableTir || (coveragePct != null && coveragePct >= 50)
      ? 'time_weighted'
      : 'sample_share';

  return {
    windowStart: start,
    windowEnd: winEnd,
    pointCount: inWin.length,
    calendarDays: CGM_REPORT_DAYS,
    daysWithData,
    wearHours: Math.round(wearHours * 10) / 10,
    expectedHours,
    coveragePct: coveragePct == null ? null : Math.round(coveragePct * 10) / 10,
    sufficient,
    insufficientReasons,
    unitReliable,
    tirMethod,
    mean: tw.mean != null ? Math.round(tw.mean * 100) / 100 : null,
    cv: tw.cv != null ? Math.round(tw.cv * 10) / 10 : null,
    min: tw.min,
    max: tw.max,
    tir: sufficient ? Math.round(tw.tir * 10) / 10 : null,
    tbr: sufficient ? Math.round(tw.tbr * 10) / 10 : null,
    tbrVery: sufficient ? Math.round(tw.tbrVery * 10) / 10 : null,
    tar: sufficient ? Math.round(tw.tar * 10) / 10 : null,
    tarMild: sufficient ? Math.round(tw.tarMild * 10) / 10 : null,
    hourlyProfile,
  };
}

/**
 * 打印友好 AGP 分位带 SVG（p5–p95 外带、p25–p75 IQR、p50 中位线）。
 * 无有效分位数据时返回空串；路径内仅含数字，无外部 CSS 依赖。
 */
export function buildAgpSvg(
  cgm14: Cgm14DayReport,
  options?: { width?: number; height?: number; locale?: AppLocale | string }
): string {
  const W = options?.width ?? 720;
  const H = options?.height ?? 220;
  const bins = (cgm14.hourlyProfile || [])
    .filter((b) => b != null && Number.isFinite(b.p50 as number))
    .slice()
    .sort((a, b) => a.hour - b.hour);
  if (!bins.length) return '';

  const pad = { top: 16, right: 16, bottom: 32, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return '';

  const ys: number[] = [];
  for (const b of bins) {
    for (const k of ['p5', 'p25', 'p50', 'p75', 'p95'] as const) {
      const v = b[k];
      if (v != null && Number.isFinite(v)) ys.push(v);
    }
  }
  if (!ys.length) return '';

  const thresholds = [3.9, 7.8, 10.0];
  let yMin = Math.min(...ys, ...thresholds);
  let yMax = Math.max(...ys, ...thresholds);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.08;
  yMin -= yPad;
  yMax += yPad;

  const n2 = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  };
  const xAt = (hour: number) => pad.left + (hour / 23) * plotW;
  const yAt = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  type LoKey = 'p5' | 'p25';
  type HiKey = 'p95' | 'p75';

  /** Consecutive-hour segments where both lo/hi are finite */
  function bandSegments(loKey: LoKey, hiKey: HiKey): CgmHourlyBin[][] {
    const segs: CgmHourlyBin[][] = [];
    let cur: CgmHourlyBin[] = [];
    for (const b of bins) {
      const lo = b[loKey];
      const hi = b[hiKey];
      const ok = lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi);
      if (ok) {
        if (cur.length && b.hour !== cur[cur.length - 1].hour + 1) {
          segs.push(cur);
          cur = [];
        }
        cur.push(b);
      } else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    return segs;
  }

  function bandPathD(loKey: LoKey, hiKey: HiKey): string {
    const parts: string[] = [];
    for (const seg of bandSegments(loKey, hiKey)) {
      if (!seg.length) continue;
      let d = `M${n2(xAt(seg[0].hour))},${n2(yAt(seg[0][hiKey]!))}`;
      for (let i = 1; i < seg.length; i++) {
        d += `L${n2(xAt(seg[i].hour))},${n2(yAt(seg[i][hiKey]!))}`;
      }
      for (let i = seg.length - 1; i >= 0; i--) {
        d += `L${n2(xAt(seg[i].hour))},${n2(yAt(seg[i][loKey]!))}`;
      }
      d += 'Z';
      parts.push(d);
    }
    return parts.join('');
  }

  function medianPathD(): string {
    const segs: CgmHourlyBin[][] = [];
    let cur: CgmHourlyBin[] = [];
    for (const b of bins) {
      if (Number.isFinite(b.p50 as number)) {
        if (cur.length && b.hour !== cur[cur.length - 1].hour + 1) {
          segs.push(cur);
          cur = [];
        }
        cur.push(b);
      } else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    return segs
      .filter((s) => s.length >= 1)
      .map((seg) => {
        let d = `M${n2(xAt(seg[0].hour))},${n2(yAt(seg[0].p50!))}`;
        for (let i = 1; i < seg.length; i++) {
          d += `L${n2(xAt(seg[i].hour))},${n2(yAt(seg[i].p50!))}`;
        }
        return d;
      })
      .join('');
  }

  const outerD = bandPathD('p5', 'p95');
  const iqrD = bandPathD('p25', 'p75');
  const medD = medianPathD();
  if (!medD && !outerD && !iqrD) return '';

  // Y ticks: ~4 steps between rounded bounds
  const span = yMax - yMin;
  const roughStep = span / 4;
  const niceSteps = [0.25, 0.5, 1, 1.5, 2, 2.5, 5];
  let step = niceSteps[niceSteps.length - 1];
  for (const s of niceSteps) {
    if (s >= roughStep * 0.6) {
      step = s;
      break;
    }
  }
  const yTicks: number[] = [];
  const tickStart = Math.ceil(yMin / step) * step;
  for (let t = tickStart; t <= yMax + 1e-9; t += step) {
    yTicks.push(Math.round(t * 100) / 100);
  }

  const thrDefs: { y: number; color: string; label: string }[] = [
    { y: 3.9, color: '#0369a1', label: '3.9' },
    { y: 7.8, color: '#ca8a04', label: '7.8' },
    { y: 10.0, color: '#c2410c', label: '10.0' },
  ];

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="AGP">`
  );
  // Plot background
  parts.push(
    `<rect x="${n2(pad.left)}" y="${n2(pad.top)}" width="${n2(plotW)}" height="${n2(plotH)}" fill="#fafbfc" stroke="#e2e8f0" stroke-width="1"/>`
  );
  // Grid + y labels
  for (const t of yTicks) {
    const y = yAt(t);
    if (y < pad.top - 0.5 || y > pad.top + plotH + 0.5) continue;
    parts.push(
      `<line x1="${n2(pad.left)}" y1="${n2(y)}" x2="${n2(pad.left + plotW)}" y2="${n2(y)}" stroke="#e2e8f0" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${n2(pad.left - 6)}" y="${n2(y + 3.5)}" text-anchor="end" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${n2(t)}</text>`
    );
  }
  // Threshold dashed lines
  for (const thr of thrDefs) {
    const y = yAt(thr.y);
    if (y < pad.top || y > pad.top + plotH) continue;
    parts.push(
      `<line x1="${n2(pad.left)}" y1="${n2(y)}" x2="${n2(pad.left + plotW)}" y2="${n2(y)}" stroke="${thr.color}" stroke-width="1" stroke-dasharray="4 3" opacity="0.85"/>`
    );
  }
  // Bands + median
  if (outerD) {
    parts.push(`<path d="${outerD}" fill="rgba(41,128,185,0.18)" stroke="none"/>`);
  }
  if (iqrD) {
    parts.push(`<path d="${iqrD}" fill="rgba(41,128,185,0.38)" stroke="none"/>`);
  }
  if (medD) {
    parts.push(
      `<path d="${medD}" fill="none" stroke="#1a6a9a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  }
  // X labels
  for (const h of [0, 6, 12, 18, 23]) {
    const x = xAt(h);
    parts.push(
      `<text x="${n2(x)}" y="${n2(H - 10)}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${h}</text>`
    );
  }
  // Axis title
  parts.push(
    `<text x="12" y="${n2(pad.top + plotH / 2)}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif" transform="rotate(-90 12 ${n2(pad.top + plotH / 2)})">mmol/L</text>`
  );
  // Compact legend
  const legY = 10;
  const legX = pad.left + 4;
  parts.push(
    `<rect x="${legX}" y="${legY - 6}" width="10" height="8" fill="rgba(41,128,185,0.18)" stroke="none"/>`
  );
  parts.push(
    `<text x="${legX + 14}" y="${legY + 1}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">P5–P95</text>`
  );
  parts.push(
    `<rect x="${legX + 62}" y="${legY - 6}" width="10" height="8" fill="rgba(41,128,185,0.38)" stroke="none"/>`
  );
  parts.push(
    `<text x="${legX + 76}" y="${legY + 1}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">P25–P75</text>`
  );
  parts.push(
    `<line x1="${legX + 128}" y1="${legY - 2}" x2="${legX + 142}" y2="${legY - 2}" stroke="#1a6a9a" stroke-width="2"/>`
  );
  parts.push(
    `<text x="${legX + 146}" y="${legY + 1}" font-size="9" fill="#475569" font-family="system-ui,sans-serif">P50</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/**
 * AHA 家庭血压：同一次测量取两次读数，间隔约 1 分钟。
 * 仅当相邻两条间隔在 [BP_DOUBLE_MIN_GAP_MS, BP_DOUBLE_MAX_GAP_MS] 内记为「双次」。
 * 同日同时段任意两条、或相隔数小时，不得记为规范双测。
 */
const BP_DOUBLE_MIN_GAP_MS = 15 * 1000; // 15s：排除同一秒重复写入
const BP_DOUBLE_MAX_GAP_MS = 3 * 60 * 1000; // 3 分钟：覆盖「约 1 分钟」及略慢复测

function sessionStats(
  records: BloodPressureRecord[]
): { count: number; double: boolean; meanSys: number | null; meanDia: number | null } {
  if (!records.length) {
    return { count: 0, double: false, meanSys: null, meanDia: null };
  }
  const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));
  let double = false;
  for (let i = 1; i < sorted.length; i++) {
    const dt =
      parseAppleDate(sorted[i].datetime) - parseAppleDate(sorted[i - 1].datetime);
    if (dt >= BP_DOUBLE_MIN_GAP_MS && dt <= BP_DOUBLE_MAX_GAP_MS) {
      double = true;
      break;
    }
  }
  // 双次均值：优先取间隔合格的相邻对的均值；否则用全部读数均值作展示
  let meanSys = mean(sorted.map((r) => r.systolic));
  let meanDia = mean(sorted.map((r) => r.diastolic));
  if (double) {
    for (let i = 1; i < sorted.length; i++) {
      const dt =
        parseAppleDate(sorted[i].datetime) - parseAppleDate(sorted[i - 1].datetime);
      if (dt >= BP_DOUBLE_MIN_GAP_MS && dt <= BP_DOUBLE_MAX_GAP_MS) {
        meanSys = mean([sorted[i - 1].systolic, sorted[i].systolic]);
        meanDia = mean([sorted[i - 1].diastolic, sorted[i].diastolic]);
        break;
      }
    }
  }
  return {
    count: sorted.length,
    double,
    meanSys,
    meanDia,
  };
}

/**
 * 家庭血压采集流程评估（AHA：就诊前 3–7 天早晚测量）
 */
export function assessHomeBpProtocol(
  analysis: FullAnalysis,
  options?: { days?: 3 | 7; windowEnd?: string; locale?: AppLocale | string }
): HomeBpAssessment | null {
  const records = analysis.data?.bloodPressure || [];
  if (!records.length) return null;
  const L = createL(normalizeLocale(options?.locale));
  const protocolDays = options?.days === 3 ? 3 : 7;
  const end =
    options?.windowEnd ||
    analysis.dateRange?.end ||
    records[records.length - 1].date;
  const { start, end: winEnd } = calendarWindowEndInclusive(end, protocolDays);
  const inWin = records.filter((r) => r.date >= start && r.date <= winEnd);

  const byDate: Record<string, BloodPressureRecord[]> = {};
  for (const r of inWin) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }

  const dayDetails: HomeBpDayDetail[] = [];
  let daysWithAm = 0;
  let daysWithPm = 0;
  let daysWithBoth = 0;
  let daysWithAmDouble = 0;
  let daysWithPmDouble = 0;

  const dates = Object.keys(byDate).sort();
  for (const date of dates) {
    const dayRecs = byDate[date];
    const am = dayRecs.filter((r) => getHour(r.datetime) < 12);
    const pm = dayRecs.filter((r) => getHour(r.datetime) >= 18);
    const amS = sessionStats(am);
    const pmS = sessionStats(pm);
    if (amS.count) daysWithAm += 1;
    if (pmS.count) daysWithPm += 1;
    if (amS.count && pmS.count) daysWithBoth += 1;
    if (amS.double) daysWithAmDouble += 1;
    if (pmS.double) daysWithPmDouble += 1;
    dayDetails.push({
      date,
      amCount: amS.count,
      pmCount: pmS.count,
      amDouble: amS.double,
      pmDouble: pmS.double,
      amMeanSys: amS.meanSys,
      amMeanDia: amS.meanDia,
      pmMeanSys: pmS.meanSys,
      pmMeanDia: pmS.meanDia,
    });
  }

  // 规范日：早晚均有「短间隔双测」（AHA：每次两次、约 1 分钟间隔）
  const isProtocolDay = (det: HomeBpDayDetail | undefined) =>
    !!(det && det.amDouble && det.pmDouble);

  // 3 天：连续 3 个日历日均为规范日
  const qualifies3d =
    protocolDays >= 3 &&
    (() => {
      const w3 = calendarWindowEndInclusive(winEnd, 3);
      let ok = 0;
      for (let i = 0; i < 3; i++) {
        const d = addDaysIso(w3.start, i);
        if (isProtocolDay(dayDetails.find((x) => x.date === d))) ok += 1;
      }
      return ok >= 3;
    })();

  // 7 天：至少 5 天为规范日（早晚双测齐全）
  const protocolCompleteDays = dayDetails.filter((d) => d.amDouble && d.pmDouble).length;
  const qualifies7d = protocolDays >= 7 && protocolCompleteDays >= 5;

  let mode: HomeBpMode = 'imported_mixed';
  if (qualifies7d || qualifies3d) mode = 'home_protocol';
  else if (daysWithBoth === 0 && inWin.length > 0) mode = 'imported_mixed';
  else if (inWin.length === 0) mode = 'insufficient';
  else if (protocolCompleteDays === 0 && daysWithBoth < 3) mode = 'insufficient';

  const noteZh =
    mode === 'home_protocol'
      ? `按家庭血压流程解读：近 ${protocolDays} 日中 ${protocolCompleteDays} 天满足「早晚各短间隔双测」` +
        `（晨双次 ${daysWithAmDouble} 天、晚双次 ${daysWithPmDouble} 天；仅有单次早晚不算规范日）`
      : mode === 'insufficient'
        ? `数据不足以按家庭血压流程评估（近 ${protocolDays} 日仅 ${protocolCompleteDays} 天满足早晚双测；有早晚但未双测 ${daysWithBoth} 天）。以下仅作普通导入数据展示。`
        : `当前更接近「普通导入数据」：近 ${protocolDays} 日 ${daysWithBoth} 天有早晚读数，但仅 ${protocolCompleteDays} 天满足短间隔双测，未达就诊前连续 3–7 天家庭测量规范。`;

  const noteEn =
    mode === 'home_protocol'
      ? `Interpret as home BP protocol: ${protocolCompleteDays}/${protocolDays} days meet AM+PM short-interval doubles` +
        ` (AM doubles ${daysWithAmDouble}d, PM doubles ${daysWithPmDouble}d; single AM/PM alone does not qualify)`
      : mode === 'insufficient'
        ? `Insufficient for home BP protocol (only ${protocolCompleteDays}/${protocolDays} days with AM+PM doubles; ${daysWithBoth} days have AM+PM at all). Shown as general imported data only.`
        : `Closer to general imported data: ${daysWithBoth}/${protocolDays} days with AM+PM, but only ${protocolCompleteDays} with short-interval doubles; below typical 3–7 day home protocol.`;

  return {
    windowStart: start,
    windowEnd: winEnd,
    protocolDays,
    daysWithAm,
    daysWithPm,
    daysWithBoth,
    daysWithAmDouble,
    daysWithPmDouble,
    qualifies3d,
    qualifies7d,
    mode,
    dayDetails,
    noteZh,
    noteEn,
  };
}

/** 为缺少 evidence 的信号补最小可追溯字段 */
export function ensureSignalEvidence(
  signals: CrossSignal[],
  analysis: FullAnalysis,
  locale?: AppLocale | string
): CrossSignal[] {
  const L = createL(normalizeLocale(locale));
  const end = analysis.dateRange?.end || '';
  const unitMeta = analysis.data?.dataQuality?.cgmUnit;
  return signals.map((s) => {
    if (s.evidence) return s;
    const evidence: SignalEvidence = {
      dates: s.date ? [s.date] : undefined,
      windowEnd: end || s.date,
      sampleCount: undefined,
      daysWithData: s.date ? 1 : undefined,
      unitNote: s.dimensions?.includes('CGM')
        ? unitMeta
          ? L(
              `单位可靠=${unitMeta.reliable ? '是' : '否'}；原始 unit：${(unitMeta.rawUnits || []).join(',') || '—'}`,
              `unitReliable=${unitMeta.reliable ? 'yes' : 'no'}; raw unit: ${(unitMeta.rawUnits || []).join(',') || '—'}`
            )
          : L('CGM 单位信息缺失', 'CGM unit metadata missing')
        : undefined,
      sourceNote: L('跨维度启发式规则（非诊断）', 'Cross-domain heuristic rule (not a diagnosis)'),
      exclusions: [
        L('未声称因果关系', 'No causal claim'),
        L('未给出调药建议', 'No medication-change advice'),
      ],
    };
    return { ...s, evidence };
  });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}%`;
}

/**
 * 规范化就诊复盘 Markdown
 */
export function generateClinicalReviewMarkdown(
  analysis: FullAnalysis,
  userContext?: UserContext | null,
  options?: ClinicalReportOptions
): string {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const includeSensitive = !!options?.includeSensitiveContext;
  const includeRaw = !!options?.includeRawSamples;
  const includeEvents = !!options?.includeEvents;
  const lines: string[] = [];

  lines.push(L('# 规范化健康复盘 / 就诊报告', '# Structured health review / clinic report'));
  lines.push('');
  lines.push(
    L(
      '> **非诊断 · 非调药建议**。用于数据复盘与门诊沟通；结论请以临床评估为准。',
      '> **Not a diagnosis · No medication advice.** For review and clinic discussion; clinical judgment prevails.'
    )
  );
  lines.push('');
  lines.push(
    L(
      `**分析窗口（全库）**：${analysis.dateRange?.start || '—'} ~ ${analysis.dateRange?.end || '—'}`,
      `**Full data range**: ${analysis.dateRange?.start || '—'} ~ ${analysis.dateRange?.end || '—'}`
    )
  );
  lines.push(
    L(
      `**生成**：${analysis.generatedAt || new Date().toISOString()}`,
      `**Generated**: ${analysis.generatedAt || new Date().toISOString()}`
    )
  );
  lines.push('');

  // —— 个人背景（可选敏感）——
  if (includeSensitive && userContext) {
    const ctx = formatUserContext(userContext, { locale });
    if (ctx?.trim()) {
      lines.push(ctx.trimEnd());
      lines.push('');
    }
  } else {
    lines.push(
      L(
        '> 默认**已脱敏**：未附带用药/病史明细与事件时间线。导出时勾选「包含敏感背景」「包含事件时间线」可附加。',
        '> **Redacted by default**: medications/history and event timeline not attached. Opt in when exporting to include sensitive context or events.'
      )
    );
    lines.push('');
  }

  // —— CGM 14 天 ——
  const cgm14 = buildCgm14DayReport(analysis, {
    windowEnd: options?.cgmWindowEnd,
    locale,
  });
  lines.push(L('## CGM 14 天报告模式', '## CGM 14-day report mode'));
  lines.push('');
  if (!cgm14) {
    lines.push(L('（无 CGM 数据）', '(No CGM data)'));
    lines.push('');
  } else {
    lines.push(
      L(
        `**固定窗口**：${cgm14.windowStart} ~ ${cgm14.windowEnd}（${cgm14.calendarDays} 自然日）`,
        `**Fixed window**: ${cgm14.windowStart} ~ ${cgm14.windowEnd} (${cgm14.calendarDays} calendar days)`
      )
    );
    lines.push(
      L(
        `**有效佩戴**：${cgm14.wearHours} h / 期望 ${cgm14.expectedHours} h · **覆盖率 ${fmtPct(cgm14.coveragePct)}** · 有数据日 ${cgm14.daysWithData}/${cgm14.calendarDays} · 采样 n=${cgm14.pointCount} · 方法 ${cgm14.tirMethod === 'time_weighted' ? '时间加权' : '采样占比'}`,
        `**Wear**: ${cgm14.wearHours} h / expected ${cgm14.expectedHours} h · **coverage ${fmtPct(cgm14.coveragePct)}** · days with data ${cgm14.daysWithData}/${cgm14.calendarDays} · samples n=${cgm14.pointCount} · method ${cgm14.tirMethod}`
      )
    );
    lines.push(
      L(
        `**单位可靠**：${cgm14.unitReliable ? '是' : '**否**'}（内部 mmol/L）`,
        `**Unit reliable**: ${cgm14.unitReliable ? 'yes' : '**no**'} (canonical mmol/L)`
      )
    );
    lines.push('');
    if (!cgm14.sufficient) {
      lines.push(
        L(
          '### ⚠ 数据不足，不作趋势结论',
          '### ⚠ Insufficient data — no trend conclusions'
        )
      );
      for (const r of cgm14.insufficientReasons) {
        lines.push(`- ${r}`);
      }
      lines.push('');
      lines.push(
        L(
          `可参考描述性统计（**非**标准化 14 天结论）：均值 ${cgm14.mean ?? '—'} mmol/L，n=${cgm14.pointCount}。`,
          `Descriptive only (**not** a standardized 14-day conclusion): mean ${cgm14.mean ?? '—'} mmol/L, n=${cgm14.pointCount}.`
        )
      );
      lines.push('');
    } else {
      lines.push(L('| 指标 | 值 |', '| Metric | Value |'));
      lines.push('|---|---|');
      lines.push(`| ${L('均值', 'Mean')} | ${cgm14.mean ?? '—'} mmol/L |`);
      lines.push(`| ${L('变异系数 CV', 'CV')} | ${cgm14.cv != null ? cgm14.cv.toFixed(1) + '%' : '—'} |`);
      lines.push(`| ${L('最低 / 最高', 'Min / Max')} | ${cgm14.min ?? '—'} / ${cgm14.max ?? '—'} mmol/L |`);
      lines.push(`| TIR (3.9–10.0) | ${fmtPct(cgm14.tir)} |`);
      lines.push(`| TBR (<3.9) | ${fmtPct(cgm14.tbr)} |`);
      lines.push(`| TBR very (<3.0) | ${fmtPct(cgm14.tbrVery)} |`);
      lines.push(`| TAR (>10.0) | ${fmtPct(cgm14.tar)} |`);
      lines.push(`| ${L('>7.8 占比', '>7.8 share')} | ${fmtPct(cgm14.tarMild)} |`);
      lines.push('');
      lines.push(
        L('### AGP 按时段分位（0–23 时）', '### AGP hourly percentiles (0–23)')
      );
      lines.push('');
      lines.push(
        L(
          '表格为各小时 P5–P95 与中位，单位 mmol/L。样本过少的小时不报分位。HTML 导出版另附可打印 AGP 分位带 SVG。',
          'Table shows hourly P5–P95 and median in mmol/L. Hours with too few samples omit percentiles. HTML export also embeds a printable AGP percentile-band SVG.'
        )
      );
      lines.push('');
      lines.push(
        L(
          '| 时 | P5 | P25 | P50 | P75 | P95 | 均值 | n |',
          '| Hour | P5 | P25 | P50 | P75 | P95 | Mean | n |'
        )
      );
      lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
      const fmtCell = (v: number | null) => (v != null ? v.toFixed(2) : '—');
      for (const b of cgm14.hourlyProfile) {
        if (b.count === 0) continue;
        // count 1–2: mean + n only; percentiles as —
        lines.push(
          `| ${String(b.hour).padStart(2, '0')} | ${fmtCell(b.p5)} | ${fmtCell(b.p25)} | ${fmtCell(b.p50)} | ${fmtCell(b.p75)} | ${fmtCell(b.p95)} | ${fmtCell(b.mean)} | ${b.count} |`
        );
      }
      lines.push('');
    }
  }

  // —— 家庭血压 ——
  const bpDays = options?.bpProtocolDays === 3 ? 3 : 7;
  const bp = assessHomeBpProtocol(analysis, { days: bpDays, locale });
  lines.push(L('## 血压家庭测量模式', '## Home blood pressure mode'));
  lines.push('');
  if (!bp) {
    lines.push(L('（无血压数据）', '(No blood pressure data)'));
    lines.push('');
  } else {
    lines.push(
      L(
        `**评估窗口**：${bp.windowStart} ~ ${bp.windowEnd}（${bp.protocolDays} 自然日）`,
        `**Assessment window**: ${bp.windowStart} ~ ${bp.windowEnd} (${bp.protocolDays} calendar days)`
      )
    );
    const modeLabel =
      bp.mode === 'home_protocol'
        ? L('按家庭血压流程采集', 'Home BP protocol')
        : bp.mode === 'insufficient'
          ? L('数据不足（流程不合格）', 'Insufficient (protocol not met)')
          : L('普通导入数据（非严格家庭流程）', 'General imported data (not strict home protocol)');
    lines.push(L(`**模式**：${modeLabel}`, `**Mode**: ${modeLabel}`));
    lines.push(
      L(
        `**早晚完整天数**：${bp.daysWithBoth} · 有晨 ${bp.daysWithAm} · 有晚 ${bp.daysWithPm} · 晨双次 ${bp.daysWithAmDouble} · 晚双次 ${bp.daysWithPmDouble}`,
        `**Days with AM+PM**: ${bp.daysWithBoth} · AM ${bp.daysWithAm} · PM ${bp.daysWithPm} · AM doubles ${bp.daysWithAmDouble} · PM doubles ${bp.daysWithPmDouble}`
      )
    );
    lines.push(
      L(
        `**合格（3 天连续早晚）**：${bp.qualifies3d ? '是' : '否'} · **合格（7 天≈≥5 天早晚）**：${bp.qualifies7d ? '是' : '否'}`,
        `**Meets 3-day AM+PM**: ${bp.qualifies3d ? 'yes' : 'no'} · **Meets 7-day (~≥5 AM+PM)**: ${bp.qualifies7d ? 'yes' : 'no'}`
      )
    );
    lines.push('');
    lines.push(`> ${locale === 'en' ? bp.noteEn : bp.noteZh}`);
    lines.push('');
    if (bp.dayDetails.length) {
      lines.push(L('| 日期 | 晨条数 | 晨双次 | 晚条数 | 晚双次 | 晨均值 | 晚均值 |', '| Date | AM n | AM×2 | PM n | PM×2 | AM mean | PM mean |'));
      lines.push('|---|---:|:---:|---:|:---:|---:|---:|');
      for (const d of bp.dayDetails) {
        const am =
          d.amMeanSys != null
            ? `${d.amMeanSys.toFixed(0)}/${d.amMeanDia?.toFixed(0)}`
            : '—';
        const pm =
          d.pmMeanSys != null
            ? `${d.pmMeanSys.toFixed(0)}/${d.pmMeanDia?.toFixed(0)}`
            : '—';
        lines.push(
          `| ${d.date} | ${d.amCount} | ${d.amDouble ? '✓' : ''} | ${d.pmCount} | ${d.pmDouble ? '✓' : ''} | ${am} | ${pm} |`
        );
      }
      lines.push('');
    }
  }

  // —— 信号 + 证据 ——
  lines.push(L('## 跨维度信号（含证据）', '## Cross-domain signals (with evidence)'));
  lines.push('');
  const rawSignals = detectCrossSignals(analysis, { locale });
  const signals = ensureSignalEvidence(rawSignals, analysis, locale).slice(0, 12);
  if (!signals.length) {
    lines.push(L('（当前规则未触发明显组合信号）', '(No strong combined signals)'));
    lines.push('');
  } else {
    signals.forEach((s, i) => {
      lines.push(`### ${i + 1}. [${s.severity}] ${s.title}`);
      if (s.date) lines.push(L(`- **日期**：${s.date}`, `- **Date**: ${s.date}`));
      lines.push(L(`- **说明**：${s.detail}`, `- **Detail**: ${s.detail}`));
      lines.push(
        L(
          `- **维度**：${(s.dimensions || []).join(' · ')}`,
          `- **Domains**: ${(s.dimensions || []).join(' · ')}`
        )
      );
      const ev = s.evidence;
      if (ev) {
        lines.push(L('- **为什么出现（可复核）**：', '- **Why it fired (auditable)**:'));
        if (ev.windowStart || ev.windowEnd) {
          lines.push(
            L(
              `  - 窗口：${ev.windowStart || '—'} ~ ${ev.windowEnd || '—'}`,
              `  - Window: ${ev.windowStart || '—'} ~ ${ev.windowEnd || '—'}`
            )
          );
        }
        if (ev.dates?.length) {
          lines.push(
            L(`  - 涉及日期：${ev.dates.join(', ')}`, `  - Dates: ${ev.dates.join(', ')}`)
          );
        }
        if (ev.sampleCount != null) {
          lines.push(L(`  - 样本数：${ev.sampleCount}`, `  - Samples: ${ev.sampleCount}`));
        }
        if (ev.daysWithData != null) {
          lines.push(
            L(`  - 有数据天数：${ev.daysWithData}`, `  - Days with data: ${ev.daysWithData}`)
          );
        }
        if (ev.unitNote) lines.push(L(`  - 单位/来源：${ev.unitNote}`, `  - Unit/source: ${ev.unitNote}`));
        if (ev.sourceNote) lines.push(L(`  - 规则：${ev.sourceNote}`, `  - Rule: ${ev.sourceNote}`));
        if (ev.exclusions?.length) {
          lines.push(
            L(
              `  - 排除/边界：${ev.exclusions.join('；')}`,
              `  - Exclusions/bounds: ${ev.exclusions.join('; ')}`
            )
          );
        }
        if (ev.metricSnapshot) {
          const bits = Object.entries(ev.metricSnapshot)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          lines.push(L(`  - 指标快照：${bits}`, `  - Metric snapshot: ${bits}`));
        }
      }
      lines.push('');
    });
  }

  // —— 本机事件时间线（须 includeEvents；仅时间共现，非因果；不回退全量）——
  if (includeEvents) {
    const rangeStart = analysis.dateRange?.start || null;
    const rangeEnd = analysis.dateRange?.end || null;
    const rawEvents = options?.events || [];
    const filtered =
      rangeStart || rangeEnd
        ? filterEventsInRange(rawEvents, rangeStart, rangeEnd)
        : rawEvents;
    if (filtered.length) {
      lines.push(formatEventsMarkdown(filtered, { locale }).trimEnd());
      lines.push('');
    } else {
      lines.push(L('## 事件时间线', '## Events timeline'));
      lines.push('');
      lines.push(
        L(
          '> 已勾选附带事件，但当前分析窗口内无记录（不回退展示窗口外历史）。',
          '> Events opted in, but none fall in the analysis window (no fallback to out-of-range history).'
        )
      );
      lines.push('');
    }
  }

  // —— 监测摘要 ——
  const bullets = buildInsightBullets(analysis, { locale }).slice(0, 6);
  if (bullets.length) {
    lines.push(L('## 监测摘要（启发式）', '## Monitoring summary (heuristic)'));
    lines.push('');
    bullets.forEach((b, i) => {
      lines.push(`${i + 1}. **[${b.tone}] ${b.title}** — ${b.detail}`);
    });
    lines.push('');
  }

  // —— 原始样本（可选）——
  if (includeRaw) {
    lines.push(L('## 原始样本摘录（用户勾选）', '## Raw samples (user opted in)'));
    lines.push('');
    const bpRec = (analysis.data?.bloodPressure || []).slice(-20);
    if (bpRec.length) {
      lines.push(L('### 血压最近 20 条', '### BP last 20'));
      lines.push('');
      for (const r of bpRec) {
        lines.push(`- ${r.datetime} · ${r.systolic}/${r.diastolic}`);
      }
      lines.push('');
    }
    const cgmPts = (analysis.data?.cgm || []).slice(-30);
    if (cgmPts.length) {
      lines.push(L('### CGM 最近 30 点', '### CGM last 30 points'));
      lines.push('');
      for (const p of cgmPts) {
        lines.push(`- ${p.datetime} · ${p.value.toFixed(2)} mmol/L`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      L(
        '> 未附带逐条原始数据。需要时请在导出选项中勾选「包含原始样本」。',
        '> Per-row raw samples omitted. Opt in to “include raw samples” when exporting.'
      )
    );
    lines.push('');
  }

  // —— 数据可追溯附录（须 includeProvenanceAppendix；非 FHIR）——
  if (options?.includeProvenanceAppendix) {
    const batches = options.importBatches || [];
    if (batches.length) {
      lines.push('---');
      lines.push('');
      lines.push(
        formatProvenanceAppendixMarkdown(batches, {
          locale,
          max: 10,
        }).trimEnd()
      );
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(
    L(
      '*本报告由本地 Health Analyzer 生成，数据未上传本工具服务器。*',
      '*Generated locally by Health Analyzer; data is not uploaded to this tool’s servers.*'
    )
  );

  return lines.join('\n');
}

/**
 * 将 AGP figure 插到首个 AGP 相关 h3 后的表格之后；无表则贴在 h3 后；再否则文末。
 */
function injectAgpFigure(htmlBody: string, figureHtml: string): string {
  if (!figureHtml) return htmlBody;
  const h3Match = htmlBody.match(/<h3>[^<]*AGP[^<]*<\/h3>/i);
  if (!h3Match || h3Match.index == null) {
    return htmlBody + '\n' + figureHtml;
  }
  const h3Idx = h3Match.index;
  const afterH3 = htmlBody.slice(h3Idx);
  const tableEndRel = afterH3.search(/<\/table>/i);
  if (tableEndRel >= 0) {
    const insertAt = h3Idx + tableEndRel + '</table>'.length;
    return htmlBody.slice(0, insertAt) + '\n' + figureHtml + htmlBody.slice(insertAt);
  }
  const h3Close = htmlBody.indexOf('</h3>', h3Idx);
  if (h3Close >= 0) {
    const insertAt = h3Close + '</h3>'.length;
    return htmlBody.slice(0, insertAt) + '\n' + figureHtml + htmlBody.slice(insertAt);
  }
  return htmlBody + '\n' + figureHtml;
}

/**
 * 打印友好 HTML（可另存或浏览器打印为 PDF）
 */
export function generateClinicalReviewHtml(
  analysis: FullAnalysis,
  userContext?: UserContext | null,
  options?: ClinicalReportOptions
): string {
  const md = generateClinicalReviewMarkdown(analysis, userContext, options);
  const locale = normalizeLocale(options?.locale);
  const title =
    locale === 'en'
      ? 'Structured health review / clinic report'
      : '规范化健康复盘 / 就诊报告';
  // 极简 Markdown → HTML（标题/表格/列表/引用/粗体）
  let body = markdownToPrintableHtml(md);

  // 打印用 AGP 分位 SVG（仅覆盖充分时；Markdown 仍为表-only）
  const cgm14 = buildCgm14DayReport(analysis, {
    locale,
    windowEnd: options?.cgmWindowEnd,
  });
  const agpSvg = cgm14?.sufficient ? buildAgpSvg(cgm14, { locale }) : '';
  if (agpSvg) {
    const caption =
      locale === 'en'
        ? 'Printable AGP schematic (14-day hourly percentiles)'
        : '打印用 AGP 示意（14 日按小时分位）';
    const figure = `<figure class="agp-figure">
  <figcaption>${escapeHtml(caption)}</figcaption>
  ${agpSvg}
</figure>`;
    body = injectAgpFigure(body, figure);
  }

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : locale === 'zh-TW' ? 'zh-TW' : 'zh-CN'}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
      line-height: 1.55; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 24px 20px 48px; font-size: 14px; }
    h1 { font-size: 1.45rem; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
    h2 { font-size: 1.15rem; margin-top: 1.6em; color: #0f766e; }
    h3 { font-size: 1.02rem; margin-top: 1.2em; }
    table { border-collapse: collapse; width: 100%; margin: 0.6em 0 1em; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; }
    blockquote { margin: 0.6em 0; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #0f766e; color: #475569; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 1em; }
    .agp-figure { margin: 0.8em 0 1.2em; padding: 0; page-break-inside: avoid; }
    .agp-figure figcaption { font-size: 12px; color: #64748b; margin-bottom: 6px; }
    .agp-figure svg { max-width: 100%; height: auto; display: block; }
    @media print {
      body { padding: 0; max-width: none; font-size: 11pt; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      .agp-figure { page-break-inside: avoid; }
      .agp-figure svg { max-width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="meta no-print">${locale === 'en' ? 'Print this page to PDF (browser Print → Save as PDF).' : '可用浏览器「打印 → 存储为 PDF」导出。'}</p>
  ${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 足够覆盖本报告的轻量 MD→HTML（无外部依赖） */
function markdownToPrintableHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  const flushTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };

  const inline = (s: string) => {
    let t = escapeHtml(s);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  };

  for (const raw of lines) {
    const line = raw;
    if (/^\|/.test(line)) {
      flushList();
      if (/^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, '')) || /^\|[-:\s|]+\|$/.test(line)) {
        continue; // separator
      }
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (!inTable) {
        out.push('<table><tbody>');
        inTable = true;
        out.push(
          '<tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>'
        );
      } else {
        out.push(
          '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>'
        );
      }
      continue;
    }
    flushTable();

    if (/^#\s+/.test(line)) {
      flushList();
      out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushList();
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushList();
      out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushList();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      out.push('<hr/>');
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  flushTable();
  return out.join('\n');
}
