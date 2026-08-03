import type { AnalysisSummary } from '../../core/HealthCoreAdapter';
import { useLocale } from '../../i18n/LocaleProvider';

type Props = {
  summary: AnalysisSummary;
  /** Preformatted freshness label from OverviewPage (locale-aware there). */
  freshnessText?: string | null;
};

type Chip = {
  id: string;
  label: string;
  value: string;
  testId?: string;
};

/**
 * Dense “today / session snapshot” strip — compact chips for range + key KPIs.
 * Presentational; values from adapter AnalysisSummary.
 */
export function TodayStrip({ summary, freshnessText }: Props) {
  const { t } = useLocale();
  const { dateRange, kpis } = summary;

  const chips: Chip[] = [
    {
      id: 'range',
      label: t('overview.today.range'),
      value: `${dateRange.start || '—'} → ${dateRange.end || '—'}`,
      testId: 'today-strip-range',
    },
  ];

  if (kpis.cgmMean != null) {
    chips.push({
      id: 'cgm',
      label: t('overview.today.cgm'),
      value: kpis.cgmMean.toFixed(2),
      testId: 'today-strip-cgm',
    });
  }
  if (kpis.stepsLatest != null) {
    chips.push({
      id: 'steps',
      label: t('overview.today.steps'),
      value: String(kpis.stepsLatest),
      testId: 'today-strip-steps',
    });
  }
  if (kpis.weightLatest != null) {
    chips.push({
      id: 'weight',
      label: t('overview.today.weight'),
      value: kpis.weightLatest.toFixed(2),
      testId: 'today-strip-weight',
    });
  }
  if (kpis.recoveryScore != null) {
    chips.push({
      id: 'recovery',
      label: t('overview.today.recovery'),
      value: String(Math.round(kpis.recoveryScore)),
      testId: 'today-strip-recovery',
    });
  }
  if (freshnessText) {
    chips.push({
      id: 'freshness',
      label: t('overview.today.freshness'),
      value: freshnessText,
      testId: 'today-strip-freshness',
    });
  }

  return (
    <section className="today-strip" data-testid="today-strip">
      <div className="today-strip-head">
        <span className="today-strip-title">{t('overview.today.title')}</span>
        <span className="muted today-strip-note">{t('overview.today.nonDiag')}</span>
      </div>
      <div className="today-strip-chips" role="list">
        {chips.map((c) => (
          <span
            key={c.id}
            className="today-chip"
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
