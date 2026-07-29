/**
 * 自动监测摘要：把统计压成 3–6 条人话要点（非诊断）
 */
import { FullAnalysis } from './types';
import { AppLocale, LocaleOptions } from './locale';
export type InsightTone = 'positive' | 'neutral' | 'watch' | 'alert';
/** 前端跳转目标：section 或 section+panel */
export type InsightAnchor = 'overview' | 'summary' | 'summary-weight' | 'summary-cgm' | 'summary-bp' | 'summary-hrv' | 'summary-watch' | 'summary-workout' | 'summary-recovery' | 'summary-ecg' | 'signals' | 'charts' | 'charts-weight' | 'charts-cgm' | 'charts-spo2' | 'charts-activity' | 'prompt';
export interface InsightBullet {
    tone: InsightTone;
    title: string;
    detail: string;
    /** 点击摘要时滚动/展开的目标 */
    anchor?: InsightAnchor;
}
export type { LocaleOptions };
/**
 * 基于当前分析生成有优先级的监测摘要
 */
export declare function buildInsightBullets(analysis: FullAnalysis, options?: LocaleOptions): InsightBullet[];
export declare function formatInsightsForLLM(bullets: InsightBullet[], options?: LocaleOptions): string;
/**
 * 仅摘要短提示（适合上下文较短的模型，或先快速粘贴）
 * 可选 prefix 由 UI 拼入个人背景，避免与 llm-prompt 循环依赖。
 */
export declare function generateInsightsOnlyPrompt(analysis: FullAnalysis, options?: {
    prefix?: string;
    locale?: AppLocale | string;
}): string;
//# sourceMappingURL=insights.d.ts.map