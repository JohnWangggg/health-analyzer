import type { AnalysisSummary } from '../../core/HealthCoreAdapter';
import { useLocale } from '../../i18n/LocaleProvider';

type Props = {
  summary: AnalysisSummary;
};

/**
 * Surface parser data-quality notes (future-dated skips, CGM unit reliability).
 */
export function DataQualityBanner({ summary }: Props) {
  const { t } = useLocale();
  const dq = summary.dataQuality;
  if (!dq) return null;

  const lines: string[] = [];
  if (dq.skippedFutureCount > 0) {
    let line = t('overview.quality.future').replace(
      '{n}',
      String(dq.skippedFutureCount),
    );
    if (dq.futureSampleDates.length) {
      line += ` (${dq.futureSampleDates.slice(0, 3).join(', ')})`;
    }
    lines.push(line);
  }
  if (dq.cgmUnitReliable === false) {
    lines.push(
      t('overview.quality.cgmUnit').replace(
        '{unit}',
        dq.cgmUnitLabel || '—',
      ),
    );
  }

  if (!lines.length) return null;

  return (
    <div
      className="data-quality-banner"
      role="status"
      data-testid="data-quality-banner"
    >
      <strong>{t('overview.quality.title')}</strong>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="muted data-quality-hint">{t('overview.quality.hint')}</p>
    </div>
  );
}
