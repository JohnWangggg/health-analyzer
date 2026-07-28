/**
 * 自动监测摘要：把统计压成 3–6 条人话要点（非诊断）
 */

import { FullAnalysis } from './types';
import { detectCrossSignals } from './signals';

export type InsightTone = 'positive' | 'neutral' | 'watch' | 'alert';

/** 前端跳转目标：section 或 section+panel */
export type InsightAnchor =
  | 'overview'
  | 'summary'
  | 'summary-weight'
  | 'summary-cgm'
  | 'summary-bp'
  | 'summary-hrv'
  | 'summary-watch'
  | 'summary-workout'
  | 'signals'
  | 'charts'
  | 'charts-weight'
  | 'charts-cgm'
  | 'charts-spo2'
  | 'charts-activity'
  | 'prompt';

export interface InsightBullet {
  tone: InsightTone;
  title: string;
  detail: string;
  /** 点击摘要时滚动/展开的目标 */
  anchor?: InsightAnchor;
}

function toneFromSeverity(sev: string): InsightTone {
  if (sev === 'alert') return 'alert';
  if (sev === 'watch') return 'watch';
  return 'neutral';
}

/**
 * 基于当前分析生成有优先级的监测摘要
 */
export function buildInsightBullets(analysis: FullAnalysis): InsightBullet[] {
  const bullets: InsightBullet[] = [];
  const data = analysis.data;
  const range = analysis.dateRange;

  if (range?.start && range?.end) {
    bullets.push({
      tone: 'neutral',
      title: '数据覆盖',
      detail: `本次可用记录约 ${range.start} 至 ${range.end}。完整明细默认只在本页内存，刷新需重新上传。`,
      anchor: 'overview',
    });
  }

  // 体重趋势
  const ws = analysis.weightStats;
  if (ws?.latestTrend && ws.earliestTrend) {
    const delta = ws.latestTrend.weight - ws.earliestTrend.weight;
    const fat =
      ws.bodyFatLatest != null
        ? `；体脂约 ${ws.bodyFatLatest.toFixed(1)}%`
        : '';
    const tone: InsightTone =
      delta <= -8 ? 'watch' : delta <= -2 ? 'neutral' : delta >= 2 ? 'watch' : 'positive';
    bullets.push({
      tone,
      title: '体重趋势（晨起）',
      detail: `最新趋势 ${ws.latestTrend.weight.toFixed(1)} kg（${ws.latestTrend.date}），相对最早 ${ws.earliestTrend.weight.toFixed(1)} kg 变化 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg${fat}。趋势按每日晨起重，避免晚间波动干扰。`,
      anchor: 'summary-weight',
    });
  }

  // CGM：优先稳定期
  if (analysis.cgmStats) {
    const st = analysis.cgmStats.stable || analysis.cgmStats.overall;
    const fd = analysis.cgmStats.firstDay;
    let tone: InsightTone = 'positive';
    if (st.pctBelow30 > 0) tone = 'alert';
    else if (st.pctBelow39 >= 5) tone = 'watch';
    else if (st.pctInRange >= 90 && st.pctAbove78 < 5) tone = 'positive';
    else tone = 'neutral';

    let detail = `稳定期/可用段均值 ${st.mean.toFixed(2)} mmol/L，TIR ${st.pctInRange.toFixed(1)}%，<3.9 占 ${st.pctBelow39.toFixed(1)}%（n=${st.count}）。`;
    if (fd && analysis.cgmStats.firstDayDate && fd.pctBelow39 >= 10) {
      detail += ` 首日 ${analysis.cgmStats.firstDayDate} 低值偏多（<3.9 ${fd.pctBelow39.toFixed(1)}%），解读请以稳定期为准并指尖血复核可疑时段。`;
      if (tone === 'positive') tone = 'neutral';
    }
    bullets.push({ tone, title: '血糖（CGM）', detail, anchor: 'summary-cgm' });
  }

  // 血压晨晚
  if (analysis.bpStats?.mean7d) {
    const m = analysis.bpStats.mean7d;
    const morn = analysis.bpStats.morning7d;
    const eve = analysis.bpStats.evening7d;
    let tone: InsightTone = 'neutral';
    if (m.lowCount >= 3 || m.systolic < 95) tone = 'watch';
    else if (m.systolic >= 130 || m.diastolic >= 85) tone = 'watch';
    else if (m.systolic >= 100 && m.systolic < 120 && m.lowCount === 0) tone = 'positive';

    let detail = `近 7 日全天均值约 ${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)} mmHg（${m.count} 条`;
    if (m.lowCount) detail += `，其中 ${m.lowCount} 条 <90/60`;
    detail += '）。';
    if (morn && eve) {
      detail += ` 晨间约 ${morn.systolic.toFixed(0)}/${morn.diastolic.toFixed(0)}，晚间约 ${eve.systolic.toFixed(0)}/${eve.diastolic.toFixed(0)}。`;
    }
    bullets.push({ tone, title: '血压', detail, anchor: 'summary-bp' });
  }

  // 恢复：HRV + RHR 近 7 日
  const hrvDates = Object.keys(analysis.hrvByDate || {}).sort();
  if (hrvDates.length) {
    const recent = hrvDates.slice(-7);
    const hrvVals = recent
      .map((d) => analysis.hrvByDate[d].allMean)
      .filter(Number.isFinite);
    const rhrMap = analysis.restingHrByDate || data.restingHr || {};
    const rhrRecent = Object.keys(rhrMap)
      .sort()
      .slice(-7)
      .map((d) => rhrMap[d])
      .filter(Number.isFinite);
    if (hrvVals.length) {
      const hrvAvg = hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length;
      const rhrAvg = rhrRecent.length
        ? rhrRecent.reduce((a, b) => a + b, 0) / rhrRecent.length
        : null;
      let tone: InsightTone = 'neutral';
      if (hrvAvg < 25 && rhrAvg != null && rhrAvg >= 85) tone = 'watch';
      else if (hrvAvg >= 35 && (rhrAvg == null || rhrAvg < 75)) tone = 'positive';
      bullets.push({
        tone,
        title: '恢复（HRV / 静息心率）',
        detail:
          `近 7 日 HRV 全天均值约 ${hrvAvg.toFixed(1)} ms` +
          (rhrAvg != null ? `，静息心率约 ${rhrAvg.toFixed(0)} bpm` : '') +
          '。数值受睡眠、训练与疾病影响，单日波动不必过度解读。',
        anchor: 'summary-hrv',
      });
    }
  }

  // Watch 活动 / 血氧 / VO2
  const wsWatch = analysis.watchStats;
  if (wsWatch && wsWatch.dayCount > 0) {
    if (wsWatch.exerciseMinMean7d != null || wsWatch.activeKcalMean7d != null) {
      const ex = wsWatch.exerciseMinMean7d;
      const kcal = wsWatch.activeKcalMean7d;
      let tone: InsightTone = 'neutral';
      if (ex != null && ex >= 20) tone = 'positive';
      else if (ex != null && ex < 5) tone = 'watch';
      bullets.push({
        tone,
        title: 'Watch 活动',
        detail:
          `近 7 日日均锻炼约 ${ex != null ? ex.toFixed(0) : '—'} 分钟` +
          (kcal != null ? `，活动消耗约 ${kcal.toFixed(0)} kcal` : '') +
          '。低活动日可与睡眠/HRV 对照，避免过度解读单日。',
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.spo2Mean7d != null) {
      let tone: InsightTone = 'positive';
      if (
        (wsWatch.spo2NightMin7d != null && wsWatch.spo2NightMin7d < 92) ||
        (wsWatch.spo2Min7d != null && wsWatch.spo2Min7d < 92)
      ) {
        tone = 'watch';
      } else if (wsWatch.spo2Mean7d < 95) tone = 'watch';
      const nightBit =
        wsWatch.spo2NightMean7d != null
          ? `；夜段均 ${wsWatch.spo2NightMean7d.toFixed(1)}%` +
            (wsWatch.spo2NightMin7d != null
              ? `（最低 ${wsWatch.spo2NightMin7d.toFixed(1)}%）`
              : '')
          : '';
      const dayBit =
        wsWatch.spo2DayMean7d != null
          ? `，日段均 ${wsWatch.spo2DayMean7d.toFixed(1)}%`
          : '';
      bullets.push({
        tone,
        title: '血氧（Watch）',
        detail:
          `近 7 日血氧均值约 ${wsWatch.spo2Mean7d.toFixed(1)}%` +
          (wsWatch.spo2Min7d != null ? `，期间最低约 ${wsWatch.spo2Min7d.toFixed(1)}%` : '') +
          nightBit +
          dayBit +
          `（${wsWatch.spo2DayCount} 天有样本）。低值需结合症状，勿单次定论。`,
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.vo2Latest != null) {
      const delta = wsWatch.vo2Delta;
      bullets.push({
        tone: delta != null && delta <= -2 ? 'watch' : 'neutral',
        title: '心肺适能 VO₂ max',
        detail:
          `最新约 ${wsWatch.vo2Latest.toFixed(1)} mL/kg/min` +
          (wsWatch.vo2Earliest != null
            ? `（相对最早 ${wsWatch.vo2Earliest.toFixed(1)}，变化 ${delta != null && delta >= 0 ? '+' : ''}${delta?.toFixed(1)}）`
            : '') +
          `，共 ${wsWatch.vo2DayCount} 天有估算。Apple 估算值仅供趋势参考。`,
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.nightHrMean7d != null) {
      bullets.push({
        tone: wsWatch.nightHrMean7d >= 80 ? 'watch' : 'neutral',
        title: '夜间心率',
        detail: `近 7 日 0–6 点心率均值约 ${wsWatch.nightHrMean7d.toFixed(0)} bpm（由 Watch 连续心率抽样汇总）。可与静息心率、睡眠对照。`,
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.rrMean7d != null) {
      bullets.push({
        tone: wsWatch.rrMean7d >= 20 || wsWatch.rrMean7d < 10 ? 'watch' : 'neutral',
        title: '呼吸频率',
        detail: `近 7 日呼吸频率日均约 ${wsWatch.rrMean7d.toFixed(1)} 次/分（Watch 睡眠/静息采样）。显著偏离习惯基线时结合症状观察。`,
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.wristTempMean7d != null) {
      bullets.push({
        tone: 'neutral',
        title: '睡眠腕温',
        detail: `近 7 日睡眠腕温日均约 ${wsWatch.wristTempMean7d.toFixed(2)} °C。Apple 腕温多为相对偏差用途，适合看自身趋势而非绝对体温。`,
        anchor: 'summary-watch',
      });
    }
  }

  // Workout 会话
  const wos = analysis.workoutStats;
  if (wos && wos.count > 0) {
    const top = wos.byType.slice(0, 3).map((t) => `${t.activityType}×${t.count}`).join('、');
    const last = wos.lastSession;
    let tone: InsightTone = 'neutral';
    if (wos.count30d >= 8) tone = 'positive';
    else if (wos.count30d === 0) tone = 'watch';
    bullets.push({
      tone,
      title: 'Workout 训练',
      detail:
        `共 ${wos.count} 场` +
        (wos.count30d ? `，近 30 日 ${wos.count30d} 场 / 共 ${wos.durationSum30d.toFixed(0)} min` : '') +
        (wos.count7d ? `，近 7 日 ${wos.count7d} 场` : '') +
        (top ? `；类型 ${top}` : '') +
        (last
          ? `。最近：${last.date} ${last.activityType} ${last.durationMin.toFixed(0)} min` +
            (last.hrAvg != null ? `，均 HR ${last.hrAvg.toFixed(0)}` : '')
          : '') +
        '。',
      anchor: 'summary-workout',
    });
  }

  // 并入跨维度信号（高优先级）
  const signals = detectCrossSignals(analysis);
  for (const s of signals.slice(0, 4)) {
    if (s.severity === 'info' && bullets.length >= 6) continue;
    bullets.push({
      tone: toneFromSeverity(s.severity),
      title: s.title,
      detail: s.detail,
      anchor: 'signals',
    });
  }

  // 去重 title
  const seen = new Set<string>();
  const unique: InsightBullet[] = [];
  for (const b of bullets) {
    if (seen.has(b.title)) continue;
    seen.add(b.title);
    unique.push(b);
  }

  // 排序：alert > watch > positive/neutral，保留数据覆盖在前两条附近
  const rank: Record<InsightTone, number> = {
    alert: 0,
    watch: 1,
    positive: 3,
    neutral: 2,
  };
  const head = unique.filter((b) => b.title === '数据覆盖');
  const rest = unique
    .filter((b) => b.title !== '数据覆盖')
    .sort((a, b) => rank[a.tone] - rank[b.tone]);
  return [...head, ...rest].slice(0, 7);
}

export function formatInsightsForLLM(bullets: InsightBullet[]): string {
  if (!bullets.length) return '';
  const lines = [
    '## 自动监测摘要（程序生成，非诊断）',
    '',
  ];
  bullets.forEach((b, i) => {
    const tag =
      b.tone === 'alert'
        ? '需关注'
        : b.tone === 'watch'
          ? '观察'
          : b.tone === 'positive'
            ? '积极'
            : '提示';
    lines.push(`${i + 1}. **[${tag}] ${b.title}**：${b.detail}`);
  });
  lines.push('');
  lines.push('> 以下为分维度原始统计与明细，请与摘要交叉核对。');
  lines.push('');
  return lines.join('\n');
}

/**
 * 仅摘要短提示（适合上下文较短的模型，或先快速粘贴）
 * 可选 prefix 由 UI 拼入个人背景，避免与 llm-prompt 循环依赖。
 */
export function generateInsightsOnlyPrompt(
  analysis: FullAnalysis,
  options: { prefix?: string } = {}
): string {
  const bullets = buildInsightBullets(analysis);
  const body = formatInsightsForLLM(bullets)
    .replace('> 以下为分维度原始统计与明细，请与摘要交叉核对。\n\n', '')
    .trim();
  const lines = [
    '请基于以下「个人健康自我监测摘要」给出简洁中文建议（Markdown）：',
    '- 不下诊断、不开药、不替代门诊',
    '- 指出最值得优先关注的 3 点，并给出可操作的自我监测建议',
    '- 异常需提示复核（如 CGM 指尖血、血压复测）',
    '',
  ];
  if (options.prefix && options.prefix.trim()) {
    lines.push(options.prefix.trim());
    lines.push('');
  }
  lines.push(body || '（暂无摘要）');
  lines.push('');
  lines.push('（本段仅为程序摘要，非完整原始数据。需要完整统计请使用完整提示词。）');
  return lines.join('\n');
}
