/**
 * 外部 CSV 导入（欧姆龙类体脂秤 / 血压计中文表头）
 * 与 Apple Health 数据合并，不上传
 */
import { BloodPressureRecord, HealthData, WeightRecord } from './types';
export interface CsvMergeResult {
    weightAdded: number;
    weightUpdated: number;
    bpAdded: number;
    bodyFatFilled: number;
    skipped: number;
    notes: string[];
}
/**
 * 解析体脂秤 CSV（表头含 测量日期时间、体重、体脂肪率 等）
 */
export declare function parseWeightScaleCsv(text: string): WeightRecord[];
/**
 * 解析血压计 CSV（表头含 测量日期时间、高压、低压）
 */
export declare function parseBloodPressureCsv(text: string): BloodPressureRecord[];
/**
 * 将外部 CSV 合并进已有 HealthData（就地修改）
 * - 体重：同分钟已存在则补体脂/BMI；否则新增
 * - 血压：同分钟已存在则跳过；否则新增
 * 合并后调用 finalizeData 重排与体脂挂接
 */
export declare function mergeExternalCsvIntoData(data: HealthData, options?: {
    weightCsvText?: string;
    bpCsvText?: string;
}): CsvMergeResult;
//# sourceMappingURL=csv-import.d.ts.map