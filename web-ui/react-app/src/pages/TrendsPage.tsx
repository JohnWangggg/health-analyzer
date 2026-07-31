import { lazy, Suspense, useMemo, useState } from 'react';
import { useHealthStore } from '../store/useHealthStore';
import {
  extractTrendSeries,
  type TrendDomain,
} from '../core/HealthCoreAdapter';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyState, LoadingState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

/** Lazy chart chunk — keeps Overview free of ECharts. */
const TrendChart = lazy(() =>
  import('../components/charts/TrendChart').then((m) => ({
    default: m.TrendChart,
  })),
);

const DOMAINS: { id: TrendDomain; label: string }[] = [
  { id: 'steps', label: '步数' },
  { id: 'weight', label: '体重' },
  { id: 'restingHr', label: '静息心率' },
  { id: 'cgmDailyMean', label: 'CGM 日均' },
];

export function TrendsPage() {
  const analysis = useHealthStore((s) => s.analysis);
  const summary = useHealthStore((s) => s.summary);
  const [domain, setDomain] = useState<TrendDomain>('steps');

  const series = useMemo(() => {
    if (!analysis) return null;
    return extractTrendSeries(analysis, domain);
  }, [analysis, domain]);

  if (!analysis || !summary) {
    return (
      <div className="stack" data-testid="page-trends">
        <h1 className="page-title">趋势</h1>
        <EmptyState
          title="请先在总览加载数据"
          description="趋势图与数据表使用同一 FullAnalysis，经适配器提取日序列，不在页面内重算。"
        />
      </div>
    );
  }

  const points = series?.points ?? [];

  return (
    <div className="stack" data-testid="page-trends">
      <div>
        <h1 className="page-title">趋势</h1>
        <p className="page-lead">
          主趋势使用本地 ECharts（路由懒加载）。下方提供数据表回退，便于键盘与读屏。
        </p>
      </div>

      <div className="row" role="tablist" aria-label="趋势指标">
        {DOMAINS.map((d) => (
          <Button
            key={d.id}
            variant={domain === d.id ? 'primary' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={domain === d.id}
            data-testid={`trend-domain-${d.id}`}
            onClick={() => setDomain(d.id)}
          >
            {d.label}
          </Button>
        ))}
        <Badge tone="neutral">{points.length} 点</Badge>
      </div>

      <Card>
        <CardTitle>{series?.label ?? '趋势'}</CardTitle>
        <Suspense fallback={<LoadingState label="加载图表模块…" />}>
          <TrendChart
            title={series?.label ?? '趋势'}
            unit={series?.unit ?? ''}
            points={points}
          />
        </Suspense>
      </Card>

      <Card data-testid="trend-table-fallback">
        <CardTitle>数据表回退</CardTitle>
        <p className="muted">与图表同一序列（extractTrendSeries）。</p>
        {points.length === 0 ? (
          <p className="muted">该域暂无数据点。</p>
        ) : (
          <div style={{ maxHeight: '16rem', overflow: 'auto', marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>
                    值（{series?.unit}）
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
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
