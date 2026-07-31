import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore';
import {
  extractTrendSeries,
  type AnalysisSummary,
  type TrendDomain,
} from '../core/HealthCoreAdapter';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyState, LoadingState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

/** Lazy chart chunk — keeps Overview free of ECharts. */
const TrendChart = lazy(() =>
  import('../components/charts/TrendChart').then((m) => ({
    default: m.TrendChart,
  })),
);

const DOMAIN_KEYS: { id: TrendDomain; key: MessageKey }[] = [
  { id: 'steps', key: 'trends.domain.steps' },
  { id: 'weight', key: 'trends.domain.weight' },
  { id: 'restingHr', key: 'trends.domain.restingHr' },
  { id: 'cgmDailyMean', key: 'trends.domain.cgmDailyMean' },
  { id: 'sleepTotal', key: 'trends.domain.sleepTotal' },
  { id: 'hrv', key: 'trends.domain.hrv' },
];

const VALID_DOMAINS = new Set<string>(DOMAIN_KEYS.map((d) => d.id));

/** TrendDomain → summary.domainPresence key */
const DOMAIN_PRESENCE_KEY: Record<
  TrendDomain,
  keyof AnalysisSummary['domainPresence']
> = {
  steps: 'steps',
  weight: 'weight',
  restingHr: 'restingHr',
  cgmDailyMean: 'cgm',
  sleepTotal: 'sleep',
  hrv: 'hrv',
};

/**
 * Default landing preference when `?domain=` is missing:
 * CGM first (Strategy A product path), then steps, then remaining tabs.
 */
const DEFAULT_DOMAIN_ORDER: TrendDomain[] = [
  'cgmDailyMean',
  'steps',
  'weight',
  'restingHr',
  'sleepTotal',
  'hrv',
];

function parseTrendDomain(raw: string | null): TrendDomain | null {
  if (!raw || !VALID_DOMAINS.has(raw)) return null;
  return raw as TrendDomain;
}

function domainHasPresence(
  summary: AnalysisSummary,
  domain: TrendDomain,
): boolean {
  return !!summary.domainPresence[DOMAIN_PRESENCE_KEY[domain]];
}

/** First domain with summary presence (cgm → steps → …). */
function firstPresentDomain(summary: AnalysisSummary): TrendDomain {
  for (const id of DEFAULT_DOMAIN_ORDER) {
    if (domainHasPresence(summary, id)) return id;
  }
  return 'steps';
}

/** First domain with extractTrendSeries points > 0 (for empty-domain switch). */
function firstDomainWithPoints(
  analysis: Parameters<typeof extractTrendSeries>[0],
  preferOrder: TrendDomain[] = DEFAULT_DOMAIN_ORDER,
): TrendDomain | null {
  for (const id of preferOrder) {
    const series = extractTrendSeries(analysis, id);
    if (series.points.length > 0) return id;
  }
  return null;
}

export function TrendsPage() {
  const { t } = useLocale();
  const analysis = useHealthStore((s) => s.analysis);
  const summary = useHealthStore((s) => s.summary);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDomain = searchParams.get('domain');
  const parsedDomain = parseTrendDomain(rawDomain);

  /** When landing without ?domain=, prefer a present domain and sync URL. */
  useEffect(() => {
    if (rawDomain !== null) return;
    if (!summary) return;
    const preferred = firstPresentDomain(summary);
    setSearchParams({ domain: preferred }, { replace: true });
  }, [rawDomain, summary, setSearchParams]);

  const domain: TrendDomain =
    parsedDomain ??
    (summary ? firstPresentDomain(summary) : ('steps' as TrendDomain));

  const setDomain = (id: TrendDomain) => {
    setSearchParams({ domain: id }, { replace: true });
  };

  const series = useMemo(() => {
    if (!analysis) return null;
    return extractTrendSeries(analysis, domain);
  }, [analysis, domain]);

  /** Another domain with points — used when current domain is empty. */
  const switchTarget = useMemo(() => {
    if (!analysis) return null;
    return firstDomainWithPoints(analysis);
  }, [analysis]);

  const domainLabel =
    t(DOMAIN_KEYS.find((d) => d.id === domain)?.key ?? 'trends.domain.steps') ||
    series?.label ||
    t('trends.title');

  if (!analysis || !summary) {
    return (
      <div className="stack" data-testid="page-trends">
        <h1 className="page-title">{t('trends.title')}</h1>
        <EmptyState
          title={t('trends.emptyTitle')}
          description={t('trends.emptyDesc')}
        />
      </div>
    );
  }

  const points = series?.points ?? [];
  const last = points.length ? points[points.length - 1] : null;
  const otherDomainHasData =
    points.length === 0 &&
    switchTarget != null &&
    switchTarget !== domain;

  return (
    <div className="stack" data-testid="page-trends">
      <div>
        <h1 className="page-title">{t('trends.title')}</h1>
        <p className="page-lead">{t('trends.lead')}</p>
      </div>

      <div
        className="domain-switcher"
        role="tablist"
        aria-label={t('trends.title')}
        data-testid="domain-switcher"
      >
        {DOMAIN_KEYS.map((d) => {
          const hasData = domainHasPresence(summary, d.id);
          return (
            <Button
              key={d.id}
              variant={domain === d.id ? 'primary' : 'ghost'}
              size="sm"
              role="tab"
              aria-selected={domain === d.id}
              data-testid={`trend-domain-${d.id}`}
              data-has-data={hasData ? '1' : '0'}
              className={
                hasData ? 'domain-tab-has-data' : 'domain-tab-empty'
              }
              onClick={() => setDomain(d.id)}
            >
              {t(d.key)}
            </Button>
          );
        })}
        <Badge tone="neutral">
          {points.length} {t('trends.points')}
        </Badge>
        {last ? (
          <Badge tone="accent">
            {t('trends.latest')} {last.date}:{' '}
            {Number.isFinite(last.value)
              ? Math.round(last.value * 100) / 100
              : '—'}{' '}
            {series?.unit}
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardTitle>
          {domainLabel}
          {series?.unit ? `（${series.unit}）` : ''}
        </CardTitle>
        {points.length === 0 ? (
          <div data-testid="trend-empty-domain">
            <p className="muted">{t('trends.emptyDomain')}</p>
            {otherDomainHasData && switchTarget ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="trend-switch-available"
                onClick={() => setDomain(switchTarget)}
                style={{ marginTop: '0.5rem' }}
              >
                {t('trends.switchAvailable')}
              </Button>
            ) : null}
          </div>
        ) : (
          <Suspense fallback={<LoadingState label="…" />}>
            <TrendChart
              title={domainLabel}
              unit={series?.unit ?? ''}
              points={points}
            />
          </Suspense>
        )}
      </Card>

      <Card data-testid="trend-table-fallback">
        <CardTitle>{t('trends.table')}</CardTitle>
        <p className="muted">{t('trends.tableHint')}</p>
        {points.length === 0 ? (
          <p className="muted">{t('trends.emptyDomain')}</p>
        ) : (
          <div
            style={{ maxHeight: '16rem', overflow: 'auto', marginTop: '0.75rem' }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>{t('trends.colDate')}</th>
                  <th>
                    {t('trends.colValue')}
                    {series?.unit ? `（${series.unit}）` : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...points]
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.date}>
                      <td>{p.date}</td>
                      <td>
                        {Number.isFinite(p.value)
                          ? Math.round(p.value * 100) / 100
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
