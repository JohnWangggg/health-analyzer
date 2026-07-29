/**
 * 一键周报 Markdown 导出（中英，非诊断）
 */
import { FullAnalysis, UserContext } from './types';
import { AppLocale } from './locale';
export type WeeklyReportOptions = {
    locale?: AppLocale | string;
};
/**
 * 生成近 7 日周报 Markdown（相对 dateRange.end）。
 * 纯函数，无副作用。
 * @param options.locale 'zh-CN' | 'en'（默认 zh-CN）
 */
export declare function generateWeeklyReportMarkdown(analysis: FullAnalysis, userContext?: UserContext | null, options?: WeeklyReportOptions): string;
//# sourceMappingURL=weekly-report.d.ts.map