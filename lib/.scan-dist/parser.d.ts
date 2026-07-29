/**
 * Apple Health XML 解析器
 * 支持同步与异步流式解析，无需外部依赖
 */
import { RawRecord, HealthData, ERecordSummary } from './types';
/** 从 datetime 字符串提取日期部分 */
export declare function getDate(dt: string): string;
/** 从 datetime 字符串提取小时 */
export declare function getHour(dt: string): number;
/** 将 Apple Health 的 +0800 时区格式转换为 JS 更稳定的 ISO 格式。 */
export declare function parseAppleDate(dt: string): number;
/** 本地日历「今天」YYYY-MM-DD（用于排除误录的未来日期） */
export declare function getLocalToday(now?: Date): string;
/** 从 XML 行取属性 */
export declare function xmlAttr(line: string, name: string): string | undefined;
/** HKWorkoutActivityTypeWalking → Walking */
export declare function shortWorkoutType(raw: string): string;
export declare function workoutTypeLabel(activityType: string): string;
/** 日期是否晚于参考日（均 YYYY-MM-DD 字符串比较） */
export declare function isFutureDate(date: string, referenceDate: string): boolean;
/**
 * 解析单个 Record 行的属性
 */
export declare function parseRecordLine(line: string): RawRecord | null;
/** 创建空的 HealthData 容器 */
export declare function createEmptyData(referenceDate?: string): HealthData;
export interface ProcessRecordOptions {
    startDate?: string;
    endDate?: string;
    /**
     * 是否保留未来日期记录。默认 false：跳过 startDate 的日历日晚于 referenceDate 的记录。
     * 用于过滤健康 App 中误录的未来体重等。
     */
    allowFuture?: boolean;
    /** 判定「今天」的参考日 YYYY-MM-DD；默认本地今天 */
    referenceDate?: string;
}
/**
 * 处理单条 Record，写入 data
 */
export declare function processRecord(rec: RawRecord, data: HealthData, startDateOrOptions?: string | ProcessRecordOptions, endDateMaybe?: string): void;
/**
 * 解析完整 <Workout>...</Workout> 或自关闭 Workout 行，写入 data.workouts
 */
export declare function processWorkoutBlock(block: string, data: HealthData, options?: ProcessRecordOptions): void;
/** 多行 Workout 解析状态 */
export interface ParseLineState {
    workoutBuf: string[] | null;
}
export declare function createParseLineState(): ParseLineState;
/**
 * 统一处理 XML 行：Record + 跨行 Workout
 */
export declare function processXmlLine(line: string, data: HealthData, options: ProcessRecordOptions, state: ParseLineState): void;
export declare function flushParseLineState(state: ParseLineState, data: HealthData, options: ProcessRecordOptions): void;
/**
 * 后处理：步数 max、血压配对完成、排序、体脂合并
 */
export declare function finalizeData(data: HealthData): void;
export interface ParseHealthXmlOptions {
    startDate?: string;
    endDate?: string;
    onProgress?: (progress: number) => void;
    /** 默认 false：排除日历日晚于 referenceDate 的记录 */
    allowFuture?: boolean;
    /** 判定「今天」YYYY-MM-DD；默认本地今天；单测可注入 */
    referenceDate?: string;
}
/**
 * 同步解析（小文件）
 */
export declare function parseHealthXml(xmlText: string, options?: ParseHealthXmlOptions): HealthData;
export type OnRecordCallback = (rec: RawRecord, lineIndex: number) => void;
export type OnProgressCallback = (progress: number) => void;
export interface StreamParseResult {
    totalLines: number;
    totalBytes: number;
}
/**
 * 字节流式解析：TextDecoder 按块解码，处理跨块行边界，周期性 yield 主线程
 */
export declare function parseBytesStream(bytes: Uint8Array | ArrayBuffer, onRecord: OnRecordCallback, onProgress?: OnProgressCallback): Promise<StreamParseResult>;
/**
 * 异步流式解析 XML（字符串或字节）
 */
export declare function parseXmlStream(source: string | Uint8Array | ArrayBuffer, onRecord: OnRecordCallback, onProgress?: OnProgressCallback): Promise<StreamParseResult>;
export declare function parseHealthXmlAsync(source: string | Uint8Array | ArrayBuffer, options?: ParseHealthXmlOptions): Promise<HealthData>;
/**
 * 解析 ECG CSV（Apple Watch ECG 导出）
 * 兼容中英文元数据头
 */
export declare function parseEcgCsv(text: string): ERecordSummary;
/**
 * 批量解析 ECG CSV 文本列表，去重后排序
 */
export declare function mergeEcgEntries(existing: ERecordSummary[] | undefined, texts: string[]): ERecordSummary[];
/**
 * 从 zip 包提取 export.xml 字节与 ECG 条目
 * 依赖 globalThis.fflate（浏览器中由 fflate.min.js 提供）
 */
export declare function extractXmlFromZip(zipFile: {
    arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<{
    xmlBytes: Uint8Array;
    ecgEntries: {
        filename: string;
        text: string;
    }[];
    xmlFileName: string;
}>;
/**
 * 从 File 读取文本
 */
export declare function readFileAsText(file: File): Promise<string>;
//# sourceMappingURL=parser.d.ts.map