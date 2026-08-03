import { Badge } from '../../components/ui/Badge';
import type { AnalysisSummary } from '../../core/HealthCoreAdapter';
import { RecoveryRing } from './RecoveryRing';

type Props = {
  summary: AnalysisSummary;
  priorityTitle: string;
  priorityDetail: string;
  priorityTone: 'ok' | 'watch' | 'alert' | 'accent';
  freshnessText: string;
  freshnessTone: 'ok' | 'watch' | 'alert' | 'neutral';
};

/**
 * Today health status band — recovery ring + priority action.
 * Presentational only; values come from adapter summary.
 */
export function StatusBand({
  summary,
  priorityTitle,
  priorityDetail,
  priorityTone,
  freshnessText,
  freshnessTone,
}: Props) {
  const score = summary.kpis.recoveryScore;
  const load = summary.kpis.loadScore;
  const sub = `负荷 ${load != null ? Math.round(load) : '—'} · 非诊断`;

  return (
    <section className="status-band" data-testid="status-band">
      <div className="status-band-score" data-testid="status-band-score">
        <RecoveryRing score={score} size={132} label="恢复分" sub={sub} />
      </div>
      <div className="status-band-main" data-testid="priority-card">
        <h2 className="status-band-kicker">优先关注</h2>
        <p className="status-band-title" data-testid="priority-title">
          {priorityTitle}
        </p>
        <p className="muted status-band-detail">{priorityDetail}</p>
        <div className="status-strip" style={{ marginTop: '0.65rem' }}>
          <Badge tone={priorityTone}>今日重点</Badge>
          <Badge tone={freshnessTone} data-testid="kpi-freshness">
            {freshnessText}
          </Badge>
          <Badge tone="neutral">
            {summary.dateRange.start || '—'} → {summary.dateRange.end || '—'}
          </Badge>
        </div>
      </div>
    </section>
  );
}
