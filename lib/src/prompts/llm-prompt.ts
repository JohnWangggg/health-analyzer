/**
 * 大模型提示词模板
 * 用于生成可直接粘贴到豆包/ChatGPT/Claude 等平台的提示词
 */

import { FullAnalysis, UserContext } from '../types';

/** 主提示词：引导 LLM 按指定格式输出深度分析报告 */
export const MAIN_PROMPT_TEMPLATE = `# 角色与任务
你是一位严谨的临床数据分析师。请基于下方「个人背景（如有）」与「原始数据与统计」生成一份《个人健康自我监测深度分析报告》，严格按照以下结构与风格：
- 不下诊断结论、不开药、不替代门诊
- 若提供了用药/目标体重/关注点，请在解读中对照使用，但仍不得改药或下诊断
- 关注趋势、相关性与可操作建议
- 数字优先、辅以解释，避免空话
- 任何可疑异常必须给"复核建议"

# 输出结构（必须按以下固定标题顺序输出；没有数据的维度跳过）

## 0. 总结判断
- 用 3-5 个要点概括本次数据给出的最重要发现
- 列出当前监测优先级（按风险/关注度排序）

## 数据概览
## CGM 动态血糖
## 血压
## 体重
## HRV 心率变异性
## 心率
## 步数与睡眠
## ECG 心电图
（仅输出有数据的维度；每个维度包含：现状、趋势、解读、风险与建议）

## 监测仪表盘
每天只看 8 个核心指标，避免数据焦虑。表格列出：模块 | 指标 | 目标/警戒

## 需要复查或升级处理的信号
区分“立即寻求急诊帮助”“尽快联系医生”“复测并持续记录”，不要因单次无症状异常直接下结论。

## 当前工作假设
列出最符合现有数据的 5-7 个工作假设

## 参考依据
- American Diabetes Association CGM Time in Range: https://diabetes.org/about-diabetes/devices-technology/cgm-time-in-range
- International Consensus on Time in Range: https://diabetesjournals.org/care/article/42/8/1593/36184/Clinical-Targets-for-Continuous-Glucose-Monitoring
- Abbott FreeStyle Libre CGM 滞后说明: https://www.freestylelibre.com.au/difference-between-glucose-interstitial-glucose
- U-M CGM 夜间低值说明: https://teamdynamix.umich.edu/TDClient/210/DepressionCenter/KB/Article/10689/CGM-Is-Reading-Low-Values

# 写作风格要求
- 中文输出，使用 Markdown 表格呈现数据
- 表格数字右对齐，阈值和警戒值使用 \`代码格式\` 标注
- 关键发现用 **加粗**
- 区分"已确认"vs"待验证"vs"假设"
- 出现 CGM <3.9 mmol/L 必须说"必须指尖血复核"
- 出现 <3.0 mmol/L 升级为"按低血糖处理"
- 高血糖参考阈值：随机 >11.1 mmol/L 或空腹 >7.0 mmol/L；CGM 不能单独用于诊断，需结合复测和医生/实验室评估

# 数据使用边界声明
- CGM 测量组织间液葡萄糖，与指尖血存在 5-10 分钟滞后
- 异常低值必须用指尖血复核，不能仅凭 CGM
- 睡眠/步数/HRV 数据来自 Apple Watch，存在测量误差
- 单次异常应先复测并结合症状、持续时间和重复次数判断
- 本报告不替代医生门诊，所有降压/降糖方案调整请遵医嘱

---

# 原始数据与统计
（请基于下方个人背景与数据生成报告）

{ANALYSIS_JSON}
`;

function trimText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function hasAnyUserContext(ctx?: UserContext | null): boolean {
  if (!ctx) return false;
  return Boolean(
    (ctx.age != null && Number.isFinite(Number(ctx.age))) ||
    trimText(ctx.sex) ||
    (ctx.heightCm != null && Number.isFinite(Number(ctx.heightCm))) ||
    trimText(ctx.medications) ||
    trimText(ctx.conditions) ||
    (ctx.targetWeightKg != null && Number.isFinite(Number(ctx.targetWeightKg))) ||
    trimText(ctx.focus) ||
    trimText(ctx.notes)
  );
}

/**
 * 将可选个人上下文格式化为 Markdown（空则返回空串）
 */
