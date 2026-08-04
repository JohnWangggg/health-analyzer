import type { AnalysisSummary } from '../../core/HealthCoreAdapter';
import { useLocale } from '../../i18n/LocaleProvider';

type Props = {
  summary: AnalysisSummary;
  /** Preformatted freshness label from OverviewPage (locale-aware there). */
  freshnessText?: string | null;
  freshnessTone?: 'ok' | 'watch' | 'alert' | 'neutral';
};

type Chip = {
  id: string;
  label: string;
  value: string;
  testId?: string;
  tone?: 'ok' | 'watch' | 'alert' | 'neutral';
};

/**
 * Slim session meta strip — range + freshness (+ optional anomaly).
 * Does NOT repeat CGM/steps/weight/recovery (those live on micro-trends + KPI).
 */
export function TodayStrip({
  summary,
  freshnessText,
  freshnessTone = 'neutral',
}: Props) {
  const { t } = useLocale();
  const { dateRange, freshnessDays } = summary;

  const chips: Chip[] = [
    {
      id: 'range',
      label: t('overview.today.range'),
      value: `${dateRange.start || '—'} → ${dateRange.end || '—'}`,
      testId: 'today-strip-range',
      tone: 'neutral',
    },
  ];

  if (freshnessText) {
    chips.push({
      id: 'freshness',
      label: t('overview.today.freshness'),
      value: freshnessText,
      testId: 'today-strip-freshness',
      tone: freshnessTone,
    });
  }

  // Anomaly only — not a full metric repeat
  if (freshnessDays != null && freshnessDays > 7) {
    chips.push({
      id: 'anomaly-stale',
      label: t('overview.today.anomaly'),
      value: t('overview.today.anomaly.stale'),
      testId: 'today-strip-anomaly',
      tone: 'watch',
    });
  }

  return (
    <section className="today-strip today-strip-meta" data-testid="today-strip">
      <div className="today-strip-head">
        <span className="today-strip-title">{t('overview.today.title')}</span>
        <span className="muted today-strip-note">{t('overview.today.nonDiag')}</span>
      </div>
      <div className="today-strip-chips" role="list">
        {chips.map((c) => (
          <span
            key={c.id}
            className={`today-chip today-chip-${c.tone || 'neutral'}`}
            role="listitem"
            data-testid={c.testId}
            data-chip={c.id}
          >
            <span className="today-chip-label">{c.label}</span>
            <span className="today-chip-value">{c.value}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
