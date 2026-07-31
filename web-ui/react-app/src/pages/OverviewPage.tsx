import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore';
import { Button } from '../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/ui/EmptyState';

/** In-repo e2e fixture — Vite ?raw embeds locally (no network). */
import fixtureXml from '../../../../e2e/fixtures/minimal-export.xml?raw';

function freshnessLabel(days: number | null): {
  text: string;
  tone: 'ok' | 'watch' | 'alert' | 'neutral';
} {
  if (days == null) return { text: '未知', tone: 'neutral' };
  if (days <= 1) return { text: `截至 ${days === 0 ? '今天' : '昨天'}`, tone: 'ok' };
  if (days <= 7) return { text: `${days} 天前`, tone: 'watch' };
  return { text: `${days} 天前（偏旧）`, tone: 'alert' };
}

function priorityFromSummary(summary: NonNullable<
  ReturnType<typeof useHealthStore.getState>['summary']
>): { title: string; detail: string; tone: 'ok' | 'watch' | 'alert' | 'accent' } {
  if (summary.kpis.statusLabel) {
    const tone =
      summary.kpis.statusTone === 'alert'
        ? 'alert'
        : summary.kpis.statusTone === 'watch'
          ? 'watch'
          : summary.kpis.statusTone === 'positive'
            ? 'ok'
            : 'accent';
    return {
      title: summary.kpis.statusLabel,
      detail:
        summary.kpis.recoveryScore != null
          ? `恢复分 ${summary.kpis.recoveryScore} · 负荷 ${summary.kpis.loadScore ?? '—'}`
          : '基于本机分析内核的恢复/负荷启发式（非诊断）',
      tone,
    };
  }
  if (summary.freshnessDays != null && summary.freshnessDays > 7) {
    return {
      title: '数据偏旧，建议重新导入',
      detail: `分析区间止于 ${summary.dateRange.end || '—'}`,
      tone: 'watch',
    };
  }
  if (summary.domainPresence.cgm) {
    return {
      title: '血糖域有数据，可查看趋势与报告',
      detail: `CGM ${summary.counts.cgm} 点 · 均值 ${summary.kpis.cgmMean?.toFixed(2) ?? '—'}`,
      tone: 'accent',
    };
  }
  return {
    title: '已加载本机分析',
    detail: `${summary.dateRange.start} → ${summary.dateRange.end}`,
    tone: 'ok',
  };
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { status, error, summary, sourceLabel, loadXml, clear } =
    useHealthStore();

  const loadFixture = useCallback(() => {
    loadXml(fixtureXml, 'e2e/fixtures/minimal-export.xml');
  }, [loadXml]);

  if (status === 'loading') {
    return <LoadingState label="正在通过 HealthCoreAdapter 分析…" />;
  }

  return (
    <div className="stack" data-testid="page-overview">
      <div>
        <h1 className="page-title">总览</h1>
        <p className="page-lead">
          数据新鲜度 → 优先事项 → 核心指标。分析由适配器调用 lib，不在 React
          内重算统计。
        </p>
      </div>

      <div className="row">
        <Button
          variant="primary"
          onClick={loadFixture}
          data-testid="load-fixture"
        >
          加载演示夹具
        </Button>
        <Button variant="secondary" onClick={clear} disabled={status === 'idle'}>
          清除
        </Button>
        {sourceLabel ? (
          <Badge tone="neutral" data-testid="source-label">
            来源 {sourceLabel}
          </Badge>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}

      {!summary ? (
        <EmptyState
          testId="overview-empty"
          title="尚未加载数据"
          description="加载 e2e/fixtures/minimal-export.xml，将通过 parseHealthXml + analyzeAll 生成摘要。"
          actionLabel="加载演示夹具"
          onAction={loadFixture}
        />
      ) : (
        <>
          <div className="card-grid">
            <Card data-testid="freshness-card">
              <CardTitle>数据新鲜度</CardTitle>
              {(() => {
                const f = freshnessLabel(summary.freshnessDays);
                return (
                  <>
                    <p className="kpi" data-testid="kpi-freshness">
                      {f.text}
                    </p>
                    <CardDesc>
                      区间 {summary.dateRange.start || '—'} →{' '}
                      {summary.dateRange.end || '—'}
                    </CardDesc>
                    <div style={{ marginTop: '0.5rem' }}>
                      <Badge tone={f.tone}>{f.tone === 'ok' ? '较新' : '需关注'}</Badge>
                    </div>
                  </>
                );
              })()}
            </Card>

            {(() => {
              const p = priorityFromSummary(summary);
              return (
                <Card className="priority-card" data-testid="priority-card">
                  <CardTitle>优先事项</CardTitle>
                  <p className="kpi" style={{ fontSize: '1.1rem' }} data-testid="priority-title">
                    {p.title}
                  </p>
                  <CardDesc>{p.detail}</CardDesc>
                  <div style={{ marginTop: '0.5rem' }}>
                    <Badge tone={p.tone}>本机启发式</Badge>
                  </div>
                </Card>
              );
            })()}
          </div>

          <div className="card-grid">
            <Card>
              <CardTitle>日期范围</CardTitle>
              <p className="kpi" data-testid="kpi-range">
                {summary.dateRange.start || '—'} → {summary.dateRange.end || '—'}
              </p>
            </Card>
            <Card>
              <CardTitle>CGM 均值</CardTitle>
              <p className="kpi" data-testid="kpi-cgm">
                {summary.kpis.cgmMean != null
                  ? summary.kpis.cgmMean.toFixed(2)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.cgm} 点</CardDesc>
            </Card>
            <Card>
              <CardTitle>最近体重</CardTitle>
              <p className="kpi" data-testid="kpi-weight">
                {summary.kpis.weightLatest != null
                  ? summary.kpis.weightLatest.toFixed(2)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.weight} 条</CardDesc>
            </Card>
            <Card>
              <CardTitle>最近步数</CardTitle>
              <p className="kpi" data-testid="kpi-steps">
                {summary.kpis.stepsLatest != null
                  ? String(summary.kpis.stepsLatest)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.stepsDays} 天</CardDesc>
            </Card>
            <Card>
              <CardTitle>恢复分</CardTitle>
              <p className="kpi" data-testid="kpi-recovery">
                {summary.kpis.recoveryScore != null
                  ? String(summary.kpis.recoveryScore)
                  : '—'}
              </p>
              <CardDesc>非诊断 · 个人启发式</CardDesc>
            </Card>
          </div>

          <div className="row">
            <Button variant="secondary" onClick={() => navigate('/trends')}>
              打开趋势
            </Button>
            <Button variant="secondary" onClick={() => navigate('/reports')}>
              打开报告
            </Button>
          </div>

          <Card>
            <CardTitle>域存在性</CardTitle>
            <div className="row" style={{ marginTop: '0.75rem' }}>
              {Object.entries(summary.domainPresence).map(([k, v]) => (
                <Badge
                  key={k}
                  tone={v ? 'ok' : 'neutral'}
                  data-domain={k}
                  data-present={v ? '1' : '0'}
                >
                  {k}: {v ? '有' : '无'}
                </Badge>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
