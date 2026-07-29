/**
 * 门诊一页纸：极简 Markdown，便于打印/粘贴给医生（非诊断）
 */

import { FullAnalysis, UserContext } from './types';
import { buildInsightBullets } from './insights';
import { detectCrossSignals } from './signals';
import { createL, normalizeLocale, LocaleOptions } from './locale';
import { formatUserContext } from './prompts/llm-prompt';

function meanLast(
  map: Record<string, number> | undefined,
  n: number,
  end: string
): number | null {
  if (!map) return null;
  const keys = Object.keys(map)
    .filter((d) => d <= end)
    .sort();
  if (!keys.length) return null;
  const slice = keys.slice(-n).map((d) => map[d]).filter(Number.isFinite);
  if (!slice.length) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * 生成门诊快速评估一页纸 Markdown
 */
export function generateVisitSummaryMarkdown(
  analysis: FullAnalysis,
  userContext?: UserContext | null,
  options?: LocaleOptions
): string {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const end = analysis.dateRange?.end || '';
  const start = analysis.dateRange?.start || '';
  const lines: string[] = [];

  lines.push(L('# 门诊快速评估一页纸', '# Clinic visit one-pager'));
  lines.push(``);
  lines.push(
    L(
      `> **非诊断** · 仅供门诊沟通与复测线索；用药/诊断请遵医嘱。`,
      `> **Not a diagnosis** · For clinic discussion and recheck cues only; follow a clinician for meds/diagnosis.`
    )
  );
  lines.push(``);
  lines.push(
    L(
      `**数据覆盖**：${start || '—'} ~ ${end || '—'}`,
      `**Data range**: ${start || '—'} ~ ${end || '—'}`
    )
  );
  lines.push(
    L(
      `**生成**：${analysis.generatedAt || new Date().toISOString()}`,
      `**Generated**: ${analysis.generatedAt || new Date().toISOString()}`
    )
  );
  lines.push(``);

  const ctx = formatUserContext(userContext, { locale });
  if (ctx?.trim()) {
    lines.push(ctx.trimEnd());
    lines.push(``);
  }

  // 核心数字
  lines.push(L('## 核心指标（摘要）', '## Key metrics (snapshot)'));
  lines.push(``);
  lines.push(L('| 指标 | 值 |', '| Metric | Value |'));
  lines.push('|---|---|');

  const ws = analysis.weightStats;
  if (ws?.latestTrend) {
    const d =
      ws.earliestTrend != null
        ? ws.latestTrend.weight - ws.earliestTrend.weight
        : null;
    lines.push(
      L(
        `| 晨起趋势体重 | ${ws.latestTrend.weight.toFixed(1)} kg（${ws.latestTrend.date}）` +
          (d != null ? `，相对最早 ${d >= 0 ? '+' : ''}${d.toFixed(1)} kg` : '') +
          ` |`,
        `| Morning trend weight | ${ws.latestTrend.weight.toFixed(1)} kg (${ws.latestTrend.date})` +
          (d != null ? `, vs earliest ${d >= 0 ? '+' : ''}${d.toFixed(1)} kg` : '') +
          ` |`
      )
    );
  }
  if (ws?.bodyFatLatest != null) {
    lines.push(
      L(
        `| 最新体脂 | ${ws.bodyFatLatest.toFixed(1)}% |`,
        `| Latest body fat | ${ws.bodyFatLatest.toFixed(1)}% |`
      )
    );
  }

  const cgm = analysis.cgmStats?.stable || analysis.cgmStats?.overall;
  if (cgm) {
    const label = analysis.cgmStats?.stable
      ? L('CGM 稳定期', 'CGM stable period')
      : L('CGM 全程', 'CGM overall');
    const unitOk = analysis.cgmStats?.unitReliable !== false;
    if (!unitOk) {
      lines.push(
        L(
          `| ${label} | 单位待确认 · n=${cgm.count} · **TIR/低值占比不可信，暂停阈值解读** |`,
          `| ${label} | units unconfirmed · n=${cgm.count} · **TIR/low share untrusted — pause threshold reading** |`
        )
      );
    } else {
      const method =
        cgm.tirMethod === 'sample_share'
          ? L('采样占比', 'sample-share')
          : L('时间加权', 'time-weighted');
      lines.push(
        L(
          `| ${label} | 均 ${cgm.mean.toFixed(2)} mmol/L · TIR ${cgm.pctInRange.toFixed(0)}%（${method}） · <3.9 ${cgm.pctBelow39.toFixed(1)}% · n=${cgm.count} |`,
          `| ${label} | mean ${cgm.mean.toFixed(2)} mmol/L · TIR ${cgm.pctInRange.toFixed(0)}% (${method}) · <3.9 ${cgm.pctBelow39.toFixed(1)}% · n=${cgm.count} |`
        )
      );
    }
  }

  const bp = analysis.bpStats?.mean7d;
  if (bp) {
    const m = analysis.bpStats?.morning7d;
    const e = analysis.bpStats?.evening7d;
    lines.push(
      L(
        `| 血压近 7 日 | ${bp.systolic.toFixed(0)}/${bp.diastolic.toFixed(0)} mmHg` +
          (m && e
            ? `（晨 ${m.systolic.toFixed(0)} / 晚 ${e.systolic.toFixed(0)}）`
            : '') +
          ` |`,
        `| BP last 7d | ${bp.systolic.toFixed(0)}/${bp.diastolic.toFixed(0)} mmHg` +
          (m && e
            ? ` (AM ${m.systolic.toFixed(0)} / PM ${e.systolic.toFixed(0)})`
            : '') +
          ` |`
      )
    );
  }

  if (end) {
    const hrvMap: Record<string, number> = {};
    for (const [d, h] of Object.entries(analysis.hrvByDate || {})) {
      if (h && Number.isFinite(h.allMean)) hrvMap[d] = h.allMean;
    }
    const hrv = meanLast(hrvMap, 7, end);
    if (hrv != null) {
      lines.push(
        L(`| HRV 近 7 日 | ${hrv.toFixed(1)} ms |`, `| HRV last 7d | ${hrv.toFixed(1)} ms |`)
      );
    }
    const rest = meanLast(analysis.restingHrByDate || analysis.data.restingHr, 7, end);
    if (rest != null) {
      lines.push(
        L(
          `| 静息心率近 7 日 | ${rest.toFixed(0)} bpm |`,
          `| Resting HR last 7d | ${rest.toFixed(0)} bpm |`
        )
      );
    }
  }

  const rw = analysis.recoveryWeek;
  if (rw) {
    lines.push(
      L(
        `| 近 7 日恢复/负荷 | 恢复 ${rw.recoveryScore ?? '—'} · 负荷 ${rw.loadScore ?? '—'} · ${rw.statusLabel} |`,
        `| Recovery/load 7d | recovery ${rw.recoveryScore ?? '—'} · load ${rw.loadScore ?? '—'} · ${rw.statusLabel} |`
      )
    );
  }

  const wos = analysis.workoutStats;
  if (wos) {
    lines.push(
      L(
        `| Workout 近 30 日 | ${wos.count30d} 场 / ${wos.durationSum30d.toFixed(0)} min |`,
        `| Workouts last 30d | ${wos.count30d} sessions / ${wos.durationSum30d.toFixed(0)} min |`
      )
    );
  }

  const es = analysis.ecgStats;
  if (es && es.count > 0) {
    lines.push(
      L(
        `| ECG | ${es.count} 份（窦性 ${es.sinusCount} · 高心率 ${es.highHrCount} · 不佳 ${es.inconclusiveCount}） |`,
        `| ECG | ${es.count} (sinus ${es.sinusCount} · high HR ${es.highHrCount} · poor ${es.inconclusiveCount}) |`
      )
    );
  }
  lines.push(``);

  // 要点（最多 5）
  const bullets = buildInsightBullets(analysis, { locale }).slice(0, 5);
  lines.push(L('## 监测要点（程序生成）', '## Monitoring highlights (auto)'));
  lines.push(``);
  if (!bullets.length) {
    lines.push(L('- （暂无足够摘要）', '- (No summary available)'));
  } else {
    for (const b of bullets) {
      const tag =
        b.tone === 'alert'
          ? L('需关注', 'Alert')
          : b.tone === 'watch'
            ? L('观察', 'Watch')
            : b.tone === 'positive'
              ? L('积极', 'Good')
              : L('提示', 'Note');
      lines.push(`- **[${tag}] ${b.title}**：${b.detail}`);
    }
  }
  lines.push(``);

  // 信号（最多 5）
  const signals = detectCrossSignals(analysis, { locale }).slice(0, 5);
  lines.push(L('## 需复核线索', '## Cues to recheck'));
  lines.push(``);
  if (!signals.length) {
    lines.push(
      L(
        '- 当前规则未触发明显组合信号；边界值仍建议人工核对。',
        '- No strong rule-based combo signals; still review edge values manually.'
      )
    );
  } else {
    for (const s of signals) {
      const sev =
        s.severity === 'alert'
          ? L('警报', 'Alert')
          : s.severity === 'watch'
            ? L('留意', 'Watch')
            : L('信息', 'Info');
      const when = s.date ? ` (${s.date})` : '';
      lines.push(`- **[${sev}] ${s.title}**${when}：${s.detail}`);
    }
  }
  lines.push(``);

  lines.push(L('## 边界声明', '## Disclaimer'));
  lines.push(``);
  lines.push(
    L(
      '- 数据来自 Apple Health / 可选外部 CSV，存在测量与算法误差。',
      '- Data from Apple Health / optional CSV; measurement and algorithm error exist.'
    )
  );
  lines.push(
    L(
      '- CGM 为组织间液，异常须指尖血复核；不能单独诊断。',
      '- CGM is interstitial fluid; abnormal values need fingerstick; not diagnostic alone.'
    )
  );
  lines.push(
    L(
      '- 本文不替代门诊，不开药、不下诊断。',
      '- This sheet does not replace a clinical visit; no prescriptions or diagnoses.'
    )
  );
  lines.push(``);

  return lines.join('\n');
}
