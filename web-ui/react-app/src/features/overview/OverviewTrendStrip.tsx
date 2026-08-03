import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  extractTrendSeries,
  type AnalysisSummary,
  type FullAnalysis,
  type TrendDomain,
} from '../../core/HealthCoreAdapter';
import { Sparkline } from '../../components/charts/Sparkline';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const RANGE_OPTIONS = [7, 30] as const;

type StripDomain = {
  id: TrendDomain;
  labelKey: MessageKey;
  presenceKey: keyof AnalysisSummary['domainPresence'];
};

const STRIP_DOMAINS: StripDomain[] = [
  { id: 'steps', labelKey: 'trends.domain.steps', presenceKey: 'steps' },
  { id: 'weight', labelKey: 'trends.domain.weight', presenceKey: 'weight' },
  {
    id: 'cgmDailyMean',
    labelKey: 'trends.domain.cgmDailyMean',
    presenceKey: 'cgm',
  },
  {
    id: 'sleepTotal',
    labelKey: 'trends.domain.sleepTotal',
    presenceKey: 'sleep',
  },
];

function sliceLastDays(
  points: { date: string; value: number }[],
  days: number,
): number[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-days).map((p) => p.value);
}

/**
 * Command-center layer 2: compact 7/30-day sparklines (no ECharts).
 */
export function OverviewTrendStrip({
  analysis,
  summary,
}: {
  analysis: FullAnalysis | null;
  summary: AnalysisSummary;
}) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);

  const cards = useMemo(() => {
    if (!analysis) return [];
    const out: {
      id: TrendDomain;
      label: string;
      values: number[];
      latest: number | null;
      present: boolean;
    }[] = [];
    for (const d of STRIP_DOMAINS) {
      if (!summary.domainPresence[d.presenceKey]) continue;
      const series = extractTrendSeries(analysis, d.id);
      const values = sliceLastDays(series.points, days);
      if (values.length < 2) continue;
      out.push({
        id: d.id,
        label: t(d.labelKey),
        values,
        latest: values[values.length - 1] ?? null,
        present: true,
      });
    }
    return out;
  }, [analysis, summary, days, t]);

  if (!analysis || !cards.length) return null;

  return (
    <section
      className="overview-trend-strip"
      data-testid="overview-trend-strip"
      aria-label={t('overview.trendStrip.title')}
    >
      <div className="overview-trend-strip-head">
        <h2 className="section-title overview-trend-strip-title">
          {t('overview.trendStrip.title')}
        </h2>
        <div
          className="overview-trend-range"
          role="group"
          aria-label={t('overview.trendStrip.range')}
        >
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className="overview-trend-range-btn"
              data-active={days === d ? '1' : '0'}
              data-testid={`overview-trend-range-${d}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="overview-trend-grid">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className="overview-trend-card"
            data-testid={`overview-trend-${c.id}`}
            data-has-data={c.present ? '1' : '0'}
            onClick={() => navigate(`/trends?domain=${c.id}`)}
            title={t('overview.kpi.openTrends')}
          >
            <span className="overview-trend-card-label">{c.label}</span>
            <span className="overview-trend-card-value">
              {c.latest != null
                ? Number.isInteger(c.latest)
                  ? String(c.latest)
                  : c.latest.toFixed(c.id === 'cgmDailyMean' ? 2 : 1)
                : '—'}
            </span>
            <Sparkline
              values={c.values}
              className="overview-trend-spark"
              width={128}
              height={40}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
