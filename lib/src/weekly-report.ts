/**
 * 一键周报 Markdown 导出（中英，非诊断）
 */

import { FullAnalysis, UserContext, WorkoutSession } from './types';
import { buildInsightBullets } from './insights';
import { detectCrossSignals } from './signals';
import { formatUserContext } from './prompts/llm-prompt';
import { AppLocale, createL, normalizeLocale } from './locale';

export type WeeklyReportOptions = { locale?: AppLocale | string };

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
 * @param options.locale 'zh-CN' | 'en'（默认 zh-CN）
 */
export function generateWeeklyReportMarkdown(
  analysis: FullAnalysis,
  userContext?: UserContext | null,
  options?: WeeklyReportOptions
): string {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const end = analysis.dateRange?.end || '';
  const start = end ? weekStartFromEnd(end) : analysis.dateRange?.start || '';
  const lines: string[] = [];

  const toneLabel = (tone: string): string => {
    if (tone === 'alert') return L('需关注', 'Attention');
    if (tone === 'watch') return L('留意', 'Watch');
    if (tone === 'positive') return L('偏积极', 'Positive');
    return L('中性', 'Neutral');
  };

  const severityLabel = (sev: string): string => {
    if (sev === 'alert') return L('警报', 'Alert');
    if (sev === 'watch') return L('留意', 'Watch');
    return L('信息', 'Info');
  };

  lines.push(L('# 本周健康监测周报', '# Weekly Health Monitoring Report'));
  lines.push(``);
  lines.push(
    end
      ? L(
          `**报告窗口**：${start} ~ ${end}（近 7 日，截止数据末日）`,
          `**Report window**: ${start} ~ ${end} (last 7 days, through data end date)`
        )
      : L(`**报告窗口**：数据日期范围不足`, `**Report window**: insufficient date range`)
  );
  lines.push(
    L(
      `**生成时间**：${analysis.generatedAt || new Date().toISOString()}`,
      `**Generated at**: ${analysis.generatedAt || new Date().toISOString()}`
    )
  );
  if (analysis.dateRange?.start && analysis.dateRange?.end) {
    lines.push(
      L(
        `**全量数据覆盖**：${analysis.dateRange.start} ~ ${analysis.dateRange.end}`,
        `**Full data coverage**: ${analysis.dateRange.start} ~ ${analysis.dateRange.end}`
      )
    );
  }
  lines.push(``);

  // 简短目录（锚点式标题列表，便于长文扫读）
  const hasEcg = !!(analysis.ecgStats && analysis.ecgStats.count > 0);
  const tocEcg = hasEcg ? ' · 📈 ECG' : '';
  lines.push(
    L(
      `> **目录** · 🧭 负荷与恢复 · 📋 监测摘要 · 🔗 关键跨维度信号 · 📊 本周数据速览 · 🏃 Workout 本周场次${tocEcg} · ⚠️ 边界声明`,
      `> **Contents** · 🧭 Load & Recovery · 📋 Monitoring summary · 🔗 Key cross-signals · 📊 Week snapshot · 🏃 Workouts this week${tocEcg} · ⚠️ Boundary / Disclaimer`
    )
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  const ctx = formatUserContext(userContext);
  if (ctx && ctx.trim()) {
    lines.push(ctx.trimEnd());
    lines.push(``);
  }

  // —— 负荷 / 恢复 ——
  lines.push(L(`## 🧭 负荷与恢复`, `## 🧭 Load & Recovery`));
  lines.push(``);
  const rw = analysis.recoveryWeek;
  if (rw) {
    lines.push(
      L(
        `> 启发式评分，非诊断；截止 **${rw.weekEnd}**。`,
        `> Heuristic score, not a diagnosis; through **${rw.weekEnd}**.`
      )
    );
    lines.push(``);
    lines.push(L(`| 项目 | 值 |`, `| Item | Value |`));
    lines.push(`|---|---|`);
    if (rw.recoveryScore != null) {
      lines.push(
        L(
          `| 恢复分 | **${rw.recoveryScore}** / 100 |`,
          `| Recovery score | **${rw.recoveryScore}** / 100 |`
        )
      );
    }
    if (rw.loadScore != null) {
      lines.push(
        L(
          `| 负荷分 | **${rw.loadScore}** / 100 |`,
          `| Load score | **${rw.loadScore}** / 100 |`
        )
      );
    }
    lines.push(
      L(
        `| 状态 | ${rw.statusLabel}（${toneLabel(rw.statusTone)}） |`,
        `| Status | ${rw.statusLabel} (${toneLabel(rw.statusTone)}) |`
      )
    );
    if (rw.baselineRecoveryMedian != null) {
      lines.push(
        L(
          `| 近几周恢复分中位 | ${rw.baselineRecoveryMedian} |`,
          `| Recent weeks recovery median | ${rw.baselineRecoveryMedian} |`
        )
      );
    }
    if (rw.vsBaselineDelta != null) {
      const sign = rw.vsBaselineDelta > 0 ? '+' : '';
      lines.push(
        L(
          `| 相对中位 | ${sign}${rw.vsBaselineDelta} |`,
          `| vs median | ${sign}${rw.vsBaselineDelta} |`
        )
      );
    }
    lines.push(``);
  } else {
    lines.push(
      L(
        `本周负荷/恢复数据不足，暂无法评分。`,
        `Insufficient load/recovery data this week to score.`
      )
    );
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);

  // —— 监测摘要 ——
  lines.push(L(`## 📋 监测摘要`, `## 📋 Monitoring summary`));
  lines.push(``);
  const bullets = buildInsightBullets(analysis, { locale });
  const coverageZh = '数据覆盖';
  const coverageEn = 'Data coverage';
  const topBullets = bullets
    .filter(
      (b) =>
        b.anchor !== 'overview' &&
        b.title !== coverageZh &&
        b.title !== coverageEn
    )
    .slice(0, 6);
  if (topBullets.length) {
    for (const b of topBullets) {
      lines.push(`- **[${toneLabel(b.tone)}] ${b.title}**：${b.detail}`);
    }
  } else {
    lines.push(
      L(
        `- 暂无足够数据生成摘要要点。`,
        `- Not enough data to generate summary bullets.`
      )
    );
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(``);

  // —— 跨维度信号 ——
  lines.push(L(`## 🔗 关键跨维度信号`, `## 🔗 Key cross-dimensional signals`));
  lines.push(``);
  const signals = detectCrossSignals(analysis, { locale }).slice(0, 5);
  if (signals.length) {
    for (const s of signals) {
      const datePart = s.date ? `（${s.date}）` : '';
      lines.push(
        `- **[${severityLabel(s.severity)}] ${s.title}**${datePart}：${s.detail}`
      );
    }
  } else {
    lines.push(
      L(
        `- 近窗内未触发跨维度启发式规则（不代表无健康风险）。`,
        `- No cross-dimensional heuristic rules fired in the recent window (does not mean no health risk).`
      )
    );
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(``);

  // —— 本周数据速览 ——
  lines.push(L(`## 📊 本周数据速览`, `## 📊 Week data snapshot`));
  lines.push(``);
  lines.push(L(`| 指标 | 近 7 日 |`, `| Metric | Last 7 days |`));
  lines.push(`|---|---|`);

  const hrv = rw?.hrvMean7d ?? null;
  const nightHr = rw?.nightHrMean7d ?? null;
  const exercise = rw?.exerciseMinMean7d ?? null;
  const sleep = rw?.sleepMean7d ?? null;
  const steps = rw?.stepsMean7d ?? null;
  const spo2Night = rw?.spo2NightMean7d ?? null;

  lines.push(
    L(
      `| HRV 日均 | ${hrv != null ? `${fmt(hrv, 1)} ms` : '—'} |`,
      `| HRV daily avg | ${hrv != null ? `${fmt(hrv, 1)} ms` : '—'} |`
    )
  );
  lines.push(
    L(
      `| 夜 HR | ${nightHr != null ? `${fmt(nightHr, 0)} bpm` : '—'} |`,
      `| Night HR | ${nightHr != null ? `${fmt(nightHr, 0)} bpm` : '—'} |`
    )
  );
  lines.push(
    L(
      `| 锻炼日均 | ${exercise != null ? `${fmt(exercise, 0)} min` : '—'} |`,
      `| Exercise daily avg | ${exercise != null ? `${fmt(exercise, 0)} min` : '—'} |`
    )
  );
  if (rw) {
    lines.push(
      L(
        `| Workout | ${rw.workoutCount7d} 场 / ${fmt(rw.workoutDuration7d, 0)} min |`,
        `| Workout | ${rw.workoutCount7d} sessions / ${fmt(rw.workoutDuration7d, 0)} min |`
      )
    );
  } else {
    const wos = analysis.workoutStats;
    lines.push(
      L(
        `| Workout | ${
          wos ? `${wos.count7d} 场 / ${fmt(wos.durationSum7d, 0)} min` : '—'
        } |`,
        `| Workout | ${
          wos ? `${wos.count7d} sessions / ${fmt(wos.durationSum7d, 0)} min` : '—'
        } |`
      )
    );
  }
  lines.push(
    L(
      `| 睡眠日均 | ${sleep != null ? `${fmt(sleep, 2)} h` : '—'} |`,
      `| Sleep daily avg | ${sleep != null ? `${fmt(sleep, 2)} h` : '—'} |`
    )
  );
  lines.push(
    L(
      `| 步数日均 | ${steps != null ? String(Math.round(steps)) : '—'} |`,
      `| Steps daily avg | ${steps != null ? String(Math.round(steps)) : '—'} |`
    )
  );
  lines.push(
    L(
      `| 血氧（夜） | ${spo2Night != null ? `${fmt(spo2Night, 1)}%` : '—'} |`,
      `| SpO₂ (night) | ${spo2Night != null ? `${fmt(spo2Night, 1)}%` : '—'} |`
    )
  );

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
    lines.push(
      L(
        `| 呼吸紊乱 | 近 7 日均 ${mean} / 最新 ${latest} |`,
        `| Breathing disturbance | 7d mean ${mean} / latest ${latest} |`
      )
    );
  } else {
    lines.push(L(`| 呼吸紊乱 | — |`, `| Breathing disturbance | — |`));
  }

  const weightStats = analysis.weightStats;
  if (weightStats?.latestTrend) {
    const lt = weightStats.latestTrend;
    let w = `${fmt(lt.weight, 1)} kg（${lt.date}）`;
    let wEn = `${fmt(lt.weight, 1)} kg (${lt.date})`;
    if (weightStats.bodyFatLatest != null) {
      w += `；体脂 ${fmt(weightStats.bodyFatLatest, 1)}%`;
      wEn += `; body fat ${fmt(weightStats.bodyFatLatest, 1)}%`;
    }
    lines.push(L(`| 体重（趋势） | ${w} |`, `| Weight (trend) | ${wEn} |`));
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(``);

  // —— Workout 场次 ——
  lines.push(L(`## 🏃 Workout 本周场次`, `## 🏃 Workouts this week`));
  lines.push(``);
  const weekSessions = sessionsInWeek(analysis.workoutStats?.sessions, end);
  if (weekSessions.length) {
    lines.push(
      L(
        `| 时间 | 类型 | 时长 min | 活动 kcal | 距离 km | 均 HR |`,
        `| Time | Type | Duration min | Active kcal | Distance km | Avg HR |`
      )
    );
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
    lines.push(L(`本周无 Workout 场次记录。`, `No Workout sessions recorded this week.`));
  }
  lines.push(``);

  // —— ECG ——
  const es = analysis.ecgStats;
  if (es && es.count > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## 📈 ECG`);
    lines.push(``);
    lines.push(
      L(
        `共 **${es.count}** 份（窦性 ${es.sinusCount} · 高心率 ${es.highHrCount} · 结果不佳 ${es.inconclusiveCount} · 其他 ${es.otherCount}）。`,
        `Total **${es.count}** (sinus ${es.sinusCount} · high HR ${es.highHrCount} · inconclusive ${es.inconclusiveCount} · other ${es.otherCount}).`
      )
    );
    if (es.latest) {
      lines.push(
        L(
          `最近：${es.latest.datetime} — **${es.latest.classification}**` +
            (es.latest.device ? `（${es.latest.device}）` : '') +
            '。',
          `Latest: ${es.latest.datetime} — **${es.latest.classification}**` +
            (es.latest.device ? ` (${es.latest.device})` : '') +
            '.'
        )
      );
    }
    if (es.highHrCount > 0) {
      const near = es.highHrNearWorkoutCount ?? 0;
      const rest = es.highHrRestingWindowCount ?? 0;
      lines.push(
        L(
          `高心率关联（启发式）：训练±2h ${near}/${es.highHrCount} · 非运动窗 ${rest}/${es.highHrCount}。`,
          `High-HR correlation (heuristic): workout ±2h ${near}/${es.highHrCount} · non-exercise window ${rest}/${es.highHrCount}.`
        )
      );
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);

  // —— 边界声明 ——
  lines.push(L(`## ⚠️ 边界声明`, `## ⚠️ Boundary / Disclaimer`));
  lines.push(``);
  lines.push(
    L(
      `- 本周报由程序自动汇总 Apple Health 等本地数据，**非医疗诊断**，不替代医生门诊。`,
      `- This weekly report is auto-aggregated from local Apple Health (and similar) data. It is **not a medical diagnosis** and does not replace clinical care.`
    )
  );
  lines.push(
    L(
      `- 负荷/恢复分为启发式评分；个人基线对照仅在样本周数足够时出现，波动可能来自睡眠、训练、疾病或测量误差。`,
      `- Load/recovery scores are heuristic. Personal baseline comparison appears only when enough sample weeks exist; swings may reflect sleep, training, illness, or measurement noise.`
    )
  );
  lines.push(
    L(
      `- CGM 为组织间液葡萄糖，异常低值须指尖血复核；血氧 / VO₂ 等为设备估算，单次异常优先复测并结合症状。`,
      `- CGM measures interstitial glucose — recheck abnormal lows with fingerstick. SpO₂ / VO₂ and similar are device estimates; retest single outliers and consider symptoms.`
    )
  );
  lines.push(
    L(
      `- 所有用药与治疗调整请遵医嘱。`,
      `- Any medication or treatment changes must follow clinical advice.`
    )
  );
  lines.push(``);

  return lines.join('\n');
}
