import { Badge } from '../../components/ui/Badge';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

/** Write-time soft eviction stages (matches applySoftQuotaEviction chain). */
export const SOFT_QUOTA_ORDER_KEYS: MessageKey[] = [
  'data.softQuota.step.cgm',
  'data.softQuota.step.bpWeight',
  'data.softQuota.step.sleepSteps',
  'data.softQuota.step.hrvHr',
  'data.softQuota.step.workoutsEcgWatch',
];

export type SoftQuotaPanelProps = {
  /** warehouseMeta.layout e.g. sharded-v1 */
  layout?: string | null;
  /** warehouseMeta.totalApproxBytes */
  totalApproxBytes?: number | null;
  /** warehouseMeta.lastWrittenAt ISO string */
  lastWrittenAt?: string | null;
};

function formatApproxMb(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Read-only soft-quota policy panel.
 * Explains write-time eviction order; does not implement interactive keep-N.
 */
export function SoftQuotaPanel({
  layout,
  totalApproxBytes,
  lastWrittenAt,
}: SoftQuotaPanelProps) {
  const { t } = useLocale();
  const hasMeta =
    layout != null ||
    totalApproxBytes != null ||
    (lastWrittenAt != null && lastWrittenAt !== '');

  return (
    <Card className="soft-quota-panel" data-testid="soft-quota-panel">
      <CardTitle>{t('data.softQuota.title')}</CardTitle>
      <CardDesc>{t('data.softQuota.lead')}</CardDesc>

      <ol className="soft-quota-order" data-testid="soft-quota-order">
        {SOFT_QUOTA_ORDER_KEYS.map((key) => (
          <li key={key} className="soft-quota-order-item">
            <span className="soft-quota-chip">{t(key)}</span>
          </li>
        ))}
      </ol>

      <p className="muted soft-quota-note">{t('data.softQuota.note')}</p>

      {hasMeta ? (
        <div className="soft-quota-meta" data-testid="soft-quota-meta">
          {layout != null && layout !== '' ? (
            <Badge
              tone={layout === 'sharded-v1' ? 'ok' : 'watch'}
              data-testid="soft-quota-layout-badge"
            >
              layout: {layout}
            </Badge>
          ) : null}
          {totalApproxBytes != null ? (
            <span className="soft-quota-meta-item" data-testid="soft-quota-bytes">
              {t('data.softQuota.approx')}: {formatApproxMb(totalApproxBytes)}
            </span>
          ) : null}
          {lastWrittenAt ? (
            <span
              className="soft-quota-meta-item muted"
              data-testid="soft-quota-last-written"
            >
              {t('data.softQuota.lastWritten')}: {lastWrittenAt}
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
