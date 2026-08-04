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
  /** Scroll target for “why / evidence” (signals). */
  signalsHref?: string;
  signalsLabel?: string;
};

/**
 * Today health status band — recovery ring + priority action.
 * Links narrative to signals list below.
 */
export function StatusBand({
  summary,
  priorityTitle,
  priorityDetail,
  priorityTone,
  freshnessText,
  freshnessTone,
  signalsHref = '#priority-signals',
  signalsLabel = '查看依据与线索',
}: Props) {
  const score = summary.kpis.recoveryScore;
  const load = summary.kpis.loadScore;
  const sub = `负荷 ${load != null ? Math.round(load) : '—'} · 非诊断`;

  return (
    <section className="status-band card-level-hero" data-testid="status-band">
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
        <a
          className="status-band-link"
          href={signalsHref}
          data-testid="priority-to-signals"
        >
          {signalsLabel}
          <span aria-hidden className="status-band-link-arrow">
            ↓
          </span>
        </a>
      </div>
      <div className="status-band-rail" aria-hidden />
    </section>
  );
}
