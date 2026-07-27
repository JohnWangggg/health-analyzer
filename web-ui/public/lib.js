/**
 * 健康分析库 - 浏览器版本（由 TypeScript 源构建）
 * 请勿手改本文件：修改 lib/src 后在 lib/ 下运行 npm run build:browser
 */

"use strict";
var HealthAnalyzer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    MAIN_PROMPT_TEMPLATE: () => MAIN_PROMPT_TEMPLATE,
    SHORT_SYSTEM_PROMPT: () => SHORT_SYSTEM_PROMPT,
    analyzeAll: () => analyzeAll,
    calcBloodPressureStats: () => calcBloodPressureStats,
    calcBpStats: () => calcBloodPressureStats,
    calcCgmStats: () => calcCgmStats,
    createEmptyData: () => createEmptyData,
    extractXmlFromZip: () => extractXmlFromZip,
    finalizeData: () => finalizeData,
    formatAnalysisForLLM: () => formatAnalysisForLLM,
    formatUserContext: () => formatUserContext,
    generateDataOnly: () => generateDataOnly,
    generateLLMPrompt: () => generateLLMPrompt,
    getDate: () => getDate,
    getHour: () => getHour,
    parseAppleDate: () => parseAppleDate,
    parseBytesStream: () => parseBytesStream,
    parseEcgCsv: () => parseEcgCsv,
    parseHealthXml: () => parseHealthXml,
    parseHealthXmlAsync: () => parseHealthXmlAsync,
    parseRecordLine: () => parseRecordLine,
    parseXmlStream: () => parseXmlStream,
    processRecord: () => processRecord,
    summarizeHrvByDay: () => summarizeHrvByDay
  });

  // src/parser.ts
  function getDate(dt) {
    return dt.slice(0, 10);
  }
  function getHour(dt) {
    return parseInt(dt.slice(11, 13), 10);
  }
  function parseAppleDate(dt) {
    const normalized = dt.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return Date.parse(normalized);
  }
  function parseRecordLine(line) {
    const attr = (name) => {
      const match = line.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
      return match?.[2];
    };
    const type = attr("type");
    const startDate = attr("startDate");
    if (!type || !startDate) return null;
    return {
      type,
      source: attr("sourceName") ?? "",
      startDate,
      endDate: attr("endDate"),
      value: attr("value") ?? ""
    };
  }
  var bpMaps = /* @__PURE__ */ new WeakMap();
  function getBpMap(data) {
    let map = bpMaps.get(data);
    if (!map) {
      map = /* @__PURE__ */ new Map();
      bpMaps.set(data, map);
    }
    return map;
  }
  function createEmptyData() {
    const data = {
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
        hasEcg: false
      }
    };
    bpMaps.set(data, /* @__PURE__ */ new Map());
    return data;
  }
  function processRecord(rec, data, startDate, endDate) {
    const rdate = rec.startDate;
    const date = getDate(rdate);
    if (startDate && date < startDate) return;
    if (endDate && date > endDate) return;
    const numericValue = Number.parseFloat(rec.value);
    if (!Number.isFinite(numericValue) && rec.type !== "HKCategoryTypeIdentifierSleepAnalysis") {
      return;
    }
    if (rec.type === "HKQuantityTypeIdentifierBloodGlucose") {
      const sourceLower = rec.source.toLowerCase();
      if (rec.source.includes("\u6B27\u6001") || sourceLower.includes("cgm") || sourceLower.includes("libre") || sourceLower.includes("glucose")) {
        data.cgm.push({ datetime: rdate, value: numericValue });
        data.dataAvailability.hasCgm = true;
      }
    } else if (rec.type === "HKQuantityTypeIdentifierBloodPressureSystolic") {
      const map = getBpMap(data);
      const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
      record.systolic = numericValue;
      map.set(rdate, record);
      data.dataAvailability.hasBloodPressure = true;
    } else if (rec.type === "HKQuantityTypeIdentifierBloodPressureDiastolic") {
      const map = getBpMap(data);
      const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
      record.diastolic = numericValue;
      map.set(rdate, record);
    } else if (rec.type === "HKQuantityTypeIdentifierBodyMass") {
      data.weight.push({ datetime: rdate, date, value: numericValue });
      data.dataAvailability.hasWeight = true;
    } else if (rec.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN") {
      if (!data.hrv[date]) data.hrv[date] = [];
      data.hrv[date].push(numericValue);
      if (getHour(rdate) < 9) {
        if (!data.hrvOvernight[date]) data.hrvOvernight[date] = [];
        data.hrvOvernight[date].push(numericValue);
      }
      data.dataAvailability.hasHrv = true;
    } else if (rec.type === "HKQuantityTypeIdentifierRestingHeartRate") {
      data.restingHr[date] = numericValue;
      data.dataAvailability.hasHeartRate = true;
    } else if (rec.type === "HKQuantityTypeIdentifierWalkingHeartRateAverage") {
      data.walkingHr[date] = numericValue;
      data.dataAvailability.hasHeartRate = true;
    } else if (rec.type === "HKQuantityTypeIdentifierStepCount") {
      if (!data.steps[date]) {
        data.steps[date] = { watch: 0, iphone: 0, max: 0 };
      }
      if (rec.source.includes("Watch")) {
        data.steps[date].watch += numericValue;
      } else if (rec.source.includes("iPhone")) {
        data.steps[date].iphone += numericValue;
      }
      data.dataAvailability.hasSteps = true;
    } else if (rec.type === "HKCategoryTypeIdentifierSleepAnalysis") {
      if (!rec.source.includes("Watch")) return;
      if (!rec.endDate) return;
      try {
        const startMs = parseAppleDate(rdate);
        const endMs = parseAppleDate(rec.endDate);
        const durationSec = (endMs - startMs) / 1e3;
        if (!Number.isFinite(durationSec) || durationSec <= 0) return;
        if (!data.sleep[date]) {
          data.sleep[date] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
        }
        const hours = durationSec / 3600;
        switch (rec.value) {
          case "HKCategoryValueSleepAnalysisAsleepDeep":
            data.sleep[date].deep += hours;
            data.sleep[date].total += hours;
            break;
          case "HKCategoryValueSleepAnalysisAsleepREM":
            data.sleep[date].rem += hours;
            data.sleep[date].total += hours;
            break;
          case "HKCategoryValueSleepAnalysisAsleepCore":
            data.sleep[date].core += hours;
            data.sleep[date].total += hours;
            break;
          case "HKCategoryValueSleepAnalysisAwake":
            data.sleep[date].awake += hours;
            break;
        }
        data.dataAvailability.hasSleep = true;
      } catch {
      }
    }
  }
  function finalizeData(data) {
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
  function parseHealthXml(xmlText, options = {}) {
    const { startDate, endDate, onProgress } = options;
    const data = createEmptyData();
    const lines = xmlText.split("\n");
    const total = lines.length;
    const reportEvery = Math.max(1, Math.floor(total / 100));
    for (let i = 0; i < total; i++) {
      const line = lines[i];
      if (line.indexOf("<Record ") === -1 && line.indexOf("<Record	") === -1) continue;
      const rec = parseRecordLine(line);
      if (!rec || rec.value === "") continue;
      processRecord(rec, data, startDate, endDate);
      if (onProgress && i % reportEvery === 0) {
        onProgress(i / total);
      }
    }
    finalizeData(data);
    if (onProgress) onProgress(1);
    return data;
  }
  function parseStringStream(text, onRecord, onProgress) {
    let pos = 0;
    const len = text.length;
    let lastReport = 0;
    let i = 0;
    while (pos < len) {
      let endPos = text.indexOf("\n", pos);
      if (endPos === -1) endPos = len;
      const line = text.substring(pos, endPos);
      pos = endPos + 1;
      if (line.indexOf("<Record ") !== -1 || line.indexOf("<Record	") !== -1) {
        const rec = parseRecordLine(line);
        if (rec && rec.value !== "") {
          onRecord(rec, i);
        }
      }
      i++;
      if (i - lastReport > 5e3) {
        lastReport = i;
        if (onProgress) onProgress(pos / len);
      }
    }
    if (onProgress) onProgress(1);
    return Promise.resolve({ totalLines: i, totalBytes: len });
  }
  async function parseBytesStream(bytes, onRecord, onProgress) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const decoder = new TextDecoder("utf-8");
    const totalBytes = view.byteLength;
    const chunkSize = 4 * 1024 * 1024;
    let pendingLine = "";
    let i = 0;
    let lastYield = Date.now();
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = view.subarray(offset, Math.min(offset + chunkSize, totalBytes));
      let text = decoder.decode(chunk, { stream: true });
      text = pendingLine + text;
      pendingLine = "";
      const lines = text.split("\n");
      if (offset + chunkSize < totalBytes) {
        pendingLine = lines.pop() ?? "";
      }
      for (const line of lines) {
        if (line.indexOf("<Record ") !== -1 || line.indexOf("<Record	") !== -1) {
          const rec = parseRecordLine(line);
          if (rec && rec.value !== "") {
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
      if (pendingLine.indexOf("<Record ") !== -1 || pendingLine.indexOf("<Record	") !== -1) {
        const rec = parseRecordLine(pendingLine);
        if (rec && rec.value !== "") onRecord(rec, i);
      }
    }
    if (onProgress) onProgress(1);
    return { totalLines: i, totalBytes };
  }
  async function parseXmlStream(source, onRecord, onProgress) {
    if (typeof source === "string") {
      return parseStringStream(source, onRecord, onProgress);
    }
    return parseBytesStream(source, onRecord, onProgress);
  }
  async function parseHealthXmlAsync(source, options = {}) {
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
  function parseEcgCsv(text) {
    const lines = text.split("\n");
    const summary = {
      datetime: "",
      classification: "unknown"
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("\u8BB0\u5F55\u65E5\u671F,")) {
        summary.datetime = trimmed.replace("\u8BB0\u5F55\u65E5\u671F,", "").trim();
      } else if (trimmed.startsWith("\u5206\u7C7B,")) {
        summary.classification = trimmed.replace("\u5206\u7C7B,", "").trim();
      } else if (trimmed.startsWith("\u8BBE\u5907,")) {
        summary.device = trimmed.replace("\u8BBE\u5907,", "").replace(/"/g, "").trim();
      } else if (/^Record Date,/i.test(trimmed) || /^Date,/i.test(trimmed)) {
        summary.datetime = trimmed.replace(/^[^,]+,/, "").trim();
      } else if (/^Classification,/i.test(trimmed)) {
        summary.classification = trimmed.replace(/^[^,]+,/, "").trim();
      } else if (/^Device,/i.test(trimmed)) {
        summary.device = trimmed.replace(/^[^,]+,/, "").replace(/"/g, "").trim();
      }
      if (/^-?\d/.test(trimmed) && trimmed.includes(".")) {
        break;
      }
    }
    return summary;
  }
  async function extractXmlFromZip(zipFile) {
    const g = globalThis;
    if (typeof g.fflate === "undefined") {
      throw new Error("fflate \u5E93\u672A\u52A0\u8F7D");
    }
    const buf = await zipFile.arrayBuffer();
    const unzipped = g.fflate.unzipSync(new Uint8Array(buf));
    const decodedEntries = {};
    for (const key of Object.keys(unzipped)) {
      const bytes = new Uint8Array(key.length);
      for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 255;
      let decoded;
      try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        decoded = key;
      }
      if (decoded.includes("\uFFFD")) decoded = key;
      decodedEntries[decoded] = unzipped[key];
    }
    const xmlKeys = Object.keys(decodedEntries).filter((k) => /\.xml$/i.test(k));
    const xmlFile = xmlKeys.find((k) => k.endsWith("export.xml") && !k.endsWith("export_cda.xml")) || xmlKeys.find((k) => /导出\.xml$/i.test(k)) || xmlKeys.filter((k) => !k.endsWith("export_cda.xml")).sort((a, b) => decodedEntries[b].byteLength - decodedEntries[a].byteLength)[0];
    if (!xmlFile) {
      const fileList = Object.keys(decodedEntries).slice(0, 10).join(", ");
      throw new Error(`ZIP \u5305\u4E2D\u672A\u627E\u5230 export.xml \u6216 \u5BFC\u51FA.xml\u3002\u524D 10 \u4E2A\u6587\u4EF6: ${fileList}`);
    }
    return {
      xmlBytes: decodedEntries[xmlFile],
      ecgEntries: Object.keys(decodedEntries).filter((k) => /electrocardiograms/i.test(k) && k.endsWith(".csv")).map((k) => ({
        filename: k,
        text: new TextDecoder("utf-8").decode(decodedEntries[k])
      })),
      xmlFileName: xmlFile
    };
  }

  // src/stats.ts
  function calcStats(values) {
    values = values.filter(Number.isFinite);
    if (values.length === 0) {
      return { mean: 0, std: 0, cv: 0, min: 0, max: 0, count: 0 };
    }
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean * 100 : 0;
    return {
      mean,
      std,
      cv,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n
    };
  }
  function calcCgmStats(cgm) {
    if (cgm.length === 0) return null;
    const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const values = sorted.map((p) => p.value);
    const total = values.length;
    const overall = calcStats(values);
    const overallObj = {
      ...overall,
      timeRange: `${sorted[0].datetime} \u81F3 ${sorted[sorted.length - 1].datetime}`,
      pctBelow39: values.filter((v) => v < 3.9).length / total * 100,
      pctBelow30: values.filter((v) => v < 3).length / total * 100,
      pctInRange: values.filter((v) => v >= 3.9 && v <= 10).length / total * 100,
      pctAbove78: values.filter((v) => v > 7.8).length / total * 100,
      pctAbove100: values.filter((v) => v > 10).length / total * 100
    };
    const byDay = {};
    for (const p of sorted) {
      const d = getDate(p.datetime);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(p.value);
    }
    const daily = {};
    for (const date of Object.keys(byDay).sort()) {
      const vals = byDay[date];
      const s = calcStats(vals);
      daily[date] = {
        ...s,
        pctBelow39: vals.filter((v) => v < 3.9).length / vals.length * 100,
        pctAbove78: vals.filter((v) => v > 7.8).length / vals.length * 100,
        pctAbove100: vals.filter((v) => v > 10).length / vals.length * 100
      };
    }
    const maxRises = {
      "30min": { rise: 0, time: "" },
      "60min": { rise: 0, time: "" },
      "120min": { rise: 0, time: "" }
    };
    for (const window of [30, 60, 120]) {
      const windowMs = window * 60 * 1e3;
      let left = 0;
      const minDeque = [];
      let maxRise = 0;
      let maxTime = "";
      for (let right = 0; right < sorted.length; right++) {
        const rightMs = parseAppleDate(sorted[right].datetime);
        while (left < right && rightMs - parseAppleDate(sorted[left].datetime) > windowMs) {
          left++;
        }
        while (minDeque.length && minDeque[0] < left) minDeque.shift();
        const previous = right - 1;
        while (minDeque.length && sorted[minDeque[minDeque.length - 1]].value >= sorted[previous].value) {
          minDeque.pop();
        }
        if (previous >= left) minDeque.push(previous);
        if (minDeque.length) {
          const minIndex = minDeque[0];
          const rise = sorted[right].value - sorted[minIndex].value;
          if (rise > maxRise) {
            maxRise = rise;
            maxTime = `${sorted[minIndex].datetime} -> ${sorted[right].datetime}`;
          }
        }
      }
      maxRises[`${window}min`] = { rise: maxRise, time: maxTime };
    }
    return { overall: overallObj, daily, maxRises };
  }
  function calcBloodPressureStats(records) {
    if (records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));
    function periodStats(days) {
      if (records.length === 0) return null;
      const latest = sorted[sorted.length - 1].date;
      const latestDate = /* @__PURE__ */ new Date(`${latest}T00:00:00Z`);
      latestDate.setUTCDate(latestDate.getUTCDate() - days);
      const startStr = latestDate.toISOString().slice(0, 10);
      const filtered = sorted.filter((r) => r.date >= startStr && r.date <= latest);
      if (filtered.length === 0) return null;
      const meanSys = filtered.reduce((a, b) => a + b.systolic, 0) / filtered.length;
      const meanDia = filtered.reduce((a, b) => a + b.diastolic, 0) / filtered.length;
      const lowCount = filtered.filter((r) => r.systolic < 90 || r.diastolic < 60).length;
      return {
        systolic: meanSys,
        diastolic: meanDia,
        count: filtered.length,
        lowCount
      };
    }
    return {
      records: sorted,
      mean7d: periodStats(7),
      mean14d: periodStats(14),
      mean30d: periodStats(30),
      lowest: sorted.reduce((min, r) => r.systolic < min.systolic ? r : min, sorted[0]),
      highest: sorted.reduce((max, r) => r.systolic > max.systolic ? r : max, sorted[0])
    };
  }
  function summarizeHrvByDay(hrv, hrvOvernight) {
    const result = {};
    for (const date of Object.keys(hrv).sort()) {
      const vals = hrv[date];
      const overnight = hrvOvernight[date] || [];
      result[date] = {
        allMean: vals.reduce((a, b) => a + b, 0) / vals.length,
        overnightMean: overnight.length > 0 ? overnight.reduce((a, b) => a + b, 0) / overnight.length : 0,
        min: Math.min(...vals),
        max: Math.max(...vals),
        count: vals.length
      };
    }
    return result;
  }
  function analyzeAll(data) {
    const allDates = [
      ...data.cgm.map((x) => getDate(x.datetime)),
      ...data.bloodPressure.map((x) => x.date),
      ...data.weight.map((x) => x.date),
      ...Object.keys(data.hrv),
      ...Object.keys(data.restingHr),
      ...Object.keys(data.walkingHr),
      ...Object.keys(data.steps),
      ...Object.keys(data.sleep)
    ];
    allDates.sort();
    const start = allDates[0] || "";
    const end = allDates[allDates.length - 1] || "";
    return {
      data,
      cgmStats: calcCgmStats(data.cgm),
      bpStats: calcBloodPressureStats(data.bloodPressure),
      hrvByDate: summarizeHrvByDay(data.hrv, data.hrvOvernight),
      restingHrByDate: data.restingHr,
      walkingHrByDate: data.walkingHr,
      stepsByDate: Object.fromEntries(
        Object.entries(data.steps).map(([d, v]) => [d, v.max])
      ),
      sleepByDate: data.sleep,
      dateRange: { start, end },
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }

  // src/prompts/llm-prompt.ts
  var MAIN_PROMPT_TEMPLATE = `# \u89D2\u8272\u4E0E\u4EFB\u52A1
\u4F60\u662F\u4E00\u4F4D\u4E25\u8C28\u7684\u4E34\u5E8A\u6570\u636E\u5206\u6790\u5E08\u3002\u8BF7\u57FA\u4E8E\u4E0B\u65B9\u300C\u4E2A\u4EBA\u80CC\u666F\uFF08\u5982\u6709\uFF09\u300D\u4E0E\u300C\u539F\u59CB\u6570\u636E\u4E0E\u7EDF\u8BA1\u300D\u751F\u6210\u4E00\u4EFD\u300A\u4E2A\u4EBA\u5065\u5EB7\u81EA\u6211\u76D1\u6D4B\u6DF1\u5EA6\u5206\u6790\u62A5\u544A\u300B\uFF0C\u4E25\u683C\u6309\u7167\u4EE5\u4E0B\u7ED3\u6784\u4E0E\u98CE\u683C\uFF1A
- \u4E0D\u4E0B\u8BCA\u65AD\u7ED3\u8BBA\u3001\u4E0D\u5F00\u836F\u3001\u4E0D\u66FF\u4EE3\u95E8\u8BCA
- \u82E5\u63D0\u4F9B\u4E86\u7528\u836F/\u76EE\u6807\u4F53\u91CD/\u5173\u6CE8\u70B9\uFF0C\u8BF7\u5728\u89E3\u8BFB\u4E2D\u5BF9\u7167\u4F7F\u7528\uFF0C\u4F46\u4ECD\u4E0D\u5F97\u6539\u836F\u6216\u4E0B\u8BCA\u65AD
- \u5173\u6CE8\u8D8B\u52BF\u3001\u76F8\u5173\u6027\u4E0E\u53EF\u64CD\u4F5C\u5EFA\u8BAE
- \u6570\u5B57\u4F18\u5148\u3001\u8F85\u4EE5\u89E3\u91CA\uFF0C\u907F\u514D\u7A7A\u8BDD
- \u4EFB\u4F55\u53EF\u7591\u5F02\u5E38\u5FC5\u987B\u7ED9"\u590D\u6838\u5EFA\u8BAE"

# \u8F93\u51FA\u7ED3\u6784\uFF08\u5FC5\u987B\u6309\u4EE5\u4E0B\u56FA\u5B9A\u6807\u9898\u987A\u5E8F\u8F93\u51FA\uFF1B\u6CA1\u6709\u6570\u636E\u7684\u7EF4\u5EA6\u8DF3\u8FC7\uFF09

## 0. \u603B\u7ED3\u5224\u65AD
- \u7528 3-5 \u4E2A\u8981\u70B9\u6982\u62EC\u672C\u6B21\u6570\u636E\u7ED9\u51FA\u7684\u6700\u91CD\u8981\u53D1\u73B0
- \u5217\u51FA\u5F53\u524D\u76D1\u6D4B\u4F18\u5148\u7EA7\uFF08\u6309\u98CE\u9669/\u5173\u6CE8\u5EA6\u6392\u5E8F\uFF09

## \u6570\u636E\u6982\u89C8
## CGM \u52A8\u6001\u8840\u7CD6
## \u8840\u538B
## \u4F53\u91CD
## HRV \u5FC3\u7387\u53D8\u5F02\u6027
## \u5FC3\u7387
## \u6B65\u6570\u4E0E\u7761\u7720
## ECG \u5FC3\u7535\u56FE
\uFF08\u4EC5\u8F93\u51FA\u6709\u6570\u636E\u7684\u7EF4\u5EA6\uFF1B\u6BCF\u4E2A\u7EF4\u5EA6\u5305\u542B\uFF1A\u73B0\u72B6\u3001\u8D8B\u52BF\u3001\u89E3\u8BFB\u3001\u98CE\u9669\u4E0E\u5EFA\u8BAE\uFF09

## \u76D1\u6D4B\u4EEA\u8868\u76D8
\u6BCF\u5929\u53EA\u770B 8 \u4E2A\u6838\u5FC3\u6307\u6807\uFF0C\u907F\u514D\u6570\u636E\u7126\u8651\u3002\u8868\u683C\u5217\u51FA\uFF1A\u6A21\u5757 | \u6307\u6807 | \u76EE\u6807/\u8B66\u6212

## \u9700\u8981\u590D\u67E5\u6216\u5347\u7EA7\u5904\u7406\u7684\u4FE1\u53F7
\u533A\u5206\u201C\u7ACB\u5373\u5BFB\u6C42\u6025\u8BCA\u5E2E\u52A9\u201D\u201C\u5C3D\u5FEB\u8054\u7CFB\u533B\u751F\u201D\u201C\u590D\u6D4B\u5E76\u6301\u7EED\u8BB0\u5F55\u201D\uFF0C\u4E0D\u8981\u56E0\u5355\u6B21\u65E0\u75C7\u72B6\u5F02\u5E38\u76F4\u63A5\u4E0B\u7ED3\u8BBA\u3002

## \u5F53\u524D\u5DE5\u4F5C\u5047\u8BBE
\u5217\u51FA\u6700\u7B26\u5408\u73B0\u6709\u6570\u636E\u7684 5-7 \u4E2A\u5DE5\u4F5C\u5047\u8BBE

## \u53C2\u8003\u4F9D\u636E
- American Diabetes Association CGM Time in Range: https://diabetes.org/about-diabetes/devices-technology/cgm-time-in-range
- International Consensus on Time in Range: https://diabetesjournals.org/care/article/42/8/1593/36184/Clinical-Targets-for-Continuous-Glucose-Monitoring
- Abbott FreeStyle Libre CGM \u6EDE\u540E\u8BF4\u660E: https://www.freestylelibre.com.au/difference-between-glucose-interstitial-glucose
- U-M CGM \u591C\u95F4\u4F4E\u503C\u8BF4\u660E: https://teamdynamix.umich.edu/TDClient/210/DepressionCenter/KB/Article/10689/CGM-Is-Reading-Low-Values

# \u5199\u4F5C\u98CE\u683C\u8981\u6C42
- \u4E2D\u6587\u8F93\u51FA\uFF0C\u4F7F\u7528 Markdown \u8868\u683C\u5448\u73B0\u6570\u636E
- \u8868\u683C\u6570\u5B57\u53F3\u5BF9\u9F50\uFF0C\u9608\u503C\u548C\u8B66\u6212\u503C\u4F7F\u7528 \`\u4EE3\u7801\u683C\u5F0F\` \u6807\u6CE8
- \u5173\u952E\u53D1\u73B0\u7528 **\u52A0\u7C97**
- \u533A\u5206"\u5DF2\u786E\u8BA4"vs"\u5F85\u9A8C\u8BC1"vs"\u5047\u8BBE"
- \u51FA\u73B0 CGM <3.9 mmol/L \u5FC5\u987B\u8BF4"\u5FC5\u987B\u6307\u5C16\u8840\u590D\u6838"
- \u51FA\u73B0 <3.0 mmol/L \u5347\u7EA7\u4E3A"\u6309\u4F4E\u8840\u7CD6\u5904\u7406"
- \u9AD8\u8840\u7CD6\u53C2\u8003\u9608\u503C\uFF1A\u968F\u673A >11.1 mmol/L \u6216\u7A7A\u8179 >7.0 mmol/L\uFF1BCGM \u4E0D\u80FD\u5355\u72EC\u7528\u4E8E\u8BCA\u65AD\uFF0C\u9700\u7ED3\u5408\u590D\u6D4B\u548C\u533B\u751F/\u5B9E\u9A8C\u5BA4\u8BC4\u4F30

# \u6570\u636E\u4F7F\u7528\u8FB9\u754C\u58F0\u660E
- CGM \u6D4B\u91CF\u7EC4\u7EC7\u95F4\u6DB2\u8461\u8404\u7CD6\uFF0C\u4E0E\u6307\u5C16\u8840\u5B58\u5728 5-10 \u5206\u949F\u6EDE\u540E
- \u5F02\u5E38\u4F4E\u503C\u5FC5\u987B\u7528\u6307\u5C16\u8840\u590D\u6838\uFF0C\u4E0D\u80FD\u4EC5\u51ED CGM
- \u7761\u7720/\u6B65\u6570/HRV \u6570\u636E\u6765\u81EA Apple Watch\uFF0C\u5B58\u5728\u6D4B\u91CF\u8BEF\u5DEE
- \u5355\u6B21\u5F02\u5E38\u5E94\u5148\u590D\u6D4B\u5E76\u7ED3\u5408\u75C7\u72B6\u3001\u6301\u7EED\u65F6\u95F4\u548C\u91CD\u590D\u6B21\u6570\u5224\u65AD
- \u672C\u62A5\u544A\u4E0D\u66FF\u4EE3\u533B\u751F\u95E8\u8BCA\uFF0C\u6240\u6709\u964D\u538B/\u964D\u7CD6\u65B9\u6848\u8C03\u6574\u8BF7\u9075\u533B\u5631

---

# \u539F\u59CB\u6570\u636E\u4E0E\u7EDF\u8BA1
\uFF08\u8BF7\u57FA\u4E8E\u4E0B\u65B9\u4E2A\u4EBA\u80CC\u666F\u4E0E\u6570\u636E\u751F\u6210\u62A5\u544A\uFF09

{ANALYSIS_JSON}
`;
  function trimText(value) {
    if (value == null) return "";
    return String(value).trim();
  }
  function hasAnyUserContext(ctx) {
    if (!ctx) return false;
    return Boolean(
      ctx.age != null && Number.isFinite(Number(ctx.age)) || trimText(ctx.sex) || ctx.heightCm != null && Number.isFinite(Number(ctx.heightCm)) || trimText(ctx.medications) || trimText(ctx.conditions) || ctx.targetWeightKg != null && Number.isFinite(Number(ctx.targetWeightKg)) || trimText(ctx.focus) || trimText(ctx.notes)
    );
  }
  function formatUserContext(ctx) {
    if (!hasAnyUserContext(ctx) || !ctx) return "";
    const lines = [
      "## \u4E2A\u4EBA\u80CC\u666F\uFF08\u7528\u6237\u81EA\u8FF0\uFF0C\u4EC5\u4F9B\u5BF9\u7167\uFF0C\u975E\u533B\u7597\u6863\u6848\uFF09",
      "",
      "| \u9879\u76EE | \u5185\u5BB9 |",
      "|---|---|"
    ];
    if (ctx.age != null && Number.isFinite(Number(ctx.age))) {
      lines.push(`| \u5E74\u9F84 | ${Number(ctx.age)} \u5C81 |`);
    }
    if (trimText(ctx.sex)) {
      lines.push(`| \u6027\u522B | ${trimText(ctx.sex)} |`);
    }
    if (ctx.heightCm != null && Number.isFinite(Number(ctx.heightCm))) {
      lines.push(`| \u8EAB\u9AD8 | ${Number(ctx.heightCm)} cm |`);
    }
    if (ctx.targetWeightKg != null && Number.isFinite(Number(ctx.targetWeightKg))) {
      lines.push(`| \u76EE\u6807\u4F53\u91CD | ${Number(ctx.targetWeightKg)} kg |`);
    }
    if (trimText(ctx.medications)) {
      lines.push(`| \u5F53\u524D\u7528\u836F | ${trimText(ctx.medications)} |`);
    }
    if (trimText(ctx.conditions)) {
      lines.push(`| \u5DF2\u77E5\u60C5\u51B5 | ${trimText(ctx.conditions)} |`);
    }
    if (trimText(ctx.focus)) {
      lines.push(`| \u672C\u6B21\u5173\u6CE8\u70B9 | ${trimText(ctx.focus)} |`);
    }
    if (trimText(ctx.notes)) {
      lines.push(`| \u8865\u5145\u8BF4\u660E | ${trimText(ctx.notes)} |`);
    }
    lines.push("");
    lines.push("> \u4EE5\u4E0A\u4E3A\u7528\u6237\u672C\u5730\u586B\u5199\u7684\u81EA\u8FF0\u4FE1\u606F\uFF0C\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF1B\u89E3\u8BFB\u65F6\u4F5C\u80CC\u666F\u53C2\u8003\uFF0C\u4E0D\u5F97\u636E\u6B64\u5F00\u836F\u6216\u4E0B\u8BCA\u65AD\u3002");
    lines.push("");
    return lines.join("\n");
  }
  function formatAnalysisForLLM(analysis) {
    const sections = [];
    const { data, cgmStats, bpStats, hrvByDate, dateRange } = analysis;
    const detailDays = 90;
    const recentDateSet = (dates) => {
      const sorted = [...dates].sort();
      const latest = sorted[sorted.length - 1];
      if (!latest) return /* @__PURE__ */ new Set();
      const cutoff = /* @__PURE__ */ new Date(`${latest}T00:00:00Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - (detailDays - 1));
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      return new Set(sorted.filter((date) => date >= cutoffDate));
    };
    sections.push(`> \u660E\u7EC6\u8868\u9ED8\u8BA4\u5C55\u793A\u6700\u8FD1 ${detailDays} \u5929\uFF1B\u66F4\u65E9\u6570\u636E\u5DF2\u7EB3\u5165\u603B\u4F53\u7EDF\u8BA1\uFF0C\u4F46\u4E3A\u63A7\u5236\u63D0\u793A\u8BCD\u957F\u5EA6\u672A\u9010\u6761\u5C55\u5F00\u3002`);
    sections.push(``);
    const av = data.dataAvailability;
    sections.push(`## \u6570\u636E\u53EF\u7528\u6027`);
    sections.push(``);
    sections.push(`| \u7EF4\u5EA6 | \u662F\u5426\u5B58\u5728 | \u6570\u636E\u91CF |`);
    sections.push(`|---|---|---|`);
    sections.push(`| CGM \u52A8\u6001\u8840\u7CD6 | ${av.hasCgm ? "\u2705" : "\u274C"} | ${data.cgm.length} \u6761 |`);
    sections.push(`| \u8840\u538B | ${av.hasBloodPressure ? "\u2705" : "\u274C"} | ${data.bloodPressure.length} \u6761 |`);
    sections.push(`| \u4F53\u91CD | ${av.hasWeight ? "\u2705" : "\u274C"} | ${data.weight.length} \u6761 |`);
    sections.push(`| HRV | ${av.hasHrv ? "\u2705" : "\u274C"} | ${Object.keys(hrvByDate).length} \u5929 |`);
    sections.push(`| \u9759\u606F/\u6B65\u884C\u5FC3\u7387 | ${av.hasHeartRate ? "\u2705" : "\u274C"} | ${Object.keys(data.restingHr).length} \u5929 |`);
    sections.push(`| \u6B65\u6570 | ${av.hasSteps ? "\u2705" : "\u274C"} | ${Object.keys(data.steps).length} \u5929 |`);
    sections.push(`| \u7761\u7720 | ${av.hasSleep ? "\u2705" : "\u274C"} | ${Object.keys(data.sleep).length} \u5929 |`);
    sections.push(`| ECG | ${av.hasEcg ? "\u2705" : "\u274C"} | ${data.ecg.length} \u4EFD |`);
    sections.push(``);
    sections.push(`\u6570\u636E\u65F6\u95F4\u8303\u56F4\uFF1A${dateRange.start} \u81F3 ${dateRange.end}`);
    sections.push(``);
    if (cgmStats) {
      sections.push(`## CGM \u52A8\u6001\u8840\u7CD6`);
      sections.push(``);
      const o = cgmStats.overall;
      sections.push(`**\u603B\u4F53\u7EDF\u8BA1**\uFF08\u5171 ${o.count} \u6761\uFF0C\u65F6\u95F4\u8303\u56F4\uFF1A${o.timeRange}\uFF09`);
      sections.push(``);
      sections.push(`| \u6307\u6807 | \u503C |`);
      sections.push(`|---|---|`);
      sections.push(`| \u5E73\u5747 | ${o.mean.toFixed(2)} mmol/L |`);
      sections.push(`| \u6807\u51C6\u5DEE | ${o.std.toFixed(2)} mmol/L |`);
      sections.push(`| CV \u53D8\u5F02\u7CFB\u6570 | ${o.cv.toFixed(1)}% |`);
      sections.push(`| \u6700\u4F4E | ${o.min.toFixed(1)} mmol/L |`);
      sections.push(`| \u6700\u9AD8 | ${o.max.toFixed(1)} mmol/L |`);
      sections.push(`| TIR (3.9-10.0 mmol/L) | ${o.pctInRange.toFixed(1)}% |`);
      sections.push(`| <3.9 mmol/L | ${o.pctBelow39.toFixed(1)}% |`);
      sections.push(`| <3.0 mmol/L | ${o.pctBelow30.toFixed(1)}% |`);
      sections.push(`| >7.8 mmol/L | ${o.pctAbove78.toFixed(1)}% |`);
      sections.push(`| >10.0 mmol/L | ${o.pctAbove100.toFixed(1)}% |`);
      sections.push(``);
      sections.push(`**\u5206\u65E5\u7EDF\u8BA1**\uFF1A`);
      sections.push(``);
      sections.push(`| \u65E5\u671F | \u6761\u6570 | \u5747\u503C | \u6700\u4F4E | \u6700\u9AD8 | CV% | <3.9% | >7.8% |`);
      sections.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
      const recentDates = recentDateSet(Object.keys(cgmStats.daily));
      for (const date of Object.keys(cgmStats.daily).filter((date2) => recentDates.has(date2)).sort()) {
        const d = cgmStats.daily[date];
        sections.push(
          `| ${date} | ${d.count} | ${d.mean.toFixed(2)} | ${d.min.toFixed(1)} | ${d.max.toFixed(1)} | ${d.cv.toFixed(1)} | ${d.pctBelow39.toFixed(1)} | ${d.pctAbove78.toFixed(1)} |`
        );
      }
      sections.push(``);
      sections.push(`**\u6700\u5927\u8840\u7CD6\u4E0A\u5347**\uFF1A30\u5206\u949F ${cgmStats.maxRises["30min"].rise.toFixed(1)} mmol/L, 60\u5206\u949F ${cgmStats.maxRises["60min"].rise.toFixed(1)} mmol/L, 120\u5206\u949F ${cgmStats.maxRises["120min"].rise.toFixed(1)} mmol/L`);
      sections.push(``);
    }
    if (bpStats && bpStats.records.length > 0) {
      sections.push(`## \u8840\u538B`);
      sections.push(``);
      sections.push(`**\u6240\u6709\u8840\u538B\u8BB0\u5F55**\uFF08\u5171 ${bpStats.records.length} \u6761\uFF09\uFF1A`);
      sections.push(``);
      sections.push(`| \u65F6\u95F4 | \u6536\u7F29\u538B | \u8212\u5F20\u538B | \u5907\u6CE8 |`);
      sections.push(`|---|---:|---:|---|`);
      const recentDates = recentDateSet(bpStats.records.map((r) => r.date));
      for (const r of bpStats.records.filter((r2) => recentDates.has(r2.date))) {
        const low = r.systolic < 90 || r.diastolic < 60 ? " \u26A0\uFE0F" : "";
        sections.push(`| ${r.datetime} | ${r.systolic} | ${r.diastolic} |${low} |`);
      }
      sections.push(``);
      sections.push(`**\u65F6\u6BB5\u5747\u503C**\uFF1A`);
      sections.push(``);
      sections.push(`| \u65F6\u6BB5 | \u6536\u7F29\u538B | \u8212\u5F20\u538B | \u6761\u6570 | <90/60 |`);
      sections.push(`|---|---:|---:|---:|---:|`);
      if (bpStats.mean7d) {
        const m = bpStats.mean7d;
        sections.push(`| \u6700\u8FD1 7 \u5929 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      if (bpStats.mean14d) {
        const m = bpStats.mean14d;
        sections.push(`| \u6700\u8FD1 14 \u5929 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      if (bpStats.mean30d) {
        const m = bpStats.mean30d;
        sections.push(`| \u6700\u8FD1 30 \u5929 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      sections.push(``);
    }
    if (data.weight.length > 0) {
      sections.push(`## \u4F53\u91CD`);
      sections.push(``);
      sections.push(`| \u65F6\u95F4 | \u4F53\u91CD (kg) |`);
      sections.push(`|---|---:|`);
      const recentDates = recentDateSet(data.weight.map((w) => w.date));
      for (const w of data.weight.filter((w2) => recentDates.has(w2.date))) {
        sections.push(`| ${w.datetime} | ${w.value.toFixed(1)} |`);
      }
      sections.push(``);
    }
    if (Object.keys(hrvByDate).length > 0) {
      sections.push(`## HRV \u5FC3\u7387\u53D8\u5F02\u6027`);
      sections.push(``);
      sections.push(`| \u65E5\u671F | \u5168\u5929\u5747\u503C | \u591C\u95F4\u5747\u503C | \u6700\u4F4E | \u6700\u9AD8 | \u6837\u672C\u6570 |`);
      sections.push(`|---|---:|---:|---:|---:|---:|`);
      const recentDates = recentDateSet(Object.keys(hrvByDate));
      for (const date of Object.keys(hrvByDate).filter((date2) => recentDates.has(date2)).sort()) {
        const h = hrvByDate[date];
        sections.push(
          `| ${date} | ${h.allMean.toFixed(1)} | ${h.overnightMean.toFixed(1)} | ${h.min.toFixed(1)} | ${h.max.toFixed(1)} | ${h.count} |`
        );
      }
      sections.push(``);
    }
    if (Object.keys(data.restingHr).length > 0 || Object.keys(data.walkingHr).length > 0) {
      sections.push(`## \u5FC3\u7387`);
      sections.push(``);
      const allDates = /* @__PURE__ */ new Set([
        ...Object.keys(data.restingHr),
        ...Object.keys(data.walkingHr)
      ]);
      const recentDates = recentDateSet(Array.from(allDates));
      const visibleDates = Array.from(allDates).filter((date) => recentDates.has(date));
      sections.push(`| \u65E5\u671F | \u9759\u606F\u5FC3\u7387 | \u6B65\u884C\u5FC3\u7387 |`);
      sections.push(`|---|---:|---:|`);
      for (const date of visibleDates.sort()) {
        const r = data.restingHr[date] ?? "\u2014";
        const w = data.walkingHr[date] ?? "\u2014";
        sections.push(`| ${date} | ${r} | ${w} |`);
      }
      sections.push(``);
    }
    if (Object.keys(data.steps).length > 0 || Object.keys(data.sleep).length > 0) {
      sections.push(`## \u6B65\u6570\u4E0E\u7761\u7720`);
      sections.push(``);
      const allDates = /* @__PURE__ */ new Set([
        ...Object.keys(data.steps),
        ...Object.keys(data.sleep)
      ]);
      const recentDates = recentDateSet(Array.from(allDates));
      sections.push(`| \u65E5\u671F | \u6B65\u6570 | \u7761\u7720(h) | \u6DF1\u7761(h) | REM(h) |`);
      sections.push(`|---|---:|---:|---:|---:|`);
      for (const date of Array.from(allDates).filter((date2) => recentDates.has(date2)).sort()) {
        const steps = data.steps[date]?.max ?? "\u2014";
        const sleep = data.sleep[date];
        const sleepStr = sleep ? sleep.total.toFixed(2) : "\u2014";
        const deepStr = sleep ? sleep.deep.toFixed(2) : "\u2014";
        const remStr = sleep ? sleep.rem.toFixed(2) : "\u2014";
        sections.push(`| ${date} | ${steps} | ${sleepStr} | ${deepStr} | ${remStr} |`);
      }
      sections.push(``);
    }
    if (data.ecg.length > 0) {
      sections.push(`## ECG \u5FC3\u7535\u56FE`);
      sections.push(``);
      sections.push(`\u5171 ${data.ecg.length} \u4EFD ECG`);
      sections.push(``);
      const counts = {};
      for (const e of data.ecg) {
        counts[e.classification] = (counts[e.classification] || 0) + 1;
      }
      sections.push(`\u5206\u7C7B\u7EDF\u8BA1\uFF1A`);
      for (const [k, v] of Object.entries(counts)) {
        sections.push(`- ${k}: ${v} \u4EFD`);
      }
      sections.push(``);
    }
    return sections.join("\n");
  }
  function combineContextAndData(analysis, userContext) {
    const dataSection = formatAnalysisForLLM(analysis);
    const ctxSection = formatUserContext(userContext);
    return ctxSection ? `${ctxSection}
${dataSection}` : dataSection;
  }
  function generateLLMPrompt(analysis, userContext) {
    const dataSection = combineContextAndData(analysis, userContext);
    return MAIN_PROMPT_TEMPLATE.replace("{ANALYSIS_JSON}", dataSection).replace("{ANALYSIS_DATA}", dataSection);
  }
  function generateDataOnly(analysis, userContext) {
    return combineContextAndData(analysis, userContext);
  }
  var SHORT_SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u4E25\u8C28\u7684\u5065\u5EB7\u6570\u636E\u5206\u6790\u5E08\u3002\u57FA\u4E8E\u7528\u6237\u63D0\u4F9B\u7684 Apple Health \u7EDF\u8BA1\u751F\u6210\u4E2D\u6587 Markdown \u62A5\u544A\uFF1B\u53EA\u5206\u6790\u5B9E\u9645\u5B58\u5728\u7684\u6570\u636E\uFF0C\u6309\u201C\u603B\u7ED3\u5224\u65AD\u3001\u6570\u636E\u7EF4\u5EA6\u3001\u76D1\u6D4B\u4EEA\u8868\u76D8\u3001\u9700\u8981\u590D\u67E5\u6216\u5347\u7EA7\u5904\u7406\u7684\u4FE1\u53F7\u3001\u5F53\u524D\u5DE5\u4F5C\u5047\u8BBE\u3001\u53C2\u8003\u4F9D\u636E\u201D\u987A\u5E8F\u7EC4\u7EC7\u3002\u4E0D\u4E0B\u8BCA\u65AD\u7ED3\u8BBA\uFF1BCGM <3.9 \u5FC5\u987B\u5EFA\u8BAE\u6307\u5C16\u8840\u590D\u6838\uFF0CCGM \u4E0D\u80FD\u5355\u72EC\u7528\u4E8E\u8BCA\u65AD\uFF1B\u5355\u6B21\u5F02\u5E38\u5148\u590D\u6D4B\u5E76\u7ED3\u5408\u75C7\u72B6\u5224\u65AD\uFF1B\u6240\u6709\u7528\u836F\u8C03\u6574\u8BF7\u9075\u533B\u5631\u3002`;
  return __toCommonJS(browser_exports);
})();
