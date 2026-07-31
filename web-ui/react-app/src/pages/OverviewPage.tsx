import { useCallback, useState } from 'react';
import { useHealthStore } from '../store/useHealthStore';

/** In-repo e2e fixture — loaded via Vite ?raw so no network host is required. */
import fixtureXml from '../../../../e2e/fixtures/minimal-export.xml?raw';

export function OverviewPage() {
  const { status, error, summary, sourceLabel, loadXml, clear } =
    useHealthStore();
  const [busy, setBusy] = useState(false);

  const loadFixture = useCallback(() => {
    setBusy(true);
    try {
      loadXml(fixtureXml, 'e2e/fixtures/minimal-export.xml');
    } finally {
      setBusy(false);
    }
  }, [loadXml]);

  return (
    <div className="stack" data-testid="page-overview">
      <div>
        <h1 className="page-title">总览</h1>
        <p className="page-lead">
          双轨预览：通过 HealthCoreAdapter 调用现有 @health-analyzer/lib，不在
          React 内重写解析/统计内核。生产默认入口仍是 legacy PWA（web-ui/public）。
        </p>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={loadFixture}
          disabled={busy || status === 'loading'}
          data-testid="load-fixture"
        >
          {status === 'loading' ? '分析中…' : '加载演示夹具'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={clear}
          disabled={status === 'idle'}
        >
          清除
        </button>
        {sourceLabel ? (
          <span className="badge" data-testid="source-label">
            来源 {sourceLabel}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="status-err" role="alert" data-testid="analyze-error">
          {error}
        </p>
      ) : null}

      {!summary ? (
        <div className="card">
          <h2>尚未加载数据</h2>
          <p>
            点击「加载演示夹具」将对 minimal-export.xml 运行 parseHealthXml +
            analyzeAll，并展示与 legacy 路径一致的摘要字段。
          </p>
        </div>
      ) : (
        <>
          <div className="card-grid">
            <div className="card">
              <h3>日期范围</h3>
              <p className="kpi" data-testid="kpi-range">
                {summary.dateRange.start || '—'} → {summary.dateRange.end || '—'}
              </p>
            </div>
            <div className="card">
              <h3>CGM 均值</h3>
              <p className="kpi" data-testid="kpi-cgm">
                {summary.kpis.cgmMean != null
                  ? summary.kpis.cgmMean.toFixed(2)
                  : '—'}
              </p>
              <p className="muted">{summary.counts.cgm} 点</p>
            </div>
            <div className="card">
              <h3>最近体重</h3>
              <p className="kpi" data-testid="kpi-weight">
                {summary.kpis.weightLatest != null
                  ? summary.kpis.weightLatest.toFixed(2)
                  : '—'}
              </p>
              <p className="muted">{summary.counts.weight} 条</p>
            </div>
            <div className="card">
              <h3>最近步数</h3>
              <p className="kpi" data-testid="kpi-steps">
                {summary.kpis.stepsLatest != null
                  ? String(summary.kpis.stepsLatest)
                  : '—'}
              </p>
              <p className="muted">{summary.counts.stepsDays} 天</p>
            </div>
          </div>

          <div className="card">
            <h2>域存在性</h2>
            <div className="row" style={{ marginTop: '0.75rem' }}>
              {Object.entries(summary.domainPresence).map(([k, v]) => (
                <span
                  key={k}
                  className="badge"
                  data-domain={k}
                  data-present={v ? '1' : '0'}
                >
                  {k}: {v ? '有' : '无'}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
