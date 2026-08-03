import {
  Activity,
  AlertTriangle,
  Droplets,
  Footprints,
  Moon,
  Sparkles,
} from 'lucide-react';
import type { AnalysisSummary } from '../../core/HealthCoreAdapter';
import { useAutoAnimate } from '../../motion/useAutoAnimate';

type Signal = {
  id: string;
  title: string;
  body: string;
  tone: 'ok' | 'watch' | 'alert' | 'neutral';
};

function buildSignals(summary: AnalysisSummary): Signal[] {
  const out: Signal[] = [];
  const { kpis, counts, domainPresence, freshnessDays } = summary;

  if (freshnessDays != null && freshnessDays > 7) {
    out.push({
      id: 'stale',
      title: '数据偏旧',
      body: `分析截止 ${summary.dateRange.end || '—'}，建议重新导入导出包。`,
      tone: 'watch',
    });
  }

  if (domainPresence.cgm && kpis.cgmMean != null) {
    out.push({
      id: 'cgm',
      title: '血糖覆盖',
      body: `均值 ${kpis.cgmMean.toFixed(2)} · ${counts.cgm} 点（会话内）`,
      tone: 'ok',
    });
  }

  if (domainPresence.steps && kpis.stepsLatest != null) {
    out.push({
      id: 'steps',
      title: '最近步数',
      body: `${kpis.stepsLatest} · 共 ${counts.stepsDays} 天有记录`,
      tone: 'ok',
    });
  }

  if (domainPresence.sleep) {
    out.push({
      id: 'sleep',
      title: '睡眠',
      body: `${counts.sleepDays} 天有睡眠汇总`,
      tone: 'neutral',
    });
  }

  if (domainPresence.workouts) {
    out.push({
      id: 'workouts',
      title: '训练记录',
      body: '会话含训练数据，可在趋势中查看活动相关序列',
      tone: 'ok',
    });
  }

  if (kpis.recoveryScore != null && kpis.recoveryScore < 40) {
    out.push({
      id: 'recovery-low',
      title: '恢复分偏低',
      body: '启发式提示优先睡眠与减负（非诊断）。',
      tone: 'watch',
    });
  }

  if (!out.length) {
    out.push({
      id: 'ready',
      title: '本机会话已就绪',
      body: '可打开趋势查看序列，或导出门诊/周报。',
      tone: 'ok',
    });
  }

  return out.slice(0, 5);
}

function SignalIcon({ id, tone }: { id: string; tone: Signal['tone'] }) {
  const size = 16;
  if (id === 'stale' || tone === 'watch' || tone === 'alert') {
    return <AlertTriangle size={size} aria-hidden />;
  }
  if (id === 'cgm') return <Droplets size={size} aria-hidden />;
  if (id === 'steps') return <Footprints size={size} aria-hidden />;
  if (id === 'sleep') return <Moon size={size} aria-hidden />;
  if (id === 'workouts') return <Activity size={size} aria-hidden />;
  return <Sparkles size={size} aria-hidden />;
}

export function SignalList({ summary }: { summary: AnalysisSummary }) {
  const signals = buildSignals(summary);
  const [listRef] = useAutoAnimate<HTMLUListElement>();

  return (
    <section
      className="signal-list"
      data-testid="signal-list"
      aria-label="signals"
    >
      <h2 className="section-title">信号与线索</h2>
      <ul className="signal-list-ul" ref={listRef}>
        {signals.map((s) => (
          <li
            key={s.id}
            className={`signal-item signal-${s.tone}`}
            data-signal={s.id}
          >
            <span className="signal-item-icon">
              <SignalIcon id={s.id} tone={s.tone} />
            </span>
            <span className="signal-item-body">
              <strong>{s.title}</strong>
              <span className="muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
