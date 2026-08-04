import { useState } from 'react';
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
import { useLocale } from '../../i18n/LocaleProvider';
import { Button } from '../../components/ui/Button';

type Signal = {
  id: string;
  title: string;
  body: string;
  tone: 'ok' | 'watch' | 'alert' | 'neutral';
};

const PREVIEW_COUNT = 3;

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
  const { t } = useLocale();
  const signals = buildSignals(summary);
  const [expanded, setExpanded] = useState(false);
  const [listRef] = useAutoAnimate<HTMLUListElement>();
  const visible =
    expanded || signals.length <= PREVIEW_COUNT
      ? signals
      : signals.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, signals.length - PREVIEW_COUNT);

  return (
    <section
      id="priority-signals"
      className="signal-list signal-list-linked card-level-signal"
      data-testid="signal-list"
      aria-label="signals"
    >
      <div className="signal-list-head">
        <p className="signal-list-kicker muted">{t('overview.signals.kicker')}</p>
        <h2 className="section-title">{t('overview.signals.title')}</h2>
      </div>
      <ul className="signal-list-ul" ref={listRef}>
        {visible.map((s, i) => (
          <li
            key={s.id}
            className={`signal-item signal-${s.tone}${i === 0 ? ' signal-item-lead' : ''}`}
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
      {hiddenCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="signal-list-expand"
          data-testid="signal-list-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t('overview.signals.collapse')
            : t('overview.signals.expand').replace(
                '{n}',
                String(signals.length),
              )}
        </Button>
      ) : null}
    </section>
  );
}
