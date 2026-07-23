/**
 * Apple Health XML 解析器
 * 支持同步与异步流式解析，无需外部依赖
 */

import {
  RawRecord,
  HealthData,
  BloodPressureRecord,
  ERecordSummary,
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

/** 解析过程中血压配对用的内部 Map（WeakMap 避免污染 HealthData） */
const bpMaps = new WeakMap<HealthData, Map<string, BloodPressureRecord>>();

function getBpMap(data: HealthData): Map<string, BloodPressureRecord> {
  let map = bpMaps.get(data);
  if (!map) {
    map = new Map();
    bpMaps.set(data, map);
  }
  return map;
}

/** 创建空的 HealthData 容器 */
export function createEmptyData(): HealthData {
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
  bpMaps.set(data, new Map());
  return data;
}

/**
 * 处理单条 Record，写入 data
 */
export function processRecord(
  rec: RawRecord,
  data: HealthData,
  startDate?: string,
  endDate?: string
): void {
  const rdate = rec.startDate;
  const date = getDate(rdate);

  if (startDate && date < startDate) return;
  if (endDate && date > endDate) return;

  const numericValue = Number.parseFloat(rec.value);
  if (!Number.isFinite(numericValue) && rec.type !== 'HKCategoryTypeIdentifierSleepAnalysis') {
    return;
  }

  if (rec.type === 'HKQuantityTypeIdentifierBloodGlucose') {
    const sourceLower = rec.source.toLowerCase();
    if (
      rec.source.includes('欧态') ||
      sourceLower.includes('cgm') ||
      sourceLower.includes('libre') ||
      sourceLower.includes('glucose')
    ) {
      data.cgm.push({ datetime: rdate, value: numericValue });
      data.dataAvailability.hasCgm = true;
    }
  } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureSystolic') {
    const map = getBpMap(data);
    const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
    record.systolic = numericValue;
    map.set(rdate, record);
    data.dataAvailability.hasBloodPressure = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureDiastolic') {
    const map = getBpMap(data);
    const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
    record.diastolic = numericValue;
    map.set(rdate, record);
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
    if (!rec.source.includes('Watch')) return;
    if (!rec.endDate) return;
    try {
      const startMs = parseAppleDate(rdate);
      const endMs = parseAppleDate(rec.endDate);
      const durationSec = (endMs - startMs) / 1000;
      if (!Number.isFinite(durationSec) || durationSec <= 0) return;
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
}

/**
 * 后处理：步数 max、血压配对完成、排序
 */
export function finalizeData(data: HealthData): void {
  for (const date in data.steps) {
    data.steps[date].max = Math.max(data.steps[date].watch, data.steps[date].iphone);
  }

  const map = bpMaps.get(data);
  if (map) {
    data.bloodPressure = [...map.values()].filter((r) => r.systolic > 0 && r.diastolic > 0);
    bpMaps.delete(data);
  } else {
    data.bloodPressure = data.bloodPressure.filter((r) => r.systolic > 0 && r.diastolic > 0);
  }
  data.bloodPressure.sort((a, b) => a.datetime.localeCompare(b.datetime));
  data.cgm.sort((a, b) => a.datetime.localeCompare(b.datetime));
  data.weight.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export interface ParseHealthXmlOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  onProgress?: (progress: number) => void;
}

/**
 * 同步解析（小文件）
 */
export function parseHealthXml(
  xmlText: string,
  options: ParseHealthXmlOptions = {}
): HealthData {
  const { startDate, endDate, onProgress } = options;
  const data = createEmptyData();
  const lines = xmlText.split('\n');
  const total = lines.length;
  const reportEvery = Math.max(1, Math.floor(total / 100));

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    if (line.indexOf('<Record ') === -1 && line.indexOf('<Record\t') === -1) continue;

    const rec = parseRecordLine(line);
    if (!rec || rec.value === '') continue;

    processRecord(rec, data, startDate, endDate);

    if (onProgress && i % reportEvery === 0) {
      onProgress(i / total);
    }
  }

  finalizeData(data);
  if (onProgress) onProgress(1);
  return data;
}

export type OnRecordCallback = (rec: RawRecord, lineIndex: number) => void;
export type OnProgressCallback = (progress: number) => void;

export interface StreamParseResult {
  totalLines: number;
  totalBytes: number;
}

/**
 * 按字符串流式扫描 Record 行（同步扫描，返回 Promise 以统一 API）
 */
function parseStringStream(
  text: string,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  let pos = 0;
  const len = text.length;
  let lastReport = 0;
  let i = 0;

  while (pos < len) {
    let endPos = text.indexOf('\n', pos);
    if (endPos === -1) endPos = len;
    const line = text.substring(pos, endPos);
    pos = endPos + 1;

    if (line.indexOf('<Record ') !== -1 || line.indexOf('<Record\t') !== -1) {
      const rec = parseRecordLine(line);
      if (rec && rec.value !== '') {
        onRecord(rec, i);
      }
    }
    i++;

    if (i - lastReport > 5000) {
      lastReport = i;
      if (onProgress) onProgress(pos / len);
    }
  }
  if (onProgress) onProgress(1);
  return Promise.resolve({ totalLines: i, totalBytes: len });
}

/**
 * 字节流式解析：TextDecoder 按块解码，处理跨块行边界，周期性 yield 主线程
 */
export async function parseBytesStream(
  bytes: Uint8Array | ArrayBuffer,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decoder = new TextDecoder('utf-8');
  const totalBytes = view.byteLength;
  const chunkSize = 4 * 1024 * 1024; // 4MB

  let pendingLine = '';
  let i = 0;
  let lastYield = Date.now();

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = view.subarray(offset, Math.min(offset + chunkSize, totalBytes));
    let text = decoder.decode(chunk, { stream: true });
    text = pendingLine + text;
    pendingLine = '';

    const lines = text.split('\n');
    if (offset + chunkSize < totalBytes) {
      pendingLine = lines.pop() ?? '';
    }

    for (const line of lines) {
      if (line.indexOf('<Record ') !== -1 || line.indexOf('<Record\t') !== -1) {
        const rec = parseRecordLine(line);
        if (rec && rec.value !== '') {
          onRecord(rec, i);
        }
      }
      i++;
    }

    const processed = offset + chunk.byteLength;
    if (onProgress) onProgress(processed / totalBytes);

    if (Date.now() - lastYield > 50) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }

  if (pendingLine) {
    if (pendingLine.indexOf('<Record ') !== -1 || pendingLine.indexOf('<Record\t') !== -1) {
      const rec = parseRecordLine(pendingLine);
      if (rec && rec.value !== '') onRecord(rec, i);
    }
  }

  if (onProgress) onProgress(1);
  return { totalLines: i, totalBytes };
}