export function formatUserContext(ctx?: UserContext | null): string {
  if (!hasAnyUserContext(ctx) || !ctx) return '';
  const lines: string[] = [
    '## 个人背景（用户自述，仅供对照，非医疗档案）',
    '',
    '| 项目 | 内容 |',
    '|---|---|',
  ];
  if (ctx.age != null && Number.isFinite(Number(ctx.age))) {
    lines.push(`| 年龄 | ${Number(ctx.age)} 岁 |`);
  }
  if (trimText(ctx.sex)) {
    lines.push(`| 性别 | ${trimText(ctx.sex)} |`);
  }
  if (ctx.heightCm != null && Number.isFinite(Number(ctx.heightCm))) {
    lines.push(`| 身高 | ${Number(ctx.heightCm)} cm |`);
  }
  if (ctx.targetWeightKg != null && Number.isFinite(Number(ctx.targetWeightKg))) {
    lines.push(`| 目标体重 | ${Number(ctx.targetWeightKg)} kg |`);
  }
  if (trimText(ctx.medications)) {
    lines.push(`| 当前用药 | ${trimText(ctx.medications)} |`);
  }
  if (trimText(ctx.conditions)) {
    lines.push(`| 已知情况 | ${trimText(ctx.conditions)} |`);
  }
  if (trimText(ctx.focus)) {
    lines.push(`| 本次关注点 | ${trimText(ctx.focus)} |`);
  }
  if (trimText(ctx.notes)) {
    lines.push(`| 补充说明 | ${trimText(ctx.notes)} |`);
  }
  lines.push('');
  lines.push('> 以上为用户本地填写的自述信息，可能不完整；解读时作背景参考，不得据此开药或下诊断。');
  lines.push('');
  return lines.join('\n');
}

/**
 * 将分析结果格式化为 LLM 友好的 Markdown 文本块
 */
