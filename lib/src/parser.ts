/**
 * Apple Health XML 解析器
 * 支持大型 XML 文件（流式读取），无需外部依赖
 */

import {
  RawRecord,
  HealthData,
  CgmPoint,
  BloodPressureRecord,
  WeightRecord,
  ERecordSummary,
  DataAvailability,
} from './types';

/** 从 datetime 字符串提取日期部分 */
export function getDate(dt: string): string {
  return dt.slice(0, 10);
}

/** 从 datetime 字符串提取小时 */
export function getHour(dt: string): number {
  return parseInt(dt.slice(11, 13), 10);
}

/** 将 Apple Health 的 +0800 时区格式转换为 JS 更稳定的 ISO 格式。 */
export function parseAppleDate(dt: string): number {
  const normalized = dt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(normalized);
}

/**
 * 解析单个 Record 行的属性
 */
export function parseRecordLine(line: string): RawRecord | null {
  const attr = (name: string): string | undefined => {
    const match = line.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
    return match?.[2];
  };
  const type = attr('type');
  const startDate = attr('startDate');

  if (!type || !startDate) return null;
  return {
    type,
    source: attr('sourceName') ?? '',
    startDate,
    endDate: attr('endDate'),
    value: attr('value') ?? '',
  };
}

/**
 * 解析 ECG CSV（Apple Watch ECG 导出）
 * 文件格式: 元数据头 + 采样数据
 */
export function parseEcgCsv(text: string): ERecordSummary {
  const lines = text.split('\n');
  const summary: ERecordSummary = {
    datetime: '',
    classification: 'unknown',
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('记录日期,')) {
      summary.datetime = trimmed.replace('记录日期,', '').trim();
    } else if (trimmed.startsWith('分类,')) {
      summary.classification = trimmed.replace('分类,', '').trim();
    } else if (trimmed.startsWith('设备,')) {
      summary.device = trimmed.replace('设备,', '').replace(/"/g, '').trim();
    }
    // 采样行以数字或负号开头时跳过
    if (/^-?\d/.test(trimmed) && trimmed.includes('.')) {
      break;
    }
  }

  return summary;
}

/**
 * 解析整个 Apple Health 导出 XML（流式，按行）
 * 可处理超大文件
 */
