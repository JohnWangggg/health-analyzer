/**
 * Lightweight Simplified → Traditional map for short analysis headers/titles.
 * Not full OpenCC / NLP — phrase dictionary only (zh-TW UI chrome remains in i18n.js).
 */

/** Phrase pairs; sorted longest-first at module load. */
const TITLE_PHRASES_RAW: Array<[string, string]> = [
  ['数据质量提示（未来日期已排除）', '資料品質提示（未來日期已排除）'],
  ['个人背景（用户自述，仅供对照，非医疗档案）', '個人背景（用戶自述，僅供對照，非醫療檔案）'],
  ['Apple Watch（活动 / 血氧 / 呼吸 / VO₂ / 腕温 / 呼吸紊乱）', 'Apple Watch（活動 / 血氧 / 呼吸 / VO₂ / 腕溫 / 呼吸紊亂）'],
  ['Apple Watch（活动 / 血氧 / 呼吸 / VO₂ / 腕温）', 'Apple Watch（活動 / 血氧 / 呼吸 / VO₂ / 腕溫）'],
  ['恢复（HRV / 静息心率）', '恢復（HRV / 靜息心率）'],
  ['HRV 相对个人基线', 'HRV 相對個人基線'],
  ['夜间心率相对个人基线', '夜間心率相對個人基線'],
  ['体重近周相对前一周', '體重近週相對前一週'],
  ['呼吸紊乱与夜段血氧', '呼吸紊亂與夜段血氧'],
  ['近 7 日负荷与恢复', '近 7 日負荷與恢復'],
  ['近 7 日负荷/恢复', '近 7 日負荷/恢復'],
  ['多周恢复/负荷趋势', '多週恢復/負荷趨勢'],
  ['体重趋势（晨起）', '體重趨勢（晨起）'],
  ['Workout 训练会话', 'Workout 訓練會話'],
  ['Workout 训练', 'Workout 訓練'],
  ['CGM 动态血糖', 'CGM 動態血糖'],
  ['HRV 心率变异性', 'HRV 心率變異性'],
  ['睡眠呼吸紊乱', '睡眠呼吸紊亂'],
  ['数据可用性', '資料可用性'],
  ['数据覆盖', '資料覆蓋'],
  ['数据概览', '資料概覽'],
  ['数据质量提示', '資料品質提示'],
  ['未来日期已排除', '未來日期已排除'],
  ['体重与体脂', '體重與體脂'],
  ['心肺适能 VO₂ max', '心肺適能 VO₂ max'],
  ['心肺适能', '心肺適能'],
  ['Watch 活动', 'Watch 活動'],
  ['血氧（Watch）', '血氧（Watch）'],
  ['血糖（CGM）', '血糖（CGM）'],
  ['呼吸频率', '呼吸頻率'],
  ['睡眠腕温', '睡眠腕溫'],
  ['夜间心率', '夜間心率'],
  ['静息心率', '靜息心率'],
  ['步数与睡眠', '步數與睡眠'],
  ['训练会话', '訓練會話'],
  ['动态血糖', '動態血糖'],
  ['心率变异性', '心率變異性'],
  ['ECG 心电图', 'ECG 心電圖'],
  ['心电图', '心電圖'],
  ['个人背景', '個人背景'],
  ['用户自述', '用戶自述'],
  ['自动监测摘要（程序生成，非诊断）', '自動監測摘要（程序生成，非診斷）'],
  ['自动监测摘要', '自動監測摘要'],
  ['跨维度提示', '跨維度提示'],
  ['非诊断', '非診斷'],
  ['监测仪表盘', '監測儀表盤'],
  ['需要复查或升级处理的信号', '需要複查或升級處理的訊號'],
  ['当前工作假设', '目前工作假設'],
  ['参考依据', '參考依據'],
  ['总结判断', '總結判斷'],
  ['是否存在', '是否存在'],
  ['数据量', '資料量'],
  ['维度', '維度'],
  ['明细', '明細'],
  ['血压', '血壓'],
  ['体重', '體重'],
  ['体脂', '體脂'],
  ['负荷', '負荷'],
  ['恢复', '恢復'],
  ['活动', '活動'],
  ['趋势', '趨勢'],
  ['紊乱', '紊亂'],
  ['腕温', '腕溫'],
  ['频率', '頻率'],
  ['适能', '適能'],
  ['变异', '變異'],
  ['数据', '資料'],
  ['训练', '訓練'],
  ['监测', '監測'],
  ['信号', '訊號'],
];

const TITLE_PHRASES: Array<[string, string]> = TITLE_PHRASES_RAW.slice().sort(
  (a, b) => b[0].length - a[0].length
);

/**
 * Convert short Simplified Chinese headers/titles to Traditional for zh-TW.
 * Safe for ## headings and insight titles; do not run on full medical prose.
 */
export function toTraditionalTitle(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [from, to] of TITLE_PHRASES) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }
  return out;
}

/**
 * Apply toTraditionalTitle to markdown ## / ### heading lines only.
 */
export function traditionalizeMarkdownHeadings(md: string): string {
  if (!md) return md;
  return md
    .split('\n')
    .map((line) => {
      const m = /^(#{1,6}\s+)(.*)$/.exec(line);
      if (!m) return line;
      return m[1] + toTraditionalTitle(m[2]);
    })
    .join('\n');
}
