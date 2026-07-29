/**
 * 跨维度规则提示（启发式，非诊断）
 */
import { FullAnalysis } from './types';
import { LocaleOptions } from './locale';
export type SignalSeverity = 'info' | 'watch' | 'alert';
export interface CrossSignal {
    severity: SignalSeverity;
    date?: string;
    title: string;
    detail: string;
    dimensions: string[];
}
export type { LocaleOptions };
/**
 * 基于多日/同日指标组合生成可复核的提示
 */
export declare function detectCrossSignals(analysis: FullAnalysis, options?: LocaleOptions): CrossSignal[];
/** 格式化为 Markdown，便于注入提示词或展示 */
export declare function formatCrossSignalsForLLM(signals: CrossSignal[], options?: LocaleOptions): string;
//# sourceMappingURL=signals.d.ts.map