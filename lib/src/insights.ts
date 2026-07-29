/**
 * 自动监测摘要：把统计压成 3–6 条人话要点（非诊断）
 */

import { FullAnalysis } from './types';
import { detectCrossSignals } from './signals';
import { AppLocale, createL, LocaleOptions, normalizeLocale } from './locale';
import { toTraditionalTitle } from './zh-tw-map';

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
  | 'summary-recovery'
  | 'summary-ecg'
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

export type { LocaleOptions };

function toneFromSeverity(sev: string): InsightTone {
  if (sev === 'alert') return 'alert';
  if (sev === 'watch') return 'watch';
  return 'neutral';
}

function meanOf(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 个人基线对比：近 7 日均值 vs 此前约 3–4 周中位数（有足够历史且 |delta| 有意义时出 bullet）
 */
function pushPersonalBaselineBullets(
  analysis: FullAnalysis,
  L: ReturnType<typeof createL>,
  bullets: InsightBullet[]
): void {
  // —— HRV：日序列优先；否则用 recoveryWeeks 周均 ——
  let hrvRecent: number | null = null;
  let hrvBaseline: number | null = null;
  const hrvByDate = analysis.hrvByDate || {};
  const hrvDates = Object.keys(hrvByDate).sort();
  if (hrvDates.length >= 21) {
    const recentVals = hrvDates
      .slice(-7)
      .map((d) => hrvByDate[d]?.allMean)
      .filter((v): v is number => v != null && Number.isFinite(v));
    // 排除近 7 日，取此前最多 28 天（约 4 周）
    const priorVals = hrvDates
      .slice(0, -7)
      .slice(-28)
      .map((d) => hrvByDate[d]?.allMean)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (recentVals.length >= 4 && priorVals.length >= 14) {
      hrvRecent = meanOf(recentVals);
      hrvBaseline = medianOf(priorVals);
    }
  }
  if (hrvRecent == null || hrvBaseline == null) {
    const weeks = (analysis.recoveryWeeks || []).filter(
      (w) => w.hrvMean7d != null && Number.isFinite(w.hrvMean7d)
    );
    if (weeks.length >= 5) {
      const last = weeks[weeks.length - 1];
      const prior = weeks.slice(-5, -1); // 此前最多 4 周
      hrvRecent = last.hrvMean7d;
      hrvBaseline = medianOf(prior.map((w) => w.hrvMean7d as number));
    }
  }
  if (hrvRecent != null && hrvBaseline != null && hrvBaseline > 0) {
    const delta = hrvRecent - hrvBaseline;
    const rel = Math.abs(delta) / hrvBaseline;
    // 有意义：绝对差 ≥5 ms 或相对 ≥10%
    if (Math.abs(delta) >= 5 || rel >= 0.1) {
      const up = delta > 0;
      bullets.push({
        tone: up ? 'positive' : 'watch',
        title: L('HRV 相对个人基线', 'HRV vs personal baseline'),
        detail: L(
          `近 7 日 HRV 日均约 ${hrvRecent.toFixed(1)} ms，相对此前约 3–4 周中位 ${hrvBaseline.toFixed(1)} ms ${up ? '升高' : '下降'}约 ${Math.abs(delta).toFixed(1)} ms（${up ? '+' : ''}${((delta / hrvBaseline) * 100).toFixed(0)}%）。${up ? '恢复能力相对个人习惯偏积极' : '恢复能力相对个人习惯偏紧'}；结合睡眠与训练负荷解读，非诊断。`,
          `Last 7 days HRV day-mean ~${hrvRecent.toFixed(1)} ms, vs prior ~3–4 week median ${hrvBaseline.toFixed(1)} ms: ${up ? 'up' : 'down'} ~${Math.abs(delta).toFixed(1)} ms (${up ? '+' : ''}${((delta / hrvBaseline) * 100).toFixed(0)}%). ${up ? 'Recovery looks relatively favorable vs your own habit' : 'Recovery looks relatively tighter vs your own habit'}; interpret with sleep and training load—not a diagnosis.`
        ),
        anchor: 'summary-hrv',
      });
    }
  }

  // —— 夜间心率：Watch 日序列优先；否则 recoveryWeeks ——
  let nightRecent: number | null = null;
  let nightBaseline: number | null = null;
  const watchDays = analysis.watchStats?.days || [];
  const nightDays = watchDays
    .filter((d) => d.nightHrMean != null && Number.isFinite(d.nightHrMean))
    .map((d) => ({ date: d.date, v: d.nightHrMean as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (nightDays.length >= 21) {
    const recentVals = nightDays.slice(-7).map((d) => d.v);
    const priorVals = nightDays.slice(0, -7).slice(-28).map((d) => d.v);
    if (recentVals.length >= 4 && priorVals.length >= 14) {
      nightRecent = meanOf(recentVals);
      nightBaseline = medianOf(priorVals);
    }
  }
  if (nightRecent == null || nightBaseline == null) {
    const weeks = (analysis.recoveryWeeks || []).filter(
      (w) => w.nightHrMean7d != null && Number.isFinite(w.nightHrMean7d)
    );
    if (weeks.length >= 5) {
      const last = weeks[weeks.length - 1];
      const prior = weeks.slice(-5, -1);
      nightRecent = last.nightHrMean7d;
      nightBaseline = medianOf(prior.map((w) => w.nightHrMean7d as number));
    }
  }
  if (nightRecent != null && nightBaseline != null && nightBaseline > 0) {
    const delta = nightRecent - nightBaseline;
    // 有意义：|Δ| ≥ 4 bpm
    if (Math.abs(delta) >= 4) {
      const up = delta > 0;
      bullets.push({
        // 夜 HR 升高通常偏紧；下降偏积极
        tone: up ? 'watch' : 'positive',
        title: L('夜间心率相对个人基线', 'Night HR vs personal baseline'),
        detail: L(
          `近 7 日夜间心率均约 ${nightRecent.toFixed(0)} bpm，相对此前约 3–4 周中位 ${nightBaseline.toFixed(0)} bpm ${up ? '升高' : '下降'}约 ${Math.abs(delta).toFixed(0)} bpm。${up ? '可与睡眠、训练负荷或身体不适对照' : '相对个人习惯偏放松'}；单周波动不必过度解读。`,
          `Last 7 days night HR mean ~${nightRecent.toFixed(0)} bpm, vs prior ~3–4 week median ${nightBaseline.toFixed(0)} bpm: ${up ? 'up' : 'down'} ~${Math.abs(delta).toFixed(0)} bpm. ${up ? 'Cross-check sleep, training load, or how you feel' : 'Relatively more relaxed vs your habit'}; avoid over-reading a single week.`
        ),
        anchor: 'summary-watch',
      });
    }
  }

  // —— 体重：近 7 日晨起趋势均 vs 前 7 日（可选补充，已有长期趋势 bullet）——
  const series = analysis.weightStats?.trendSeries || [];
  if (series.length >= 14) {
    const recent = series.slice(-7).map((p) => p.weight).filter(Number.isFinite);
    const prior = series.slice(-14, -7).map((p) => p.weight).filter(Number.isFinite);
    const rMean = meanOf(recent);
    const pMean = meanOf(prior);
    if (rMean != null && pMean != null && recent.length >= 4 && prior.length >= 4) {
      const delta = rMean - pMean;
      // 有意义：|Δ| ≥ 0.5 kg
      if (Math.abs(delta) >= 0.5) {
        const up = delta > 0;
        bullets.push({
          tone: Math.abs(delta) >= 1.5 ? 'watch' : 'neutral',
          title: L('体重近周相对前一周', 'Weight: last 7d vs prior week'),
          detail: L(
            `近 7 日晨起趋势均约 ${rMean.toFixed(1)} kg，相对此前 7 日均 ${pMean.toFixed(1)} kg ${up ? '上升' : '下降'}约 ${Math.abs(delta).toFixed(1)} kg。短期波动受钠盐、训练与月经周期等影响；结合长期晨起趋势解读。`,
            `Last 7 days morning-trend mean ~${rMean.toFixed(1)} kg, vs prior 7-day mean ${pMean.toFixed(1)} kg: ${up ? 'up' : 'down'} ~${Math.abs(delta).toFixed(1)} kg. Short-term swings reflect sodium, training, cycle, etc.; read with the longer morning trend.`
          ),
          anchor: 'summary-weight',
        });
      }
    }
  }
}

/**
 * 基于当前分析生成有优先级的监测摘要
 */
export function buildInsightBullets(
  analysis: FullAnalysis,
  options?: LocaleOptions
): InsightBullet[] {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const bullets: InsightBullet[] = [];
  const data = analysis.data;
  const range = analysis.dateRange;
  const coverageTitle = L('数据覆盖', 'Data coverage');

  if (range?.start && range?.end) {
    bullets.push({
      tone: 'neutral',
      title: coverageTitle,
      detail: L(
        `本次可用记录约 ${range.start} 至 ${range.end}。完整明细默认只在本页内存，刷新需重新上传。`,
        `Available records roughly cover ${range.start} to ${range.end}. Full details stay in this page’s memory by default; re-upload after refresh.`
      ),
      anchor: 'overview',
    });
  }

  // 体重趋势
  const ws = analysis.weightStats;
  if (ws?.latestTrend && ws.earliestTrend) {
    const delta = ws.latestTrend.weight - ws.earliestTrend.weight;
    const fat =
      ws.bodyFatLatest != null
        ? L(
            `；体脂约 ${ws.bodyFatLatest.toFixed(1)}%`,
            `; body fat ~${ws.bodyFatLatest.toFixed(1)}%`
          )
        : '';
    const tone: InsightTone =
      delta <= -8 ? 'watch' : delta <= -2 ? 'neutral' : delta >= 2 ? 'watch' : 'positive';
    bullets.push({
      tone,
      title: L('体重趋势（晨起）', 'Weight trend (morning)'),
      detail: L(
        `最新趋势 ${ws.latestTrend.weight.toFixed(1)} kg（${ws.latestTrend.date}），相对最早 ${ws.earliestTrend.weight.toFixed(1)} kg 变化 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg${fat}。趋势按每日晨起重，避免晚间波动干扰。`,
        `Latest trend ${ws.latestTrend.weight.toFixed(1)} kg (${ws.latestTrend.date}), vs earliest ${ws.earliestTrend.weight.toFixed(1)} kg, change ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg${fat}. Trend uses daily morning weight to reduce evening noise.`
      ),
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

    let detail = L(
      `稳定期/可用段均值 ${st.mean.toFixed(2)} mmol/L，TIR ${st.pctInRange.toFixed(1)}%，<3.9 占 ${st.pctBelow39.toFixed(1)}%（n=${st.count}）。`,
      `Stable/usable segment mean ${st.mean.toFixed(2)} mmol/L, TIR ${st.pctInRange.toFixed(1)}%, <3.9 ${st.pctBelow39.toFixed(1)}% (n=${st.count}).`
    );
    if (fd && analysis.cgmStats.firstDayDate && fd.pctBelow39 >= 10) {
      detail += L(
        ` 首日 ${analysis.cgmStats.firstDayDate} 低值偏多（<3.9 ${fd.pctBelow39.toFixed(1)}%），解读请以稳定期为准并指尖血复核可疑时段。`,
        ` First day ${analysis.cgmStats.firstDayDate} had more lows (<3.9 ${fd.pctBelow39.toFixed(1)}%); prefer the stable segment and confirm suspect periods with finger-stick glucose.`
      );
      if (tone === 'positive') tone = 'neutral';
    }
    bullets.push({
      tone,
      title: L('血糖（CGM）', 'Glucose (CGM)'),
      detail,
      anchor: 'summary-cgm',
    });
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

    let detail = L(
      `近 7 日全天均值约 ${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)} mmHg（${m.count} 条`,
      `Last 7 days all-day mean ~${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)} mmHg (${m.count} readings`
    );
    if (m.lowCount) {
      detail += L(
        `，其中 ${m.lowCount} 条 <90/60`,
        `, including ${m.lowCount} <90/60`
      );
    }
    detail += L('）。', ').');
    if (morn && eve) {
      detail += L(
        ` 晨间约 ${morn.systolic.toFixed(0)}/${morn.diastolic.toFixed(0)}，晚间约 ${eve.systolic.toFixed(0)}/${eve.diastolic.toFixed(0)}。`,
        ` Morning ~${morn.systolic.toFixed(0)}/${morn.diastolic.toFixed(0)}, evening ~${eve.systolic.toFixed(0)}/${eve.diastolic.toFixed(0)}.`
      );
    }
    bullets.push({ tone, title: L('血压', 'Blood pressure'), detail, anchor: 'summary-bp' });
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
        title: L('恢复（HRV / 静息心率）', 'Recovery (HRV / resting HR)'),
        detail:
          L(
            `近 7 日 HRV 全天均值约 ${hrvAvg.toFixed(1)} ms`,
            `Last 7 days all-day HRV mean ~${hrvAvg.toFixed(1)} ms`
          ) +
          (rhrAvg != null
            ? L(
                `，静息心率约 ${rhrAvg.toFixed(0)} bpm`,
                `, resting HR ~${rhrAvg.toFixed(0)} bpm`
              )
            : '') +
          L(
            '。数值受睡眠、训练与疾病影响，单日波动不必过度解读。',
            '. Values reflect sleep, training, and illness; avoid over-reading single-day swings.'
          ),
        anchor: 'summary-hrv',
      });
    }
  }

  // 个人基线：近 7 日 vs 此前 3–4 周（HRV / 夜 HR / 晨重）
  pushPersonalBaselineBullets(analysis, L, bullets);

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
        title: L('Watch 活动', 'Watch activity'),
        detail:
          L(
            `近 7 日日均锻炼约 ${ex != null ? ex.toFixed(0) : '—'} 分钟`,
            `Last 7 days mean exercise ~${ex != null ? ex.toFixed(0) : '—'} min/day`
          ) +
          (kcal != null
            ? L(
                `，活动消耗约 ${kcal.toFixed(0)} kcal`,
                `, active energy ~${kcal.toFixed(0)} kcal`
              )
            : '') +
          L(
            '。低活动日可与睡眠/HRV 对照，避免过度解读单日。',
            '. On low-activity days, cross-check sleep/HRV; avoid over-reading a single day.'
          ),
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
          ? L(
              `；夜段均 ${wsWatch.spo2NightMean7d.toFixed(1)}%`,
              `; night mean ${wsWatch.spo2NightMean7d.toFixed(1)}%`
            ) +
            (wsWatch.spo2NightMin7d != null
              ? L(
                  `（最低 ${wsWatch.spo2NightMin7d.toFixed(1)}%）`,
                  ` (min ${wsWatch.spo2NightMin7d.toFixed(1)}%)`
                )
              : '')
          : '';
      const dayBit =
        wsWatch.spo2DayMean7d != null
          ? L(
              `，日段均 ${wsWatch.spo2DayMean7d.toFixed(1)}%`,
              `, day mean ${wsWatch.spo2DayMean7d.toFixed(1)}%`
            )
          : '';
      bullets.push({
        tone,
        title: L('血氧（Watch）', 'Blood oxygen (Watch)'),
        detail:
          L(
            `近 7 日血氧均值约 ${wsWatch.spo2Mean7d.toFixed(1)}%`,
            `Last 7 days SpO₂ mean ~${wsWatch.spo2Mean7d.toFixed(1)}%`
          ) +
          (wsWatch.spo2Min7d != null
            ? L(
                `，期间最低约 ${wsWatch.spo2Min7d.toFixed(1)}%`,
                `, period min ~${wsWatch.spo2Min7d.toFixed(1)}%`
              )
            : '') +
          nightBit +
          dayBit +
          L(
            `（${wsWatch.spo2DayCount} 天有样本）。低值需结合症状，勿单次定论。`,
            ` (${wsWatch.spo2DayCount} days with samples). Interpret lows with symptoms; do not conclude from a single reading.`
          ),
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.vo2Latest != null) {
      const delta = wsWatch.vo2Delta;
      bullets.push({
        tone: delta != null && delta <= -2 ? 'watch' : 'neutral',
        title: L('心肺适能 VO₂ max', 'Cardio fitness VO₂ max'),
        detail:
          L(
            `最新约 ${wsWatch.vo2Latest.toFixed(1)} mL/kg/min`,
            `Latest ~${wsWatch.vo2Latest.toFixed(1)} mL/kg/min`
          ) +
          (wsWatch.vo2Earliest != null
            ? L(
                `（相对最早 ${wsWatch.vo2Earliest.toFixed(1)}，变化 ${delta != null && delta >= 0 ? '+' : ''}${delta?.toFixed(1)}）`,
                ` (vs earliest ${wsWatch.vo2Earliest.toFixed(1)}, change ${delta != null && delta >= 0 ? '+' : ''}${delta?.toFixed(1)})`
              )
            : '') +
          L(
            `，共 ${wsWatch.vo2DayCount} 天有估算。Apple 估算值仅供趋势参考。`,
            `; ${wsWatch.vo2DayCount} days with estimates. Apple estimates are for personal trend only.`
          ),
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.nightHrMean7d != null) {
      bullets.push({
        tone: wsWatch.nightHrMean7d >= 80 ? 'watch' : 'neutral',
        title: L('夜间心率', 'Night heart rate'),
        detail: L(
          `近 7 日 0–6 点心率均值约 ${wsWatch.nightHrMean7d.toFixed(0)} bpm（由 Watch 连续心率抽样汇总）。可与静息心率、睡眠对照。`,
          `Last 7 days 0–6h heart rate mean ~${wsWatch.nightHrMean7d.toFixed(0)} bpm (from Watch continuous HR samples). Cross-check with resting HR and sleep.`
        ),
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.rrMean7d != null) {
      bullets.push({
        tone: wsWatch.rrMean7d >= 20 || wsWatch.rrMean7d < 10 ? 'watch' : 'neutral',
        title: L('呼吸频率', 'Respiratory rate'),
        detail: L(
          `近 7 日呼吸频率日均约 ${wsWatch.rrMean7d.toFixed(1)} 次/分（Watch 睡眠/静息采样）。显著偏离习惯基线时结合症状观察。`,
          `Last 7 days respiratory rate ~${wsWatch.rrMean7d.toFixed(1)} breaths/min (Watch sleep/rest samples). If clearly off your usual baseline, observe alongside symptoms.`
        ),
        anchor: 'summary-watch',
      });
    }
    if (wsWatch.wristTempMean7d != null) {
      bullets.push({
        tone: 'neutral',
        title: L('睡眠腕温', 'Sleep wrist temperature'),
        detail: L(
          `近 7 日睡眠腕温日均约 ${wsWatch.wristTempMean7d.toFixed(2)} °C。Apple 腕温多为相对偏差用途，适合看自身趋势而非绝对体温。`,
          `Last 7 days sleep wrist temperature mean ~${wsWatch.wristTempMean7d.toFixed(2)} °C. Apple wrist temp is mainly for relative deviation—use for your own trend, not absolute core temperature.`
        ),
        anchor: 'summary-watch',
      });
    }
    if (
      wsWatch.breathingDisturbanceDayCount >= 3 &&
      wsWatch.breathingDisturbanceMean7d != null
    ) {
      const latestBit =
        wsWatch.breathingDisturbanceLatest != null
          ? L(
              `，最新约 ${wsWatch.breathingDisturbanceLatest.toFixed(2)}`,
              `, latest ~${wsWatch.breathingDisturbanceLatest.toFixed(2)}`
            )
          : '';
      bullets.push({
        tone: 'neutral',
        title: L('睡眠呼吸紊乱', 'Sleep breathing disturbance'),
        detail:
          L(
            `近 7 日有样本日均约 ${wsWatch.breathingDisturbanceMean7d.toFixed(2)}`,
            `Last 7 days mean on sampled days ~${wsWatch.breathingDisturbanceMean7d.toFixed(2)}`
          ) +
          latestBit +
          L(
            `（共 ${wsWatch.breathingDisturbanceDayCount} 天有数据）。数值来自 Apple Watch 睡眠呼吸扰动估算，越高表示扰动相对越多；仅供自身趋势观察，不能诊断睡眠呼吸暂停。`,
            ` (${wsWatch.breathingDisturbanceDayCount} days with data). From Apple Watch sleep breathing disturbance estimates—higher means relatively more disturbance; for personal trend only, not a sleep apnea diagnosis.`
          ),
        anchor: 'summary-watch',
      });
      // 可选：紊乱 + 夜段血氧同向偏倚时补一条联合提示
      const nightMeanLow =
        wsWatch.spo2NightMean7d != null && wsWatch.spo2NightMean7d < 95;
      const nightMinLow =
        wsWatch.spo2NightMin7d != null && wsWatch.spo2NightMin7d < 92;
      if (nightMeanLow || nightMinLow) {
        const bdDays = (wsWatch.days || [])
          .map((d) => d.breathingDisturbance)
          .filter((v): v is number => v != null && Number.isFinite(v));
        const allBdMean =
          bdDays.length > 0
            ? bdDays.reduce((a, b) => a + b, 0) / bdDays.length
            : null;
        const bdElevated =
          allBdMean != null &&
          allBdMean > 0 &&
          wsWatch.breathingDisturbanceMean7d >= allBdMean * 1.15;
        if (bdElevated || nightMinLow) {
          bullets.push({
            tone: 'watch',
            title: L('呼吸紊乱与夜段血氧', 'Breathing disturbance & night SpO₂'),
            detail:
              L(
                `近 7 日呼吸紊乱均约 ${wsWatch.breathingDisturbanceMean7d.toFixed(2)}`,
                `Last 7 days breathing disturbance mean ~${wsWatch.breathingDisturbanceMean7d.toFixed(2)}`
              ) +
              (wsWatch.spo2NightMean7d != null
                ? L(
                    `，夜段 SpO₂ 均约 ${wsWatch.spo2NightMean7d.toFixed(1)}%`,
                    `, night SpO₂ mean ~${wsWatch.spo2NightMean7d.toFixed(1)}%`
                  )
                : '') +
              (wsWatch.spo2NightMin7d != null
                ? L(
                    `（最低约 ${wsWatch.spo2NightMin7d.toFixed(1)}%）`,
                    ` (min ~${wsWatch.spo2NightMin7d.toFixed(1)}%)`
                  )
                : '') +
              L(
                '。二者同向时更宜对照睡眠质量与白天精神；仍为腕表趋势，非诊断。',
                '. When both lean the same way, also note sleep quality and daytime alertness; still a watch trend, not a diagnosis.'
              ),
            anchor: 'summary-watch',
          });
        }
      }
    }
  }

  // Workout 会话
  const wos = analysis.workoutStats;
  if (wos && wos.count > 0) {
    const top = wos.byType
      .slice(0, 3)
      .map((t) => `${t.activityLabel || t.activityType}×${t.count}`)
      .join(L('、', ', '));
    const last = wos.lastSession;
    let tone: InsightTone = 'neutral';
    if (wos.count30d >= 8) tone = 'positive';
    else if (wos.count30d === 0) tone = 'watch';
    bullets.push({
      tone,
      title: L('Workout 训练', 'Workouts'),
      detail:
        L(`共 ${wos.count} 场`, `${wos.count} session(s) total`) +
        (wos.count30d
          ? L(
              `，近 30 日 ${wos.count30d} 场 / 共 ${wos.durationSum30d.toFixed(0)} min`,
              `, last 30 days ${wos.count30d} session(s) / ${wos.durationSum30d.toFixed(0)} min total`
            )
          : L('，近 30 日 0 场', ', last 30 days: 0 sessions')) +
        (wos.count7d
          ? L(`，近 7 日 ${wos.count7d} 场`, `, last 7 days ${wos.count7d} session(s)`)
          : '') +
        (top ? L(`；类型 ${top}`, `; types ${top}`) : '') +
        (last
          ? L(
              `。最近：${last.date} ${last.activityLabel || last.activityType} ${last.durationMin.toFixed(0)} min`,
              `. Latest: ${last.date} ${last.activityLabel || last.activityType} ${last.durationMin.toFixed(0)} min`
            ) +
            (last.hrAvg != null
              ? L(
                  `，均 HR ${last.hrAvg.toFixed(0)}`,
                  `, mean HR ${last.hrAvg.toFixed(0)}`
                )
              : '')
          : '') +
        L('。', '.'),
      anchor: 'summary-workout',
    });
  }

  // 周恢复仪表
  const rw = analysis.recoveryWeek;
  if (rw) {
    bullets.push({
      tone: rw.statusTone,
      title: L('近 7 日负荷/恢复', 'Last 7 days load / recovery'),
      detail:
        (rw.recoveryScore != null
          ? L(`恢复分约 ${rw.recoveryScore}`, `Recovery score ~${rw.recoveryScore}`)
          : L('恢复分 —', 'Recovery score —')) +
        (rw.loadScore != null
          ? L(`，负荷分约 ${rw.loadScore}`, `, load score ~${rw.loadScore}`)
          : '') +
        L(`。${rw.statusLabel}`, `. ${rw.statusLabel}`) +
        (rw.hrvMean7d != null
          ? L(` HRV≈${rw.hrvMean7d.toFixed(0)}ms`, ` HRV≈${rw.hrvMean7d.toFixed(0)}ms`)
          : '') +
        (rw.sleepMean7d != null
          ? L(` 睡眠≈${rw.sleepMean7d.toFixed(1)}h`, ` sleep≈${rw.sleepMean7d.toFixed(1)}h`)
          : '') +
        (rw.exerciseMinMean7d != null
          ? L(
              ` 锻炼≈${rw.exerciseMinMean7d.toFixed(0)}min/日`,
              ` exercise≈${rw.exerciseMinMean7d.toFixed(0)} min/day`
            )
          : '') +
        (rw.daylightMinMean7d != null
          ? L(
              ` 日照≈${rw.daylightMinMean7d.toFixed(0)}min`,
              ` daylight≈${rw.daylightMinMean7d.toFixed(0)} min`
            )
          : '') +
        L('。', '.'),
      anchor: 'summary-recovery',
    });
  }

  // ECG
  const es = analysis.ecgStats;
  if (es && es.count > 0) {
    let tone: InsightTone = 'positive';
    if (es.highHrCount > 0) tone = 'watch';
    if (es.otherCount > 0 && es.sinusCount === 0) tone = 'watch';
    const latest = es.latest;
    let corr = '';
    if (es.highHrCount >= 2) {
      const near = es.highHrNearWorkoutCount ?? 0;
      const rest = es.highHrRestingWindowCount ?? 0;
      const topHours = (es.highHrByHour || [])
        .map((c, h) => ({ h, c }))
        .filter((x) => x.c > 0)
        .sort((a, b) => b.c - a.c || a.h - b.h)
        .slice(0, 3)
        .map((x) =>
          L(
            `${String(x.h).padStart(2, '0')}时×${x.c}`,
            `${String(x.h).padStart(2, '0')}h×${x.c}`
          )
        )
        .join(L('、', ', '));
      corr =
        L(
          `。高心率关联：训练±2h ${near} 份`,
          `. High-HR context: workout ±2h ${near}`
        ) +
        L(
          `，非运动窗（22–08 或无附近训练）${rest} 份`,
          `, non-exercise window (22–08 or no nearby workout) ${rest}`
        ) +
        (topHours
          ? L(`；高发小时 ${topHours}`, `; peak hours ${topHours}`)
          : '');
      if (rest >= 2 && rest >= near) tone = 'watch';
      else if (near >= 2 && near > rest) tone = 'neutral';
    }
    bullets.push({
      tone,
      title: L('ECG 心电图', 'ECG'),
      detail:
        L(`共 ${es.count} 份`, `${es.count} recording(s) total`) +
        (es.sinusCount ? L(`，窦性 ${es.sinusCount}`, `, sinus ${es.sinusCount}`) : '') +
        (es.highHrCount
          ? L(`，高心率 ${es.highHrCount}`, `, high heart rate ${es.highHrCount}`)
          : '') +
        (es.inconclusiveCount
          ? L(`，结果不佳 ${es.inconclusiveCount}`, `, inconclusive ${es.inconclusiveCount}`)
          : '') +
        (es.otherCount ? L(`，其他 ${es.otherCount}`, `, other ${es.otherCount}`) : '') +
        (latest
          ? L(
              `。最近 ${String(latest.datetime).slice(0, 16)}：${latest.classification}`,
              `. Latest ${String(latest.datetime).slice(0, 16)}: ${latest.classification}`
            )
          : '') +
        corr +
        L(
          '。单次异常需结合症状与复测，不能替代门诊。',
          '. A single abnormal reading needs symptoms and repeat context; this does not replace clinical care.'
        ),
      anchor: 'summary-ecg',
    });
  }

  // 并入跨维度信号（高优先级）；CGM×睡眠/活动至多一条
  const signals = detectCrossSignals(analysis, options);
  const isCgmSleepOrActivity = (dims: string[]) =>
    dims.includes('CGM') &&
    (dims.includes('睡眠') ||
      dims.includes('步数') ||
      dims.includes('Sleep') ||
      dims.includes('Steps'));
  let cgmSleepActAdded = false;
  let signalsAdded = 0;
  for (const s of signals) {
    if (signalsAdded >= 4) break;
    if (isCgmSleepOrActivity(s.dimensions)) {
      if (cgmSleepActAdded) continue;
      cgmSleepActAdded = true;
    }
    if (s.severity === 'info' && bullets.length >= 6) continue;
    bullets.push({
      tone: toneFromSeverity(s.severity),
      title: s.title,
      detail: s.detail,
      anchor: 'signals',
    });
    signalsAdded += 1;
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
  const head = unique.filter((b) => b.title === coverageTitle);
  const rest = unique
    .filter((b) => b.title !== coverageTitle)
    .sort((a, b) => rank[a.tone] - rank[b.tone]);
  const result = [...head, ...rest].slice(0, 7);
  // zh-TW: traditionalize short titles only (body text stays shared zh-CN medical copy)
  if (locale === 'zh-TW') {
    for (const b of result) {
      b.title = toTraditionalTitle(b.title);
    }
  }
  return result;
}

export function formatInsightsForLLM(
  bullets: InsightBullet[],
  options?: LocaleOptions
): string {
  if (!bullets.length) return '';
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const lines = [
    L('## 自动监测摘要（程序生成，非诊断）', '## Automated monitoring summary (program-generated, not a diagnosis)'),
    '',
  ];
  bullets.forEach((b, i) => {
    const tag =
      b.tone === 'alert'
        ? L('需关注', 'Attention')
        : b.tone === 'watch'
          ? L('观察', 'Watch')
          : b.tone === 'positive'
            ? L('积极', 'Positive')
            : L('提示', 'Note');
    const title = locale === 'zh-TW' ? toTraditionalTitle(b.title) : b.title;
    lines.push(`${i + 1}. **[${tag}] ${title}**：${b.detail}`);
  });
  lines.push('');
  lines.push(
    L(
      '> 以下为分维度原始统计与明细，请与摘要交叉核对。',
      '> The following are raw per-domain stats and details; cross-check against the summary.'
    )
  );
  lines.push('');
  let out = lines.join('\n');
  if (locale === 'zh-TW') {
    // Heading line only (body remains shared zh-CN)
    out = out.replace(
      /^## 自动监测摘要（程序生成，非诊断）/m,
      '## ' + toTraditionalTitle('自动监测摘要（程序生成，非诊断）')
    );
  }
  return out;
}

/**
 * 仅摘要短提示（适合上下文较短的模型，或先快速粘贴）
 * 可选 prefix 由 UI 拼入个人背景，避免与 llm-prompt 循环依赖。
 */
export function generateInsightsOnlyPrompt(
  analysis: FullAnalysis,
  options: { prefix?: string; locale?: AppLocale | string } = {}
): string {
  const locale = normalizeLocale(options.locale);
  const L = createL(locale);
  const bullets = buildInsightBullets(analysis, { locale });
  const footerZh = '> 以下为分维度原始统计与明细，请与摘要交叉核对。\n\n';
  const footerEn =
    '> The following are raw per-domain stats and details; cross-check against the summary.\n\n';
  const body = formatInsightsForLLM(bullets, { locale })
    .replace(footerZh, '')
    .replace(footerEn, '')
    .trim();
  const lines = [
    L(
      '请基于以下「个人健康自我监测摘要」给出简洁中文建议（Markdown）：',
      'Based on the personal health self-monitoring summary below, provide concise English advice (Markdown):'
    ),
    L(
      '- 不下诊断、不开药、不替代门诊',
      '- Do not diagnose, prescribe, or replace clinical care'
    ),
    L(
      '- 指出最值得优先关注的 3 点，并给出可操作的自我监测建议',
      '- Highlight the top 3 priorities and give actionable self-monitoring suggestions'
    ),
    L(
      '- 异常需提示复核（如 CGM 指尖血、血压复测）',
      '- Flag anomalies for confirmation (e.g. CGM finger-stick, blood pressure recheck)'
    ),
    '',
  ];
  if (options.prefix && options.prefix.trim()) {
    lines.push(options.prefix.trim());
    lines.push('');
  }
  lines.push(body || L('（暂无摘要）', '(No summary yet)'));
  lines.push('');
  lines.push(
    L(
      '（本段仅为程序摘要，非完整原始数据。需要完整统计请使用完整提示词。）',
      '(This is a program summary only, not full raw data. Use the full prompt for complete stats.)'
    )
  );
  return lines.join('\n');
}
