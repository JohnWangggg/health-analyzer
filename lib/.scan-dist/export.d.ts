/**
 * 导出 JSON / CSV / 周报 Markdown（纯文本，无副作用）
 */
import { FullAnalysis } from './types';
import { AnalysisSnapshot } from './snapshot';
import { CrossSignal } from './signals';
export { generateWeeklyReportMarkdown } from './weekly-report';
export { generateVisitSummaryMarkdown } from './visit-summary';
export interface ExportBundle {
    /** 完整分析 JSON（含明细，可能较大） */
    analysisJson: string;
    /** 摘要快照 JSON */
    snapshotJson: string;
    /** 多个 CSV 文件 */
    csvFiles: {
        filename: string;
        content: string;
    }[];
    signals: CrossSignal[];
    snapshot: AnalysisSnapshot;
}
/** 生成可下载的导出包内容 */
export declare function buildExportBundle(analysis: FullAnalysis): ExportBundle;
/** 将多 CSV 拼成单文件（兼容无 zip 场景） */
export declare function joinCsvBundle(csvFiles: {
    filename: string;
    content: string;
}[]): string;
//# sourceMappingURL=export.d.ts.map