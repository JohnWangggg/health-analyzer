/**
 * 跨维度规则提示（启发式，非诊断）
 */

import { FullAnalysis } from './types';
import { getDate, getHour } from './parser';
import { createL, LocaleOptions, normalizeLocale } from './locale';
import { toTraditionalTitle } from './zh-tw-map';

export type SignalSeverity = 'info' | 'watch' | 'alert';

export interface CrossSignal {
  severity: SignalSeverity;
  date?: string;
  title: string;
  detail: string;
  dimensions: string[];
}

export type { LocaleOptions };

function mean(values: number[]): number | null {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function recentDates(keys: string[], n: number): string[] {
  return [...keys].sort().slice(-n);
}

/**
 * 基于多日/同日指标组合生成可复核的提示
 */
export function detectCrossSignals(
  analysis: FullAnalysis,
  options?: LocaleOptions
): CrossSignal[] {
  const L = createL(normalizeLocale(options?.locale));
  const signals: CrossSignal[] = [];
  const data = analysis.data;
  const hrvByDate = analysis.hrvByDate || {};
  const restMap = analysis.restingHrByDate || data.restingHr || {};
  const walkMap = analysis.walkingHrByDate || data.walkingHr || {};
  const stepsMap = analysis.stepsByDate || {};
  const sleepMap = analysis.sleepByDate || data.sleep || {};

  const hrvDates = Object.keys(hrvByDate).sort();
  const hrv7 = recentDates(hrvDates, 7);
  const hrvBase = mean(hrv7.map((d) => hrvByDate[d].allMean));
  const rest7 = recentDates(Object.keys(restMap), 7);
  const restBase = mean(rest7.map((d) => restMap[d]));

  // 同日：HRV 明显偏低 + 静息心率偏高
  const commonDays = hrvDates.filter((d) => restMap[d] != null);
  for (const d of commonDays.slice(-14)) {
    const h = hrvByDate[d].allMean;
    const r = restMap[d];
    if (
      hrvBase != null &&
      restBase != null &&
      h < hrvBase * 0.75 &&
      r > restBase + 8
    ) {
      signals.push({
        severity: 'watch',
        date: d,
        title: L('恢复压力日（HRV↓ + 静息心率↑）', 'Recovery stress day (HRV↓ + resting HR↑)'),
        detail: L(
          `${d}：HRV 全天均值 ${h.toFixed(1)} ms（近 7 日均 ${hrvBase.toFixed(1)}），静息心率 ${r} bpm（近 7 日均 ${restBase.toFixed(1)}）。可能与疲劳、睡眠不足、疾病或训练负荷有关，建议结合症状观察 1-2 天。`,
          `${d}: all-day HRV mean ${h.toFixed(1)} ms (7-day mean ${hrvBase.toFixed(1)}), resting HR ${r} bpm (7-day mean ${restBase.toFixed(1)}). May relate to fatigue, short sleep, illness, or training load; observe with symptoms for 1–2 days.`
        ),
        dimensions: ['HRV', L('静息心率', 'Resting HR')],
      });
    }
  }

  // 低睡眠 + 低步数（活动与恢复双低）
  const sleepDays = Object.keys(sleepMap).sort();
  for (const d of sleepDays.slice(-10)) {
    const sleepH = sleepMap[d]?.total;
    const steps = stepsMap[d];
    if (sleepH != null && sleepH < 6 && steps != null && steps < 3000) {
      signals.push({
        severity: 'info',
        date: d,
        title: L('低睡眠且活动量偏低', 'Short sleep and low activity'),
        detail: L(
          `${d}：总睡眠 ${sleepH.toFixed(2)} h，步数 ${Math.round(steps)}。若持续多日，可优先保证睡眠与基础活动，避免过度解读单日指标。`,
          `${d}: total sleep ${sleepH.toFixed(2)} h, steps ${Math.round(steps)}. If this persists for several days, prioritize sleep and baseline activity; avoid over-reading a single day.`
        ),
        dimensions: [L('睡眠', 'Sleep'), L('步数', 'Steps')],
      });
    }
  }

  // 血压低压次数
  if (analysis.bpStats?.mean7d && analysis.bpStats.mean7d.lowCount > 0) {
    const m = analysis.bpStats.mean7d;
    signals.push({
      severity: m.lowCount >= 3 ? 'watch' : 'info',
      title: L('近 7 天出现偏低血压读数', 'Low blood pressure readings in last 7 days'),
      detail: L(
        `近 7 天均值 ${m.systolic.toFixed(1)}/${m.diastolic.toFixed(1)} mmHg，其中 ${m.lowCount} 条 <90/60。结合头晕、乏力等症状判断；用药调整请遵医嘱。`,
        `Last 7 days mean ${m.systolic.toFixed(1)}/${m.diastolic.toFixed(1)} mmHg, including ${m.lowCount} readings <90/60. Interpret with symptoms such as dizziness or fatigue; medication changes only with clinical advice.`
      ),
      dimensions: [L('血压', 'Blood pressure')],
    });
  }

  // CGM 低值占比
  if (analysis.cgmStats) {
    const o = analysis.cgmStats.overall;
    if (o.pctBelow30 > 0) {
      signals.push({
        severity: 'alert',
        title: L('CGM 出现 <3.0 mmol/L 读数', 'CGM readings <3.0 mmol/L present'),
        detail: L(
          `整体 <3.0 占比 ${o.pctBelow30.toFixed(1)}%，最低 ${o.min.toFixed(1)} mmol/L。须指尖血复核；不能仅凭 CGM 判定低血糖。`,
          `Overall <3.0 share ${o.pctBelow30.toFixed(1)}%, min ${o.min.toFixed(1)} mmol/L. Confirm with finger-stick glucose; do not judge hypoglycemia from CGM alone.`
        ),
        dimensions: ['CGM'],
      });
    } else if (o.pctBelow39 >= 5) {
      signals.push({
        severity: 'watch',
        title: L('CGM <3.9 mmol/L 占比较高', 'Elevated share of CGM <3.9 mmol/L'),
        detail: L(
          `整体 <3.9 占比 ${o.pctBelow39.toFixed(1)}%。注意区分传感器伪影与真实低值，异常时指尖血复核。`,
          `Overall <3.9 share ${o.pctBelow39.toFixed(1)}%. Separate sensor artifact from true lows; confirm unusual periods with finger-stick glucose.`
        ),
        dimensions: ['CGM'],
      });
    }

    // 分日：单日大量低值
    for (const [date, day] of Object.entries(analysis.cgmStats.daily)) {
      if (day.pctBelow39 >= 20 && day.count >= 12) {
        signals.push({
          severity: 'watch',
          date,
          title: L(`CGM 单日低值偏多（${date}）`, `Many CGM lows on a single day (${date})`),
          detail: L(
            `${date}：<3.9 占比 ${day.pctBelow39.toFixed(1)}%（${day.count} 条），最低 ${day.min.toFixed(1)}。优先排查压迫低值/传感器首日偏差，并指尖血复核可疑时段。`,
            `${date}: <3.9 share ${day.pctBelow39.toFixed(1)}% (${day.count} points), min ${day.min.toFixed(1)}. Check compression lows / first-day sensor bias and confirm suspect periods with finger-stick glucose.`
          ),
          dimensions: ['CGM'],
        });
      }
    }
  }

  // 体重快速下降：用趋势序列（晨起优先）近 7 日 vs 再往前一点
  const trend = analysis.weightStats?.trendSeries || [];
  if (trend.length >= 4) {
    const last = trend[trend.length - 1];
    const refIdx = Math.max(0, trend.length - 8);
    const ref = trend[refIdx];
    const drop = ref.weight - last.weight;
    if (drop >= 1.5) {
      signals.push({
        severity: drop >= 2.5 ? 'watch' : 'info',
        date: last.date,
        title: L('体重短期下降偏快（晨起趋势）', 'Relatively fast short-term weight drop (morning trend)'),
        detail: L(
          `相对约一周前趋势体重 ${ref.weight.toFixed(1)} kg（${ref.date}），最新 ${last.weight.toFixed(1)} kg（${last.date}），约下降 ${drop.toFixed(1)} kg。若伴随乏力、HRV 下降或血压偏低，建议综合关注能量摄入与恢复。`,
          `Vs trend weight about a week earlier ${ref.weight.toFixed(1)} kg (${ref.date}), latest ${last.weight.toFixed(1)} kg (${last.date}), drop ~${drop.toFixed(1)} kg. If fatigue, lower HRV, or low BP appear together, also review energy intake and recovery.`
        ),
        dimensions: [L('体重', 'Weight')],
      });
    }
  }

  // CGM：若稳定期正常而仅首日低值，弱化「全程低血糖」叙事（已有首日信号）
  if (analysis.cgmStats?.stable && analysis.cgmStats.firstDay) {
    const st = analysis.cgmStats.stable;
    const fd = analysis.cgmStats.firstDay;
    if (fd.pctBelow39 >= 15 && st.pctBelow39 < 2 && st.pctBelow30 === 0) {
      signals.push({
        severity: 'info',
        date: analysis.cgmStats.firstDayDate || undefined,
        title: L('CGM 低值主要集中在传感器首日', 'CGM lows mainly on sensor first day'),
        detail: L(
          `首日 <3.9 占比 ${fd.pctBelow39.toFixed(1)}%，稳定期仅 ${st.pctBelow39.toFixed(1)}% 且无 <3.0。解读时请以稳定期为准，首日低值优先考虑压迫/校准伪影并指尖血复核可疑时段。`,
          `First day <3.9 share ${fd.pctBelow39.toFixed(1)}%; stable segment only ${st.pctBelow39.toFixed(1)}% with no <3.0. Prefer the stable segment; first-day lows often reflect compression/calibration artifact—confirm suspect periods with finger-stick glucose.`
        ),
        dimensions: ['CGM'],
      });
    }
  }

  // CGM × 睡眠 / 活动联合（启发式，非诊断）
  if (analysis.cgmStats?.daily) {
    const daily = analysis.cgmStats.daily;
    const cgmDayDates = Object.keys(daily).sort();
    const nightHrByDate: Record<string, number> = {};
    for (const d of analysis.watchStats?.days || []) {
      if (d.nightHrMean != null && Number.isFinite(d.nightHrMean)) {
        nightHrByDate[d.date] = d.nightHrMean;
      }
    }

    // 同日：CGM 低值偏多 + 睡眠偏短
    for (const d of cgmDayDates.slice(-14)) {
      const day = daily[d];
      const sleepH = sleepMap[d]?.total;
      if (
        day &&
        day.pctBelow39 >= 15 &&
        day.count >= 12 &&
        sleepH != null &&
        sleepH < 6
      ) {
        signals.push({
          severity: 'watch',
          date: d,
          title: L('睡眠偏短且 CGM 低值偏多', 'Short sleep with many CGM lows'),
          detail: L(
            `${d}：总睡眠 ${sleepH.toFixed(2)} h，CGM <3.9 占比 ${day.pctBelow39.toFixed(1)}%（${day.count} 条）` +
              `，最低 ${day.min.toFixed(1)}。睡眠不足可与低血糖读数同日出现，优先指尖血复核可疑低值并保证睡眠；勿仅凭 CGM 定论。`,
            `${d}: total sleep ${sleepH.toFixed(2)} h, CGM <3.9 share ${day.pctBelow39.toFixed(1)}% (${day.count} points)` +
              `, min ${day.min.toFixed(1)}. Short sleep and low CGM readings can co-occur; confirm suspect lows with finger-stick glucose and prioritize sleep—do not conclude from CGM alone.`
          ),
          dimensions: ['CGM', L('睡眠', 'Sleep')],
        });
      }
    }

    // 同日：高血糖读数 + 步数很低
    for (const d of cgmDayDates.slice(-14)) {
      const day = daily[d];
      const steps = stepsMap[d];
      if (!day || day.count < 12 || steps == null || steps >= 3000) continue;
      const highGlu = day.pctAbove78 >= 15 || day.mean >= 7.8;
      if (!highGlu) continue;
      signals.push({
        severity: 'info',
        date: d,
        title: L('高血糖读数日活动偏低', 'High glucose readings with low activity'),
        detail: L(
          `${d}：CGM 均值 ${day.mean.toFixed(2)} mmol/L` +
            (day.pctAbove78 > 0 ? `，>7.8 占比 ${day.pctAbove78.toFixed(1)}%` : '') +
            `（${day.count} 条）；步数约 ${Math.round(steps)}。` +
            `高读数日活动偏少仅供自我对照（餐后走动等），不能替代诊疗；异常高值建议复测并遵医嘱。`,
          `${d}: CGM mean ${day.mean.toFixed(2)} mmol/L` +
            (day.pctAbove78 > 0 ? `, >7.8 share ${day.pctAbove78.toFixed(1)}%` : '') +
            ` (${day.count} points); steps ~${Math.round(steps)}. ` +
            `Low activity on high-reading days is for self-comparison only (e.g. post-meal walks), not clinical care; recheck unusual highs and follow medical advice.`
        ),
        dimensions: ['CGM', L('步数', 'Steps')],
      });
    }

    // 夜段导向：当日 CGM 低值偏多 + 0–6 点 CGM 均值偏低 + 夜间心率偏高（有数据时）
    if ((data.cgm || []).length && Object.keys(nightHrByDate).length) {
      const nightValsByDate: Record<string, number[]> = {};
      for (const p of data.cgm) {
        const hour = getHour(p.datetime);
        // 与 Watch 夜 HR 一致：0–5 点
        if (!Number.isFinite(hour) || hour < 0 || hour >= 6) continue;
        const date = getDate(p.datetime);
        if (!nightValsByDate[date]) nightValsByDate[date] = [];
        nightValsByDate[date].push(p.value);
      }
      for (const d of Object.keys(nightValsByDate).sort().slice(-14)) {
        const day = daily[d];
        const nightVals = nightValsByDate[d];
        const nightHr = nightHrByDate[d];
        if (!day || day.pctBelow39 < 15 || day.count < 12) continue;
        if (!nightVals || nightVals.length < 3 || nightHr == null) continue;
        const nightMean = nightVals.reduce((a, b) => a + b, 0) / nightVals.length;
        if (nightMean >= 4.0) continue;
        const hrElevated =
          restBase != null ? nightHr >= restBase + 8 : nightHr >= 72;
        if (!hrElevated) continue;
        signals.push({
          severity: 'info',
          date: d,
          title: L('夜段 CGM 偏低且夜间心率偏高', 'Low night CGM with elevated night HR'),
          detail: L(
            `${d}：0–6 点 CGM 均约 ${nightMean.toFixed(2)} mmol/L（${nightVals.length} 点），全日 <3.9 占比 ${day.pctBelow39.toFixed(1)}%；` +
              `夜间心率约 ${nightHr.toFixed(0)} bpm` +
              (restBase != null ? `（近 7 日静息约 ${restBase.toFixed(0)}）` : '') +
              '。夜段低值需排除压迫伪影并用指尖血复核；心率偏高可结合睡眠质量观察。非诊断。',
            `${d}: 0–6h CGM mean ~${nightMean.toFixed(2)} mmol/L (${nightVals.length} points), all-day <3.9 share ${day.pctBelow39.toFixed(1)}%; ` +
              `night HR ~${nightHr.toFixed(0)} bpm` +
              (restBase != null ? ` (7-day resting ~${restBase.toFixed(0)})` : '') +
              '. Rule out compression artifact for night lows and confirm with finger-stick glucose; elevated HR can be viewed with sleep quality. Not a diagnosis.'
          ),
          dimensions: ['CGM', L('夜间心率', 'Night HR'), L('睡眠', 'Sleep')],
        });
      }
    }
  }

  // 多日：稳定期 CGM 低值偏多 + 近 7 日睡眠偏短
  {
    const st = analysis.cgmStats?.stable || analysis.cgmStats?.overall;
    const sleep7 = recentDates(Object.keys(sleepMap), 7);
    const sleepMean7d =
      analysis.recoveryWeek?.sleepMean7d ??
      mean(sleep7.map((d) => sleepMap[d]?.total).filter((v): v is number => v != null && Number.isFinite(v)));
    if (
      st &&
      st.pctBelow39 >= 5 &&
      st.count >= 24 &&
      sleepMean7d != null &&
      sleepMean7d < 6 &&
      sleep7.length >= 3
    ) {
      signals.push({
        severity: 'info',
        title: L(
          '稳定期 CGM 低值偏多且近 7 日睡眠偏短',
          'Stable-segment CGM lows with short sleep over last 7 days'
        ),
        detail: L(
          `稳定期/可用段 <3.9 占比 ${st.pctBelow39.toFixed(1)}%（n=${st.count}），近 7 日睡眠日均约 ${sleepMean7d.toFixed(1)} h。` +
            `恢复与血糖读数可同向偏倚；优先保证睡眠、指尖血复核可疑低值，并避免在睡眠债日过度解读单次 CGM。`,
          `Stable/usable segment <3.9 share ${st.pctBelow39.toFixed(1)}% (n=${st.count}), last 7 days mean sleep ~${sleepMean7d.toFixed(1)} h. ` +
            `Recovery and glucose readings can lean the same way; prioritize sleep, confirm suspect lows with finger-stick glucose, and avoid over-reading single CGM points on sleep-debt days.`
        ),
        dimensions: ['CGM', L('睡眠', 'Sleep')],
      });
    }
  }

  // 步行心率偏高 + HRV 偏低（近 7 日）
  if (hrvBase != null && restBase != null) {
    const walk7 = recentDates(Object.keys(walkMap), 7);
    const walkBase = mean(walk7.map((d) => walkMap[d]));
    if (walkBase != null && walkBase >= 120 && hrvBase < 25) {
      signals.push({
        severity: 'info',
        title: L('近 7 日步行心率偏高且 HRV 偏低', 'Elevated walking HR and low HRV over last 7 days'),
        detail: L(
          `步行心率近 7 日均约 ${walkBase.toFixed(0)} bpm，HRV 近 7 日均约 ${hrvBase.toFixed(1)} ms。可能反映有氧能力/恢复状态偏紧，建议结合睡眠与主观疲劳判断。`,
          `Walking HR 7-day mean ~${walkBase.toFixed(0)} bpm, HRV 7-day mean ~${hrvBase.toFixed(1)} ms. May reflect tighter aerobic capacity/recovery; interpret with sleep and subjective fatigue.`
        ),
        dimensions: [L('步行心率', 'Walking HR'), 'HRV'],
      });
    }
  }

  // Watch：低血氧 / 低活动 / 低锻炼
  const ws = analysis.watchStats;
  if (ws && ws.dayCount > 0) {
    if (ws.spo2Min7d != null && ws.spo2Min7d < 92) {
      signals.push({
        severity: 'watch',
        title: L('近 7 日出现较低血氧读数', 'Lower SpO₂ readings in last 7 days'),
        detail: L(
          `血氧近 7 日均值约 ${ws.spo2Mean7d != null ? ws.spo2Mean7d.toFixed(1) : '—'}%，期间最低约 ${ws.spo2Min7d.toFixed(1)}%（${ws.spo2DayCount} 天有样本）。Apple Watch 血氧易受运动/姿势/佩戴影响；若伴随胸闷、气短或反复偏低，建议复测并必要时就医评估。`,
          `SpO₂ 7-day mean ~${ws.spo2Mean7d != null ? ws.spo2Mean7d.toFixed(1) : '—'}%, period min ~${ws.spo2Min7d.toFixed(1)}% (${ws.spo2DayCount} days with samples). Watch SpO₂ is sensitive to motion/posture/fit; if chest tightness, shortness of breath, or repeated lows appear, recheck and seek care if needed.`
        ),
        dimensions: [L('血氧', 'SpO₂')],
      });
    } else if (ws.spo2Mean7d != null && ws.spo2Mean7d < 95) {
      signals.push({
        severity: 'info',
        title: L('近 7 日血氧均值略偏低', 'Slightly low SpO₂ mean over last 7 days'),
        detail: L(
          `血氧近 7 日均值约 ${ws.spo2Mean7d.toFixed(1)}%。无症状时优先观察趋势与复测；勿单次读数定论。`,
          `SpO₂ 7-day mean ~${ws.spo2Mean7d.toFixed(1)}%. If asymptomatic, prefer trend and rechecks; do not conclude from a single reading.`
        ),
        dimensions: [L('血氧', 'SpO₂')],
      });
    }

    if (ws.exerciseMinMean7d != null && ws.exerciseMinMean7d < 5 && ws.dayCount >= 5) {
      const lowActDays = ws.days
        .slice(-7)
        .filter((d) => d.exerciseMin < 5 && d.activeKcal < 150);
      if (lowActDays.length >= 4) {
        signals.push({
          severity: 'info',
          title: L('近 7 日 Watch 活动量偏低', 'Low Watch activity over last 7 days'),
          detail:
            L(
              `日均锻炼约 ${ws.exerciseMinMean7d.toFixed(0)} 分钟`,
              `Mean exercise ~${ws.exerciseMinMean7d.toFixed(0)} min/day`
            ) +
            (ws.activeKcalMean7d != null
              ? L(
                  `，活动消耗约 ${ws.activeKcalMean7d.toFixed(0)} kcal`,
                  `, active energy ~${ws.activeKcalMean7d.toFixed(0)} kcal`
                )
              : '') +
            L(
              `。可与步数/睡眠对照；久坐日可穿插短时走动，避免仅凭戒指类环达标焦虑。`,
              `. Cross-check steps/sleep; on sedentary days, short walks help—avoid ring/goal anxiety alone.`
            ),
          dimensions: [L('Watch活动', 'Watch activity'), L('步数', 'Steps')],
        });
      }
    }

    // 低锻炼 + 低 HRV（恢复与负荷）
    if (
      ws.exerciseMinMean7d != null &&
      ws.exerciseMinMean7d < 10 &&
      hrvBase != null &&
      hrvBase < 25
    ) {
      signals.push({
        severity: 'info',
        title: L('低活动且 HRV 偏低', 'Low activity with low HRV'),
        detail: L(
          `近 7 日日均锻炼约 ${ws.exerciseMinMean7d.toFixed(0)} 分钟，HRV 约 ${hrvBase.toFixed(1)} ms。可能处于恢复不足或活动过少状态，建议优先睡眠与轻度日常活动，勿在低恢复日强上高强度训练。`,
          `Last 7 days mean exercise ~${ws.exerciseMinMean7d.toFixed(0)} min/day, HRV ~${hrvBase.toFixed(1)} ms. May reflect under-recovery or very low activity; prioritize sleep and light daily movement—avoid hard sessions on low-recovery days.`
        ),
        dimensions: [L('Watch活动', 'Watch activity'), 'HRV'],
      });
    }

    if (ws.nightHrMean7d != null && restBase != null && ws.nightHrMean7d > restBase + 10) {
      signals.push({
        severity: 'info',
        title: L('夜间心率高于日间静息', 'Night HR above daytime resting'),
        detail: L(
          `近 7 日 0–6 点心率均值约 ${ws.nightHrMean7d.toFixed(0)} bpm，日间静息约 ${restBase.toFixed(0)} bpm。可结合睡眠质量、饮酒、疾病或室温解读；持续偏高可观察是否伴随 HRV 下降。`,
          `Last 7 days 0–6h HR mean ~${ws.nightHrMean7d.toFixed(0)} bpm, daytime resting ~${restBase.toFixed(0)} bpm. Interpret with sleep quality, alcohol, illness, or room temperature; if persistently high, note whether HRV also falls.`
        ),
        dimensions: [L('夜间心率', 'Night HR'), L('静息心率', 'Resting HR')],
      });
    }

    // 夜段血氧明显低于日段 / 夜段偏低
    if (ws.spo2NightMin7d != null && ws.spo2NightMin7d < 92) {
      signals.push({
        severity: 'watch',
        title: L('近 7 日夜段血氧出现低值', 'Low night SpO₂ in last 7 days'),
        detail:
          L(
            `夜段(0–8点)最低约 ${ws.spo2NightMin7d.toFixed(1)}%`,
            `Night (0–8h) min ~${ws.spo2NightMin7d.toFixed(1)}%`
          ) +
          (ws.spo2NightMean7d != null
            ? L(
                `，夜段均值约 ${ws.spo2NightMean7d.toFixed(1)}%`,
                `, night mean ~${ws.spo2NightMean7d.toFixed(1)}%`
              )
            : '') +
          (ws.spo2DayMean7d != null
            ? L(
                `；日段均值约 ${ws.spo2DayMean7d.toFixed(1)}%`,
                `; day mean ~${ws.spo2DayMean7d.toFixed(1)}%`
              )
            : '') +
          L(
            '。夜段偏低更需结合睡眠姿势、呼吸与症状；无症状时优先复测与趋势观察。',
            '. Night lows warrant sleep posture, breathing, and symptom context; if asymptomatic, recheck and watch the trend first.'
          ),
        dimensions: [L('血氧', 'SpO₂'), L('睡眠', 'Sleep')],
      });
    } else if (
      ws.spo2NightMean7d != null &&
      ws.spo2DayMean7d != null &&
      ws.spo2NightMean7d <= ws.spo2DayMean7d - 1.5
    ) {
      signals.push({
        severity: 'info',
        title: L('夜段血氧均值低于日段', 'Night SpO₂ mean below day'),
        detail: L(
          `近 7 日夜段 SpO₂ 均值约 ${ws.spo2NightMean7d.toFixed(1)}%，日段约 ${ws.spo2DayMean7d.toFixed(1)}%。差值在 Watch 测量误差范围内也可出现；若伴打鼾/白天嗜睡可记录后咨询医生。`,
          `Last 7 days night SpO₂ mean ~${ws.spo2NightMean7d.toFixed(1)}%, day ~${ws.spo2DayMean7d.toFixed(1)}%. Gaps can fall within Watch measurement noise; if snoring or daytime sleepiness appear, log and discuss with a clinician.`
        ),
        dimensions: [L('血氧', 'SpO₂'), L('睡眠', 'Sleep')],
      });
    }

    // 睡眠呼吸紊乱：相对基线抬升或近段持续偏高（启发式，非诊断）
    {
      const bdSeries = ws.days
        .filter((d) => d.breathingDisturbance != null && Number.isFinite(d.breathingDisturbance!))
        .map((d) => d.breathingDisturbance as number);
      if (bdSeries.length >= 6) {
        const recentN = Math.min(7, Math.max(3, Math.floor(bdSeries.length / 2)));
        const earlierN = Math.min(bdSeries.length - recentN, Math.max(3, recentN));
        const recentVals = bdSeries.slice(-recentN);
        const earlierVals = bdSeries.slice(0, earlierN);
        const recentMean = recentVals.reduce((a, b) => a + b, 0) / recentVals.length;
        const earlierMean = earlierVals.reduce((a, b) => a + b, 0) / earlierVals.length;
        const last5 = bdSeries.slice(-Math.min(5, bdSeries.length));
        const last5Mean = last5.reduce((a, b) => a + b, 0) / last5.length;
        const allMean = bdSeries.reduce((a, b) => a + b, 0) / bdSeries.length;
        const trendUp =
          earlierMean > 0 &&
          recentMean >= earlierMean * 1.35 &&
          recentMean - earlierMean >= 0.15;
        const persistentHigh =
          last5.length >= 4 &&
          allMean > 0 &&
          last5Mean >= allMean * 1.25 &&
          last5.filter((v) => v >= allMean * 1.15).length >= Math.ceil(last5.length * 0.75);
        if (trendUp || persistentHigh) {
          signals.push({
            severity: 'info',
            title: trendUp
              ? L('睡眠呼吸紊乱近期相对抬升', 'Sleep breathing disturbance recently elevated')
              : L('睡眠呼吸紊乱近段持续偏高', 'Sleep breathing disturbance persistently elevated'),
            detail:
              L(
                `有样本共 ${bdSeries.length} 天；近 ${recentN} 日均约 ${recentMean.toFixed(2)}`,
                `${bdSeries.length} days with samples; last ${recentN} days mean ~${recentMean.toFixed(2)}`
              ) +
              (earlierMean > 0
                ? L(`，前段约 ${earlierMean.toFixed(2)}`, `, earlier ~${earlierMean.toFixed(2)}`)
                : '') +
              (ws.breathingDisturbanceMean7d != null
                ? L(
                    `，近 7 日有样本均约 ${ws.breathingDisturbanceMean7d.toFixed(2)}`,
                    `, last 7 days sampled mean ~${ws.breathingDisturbanceMean7d.toFixed(2)}`
                  )
                : '') +
              L(
                '。Apple 睡眠呼吸紊乱为腕表估算趋势，受饮酒、体位、感冒等影响；持续偏高或伴随打鼾/白天嗜睡时，可记录后咨询医生，本工具不作睡眠呼吸暂停诊断。',
                '. Apple sleep breathing disturbance is a watch estimate affected by alcohol, posture, colds, etc.; if persistently high or with snoring/daytime sleepiness, log and consult a clinician—this tool does not diagnose sleep apnea.'
              ),
            dimensions: [L('睡眠呼吸紊乱', 'Sleep breathing disturbance'), L('睡眠', 'Sleep')],
          });
        }
      } else if (
        bdSeries.length >= 3 &&
        ws.breathingDisturbanceMean7d != null &&
        ws.breathingDisturbanceLatest != null &&
        ws.breathingDisturbanceLatest >= ws.breathingDisturbanceMean7d * 1.5 &&
        ws.breathingDisturbanceLatest - ws.breathingDisturbanceMean7d >= 0.2
      ) {
        signals.push({
          severity: 'info',
          title: L(
            '最新睡眠呼吸紊乱高于近段均值',
            'Latest sleep breathing disturbance above recent mean'
          ),
          detail: L(
            `最新约 ${ws.breathingDisturbanceLatest.toFixed(2)}，近 7 日有样本均约 ${ws.breathingDisturbanceMean7d.toFixed(2)}（${bdSeries.length} 天）。单日波动常见；若连续多日偏高且伴症状，宜结合血氧/睡眠观察并必要时就医评估。非诊断结论。`,
            `Latest ~${ws.breathingDisturbanceLatest.toFixed(2)}, last 7 days sampled mean ~${ws.breathingDisturbanceMean7d.toFixed(2)} (${bdSeries.length} days). Single-day swings are common; if elevated for several days with symptoms, also watch SpO₂/sleep and seek care if needed. Not a diagnosis.`
          ),
          dimensions: [L('睡眠呼吸紊乱', 'Sleep breathing disturbance'), L('睡眠', 'Sleep')],
        });
      }
    }

    // 睡眠呼吸紊乱 × 夜段血氧：同日/近邻日与 7 日联合（启发式，非诊断）
    {
      const days = ws.days || [];
      const bdVals = days
        .map((d) => d.breathingDisturbance)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const bdBase =
        bdVals.length >= 3
          ? bdVals.reduce((a, b) => a + b, 0) / bdVals.length
          : null;

      const nightSpo2Low = (d: { spo2NightMin: number | null; spo2NightMean: number | null }) =>
        (d.spo2NightMin != null && d.spo2NightMin < 92) ||
        (d.spo2NightMean != null && d.spo2NightMean < 94);

      const bdElevated = (bd: number) => {
        if (bdBase != null && bdBase > 0) {
          return bd >= bdBase * 1.3 && bd - bdBase >= 0.15;
        }
        return bd >= 1.5;
      };

      // 同日或 ±1 天：呼吸紊乱抬升 + 夜段血氧偏低
      const jointDays: string[] = [];
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        if (d.breathingDisturbance == null || !Number.isFinite(d.breathingDisturbance)) continue;
        if (!bdElevated(d.breathingDisturbance)) continue;
        const neighbors = [days[i], days[i - 1], days[i + 1]].filter(Boolean);
        const spo2Hit = neighbors.find(
          (n) =>
            n &&
            (n.spo2NightMean != null || n.spo2NightMin != null) &&
            nightSpo2Low(n)
        );
        if (spo2Hit) jointDays.push(d.date);
      }
      // 只取近 14 天内的命中，避免历史噪声淹没
      const recentJoint = jointDays.filter((d) => d >= (days[Math.max(0, days.length - 14)]?.date || d));
      if (recentJoint.length >= 1) {
        const sample = recentJoint.slice(-3).join(L('、', ', '));
        const lastDate = recentJoint[recentJoint.length - 1];
        const lastDay = days.find((d) => d.date === lastDate);
        signals.push({
          severity: 'watch',
          date: lastDate,
          title: L('呼吸紊乱抬升且夜段血氧偏低', 'Elevated breathing disturbance with low night SpO₂'),
          detail:
            L(
              `近段有 ${recentJoint.length} 日出现睡眠呼吸紊乱相对偏高，且同日或邻日夜段 SpO₂ 偏低`,
              `Recently ${recentJoint.length} day(s) showed relatively high sleep breathing disturbance with low night SpO₂ same day or adjacent day`
            ) +
            (lastDay?.breathingDisturbance != null
              ? L(
                  `（例 ${lastDate} 紊乱约 ${lastDay.breathingDisturbance.toFixed(2)}`,
                  ` (e.g. ${lastDate} disturbance ~${lastDay.breathingDisturbance.toFixed(2)}`
                )
              : '') +
            (lastDay?.spo2NightMin != null
              ? L(
                  `，夜段最低约 ${lastDay.spo2NightMin.toFixed(1)}%`,
                  `, night min ~${lastDay.spo2NightMin.toFixed(1)}%`
                )
              : lastDay?.spo2NightMean != null
                ? L(
                    `，夜段均约 ${lastDay.spo2NightMean.toFixed(1)}%`,
                    `, night mean ~${lastDay.spo2NightMean.toFixed(1)}%`
                  )
                : '') +
            (lastDay?.breathingDisturbance != null ? ')' : '') +
            (sample && recentJoint.length > 1
              ? L(`；涉及 ${sample}`, `; dates ${sample}`)
              : '') +
            L(
              '。腕表估算受体位、饮酒、感冒等影响；若伴打鼾、白天嗜睡或反复低值，建议记录后咨询医生，本工具不作睡眠呼吸暂停诊断。',
              '. Watch estimates are affected by posture, alcohol, colds, etc.; if snoring, daytime sleepiness, or repeated lows appear, log and consult a clinician—this tool does not diagnose sleep apnea.'
            ),
          dimensions: [
            L('睡眠呼吸紊乱', 'Sleep breathing disturbance'),
            L('血氧', 'SpO₂'),
            L('睡眠', 'Sleep'),
          ],
        });
      }

      // 7 日联合：紊乱均值相对基线抬升 + 夜段血氧阈值
      if (
        bdVals.length >= 4 &&
        ws.breathingDisturbanceMean7d != null &&
        (ws.spo2NightMean7d != null || ws.spo2NightMin7d != null)
      ) {
        const recentN = Math.min(7, Math.max(3, Math.floor(bdVals.length / 2)));
        const earlierN = Math.min(bdVals.length - recentN, Math.max(3, recentN));
        const recentMean =
          bdVals.slice(-recentN).reduce((a, b) => a + b, 0) / recentN;
        const earlierMean =
          earlierN > 0
            ? bdVals.slice(0, earlierN).reduce((a, b) => a + b, 0) / earlierN
            : bdBase;
        const allMean = bdBase ?? recentMean;
        const bd7Elevated =
          (earlierMean != null &&
            earlierMean > 0 &&
            recentMean >= earlierMean * 1.3 &&
            recentMean - earlierMean >= 0.15) ||
          (allMean > 0 &&
            ws.breathingDisturbanceMean7d >= allMean * 1.25 &&
            ws.breathingDisturbanceMean7d - allMean >= 0.12);
        const spo27Low =
          (ws.spo2NightMean7d != null && ws.spo2NightMean7d < 95) ||
          (ws.spo2NightMin7d != null && ws.spo2NightMin7d < 92);
        if (bd7Elevated && spo27Low) {
          signals.push({
            severity: 'watch',
            title: L(
              '近 7 日呼吸紊乱偏高且夜段血氧偏低',
              'Elevated breathing disturbance and low night SpO₂ over last 7 days'
            ),
            detail:
              L(
                `近 7 日有样本呼吸紊乱均约 ${ws.breathingDisturbanceMean7d.toFixed(2)}`,
                `Last 7 days sampled breathing disturbance mean ~${ws.breathingDisturbanceMean7d.toFixed(2)}`
              ) +
              (earlierMean != null
                ? L(`（前段约 ${earlierMean.toFixed(2)}）`, ` (earlier ~${earlierMean.toFixed(2)})`)
                : '') +
              (ws.spo2NightMean7d != null
                ? L(
                    `；夜段 SpO₂ 均约 ${ws.spo2NightMean7d.toFixed(1)}%`,
                    `; night SpO₂ mean ~${ws.spo2NightMean7d.toFixed(1)}%`
                  )
                : '') +
              (ws.spo2NightMin7d != null
                ? L(
                    `，期间夜段最低约 ${ws.spo2NightMin7d.toFixed(1)}%`,
                    `, period night min ~${ws.spo2NightMin7d.toFixed(1)}%`
                  )
                : '') +
              L(
                '。二者同向偏倚更值得对照睡眠与症状；仍为腕表趋势提示，不能诊断睡眠呼吸暂停，必要时就医评估。',
                '. When both lean the same way, also review sleep and symptoms; still a watch trend, not a sleep apnea diagnosis—seek care if needed.'
              ),
            dimensions: [
              L('睡眠呼吸紊乱', 'Sleep breathing disturbance'),
              L('血氧', 'SpO₂'),
              L('睡眠', 'Sleep'),
            ],
          });
        }
      }
    }

    // 活动 × HRV × 夜间心率：恢复压力组合
    if (
      hrvBase != null &&
      ws.nightHrMean7d != null &&
      restBase != null &&
      hrvBase < 28 &&
      ws.nightHrMean7d >= restBase + 5
    ) {
      const ex = ws.exerciseMinMean7d;
      const wos = analysis.workoutStats;
      const trainNote =
        wos && wos.count7d > 0
          ? L(
              `近 7 日 Workout ${wos.count7d} 场、共约 ${wos.durationSum7d.toFixed(0)} 分钟`,
              `Last 7 days: ${wos.count7d} workout(s), ~${wos.durationSum7d.toFixed(0)} min total`
            )
          : ex != null
            ? L(
                `近 7 日日均锻炼约 ${ex.toFixed(0)} 分钟`,
                `Last 7 days mean exercise ~${ex.toFixed(0)} min/day`
              )
            : L('近期活动', 'Recent activity');
      signals.push({
        severity: hrvBase < 22 ? 'watch' : 'info',
        title: L('恢复偏紧（HRV↓ + 夜 HR↑）', 'Tight recovery (HRV↓ + night HR↑)'),
        detail: L(
          `${trainNote}；HRV 近 7 日均约 ${hrvBase.toFixed(1)} ms，夜间心率约 ${ws.nightHrMean7d.toFixed(0)} bpm（静息约 ${restBase.toFixed(0)}）。可能反映睡眠/负荷/疾病恢复压力，建议优先睡眠与低强度日，避免连续高强度。`,
          `${trainNote}; HRV 7-day mean ~${hrvBase.toFixed(1)} ms, night HR ~${ws.nightHrMean7d.toFixed(0)} bpm (resting ~${restBase.toFixed(0)}). May reflect sleep/load/illness recovery pressure; prioritize sleep and easy days, avoid back-to-back hard sessions.`
        ),
        dimensions: ['HRV', L('夜间心率', 'Night HR'), L('Watch活动', 'Watch activity')],
      });
    }
  }

  // 日照偏低 + 睡眠偏短
  if (ws && ws.daylightMinMean7d != null && ws.daylightMinMean7d < 20) {
    const sleep7 = recentDates(Object.keys(sleepMap), 7);
    const sleepAvg = mean(sleep7.map((d) => sleepMap[d]?.total).filter((v): v is number => v != null));
    if (sleepAvg != null && sleepAvg < 6.5) {
      signals.push({
        severity: 'info',
        title: L('近 7 日日照偏少且睡眠偏短', 'Low daylight and short sleep over last 7 days'),
        detail: L(
          `日照日均约 ${ws.daylightMinMean7d.toFixed(0)} 分钟，睡眠日均约 ${sleepAvg.toFixed(1)} h。可尝试白天户外走动；睡眠与日照关联因人而异，仅供自我观察。`,
          `Daylight mean ~${ws.daylightMinMean7d.toFixed(0)} min/day, sleep mean ~${sleepAvg.toFixed(1)} h. Daytime outdoor walks may help; sleep–daylight links vary—self-observation only.`
        ),
        dimensions: [L('日照', 'Daylight'), L('睡眠', 'Sleep')],
      });
    } else {
      signals.push({
        severity: 'info',
        title: L('近 7 日户外日照偏少', 'Low outdoor daylight over last 7 days'),
        detail: L(
          `日照日均约 ${ws.daylightMinMean7d.toFixed(0)} 分钟（Watch 估算）。若室内为主可留意节律与情绪，非医疗指标。`,
          `Daylight mean ~${ws.daylightMinMean7d.toFixed(0)} min/day (Watch estimate). If mostly indoors, note rhythm and mood—not a clinical metric.`
        ),
        dimensions: [L('日照', 'Daylight')],
      });
    }
  }

  // 站立小时偏低
  if (ws && ws.standHoursMean7d != null && ws.standHoursMean7d < 6 && ws.dayCount >= 5) {
    signals.push({
      severity: 'info',
      title: L('近 7 日站立小时偏少', 'Few stand hours over last 7 days'),
      detail: L(
        `站立小时日均约 ${ws.standHoursMean7d.toFixed(1)}（Apple 站立环）。久坐日可每小时起身片刻，与步数/锻炼互补。`,
        `Stand hours mean ~${ws.standHoursMean7d.toFixed(1)}/day (Apple Stand ring). On sedentary days, stand briefly each hour—complements steps/exercise.`
      ),
      dimensions: [L('站立', 'Stand'), L('Watch活动', 'Watch activity')],
    });
  }

  // ECG 高心率：时段 / 训练关联
  const es = analysis.ecgStats;
  if (es && es.count >= 2 && es.highHrCount >= 2) {
    const near = es.highHrNearWorkoutCount ?? 0;
    const rest = es.highHrRestingWindowCount ?? 0;
    const hh = es.highHrCount;
    const nearRatio = near / hh;
    const restRatio = rest / hh;

    // 多数高心率落在训练 ±2h → 信息级（运动相关测量常见）
    if (near >= 2 && nearRatio >= 0.5) {
      signals.push({
        severity: 'info',
        title: L('高心率 ECG 多发生在训练时段', 'High-HR ECGs mostly around workouts'),
        detail: L(
          `共 ${hh} 份高心率 ECG 中约 ${near} 份落在 Workout 开始前后 ±2h（${Math.round(nearRatio * 100)}%）。` +
            `训练中/后测量偏高较常见；若仅见于运动相关时段且无不适，通常可结合恢复观察。勿自行诊断。`,
          `Of ${hh} high-HR ECGs, about ${near} fell within ±2h of a workout start (${Math.round(nearRatio * 100)}%). ` +
            `Higher readings during/after training are common; if only exercise-related and asymptomatic, usually watch recovery. Do not self-diagnose.`
        ),
        dimensions: ['ECG', 'Workout'],
      });
    }

    // 夜间/清晨或无附近训练的高心率偏多 → 需关注
    if (rest >= 2 && restRatio >= 0.5) {
      signals.push({
        severity: 'watch',
        title: L('非运动时段高心率 ECG 偏多', 'Many high-HR ECGs outside exercise'),
        detail: L(
          `共 ${hh} 份高心率中约 ${rest} 份落在夜间/清晨（22–08）或附近无 Workout（±2h）。` +
            `若静息下反复出现或伴心悸、胸闷、头晕，建议就医评估，勿自行诊断。`,
          `Of ${hh} high-HR recordings, about ${rest} fell at night/early morning (22–08) or without a nearby workout (±2h). ` +
            `If repeated at rest or with palpitations, chest tightness, or dizziness, seek clinical evaluation—do not self-diagnose.`
        ),
        dimensions: ['ECG'],
      });
    } else if (!(near >= 2 && nearRatio >= 0.5)) {
      // 无清晰训练关联时保留通用提示
      signals.push({
        severity: 'watch',
        title: L('ECG 多次「高心率」分类', 'Multiple ECG “high heart rate” classifications'),
        detail: L(
          `共 ${es.count} 份 ECG 中 ${es.highHrCount} 份为高心率相关分类。运动后测量常见；若静息下反复出现或伴心悸、胸闷，建议就医评估，勿自行诊断。`,
          `${es.highHrCount} of ${es.count} ECGs are high-HR related. Common after exercise; if repeated at rest or with palpitations/chest tightness, seek clinical evaluation—do not self-diagnose.`
        ),
        dimensions: ['ECG'],
      });
    }
  }

  // 低活动日仍出现高心率 ECG（同日步数/锻炼启发式）
  if (es && (es.highHrOnLowActivityCount ?? 0) >= 2) {
    const low = es.highHrOnLowActivityCount;
    const high = es.highHrOnHighActivityCount ?? 0;
    signals.push({
      severity: 'watch',
      title: L('低活动日仍出现高心率 ECG', 'High-HR ECG on low-activity days'),
      detail: L(
        `约 ${low} 份高心率 ECG 落在步数偏低（<3000）且锻炼很少的日子` +
          (high > 0 ? `；另有约 ${high} 份落在高活动/训练邻域日` : '') +
          '。低活动日仍反复高心率更值得对照症状与复测情境；运动相关测量常见，不能据此自行诊断心律失常。',
        `About ${low} high-HR ECG(s) fell on low-step (<3000) low-exercise days` +
          (high > 0 ? `; about ${high} also fell near high-activity/workout days` : '') +
          '. Repeated high HR on low-activity days warrants symptom and context review; exercise-related measurements are common and do not self-diagnose arrhythmia.'
      ),
      dimensions: ['ECG', L('步数', 'Steps'), L('Watch活动', 'Watch activity')],
    });
  }

  // Workout：大负荷次日 HRV 明显偏低
  const wos = analysis.workoutStats;
  if (wos && wos.sessions.length && Object.keys(hrvByDate).length) {
    for (const s of wos.sessions.slice(-20)) {
      if ((s.durationMin || 0) < 40 && (s.activeKcal || 0) < 300) continue;
      // 次日日历
      const next = new Date(`${s.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextDate = next.toISOString().slice(0, 10);
      const hNext = hrvByDate[nextDate];
      if (!hNext || hrvBase == null) continue;
      if (hNext.allMean < hrvBase * 0.75) {
        signals.push({
          severity: 'info',
          date: nextDate,
          title: L('较大训练后次日 HRV 偏低', 'Low HRV day after a larger workout'),
          detail:
            L(
              `${s.date} ${s.activityType} 约 ${s.durationMin.toFixed(0)} min`,
              `${s.date} ${s.activityType} ~${s.durationMin.toFixed(0)} min`
            ) +
            (s.activeKcal != null
              ? L(` / ${s.activeKcal.toFixed(0)} kcal`, ` / ${s.activeKcal.toFixed(0)} kcal`)
              : '') +
            (s.hrAvg != null
              ? L(`，均 HR ${s.hrAvg.toFixed(0)}`, `, mean HR ${s.hrAvg.toFixed(0)}`)
              : '') +
            L(
              `；次日 ${nextDate} HRV ${hNext.allMean.toFixed(1)} ms（近 7 日均 ${hrvBase.toFixed(1)}）。属常见恢复反应，可安排轻松日。`,
              `; next day ${nextDate} HRV ${hNext.allMean.toFixed(1)} ms (7-day mean ${hrvBase.toFixed(1)}). A common recovery response—consider an easy day.`
            ),
          dimensions: ['Workout', 'HRV'],
        });
      }
    }
  }

  // 去重：同 title+date
  const seen = new Set<string>();
  const unique: CrossSignal[] = [];
  for (const s of signals) {
    const k = `${s.title}|${s.date || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(s);
  }

  // 严重度排序
  const rank: Record<SignalSeverity, number> = { alert: 0, watch: 1, info: 2 };
  unique.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.date || '').localeCompare(String(a.date || '')));
  const out = unique.slice(0, 20);
  // zh-TW: 维度标签等非 L() 拼接处再过一遍词库（L() 已繁体化主文案）
  if (normalizeLocale(options?.locale) === 'zh-TW') {
    for (const s of out) {
      s.title = toTraditionalTitle(s.title);
      s.detail = toTraditionalTitle(s.detail);
      if (s.dimensions && s.dimensions.length) {
        s.dimensions = s.dimensions.map((d) => toTraditionalTitle(d));
      }
    }
  }
  return out;
}

/** 格式化为 Markdown，便于注入提示词或展示 */
export function formatCrossSignalsForLLM(
  signals: CrossSignal[],
  options?: LocaleOptions
): string {
  const L = createL(normalizeLocale(options?.locale));
  if (!signals.length) {
    return (
      L('## 跨维度提示', '## Cross-domain signals') +
      '\n\n' +
      L('（当前规则未触发明显组合信号）', '(No clear combined signals triggered by current rules)') +
      '\n'
    );
  }
  const lines = [
    L('## 跨维度提示（启发式，非诊断）', '## Cross-domain signals (heuristic, not a diagnosis)'),
    '',
    L(
      '| 级别 | 日期 | 标题 | 说明 |',
      '| Level | Date | Title | Detail |'
    ),
    '|---|---|---|---|',
  ];
  for (const s of signals) {
    const level =
      s.severity === 'alert'
        ? L('需关注', 'Attention')
        : s.severity === 'watch'
          ? L('观察', 'Watch')
          : L('提示', 'Note');
    const detail = s.detail.replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push(`| ${level} | ${s.date || '—'} | ${s.title} | ${detail} |`);
  }
  lines.push('');
  lines.push(
    L(
      '> 以上为程序规则生成的线索，须与原始数据交叉核对，不能替代医疗判断。',
      '> Clues above are rule-generated; cross-check with raw data. This does not replace medical judgment.'
    )
  );
  lines.push('');
  return lines.join('\n');
}
