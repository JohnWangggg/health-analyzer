/**
 * HealthCoreAdapter — thin typed boundary over @health-analyzer/lib.
 * UI must not reimplement parse/stats; all analysis goes through this adapter.
 */
import {
  parseHealthXml,
  analyzeAll,
  generateVisitSummaryMarkdown,
  generateWeeklyReportMarkdown,
  generateClinicalReviewMarkdown,
  generateClinicalReviewHtml as generateClinicalReviewHtmlImport,
  generateLLMPrompt,
  generateDataOnly,
  SHORT_SYSTEM_PROMPT,
  SHORT_SYSTEM_PROMPT_EN,
  type FullAnalysis,
  type HealthData,
  type AppLocale,
  type UserContext,
} from '@health-analyzer/lib';

export type AnalyzeOptions = {
  locale?: AppLocale | string | null;
};

/** Stable summary fields used for parity tests and shell KPI cards. */
export type AnalysisSummary = {
  dateRange: { start: string; end: string };
  generatedAt: string;
  domainPresence: {
    cgm: boolean;
    bloodPressure: boolean;
    weight: boolean;
    hrv: boolean;
    restingHr: boolean;
    steps: boolean;
    sleep: boolean;
    watch: boolean;
    workouts: boolean;
    ecg: boolean;
  };
  counts: {
    cgm: number;
    bloodPressure: number;
    weight: number;
    stepsDays: number;
    sleepDays: number;
    hrvDays: number;
  };
  kpis: {
    cgmMean: number | null;
    weightLatest: number | null;
    stepsLatest: number | null;
    restingHrLatest: number | null;
    recoveryScore: number | null;
    loadScore: number | null;
    statusLabel: string | null;
    statusTone: string | null;
  };
  /** Days since end of date range (0 = ends today). */
  freshnessDays: number | null;
  /** Parser data-quality hints (future-dated skips, CGM unit reliability). */
  dataQuality: {
    skippedFutureCount: number;
    futureSampleDates: string[];
    cgmUnitReliable: boolean | null;
    cgmUnitLabel: string | null;
  };
};

export type SeriesPoint = { date: string; value: number };

export type TrendDomain =
  | 'steps'
  | 'weight'
  | 'restingHr'
  | 'cgmDailyMean'
  | 'sleepTotal'
  | 'hrv';

export type ReportKind = 'visit' | 'weekly' | 'clinical';

