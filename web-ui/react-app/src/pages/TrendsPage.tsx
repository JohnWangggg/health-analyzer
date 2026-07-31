import { useHealthStore } from '../store/useHealthStore';

export function TrendsPage() {
  const summary = useHealthStore((s) => s.summary);

  return (
    <div className="stack" data-testid="page-trends">
      <div>
        <h1 className="page-title">趋势</h1>
        <p className="page-lead">
          占位工作区路由。完整趋势图（ECharts）迁移属后续阶段；此处仅展示适配器摘要中的时间序列计数。
        </p>
      </div>
      <div className="card-grid">
        <div className="card">
          <h3>HRV 天数</h3>
          <p className="kpi">{summary?.counts.hrvDays ?? '—'}</p>
        </div>
        <div className="card">
          <h3>睡眠天数</h3>
          <p className="kpi">{summary?.counts.sleepDays ?? '—'}</p>
        </div>
        <div className="card">
          <h3>步数天数</h3>
          <p className="kpi">{summary?.counts.stepsDays ?? '—'}</p>
        </div>
        <div className="card">
          <h3>CGM 点数</h3>
          <p className="kpi">{summary?.counts.cgm ?? '—'}</p>
        </div>
      </div>
    </div>
  );
}
