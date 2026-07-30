/**
 * 外部 CSV 导入（欧姆龙类体脂秤 / 血压计中文表头）
 * 与 Apple Health 数据合并，不上传
 */

import { BloodPressureRecord, HealthData, WeightRecord } from './types';
import { getDate, finalizeData } from './parser';

export interface CsvMergeResult {
  weightAdded: number;
  weightUpdated: number;
  bpAdded: number;
  bodyFatFilled: number;
  skipped: number;
  notes: string[];
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function parseCsvLine(line: string): string[] {
  // 简单 CSV：无复杂引号嵌套
  return line.split(',').map((c) => c.trim());
}

function normalizeDt(raw: string): string {
  const s = raw.trim().replace('T', ' ');
  // 2025-10-23 20:18:12 → 补时区便于排序（字符串仍可 slice 日期）
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !/[+-]\d{4}$/.test(s) && !/Z$/.test(s)) {
    return `${s} +0800`;
  }
  return s;
}

function parseNum(s: string): number | null {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析体脂秤 CSV（表头含 测量日期时间、体重、体脂肪率 等）
 */
export function parseWeightScaleCsv(text: string): WeightRecord[] {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  // 宽松匹配列名
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDt = idx(['测量日期时间', '日期时间', 'datetime', '时间', 'date']);
  const iW = idx(['体重', 'weight']);
  const iFat = idx(['体脂肪', '体脂', 'bodyfat', 'body fat']);
  const iBmi = idx(['bmi']);
  const iMuscle = idx(['骨骼肌', 'muscle']);
  if (iDt < 0 || iW < 0) return [];

  const out: WeightRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    if (!cols[iDt] || !cols[iW]) continue;
    const datetime = normalizeDt(cols[iDt]);
    const value = parseNum(cols[iW]);
    if (value == null || value < 20 || value > 300) continue;
    const rec: WeightRecord = {
      datetime,
      date: getDate(datetime),
      value,
      source: 'external-csv',
    };
    if (iFat >= 0) {
      const fat = parseNum(cols[iFat]);
      if (fat != null && fat > 0 && fat < 80) rec.bodyFat = fat;
    }
    if (iBmi >= 0) {
      const bmi = parseNum(cols[iBmi]);
      if (bmi != null) rec.bmi = bmi;
    }
    if (iMuscle >= 0) {
      const m = parseNum(cols[iMuscle]);
      if (m != null) rec.muscleMass = m;
    }
    out.push(rec);
  }
  return out;
}

/**
 * 解析血压计 CSV（表头含 测量日期时间、高压、低压）
 */
export function parseBloodPressureCsv(text: string): BloodPressureRecord[] {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDt = idx(['测量日期时间', '日期时间', 'datetime', '时间', 'date']);
  const iSys = idx(['高压', '收缩', 'systolic', 'sys']);
  const iDia = idx(['低压', '舒张', 'diastolic', 'dia']);
  if (iDt < 0 || iSys < 0 || iDia < 0) return [];

  const out: BloodPressureRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    if (!cols[iDt]) continue;
    const datetime = normalizeDt(cols[iDt]);
    const systolic = parseNum(cols[iSys]);
    const diastolic = parseNum(cols[iDia]);
    if (systolic == null || diastolic == null) continue;
    if (systolic < 50 || systolic > 250 || diastolic < 30 || diastolic > 150) continue;
    out.push({
      datetime,
      date: getDate(datetime),
      systolic,
      diastolic,
      source: 'external-csv',
    });
  }
  return out;
}

function sameMinute(a: string, b: string): boolean {
  // 比较到分钟
  return a.slice(0, 16) === b.slice(0, 16);
}

/**
 * 将外部 CSV 合并进已有 HealthData（就地修改）
 * - 体重：同分钟已存在则补体脂/BMI；否则新增
 * - 血压：同分钟已存在则跳过；否则新增
 * 合并后调用 finalizeData 重排与体脂挂接
 */
export function mergeExternalCsvIntoData(
  data: HealthData,
  options: { weightCsvText?: string; bpCsvText?: string } = {}
): CsvMergeResult {
  const result: CsvMergeResult = {
    weightAdded: 0,
    weightUpdated: 0,
    bpAdded: 0,
    bodyFatFilled: 0,
    skipped: 0,
    notes: [],
  };

  if (options.weightCsvText) {
    const rows = parseWeightScaleCsv(options.weightCsvText);
    if (!rows.length) {
      result.notes.push('体重 CSV 未识别到有效行（请确认含「测量日期时间」「体重」列）');
    }
    for (const row of rows) {
      const hit = data.weight.find(
        (w) => sameMinute(w.datetime, row.datetime) || (w.date === row.date && Math.abs(w.value - row.value) < 0.05)
      );
      if (hit) {
        let updated = false;
        if (hit.bodyFat == null && row.bodyFat != null) {
          hit.bodyFat = row.bodyFat;
          result.bodyFatFilled += 1;
          updated = true;
        }
        if (hit.bmi == null && row.bmi != null) {
          hit.bmi = row.bmi;
          updated = true;
        }
        if (hit.muscleMass == null && row.muscleMass != null) {
          hit.muscleMass = row.muscleMass;
          updated = true;
        }
        if (updated) result.weightUpdated += 1;
        else result.skipped += 1;
      } else {
        data.weight.push({ ...row });
        if (row.bodyFat != null) {
          data.bodyFat.push({
            datetime: row.datetime,
            date: row.date,
            value: row.bodyFat,
            source: 'external-csv',
          });
        }
        result.weightAdded += 1;
      }
    }
    if (rows.length) {
      data.dataAvailability.hasWeight = true;
      if (data.weight.some((w) => w.bodyFat != null) || data.bodyFat.length) {
        data.dataAvailability.hasBodyFat = true;
      }
    }
  }

  if (options.bpCsvText) {
    const rows = parseBloodPressureCsv(options.bpCsvText);
    if (!rows.length) {
      result.notes.push('血压 CSV 未识别到有效行（请确认含「测量日期时间」「高压」「低压」列）');
    }
    for (const row of rows) {
      const hit = data.bloodPressure.find(
        (b) =>
          sameMinute(b.datetime, row.datetime) ||
          (b.date === row.date && b.systolic === row.systolic && b.diastolic === row.diastolic)
      );
      if (hit) {
        result.skipped += 1;
      } else {
        data.bloodPressure.push({ ...row });
        result.bpAdded += 1;
      }
    }
    if (rows.length) data.dataAvailability.hasBloodPressure = true;
  }

  finalizeData(data);
  return result;
}