export type ParseAnalyzeResult = {
  data: HealthData;
  analysis: FullAnalysis;
  summary: AnalysisSummary;
};

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function daysBetweenIso(end: string, todayIso: string): number | null {
  if (!end) return null;
  const a = Date.parse(`${end}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Extract comparable summary from a FullAnalysis (shared by adapter + direct lib path). */
export function summarizeAnalysis(
  analysis: FullAnalysis,
  now: Date = new Date(),
): AnalysisSummary {
  const data = analysis.data;
  const cgmMean = numOrNull(analysis.cgmStats?.overall?.mean);
  const weightLatest =
    numOrNull(analysis.weightStats?.latestTrend?.weight) ??
    (data.weight.length
      ? numOrNull(data.weight[data.weight.length - 1]!.value)
      : null);
  const stepDates = Object.keys(analysis.stepsByDate || {}).sort();
  const stepsLatest = stepDates.length
    ? numOrNull(analysis.stepsByDate[stepDates[stepDates.length - 1]!])
    : null;
  const rhrDates = Object.keys(analysis.restingHrByDate || {}).sort();
  const restingHrLatest = rhrDates.length
    ? numOrNull(analysis.restingHrByDate[rhrDates[rhrDates.length - 1]!])
    : null;
  const recoveryScore = numOrNull(analysis.recoveryWeek?.recoveryScore);
  const loadScore = numOrNull(analysis.recoveryWeek?.loadScore);
  const todayIso = now.toISOString().slice(0, 10);
  const dq = (data as { dataQuality?: Record<string, unknown> }).dataQuality;
  const skippedFuture =
    typeof dq?.skippedFutureCount === 'number' ? dq.skippedFutureCount : 0;
  const futureSamples = Array.isArray(dq?.futureSampleDates)
    ? (dq!.futureSampleDates as unknown[])
        .map((x) => String(x))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const cgmUnit = dq?.cgmUnit as
    | { reliable?: boolean; displayUnit?: string; unit?: string }
    | null
    | undefined;
  const cgmUnitReliable =
    cgmUnit && typeof cgmUnit.reliable === 'boolean' ? cgmUnit.reliable : null;
  const cgmUnitLabel =
    cgmUnit && (cgmUnit.displayUnit || cgmUnit.unit)
      ? String(cgmUnit.displayUnit || cgmUnit.unit)
      : null;

  return {
    dateRange: { ...analysis.dateRange },
    generatedAt: analysis.generatedAt,
    domainPresence: {
      cgm: (data.cgm?.length ?? 0) > 0 || !!analysis.cgmStats,
      bloodPressure:
        (data.bloodPressure?.length ?? 0) > 0 || !!analysis.bpStats,
      weight: (data.weight?.length ?? 0) > 0 || !!analysis.weightStats,
      hrv: Object.keys(data.hrv || {}).length > 0,
      restingHr: Object.keys(data.restingHr || {}).length > 0,
      steps: Object.keys(data.steps || {}).length > 0,
      sleep: Object.keys(data.sleep || {}).length > 0,
      watch:
        Object.keys(data.watchDaily || {}).length > 0 || !!analysis.watchStats,
      workouts: (data.workouts?.length ?? 0) > 0 || !!analysis.workoutStats,
      ecg: (data.ecg?.length ?? 0) > 0 || !!analysis.ecgStats,
    },
    counts: {
      cgm: data.cgm?.length ?? 0,
      bloodPressure: data.bloodPressure?.length ?? 0,
      weight: data.weight?.length ?? 0,
      stepsDays: Object.keys(data.steps || {}).length,
      sleepDays: Object.keys(data.sleep || {}).length,
      hrvDays: Object.keys(data.hrv || {}).length,
    },
    kpis: {
      cgmMean,
      weightLatest: numOrNull(weightLatest),
      stepsLatest: numOrNull(stepsLatest),
      restingHrLatest: numOrNull(restingHrLatest),
      recoveryScore,
      loadScore,
      statusLabel: analysis.recoveryWeek?.statusLabel ?? null,
      statusTone: analysis.recoveryWeek?.statusTone ?? null,
    },
    freshnessDays: daysBetweenIso(analysis.dateRange.end, todayIso),
    dataQuality: {
      skippedFutureCount: skippedFuture,
      futureSampleDates: futureSamples,
      cgmUnitReliable,
      cgmUnitLabel,
    },
  };
}

/**
 * Build chart series from analysis (no re-stats — maps existing daily maps).
 */
export function extractTrendSeries(
  analysis: FullAnalysis,
  domain: TrendDomain,
): { domain: TrendDomain; label: string; unit: string; points: SeriesPoint[] } {
  if (domain === 'steps') {
    const points = Object.entries(analysis.stepsByDate || {})
      .map(([date, value]) => ({ date, value: Number(value) }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { domain, label: '步数', unit: '步', points };
  }
  if (domain === 'weight') {
    const series = analysis.weightStats?.trendSeries;
    const points = series?.length
      ? series.map((p) => ({ date: p.date, value: p.weight }))
      : analysis.data.weight
          .map((w) => ({ date: w.date, value: w.value }))
          .sort((a, b) => a.date.localeCompare(b.date));
    return { domain, label: '体重', unit: 'kg', points };
  }
  if (domain === 'restingHr') {
    const points = Object.entries(analysis.restingHrByDate || {})
      .map(([date, value]) => ({ date, value: Number(value) }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { domain, label: '静息心率', unit: 'bpm', points };
  }
  if (domain === 'sleepTotal') {
    const sleepMap =
      analysis.sleepByDate || analysis.data?.sleep || ({} as Record<string, { total?: number }>);
    const points = Object.entries(sleepMap)
      .map(([date, s]) => {
        const total =
          s && typeof s === 'object' && s !== null && 'total' in s
            ? Number((s as { total: number }).total)
            : Number(s);
        return { date, value: total };
      })
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { domain, label: '睡眠时长', unit: 'h', points };
  }
  if (domain === 'hrv') {
    const points = Object.entries(analysis.hrvByDate || {})
      .map(([date, h]) => {
        if (h && typeof h === 'object' && h !== null && 'allMean' in h) {
          return { date, value: Number((h as { allMean: number }).allMean) };
        }
        if (typeof h === 'number') return { date, value: h };
        const mean =
          h && typeof h === 'object' && h !== null && 'mean' in h
            ? Number((h as { mean?: number }).mean)
            : NaN;
        return { date, value: mean };
      })
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { domain, label: 'HRV', unit: 'ms', points };
  }
  // cgmDailyMean — average by calendar day from raw points
  const byDay = new Map<string, number[]>();
  for (const p of analysis.data.cgm || []) {
    const day = (p.datetime || '').slice(0, 10);
    if (!day) continue;
    const arr = byDay.get(day) || [];
    arr.push(p.value);
    byDay.set(day, arr);
  }
  const points = [...byDay.entries()]
    .map(([date, vals]) => ({
      date,
      value: vals.reduce((a, b) => a + b, 0) / vals.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { domain, label: 'CGM 日均', unit: 'mmol/L', points };
}

export type ReportPreviewOptions = AnalyzeOptions & {
  userContext?: UserContext | null;
  includeSensitiveContext?: boolean;
  includeEvents?: boolean;
  events?: unknown[];
};

export function buildReportPreview(
  analysis: FullAnalysis,
  kind: ReportKind,
  options?: ReportPreviewOptions,
): { kind: ReportKind; title: string; markdown: string } {
  const locale = options?.locale ?? 'zh-CN';
  const ctx = options?.userContext ?? null;
  const includeEvents = !!options?.includeEvents;
  const events = options?.events || [];
  if (kind === 'visit') {
    return {
      kind,
      title: '门诊快速评估一页纸',
      markdown: generateVisitSummaryMarkdown(analysis, ctx, { locale }),
    };
  }
  if (kind === 'weekly') {
    return {
      kind,
      title: '周报',
      markdown: generateWeeklyReportMarkdown(analysis, ctx, {
        locale,
        includeEvents,
        events,
      }),
    };
  }
  return {
    kind,
    title: '临床复盘',
    markdown: generateClinicalReviewMarkdown(analysis, ctx, {
      locale,
      includeSensitiveContext: !!options?.includeSensitiveContext,
      includeEvents,
      events,
    }),
  };
}

export function buildClinicalHtml(
  analysis: FullAnalysis,
  options?: ReportPreviewOptions,
): string {
  const locale = options?.locale ?? 'zh-CN';
  return generateClinicalReviewHtmlImport(
    analysis,
    options?.userContext ?? null,
    {
      locale,
      includeSensitiveContext: !!options?.includeSensitiveContext,
      includeEvents: !!options?.includeEvents,
      events: options?.events || [],
    },
  );
}

export type LlmPromptMode = 'full' | 'data' | 'short';

/**
 * Build paste-ready LLM prompt via lib kernel (legacy parity accelerator).
 * userContext optional; events default off (opt-in via includeEvents + events[]).
 */
export function buildLlmPrompt(
  analysis: FullAnalysis,
  mode: LlmPromptMode = 'full',
  options?: AnalyzeOptions & {
    userContext?: UserContext | null;
    includeEvents?: boolean;
    events?: unknown[];
  },
): { mode: LlmPromptMode; text: string } {
  const locale = options?.locale ?? 'zh-CN';
  const ctx = options?.userContext ?? null;
  const eventOpts = {
    locale,
    includeEvents: !!options?.includeEvents,
    events: options?.events || [],
  };
  if (mode === 'data') {
    return {
      mode,
      text: generateDataOnly(analysis, ctx, eventOpts),
    };
  }
  if (mode === 'short') {
    const short =
      locale === 'en' || String(locale).startsWith('en')
        ? SHORT_SYSTEM_PROMPT_EN
        : SHORT_SYSTEM_PROMPT;
    const data = generateDataOnly(analysis, ctx, eventOpts);
    return { mode, text: `${short}\n\n---\n\n${data}` };
  }
  return {
    mode: 'full',
    text: generateLLMPrompt(analysis, ctx, eventOpts),
  };
}

/**
 * Parse Apple Health XML and run full analysis via the existing lib kernel.
 */
export function analyzeHealthXml(
  xml: string,
  options?: AnalyzeOptions,
): ParseAnalyzeResult {
  const data = parseHealthXml(xml);
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}

/**
 * Direct lib path used only by parity tests to prove the adapter is not a reimplementation.
 */
export function analyzeHealthXmlViaLibDirect(
  xml: string,
  options?: AnalyzeOptions,
): ParseAnalyzeResult {
  const data = parseHealthXml(xml);
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}

export type AsyncAnalyzeResult = ParseAnalyzeResult & {
  via: 'worker' | 'main';
};

export class HealthCoreAdapter {
  analyzeXml(xml: string, options?: AnalyzeOptions): ParseAnalyzeResult {
    return analyzeHealthXml(xml, options);
  }

  /**
   * Prefer module Worker for parse+analyze; fall back to main thread.
   * UI should call this for user file imports.
   */
  async analyzeXmlAsync(
    xml: string,
    options?: AnalyzeOptions,
  ): Promise<AsyncAnalyzeResult> {
    const { analyzeXmlOffMainThread } = await import('./parseWorkerClient');
    const locale = options?.locale ?? null;
    const { analysis, via } = await analyzeXmlOffMainThread(xml, locale, () => {
      const r = analyzeHealthXml(xml, options);
      return { analysis: r.analysis };
    });
    return {
      data: analysis.data,
      analysis,
      summary: summarizeAnalysis(analysis),
      via,
    };
  }

  trendSeries(analysis: FullAnalysis, domain: TrendDomain) {
    return extractTrendSeries(analysis, domain);
  }

  report(
    analysis: FullAnalysis,
    kind: ReportKind,
    options?: AnalyzeOptions,
  ) {
    return buildReportPreview(analysis, kind, options);
  }
}

export const healthCore = new HealthCoreAdapter();

