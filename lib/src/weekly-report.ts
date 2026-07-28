/**
 * 一键周报 Markdown 导出（中文，非诊断）
 */

import { FullAnalysis, UserContext, WorkoutSession } from './types';
import { buildInsightBullets } from './insights';
import { detectCrossSignals } from './signals';
import { formatUserContext } from './prompts/llm-prompt';

function addDaysIso(date: string, deltaDays: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function toneLabel(tone: string): string {
  if (tone === 'alert') return '需关注';
  if (tone === 'watch') return '留意';
  if (tone === 'positive') return '偏积极';
  return '中性';
}

function severityLabel(sev: string): string {
  if (sev === 'alert') return '警报';
  if (sev === 'watch') return '留意';
  return '信息';
}

function weekStartFromEnd(end: string): string {
  return addDaysIso(end, -6);
}

function sessionsInWeek(sessions: WorkoutSession[] | undefined, end: string): WorkoutSession[] {
  if (!sessions?.length) return [];
  const start = weekStartFromEnd(end);
  return sessions
    .filter((s) => s.date >= start && s.date <= end)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

/**
 * 生成近 7 日周报 Markdown（相对 dateRange.end）。
 * 纯函数，无副作用。
 */
export function generateWeeklyReportMarkdown(
  analysis: FullAnalysis,
  userContext?: UserContext | null
): string {
  const end = analysis.dateRange?.end || '';
  const start = end ? weekStartFromEnd(end) : analysis.dateRange?.start || '';
  const lines: string[] = [];

  lines.push(`# 本周健康监测周报`);
  lines.push(``);
  lines.push(
    end
      ? `**报告窗口**：${start} ~ ${end}（近 7 日，截止数据末日）`
      : `**报告窗口**：数据日期范围不足`
  );
  lines.push(`**生成时间**：${analysis.generatedAt || new Date().toISOString()}`);
  if (analysis.dateRange?.start && analysis.dateRange?.end) {
    lines.push(
      `**全量数据覆盖**：${analysis.dateRange.start} ~ ${analysis.dateRange.end}`
    );
  }
  lines.push(``);

  const ctx = formatUserContext(userContext);
  if (ctx && ctx.trim()) {
    lines.push(ctx.trimEnd());
    lines.push(``);
  }

  // —— 负荷 / 恢复 ——
  lines.push(`## 负荷与恢复`);
  lines.push(``);
  const rw = analysis.recoveryWeek;
  if (rw) {
    lines.push(`> 启发式评分，非诊断；截止 **${rw.weekEnd}**。`);
    lines.push(``);
    lines.push(`| 项目 | 值 |`);
    lines.push(`|---|---|`);
    if (rw.recoveryScore != null) lines.push(`| 恢复分 | **${rw.recoveryScore}** / 100 |`);
    if (rw.loadScore != null) lines.push(`| 负荷分 | **${rw.loadScore}** / 100 |`);
    lines.push(`| 状态 | ${rw.statusLabel}（${toneLabel(rw.statusTone)}） |`);
    if (rw.baselineRecoveryMedian != null) {
      lines.push(`| 近几周恢复分中位 | ${rw.baselineRecoveryMedian} |`);
    }
    if (rw.vsBaselineDelta != null) {
      const sign = rw.vsBaselineDelta > 0 ? '+' : '';
      lines.push(`| 相对中位 | ${sign}${rw.vsBaselineDelta} |`);
    }
    lines.push(``);
  } else {
    lines.push(`本周负荷/恢复数据不足，暂无法评分。`);
    lines.push(``);
  }

  // —— 监测摘要 ——
  lines.push(`## 监测摘要`);
  lines.push(``);
  const bullets = buildInsightBullets(analysis);
  // 优先非「数据覆盖」类，取前 6 条
  const topBullets = bullets
    .filter((b) => b.title !== '数据覆盖')
    .slice(0, 6);
  if (topBullets.length) {
    for (const b of topBullets) {
      lines.push(`- **[${toneLabel(b.tone)}] ${b.title}**：${b.detail}`);
    }
  } else {
    lines.push(`- 暂无足够数据生成摘要要点。`);
  }
  lines.push(``);

  // —— 跨维度信号 ——
  lines.push(`## 关键跨维度信号`);
  lines.push(``);
  const signals = detectCrossSignals(analysis).slice(0, 5);
  if (signals.length) {
    for (const s of signals) {
      const datePart = s.date ? `（${s.date}）` : '';
      lines.push(
        `- **[${severityLabel(s.severity)}] ${s.title}**${datePart}：${s.detail}`
      );
    }
  } else {
    lines.push(`- 近窗内未触发跨维度启发式规则（不代表无健康风险）。`);
  }
  lines.push(``);

  // —— 本周数据速览 ——
  lines.push(`## 本周数据速览`);
  lines.push(``);
  lines.push(`| 指标 | 近 7 日 |`);
  lines.push(`|---|---|`);

  const hrv = rw?.hrvMean7d ?? null;
  const nightHr = rw?.nightHrMean7d ?? null;
  const exercise = rw?.exerciseMinMean7d ?? null;
  const sleep = rw?.sleepMean7d ?? null;
  const steps = rw?.stepsMean7d ?? null;
  const spo2Night = rw?.spo2NightMean7d ?? null;

  lines.push(`| HRV 日均 | ${hrv != null ? `${fmt(hrv, 1)} ms` : '—'} |`);
  lines.push(`| 夜 HR | ${nightHr != null ? `${fmt(nightHr, 0)} bpm` : '—'} |`);
  lines.push(`| 锻炼日均 | ${exercise != null ? `${fmt(exercise, 0)} min` : '—'} |`);
  if (rw) {
    lines.push(
      `| Workout | ${rw.workoutCount7d} 场 / ${fmt(rw.workoutDuration7d, 0)} min |`
    );
  } else {
    const wos = analysis.workoutStats;
    lines.push(
      `| Workout | ${
        wos ? `${wos.count7d} 场 / ${fmt(wos.durationSum7d, 0)} min` : '—'
      } |`
    );
  }
  lines.push(`| 睡眠日均 | ${sleep != null ? `${fmt(sleep, 2)} h` : '—'} |`);
  lines.push(`| 步数日均 | ${steps != null ? String(Math.round(steps)) : '—'} |`);
  lines.push(`| 血氧（夜） | ${spo2Night != null ? `${fmt(spo2Night, 1)}%` : '—'} |`);

  const ws = analysis.watchStats;
  if (ws?.breathingDisturbanceMean7d != null || ws?.breathingDisturbanceLatest != null) {
    const mean =
      ws.breathingDisturbanceMean7d != null
        ? fmt(ws.breathingDisturbanceMean7d, 2)
        : '—';
    const latest =
      ws.breathingDisturbanceLatest != null
        ? fmt(ws.breathingDisturbanceLatest, 2)
        : '—';
    lines.push(`| 呼吸紊乱 | 近 7 日均 ${mean} / 最新 ${latest} |`);
  } else {
    lines.push(`| 呼吸紊乱 | — |`);
  }

  const weightStats = analysis.weightStats;
  if (weightStats?.latestTrend) {
    const lt = weightStats.latestTrend;
    let w = `${fmt(lt.weight, 1)} kg（${lt.date}）`;
    if (weightStats.bodyFatLatest != null) {
      w += `；体脂 ${fmt(weightStats.bodyFatLatest, 1)}%`;
    }
    lines.push(`| 体重（趋势） | ${w} |`);
  }
  lines.push(``);

  // —— Workout 场次 ——
  lines.push(`## Workout 本周场次`);
  lines.push(``);
  const weekSessions = sessionsInWeek(analysis.workoutStats?.sessions, end);
  if (weekSessions.length) {
    lines.push(`| 时间 | 类型 | 时长 min | 活动 kcal | 距离 km | 均 HR |`);
    lines.push(`|---|---|---:|---:|---:|---:|`);
    for (const s of weekSessions) {
      const label = s.activityLabel || s.activityType || '—';
      lines.push(
        `| ${String(s.startDate).slice(0, 16)} | ${label} | ${fmt(s.durationMin, 1)} | ${
          s.activeKcal != null ? fmt(s.activeKcal, 0) : '—'
        } | ${s.distanceKm != null ? fmt(s.distanceKm, 2) : '—'} | ${
          s.hrAvg != null ? fmt(s.hrAvg, 0) : '—'
        } |`
      );
    }
  } else {
    lines.push(`本周无 Workout 场次记录。`);
  }
  lines.push(``);

  // —— ECG ——
  const es = analysis.ecgStats;
  if (es && es.count > 0) {
    lines.push(`## ECG`);
    lines.push(``);
    lines.push(
      `共 **${es.count}** 份（窦性 ${es.sinusCount} · 高心率 ${es.highHrCount} · 结果不佳 ${es.inconclusiveCount} · 其他 ${es.otherCount}）。`
    );
    if (es.latest) {
      lines.push(
        `最近：${es.latest.datetime} — **${es.latest.classification}**` +
          (es.latest.device ? `（${es.latest.device}）` : '') +
          '。'
      );
    }
    if (es.highHrCount > 0) {
      const near = es.highHrNearWorkoutCount ?? 0;
      const rest = es.highHrRestingWindowCount ?? 0;
      lines.push(
        `高心率关联（启发式）：训练±2h ${near}/${es.highHrCount} · 非运动窗 ${rest}/${es.highHrCount}。`
      );
    }
    lines.push(``);
  }

  // —— 边界声明 ——
  lines.push(`## 边界声明`);
  lines.push(``);
  lines.push(
    `- 本周报由程序自动汇总 Apple Health 等本地数据，**非医疗诊断**，不替代医生门诊。`
  );
  lines.push(
    `- 负荷/恢复分为启发式评分；个人基线对照仅在样本周数足够时出现，波动可能来自睡眠、训练、疾病或测量误差。`
  );
  lines.push(
    `- CGM 为组织间液葡萄糖，异常低值须指尖血复核；血氧 / VO₂ 等为设备估算，单次异常优先复测并结合症状。`
  );
  lines.push(`- 所有用药与治疗调整请遵医嘱。`);
  lines.push(``);

  return lines.join('\n');
}