export function formatAnalysisForLLM(analysis: FullAnalysis): string {
  const sections: string[] = [];
  const { data, cgmStats, bpStats, hrvByDate, dateRange } = analysis;
  const detailDays = 90;
  const recentDateSet = (dates: string[]) => {
    const sorted = [...dates].sort();
    const latest = sorted[sorted.length - 1];
    if (!latest) return new Set<string>();
    const cutoff = new Date(`${latest}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - (detailDays - 1));
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return new Set(sorted.filter(date => date >= cutoffDate));
  };
  sections.push(`> 明细表默认展示最近 ${detailDays} 天；更早数据已纳入总体统计，但为控制提示词长度未逐条展开。`);
  sections.push(``);

  // 数据可用性
  const av = data.dataAvailability;
  sections.push(`## 数据可用性`);
  sections.push(``);
  sections.push(`| 维度 | 是否存在 | 数据量 |`);
  sections.push(`|---|---|---|`);
  sections.push(`| CGM 动态血糖 | ${av.hasCgm ? '✅' : '❌'} | ${data.cgm.length} 条 |`);
  sections.push(`| 血压 | ${av.hasBloodPressure ? '✅' : '❌'} | ${data.bloodPressure.length} 条 |`);
  sections.push(`| 体重 | ${av.hasWeight ? '✅' : '❌'} | ${data.weight.length} 条 |`);
  sections.push(`| HRV | ${av.hasHrv ? '✅' : '❌'} | ${Object.keys(hrvByDate).length} 天 |`);
  sections.push(`| 静息/步行心率 | ${av.hasHeartRate ? '✅' : '❌'} | ${Object.keys(data.restingHr).length} 天 |`);
  sections.push(`| 步数 | ${av.hasSteps ? '✅' : '❌'} | ${Object.keys(data.steps).length} 天 |`);
  sections.push(`| 睡眠 | ${av.hasSleep ? '✅' : '❌'} | ${Object.keys(data.sleep).length} 天 |`);
  sections.push(`| ECG | ${av.hasEcg ? '✅' : '❌'} | ${data.ecg.length} 份 |`);
  sections.push(``);
  sections.push(`数据时间范围：${dateRange.start} 至 ${dateRange.end}`);
  sections.push(``);

  // CGM
  if (cgmStats) {
    sections.push(`## CGM 动态血糖`);
    sections.push(``);
    const o = cgmStats.overall;
    sections.push(`**总体统计**（共 ${o.count} 条，时间范围：${o.timeRange}）`);
    sections.push(``);
    sections.push(`| 指标 | 值 |`);
    sections.push(`|---|---|`);
    sections.push(`| 平均 | ${o.mean.toFixed(2)} mmol/L |`);
    sections.push(`| 标准差 | ${o.std.toFixed(2)} mmol/L |`);
    sections.push(`| CV 变异系数 | ${o.cv.toFixed(1)}% |`);
    sections.push(`| 最低 | ${o.min.toFixed(1)} mmol/L |`);
    sections.push(`| 最高 | ${o.max.toFixed(1)} mmol/L |`);
    sections.push(`| TIR (3.9-10.0 mmol/L) | ${o.pctInRange.toFixed(1)}% |`);
    sections.push(`| <3.9 mmol/L | ${o.pctBelow39.toFixed(1)}% |`);
    sections.push(`| <3.0 mmol/L | ${o.pctBelow30.toFixed(1)}% |`);
    sections.push(`| >7.8 mmol/L | ${o.pctAbove78.toFixed(1)}% |`);
    sections.push(`| >10.0 mmol/L | ${o.pctAbove100.toFixed(1)}% |`);
    sections.push(``);
    sections.push(`**分日统计**：`);
    sections.push(``);
    sections.push(`| 日期 | 条数 | 均值 | 最低 | 最高 | CV% | <3.9% | >7.8% |`);
    sections.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
    const recentDates = recentDateSet(Object.keys(cgmStats.daily));
    for (const date of Object.keys(cgmStats.daily).filter(date => recentDates.has(date)).sort()) {
      const d = cgmStats.daily[date];
      sections.push(
        `| ${date} | ${d.count} | ${d.mean.toFixed(2)} | ${d.min.toFixed(1)} | ${d.max.toFixed(1)} | ${d.cv.toFixed(1)} | ${d.pctBelow39.toFixed(1)} | ${d.pctAbove78.toFixed(1)} |`
      );
    }
    sections.push(``);
    sections.push(`**最大血糖上升**：30分钟 ${cgmStats.maxRises['30min'].rise.toFixed(1)} mmol/L, 60分钟 ${cgmStats.maxRises['60min'].rise.toFixed(1)} mmol/L, 120分钟 ${cgmStats.maxRises['120min'].rise.toFixed(1)} mmol/L`);
    sections.push(``);
  }

  // 血压
  if (bpStats && bpStats.records.length > 0) {
    sections.push(`## 血压`);
    sections.push(``);
    sections.push(`**所有血压记录**（共 ${bpStats.records.length} 条）：`);
    sections.push(``);
    sections.push(`| 时间 | 收缩压 | 舒张压 | 备注 |`);
    sections.push(`|---|---:|---:|---|`);
    const recentDates = recentDateSet(bpStats.records.map(r => r.date));
    for (const r of bpStats.records.filter(r => recentDates.has(r.date))) {
      const low = r.systolic < 90 || r.diastolic < 60 ? ' ⚠️' : '';
      sections.push(`| ${r.datetime} | ${r.systolic} | ${r.diastolic} |${low} |`);
    }
    sections.push(``);
    sections.push(`**时段均值**：`);
    sections.push(``);
    sections.push(`| 时段 | 收缩压 | 舒张压 | 条数 | <90/60 |`);
    sections.push(`|---|---:|---:|---:|---:|`);
    if (bpStats.mean7d) {
      const m = bpStats.mean7d;
      sections.push(`| 最近 7 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
    }
    if (bpStats.mean14d) {
      const m = bpStats.mean14d;
      sections.push(`| 最近 14 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
    }
    if (bpStats.mean30d) {
      const m = bpStats.mean30d;
      sections.push(`| 最近 30 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
    }
    sections.push(``);
  }

  // 体重
  if (data.weight.length > 0) {
    sections.push(`## 体重`);
    sections.push(``);
    sections.push(`| 时间 | 体重 (kg) |`);
    sections.push(`|---|---:|`);
    const recentDates = recentDateSet(data.weight.map(w => w.date));
    for (const w of data.weight.filter(w => recentDates.has(w.date))) {
      sections.push(`| ${w.datetime} | ${w.value.toFixed(1)} |`);
    }
    sections.push(``);
  }

  // HRV
  if (Object.keys(hrvByDate).length > 0) {
    sections.push(`## HRV 心率变异性`);
    sections.push(``);
    sections.push(`| 日期 | 全天均值 | 夜间均值 | 最低 | 最高 | 样本数 |`);
    sections.push(`|---|---:|---:|---:|---:|---:|`);
    const recentDates = recentDateSet(Object.keys(hrvByDate));
    for (const date of Object.keys(hrvByDate).filter(date => recentDates.has(date)).sort()) {
      const h = hrvByDate[date];
      sections.push(
        `| ${date} | ${h.allMean.toFixed(1)} | ${h.overnightMean.toFixed(1)} | ${h.min.toFixed(1)} | ${h.max.toFixed(1)} | ${h.count} |`
      );
    }
    sections.push(``);
  }

  // 心率
  if (Object.keys(data.restingHr).length > 0 || Object.keys(data.walkingHr).length > 0) {
    sections.push(`## 心率`);
    sections.push(``);
    const allDates = new Set([
      ...Object.keys(data.restingHr),
      ...Object.keys(data.walkingHr),
    ]);
    const recentDates = recentDateSet(Array.from(allDates));
    const visibleDates = Array.from(allDates).filter(date => recentDates.has(date));
    sections.push(`| 日期 | 静息心率 | 步行心率 |`);
    sections.push(`|---|---:|---:|`);
    for (const date of visibleDates.sort()) {
      const r = data.restingHr[date] ?? '—';
      const w = data.walkingHr[date] ?? '—';
      sections.push(`| ${date} | ${r} | ${w} |`);
    }
    sections.push(``);
  }

  // 步数 + 睡眠
  if (Object.keys(data.steps).length > 0 || Object.keys(data.sleep).length > 0) {
    sections.push(`## 步数与睡眠`);
    sections.push(``);
    const allDates = new Set([
      ...Object.keys(data.steps),
      ...Object.keys(data.sleep),
    ]);
    const recentDates = recentDateSet(Array.from(allDates));
    sections.push(`| 日期 | 步数 | 睡眠(h) | 深睡(h) | REM(h) |`);
    sections.push(`|---|---:|---:|---:|---:|`);
    for (const date of Array.from(allDates).filter(date => recentDates.has(date)).sort()) {
      const steps = data.steps[date]?.max ?? '—';
      const sleep = data.sleep[date];
      const sleepStr = sleep ? sleep.total.toFixed(2) : '—';
      const deepStr = sleep ? sleep.deep.toFixed(2) : '—';
      const remStr = sleep ? sleep.rem.toFixed(2) : '—';
      sections.push(`| ${date} | ${steps} | ${sleepStr} | ${deepStr} | ${remStr} |`);
    }
    sections.push(``);
  }

  // ECG
  if (data.ecg.length > 0) {
    sections.push(`## ECG 心电图`);
    sections.push(``);
    sections.push(`共 ${data.ecg.length} 份 ECG`);
    sections.push(``);
    const counts: Record<string, number> = {};
    for (const e of data.ecg) {
      counts[e.classification] = (counts[e.classification] || 0) + 1;
    }
    sections.push(`分类统计：`);
    for (const [k, v] of Object.entries(counts)) {
      sections.push(`- ${k}: ${v} 份`);
    }
    sections.push(``);
  }

  return sections.join('\n');
}

function combineContextAndData(analysis: FullAnalysis, userContext?: UserContext | null): string {
  const dataSection = formatAnalysisForLLM(analysis);
  const ctxSection = formatUserContext(userContext);
  return ctxSection ? `${ctxSection}\n${dataSection}` : dataSection;
}

/**
 * 生成完整的大模型提示词（主提示词 + 可选个人背景 + 格式化数据）
 */
export function generateLLMPrompt(analysis: FullAnalysis, userContext?: UserContext | null): string {
  const dataSection = combineContextAndData(analysis, userContext);
  return MAIN_PROMPT_TEMPLATE
    .replace('{ANALYSIS_JSON}', dataSection)
    .replace('{ANALYSIS_DATA}', dataSection);
}

/**
 * 仅输出格式化后的数据块（可选附带个人背景，不含主提示词模板）
 */
export function generateDataOnly(analysis: FullAnalysis, userContext?: UserContext | null): string {
  return combineContextAndData(analysis, userContext);
}

/** 简化的 system prompt（用于不支持长 system prompt 的平台） */
export const SHORT_SYSTEM_PROMPT = `你是一位严谨的健康数据分析师。基于用户提供的 Apple Health 统计生成中文 Markdown 报告；只分析实际存在的数据，按“总结判断、数据维度、监测仪表盘、需要复查或升级处理的信号、当前工作假设、参考依据”顺序组织。不下诊断结论；CGM <3.9 必须建议指尖血复核，CGM 不能单独用于诊断；单次异常先复测并结合症状判断；所有用药调整请遵医嘱。`;