/**
 * 异步流式解析 XML（字符串或字节）
 */
export async function parseXmlStream(
  source: string | Uint8Array | ArrayBuffer,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  if (typeof source === 'string') {
    return parseStringStream(source, onRecord, onProgress);
  }
  return parseBytesStream(source, onRecord, onProgress);
}

/**
 * 高层 API：异步解析（用于大文件 / Uint8Array）
 */
export async function parseHealthXmlAsync(
  source: string | Uint8Array | ArrayBuffer,
  options: ParseHealthXmlOptions = {}
): Promise<HealthData> {
  const { startDate, endDate, onProgress } = options;
  const data = createEmptyData();

  await parseXmlStream(
    source,
    (rec) => {
      processRecord(rec, data, startDate, endDate);
    },
    onProgress
  );

  finalizeData(data);
  return data;
}

/**
 * 解析 ECG CSV（Apple Watch ECG 导出）
 * 兼容中英文元数据头
 */
export function parseEcgCsv(text: string): ERecordSummary {
  const lines = text.split('\n');
  const summary: ERecordSummary = {
    datetime: '',
    classification: 'unknown',
  };

  for (const line of lines) {
    const trimmed = line.trim();
    // 中文
    if (trimmed.startsWith('记录日期,')) {
      summary.datetime = trimmed.replace('记录日期,', '').trim();
    } else if (trimmed.startsWith('分类,')) {
      summary.classification = trimmed.replace('分类,', '').trim();
    } else if (trimmed.startsWith('设备,')) {
      summary.device = trimmed.replace('设备,', '').replace(/"/g, '').trim();
    }
    // 英文变体
    else if (/^Record Date,/i.test(trimmed) || /^Date,/i.test(trimmed)) {
      summary.datetime = trimmed.replace(/^[^,]+,/, '').trim();
    } else if (/^Classification,/i.test(trimmed)) {
      summary.classification = trimmed.replace(/^[^,]+,/, '').trim();
    } else if (/^Device,/i.test(trimmed)) {
      summary.device = trimmed.replace(/^[^,]+,/, '').replace(/"/g, '').trim();
    }

    // 采样行以数字或负号开头时跳过
    if (/^-?\d/.test(trimmed) && trimmed.includes('.')) {
      break;
    }
  }

  return summary;
}

/**
 * 从 zip 包提取 export.xml 字节与 ECG 条目
 * 依赖 globalThis.fflate（浏览器中由 fflate.min.js 提供）
 */
export async function extractXmlFromZip(zipFile: {
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<{
  xmlBytes: Uint8Array;
  ecgEntries: { filename: string; text: string }[];
  xmlFileName: string;
}> {
  const g = globalThis as typeof globalThis & {
    fflate?: {
      unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
    };
  };
  if (typeof g.fflate === 'undefined') {
    throw new Error('fflate 库未加载');
  }

  const buf = await zipFile.arrayBuffer();
  const unzipped = g.fflate.unzipSync(new Uint8Array(buf));

  // 修复 macOS ZIP 文件名 UTF-8 编码问题
  const decodedEntries: Record<string, Uint8Array> = {};
  for (const key of Object.keys(unzipped)) {
    const bytes = new Uint8Array(key.length);
    for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      decoded = key;
    }
    if (decoded.includes('\ufffd')) decoded = key;
    decodedEntries[decoded] = unzipped[key];
  }

  const xmlKeys = Object.keys(decodedEntries).filter((k) => /\.xml$/i.test(k));
  const xmlFile =
    xmlKeys.find((k) => k.endsWith('export.xml') && !k.endsWith('export_cda.xml')) ||
    xmlKeys.find((k) => /导出\.xml$/i.test(k)) ||
    xmlKeys
      .filter((k) => !k.endsWith('export_cda.xml'))
      .sort((a, b) => decodedEntries[b].byteLength - decodedEntries[a].byteLength)[0];

  if (!xmlFile) {
    const fileList = Object.keys(decodedEntries).slice(0, 10).join(', ');
    throw new Error(`ZIP 包中未找到 export.xml 或 导出.xml。前 10 个文件: ${fileList}`);
  }

  return {
    xmlBytes: decodedEntries[xmlFile],
    ecgEntries: Object.keys(decodedEntries)
      .filter((k) => /electrocardiograms/i.test(k) && k.endsWith('.csv'))
      .map((k) => ({
        filename: k,
        text: new TextDecoder('utf-8').decode(decodedEntries[k]),
      })),
    xmlFileName: xmlFile,
  };
}

/**
 * 从 File 读取文本
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