export function parseHealthXml(
  xmlText: string,
  options: {
    startDate?: string; // YYYY-MM-DD
    endDate?: string;
    onProgress?: (progress: number) => void;
  } = {}
): HealthData {
  const { startDate, endDate, onProgress } = options;

  const data: HealthData = {
    cgm: [],
    bloodPressure: [],
    weight: [],
    hrv: {},
    hrvOvernight: {},
    restingHr: {},
    walkingHr: {},
    steps: {},
    sleep: {},
    ecg: [],
    dataAvailability: {
      hasCgm: false,
      hasBloodPressure: false,
      hasWeight: false,
      hasHrv: false,
      hasHeartRate: false,
      hasSteps: false,
      hasSleep: false,
      hasEcg: false,
    },
  };

  const lines = xmlText.split('\n');
  const total = lines.length;
  const reportEvery = Math.max(1, Math.floor(total / 100));
  const bloodPressureByDateTime = new Map<string, BloodPressureRecord>();

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    if (line.indexOf('<Record ') === -1 && line.indexOf('<Record\t') === -1) continue;

    const rec = parseRecordLine(line);
    if (!rec || rec.value === '') continue;

    const rdate = rec.startDate;
    const date = getDate(rdate);

    // 日期过滤
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;

    // 数值类型
    const numericValue = Number.parseFloat(rec.value);
    if (!Number.isFinite(numericValue) && rec.type !== 'HKCategoryTypeIdentifierSleepAnalysis') continue;

    if (rec.type === 'HKQuantityTypeIdentifierBloodGlucose') {
      const sourceLower = rec.source.toLowerCase();
      if (rec.source.includes('欧态') || sourceLower.includes('cgm') || sourceLower.includes('libre') || sourceLower.includes('glucose')) {
        data.cgm.push({ datetime: rdate, value: numericValue });
        data.dataAvailability.hasCgm = true;
      }
    } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureSystolic') {
      const record = bloodPressureByDateTime.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
      record.systolic = numericValue;
      bloodPressureByDateTime.set(rdate, record);
      data.dataAvailability.hasBloodPressure = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureDiastolic') {
      const record = bloodPressureByDateTime.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
      record.diastolic = numericValue;
      bloodPressureByDateTime.set(rdate, record);
    } else if (rec.type === 'HKQuantityTypeIdentifierBodyMass') {
      data.weight.push({ datetime: rdate, date, value: numericValue });
      data.dataAvailability.hasWeight = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      if (!data.hrv[date]) data.hrv[date] = [];
      data.hrv[date].push(numericValue);
      if (getHour(rdate) < 9) {
        if (!data.hrvOvernight[date]) data.hrvOvernight[date] = [];
        data.hrvOvernight[date].push(numericValue);
      }
      data.dataAvailability.hasHrv = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierRestingHeartRate') {
      data.restingHr[date] = numericValue;
      data.dataAvailability.hasHeartRate = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierWalkingHeartRateAverage') {
      data.walkingHr[date] = numericValue;
      data.dataAvailability.hasHeartRate = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierStepCount') {
      if (!data.steps[date]) {
        data.steps[date] = { watch: 0, iphone: 0, max: 0 };
      }
      if (rec.source.includes('Watch')) {
        data.steps[date].watch += numericValue;
      } else if (rec.source.includes('iPhone')) {
        data.steps[date].iphone += numericValue;
      }
      data.dataAvailability.hasSteps = true;
    } else if (rec.type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      if (!rec.source.includes('Watch')) continue;
      if (!rec.endDate) continue;
      try {
        const startMs = parseAppleDate(rdate);
        const endMs = parseAppleDate(rec.endDate);
        const durationSec = (endMs - startMs) / 1000;
        if (!Number.isFinite(durationSec) || durationSec <= 0) continue;
        if (!data.sleep[date]) {
          data.sleep[date] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
        }
        const hours = durationSec / 3600;
        switch (rec.value) {
          case 'HKCategoryValueSleepAnalysisAsleepDeep':
            data.sleep[date].deep += hours;
            data.sleep[date].total += hours;
            break;
          case 'HKCategoryValueSleepAnalysisAsleepREM':
            data.sleep[date].rem += hours;
            data.sleep[date].total += hours;
            break;
          case 'HKCategoryValueSleepAnalysisAsleepCore':
            data.sleep[date].core += hours;
            data.sleep[date].total += hours;
            break;
          case 'HKCategoryValueSleepAnalysisAwake':
            data.sleep[date].awake += hours;
            break;
        }
        data.dataAvailability.hasSleep = true;
      } catch {
        // ignore malformed
      }
    }

    if (onProgress && i % reportEvery === 0) {
      onProgress(i / total);
    }
  }

  // 后处理：步数取 max
  for (const date in data.steps) {
    data.steps[date].max = Math.max(
      data.steps[date].watch,
      data.steps[date].iphone
    );
  }

  // 仅保留完整血压记录
  data.bloodPressure = [...bloodPressureByDateTime.values()].filter(
    (r) => r.systolic > 0 && r.diastolic > 0
  );
  data.bloodPressure.sort((a, b) => a.datetime.localeCompare(b.datetime));

  // 按时间排序 CGM
  data.cgm.sort((a, b) => a.datetime.localeCompare(b.datetime));

  // 按时间排序体重
  data.weight.sort((a, b) => a.datetime.localeCompare(b.datetime));

  if (onProgress) onProgress(1);

  return data;
}

/**
 * 从 zip 包或目录读取所有文件并解析
 * 接受 FileSystemDirectoryEntry/File[]/FileList 形式
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
