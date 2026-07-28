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
    buildAnalysisSnapshot: () => buildAnalysisSnapshot,
    buildExportBundle: () => buildExportBundle,
    buildInsightBullets: () => buildInsightBullets,
    calcBloodPressureStats: () => calcBloodPressureStats,
    calcBpStats: () => calcBloodPressureStats,
    calcCgmStats: () => calcCgmStats,
    calcWatchStats: () => calcWatchStats,
    calcWeightStats: () => calcWeightStats,
    calcWorkoutStats: () => calcWorkoutStats,
    compareSnapshots: () => compareSnapshots,
    createEmptyData: () => createEmptyData,
    detectCrossSignals: () => detectCrossSignals,
    extractXmlFromZip: () => extractXmlFromZip,
    finalizeData: () => finalizeData,
    formatAnalysisForLLM: () => formatAnalysisForLLM,
    formatCrossSignalsForLLM: () => formatCrossSignalsForLLM,
    formatInsightsForLLM: () => formatInsightsForLLM,
    formatUserContext: () => formatUserContext,
    generateDataOnly: () => generateDataOnly,
    generateInsightsOnlyPrompt: () => generateInsightsOnlyPrompt,
    generateLLMPrompt: () => generateLLMPrompt,
    getDate: () => getDate,
    getHour: () => getHour,
    getLocalToday: () => getLocalToday,
    isFutureDate: () => isFutureDate,
    joinCsvBundle: () => joinCsvBundle,
    mergeExternalCsvIntoData: () => mergeExternalCsvIntoData,
    parseAppleDate: () => parseAppleDate,
    parseBloodPressureCsv: () => parseBloodPressureCsv,
    parseBytesStream: () => parseBytesStream,
    parseEcgCsv: () => parseEcgCsv,
    parseHealthXml: () => parseHealthXml,
    parseHealthXmlAsync: () => parseHealthXmlAsync,
    parseRecordLine: () => parseRecordLine,
    parseWeightScaleCsv: () => parseWeightScaleCsv,
    parseXmlStream: () => parseXmlStream,
    processRecord: () => processRecord,
    processWorkoutBlock: () => processWorkoutBlock,
    processXmlLine: () => processXmlLine,
    shortWorkoutType: () => shortWorkoutType,
    summarizeHrvByDay: () => summarizeHrvByDay,
    xmlAttr: () => xmlAttr
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
  function getLocalToday(now = /* @__PURE__ */ new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  var MAX_FUTURE_SAMPLES = 8;
  function noteSkippedFuture(data, date) {
    data.dataQuality.skippedFutureCount += 1;
    const samples = data.dataQuality.futureSampleDates;
    if (!samples.includes(date) && samples.length < MAX_FUTURE_SAMPLES) {
      samples.push(date);
      samples.sort();
    }
  }
  function ensureWatchDay(data, date) {
    if (!data.watchDaily) data.watchDaily = {};
    if (!data.watchDaily[date]) {
      data.watchDaily[date] = {
        activeKcal: 0,
        exerciseMin: 0,
        standMin: 0,
        daylightMin: 0,
        spo2Sum: 0,
        spo2Count: 0,
        spo2Min: Infinity,
        spo2NightSum: 0,
        spo2NightCount: 0,
        spo2NightMin: Infinity,
        spo2DaySum: 0,
        spo2DayCount: 0,
        spo2DayMin: Infinity,
        rrSum: 0,
        rrCount: 0,
        nightHrSum: 0,
        nightHrCount: 0,
        wristTempSum: 0,
        wristTempCount: 0
      };
    }
    const w = data.watchDaily[date];
    if (w.spo2NightMin == null) w.spo2NightMin = Infinity;
    if (w.spo2DayMin == null) w.spo2DayMin = Infinity;
    if (w.spo2NightSum == null) w.spo2NightSum = 0;
    if (w.spo2NightCount == null) w.spo2NightCount = 0;
    if (w.spo2DaySum == null) w.spo2DaySum = 0;
    if (w.spo2DayCount == null) w.spo2DayCount = 0;
    return w;
  }
  function xmlAttr(line, name) {
    const match = line.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
    return match?.[2];
  }
  function shortWorkoutType(raw) {
    return raw.replace(/^HKWorkoutActivityType/, "") || raw || "Other";
  }
  function isFutureDate(date, referenceDate) {
    return Boolean(date && referenceDate && date > referenceDate);
  }
  function parseRecordLine(line) {
    const type = xmlAttr(line, "type");
    const startDate = xmlAttr(line, "startDate");
    if (!type || !startDate) return null;
    return {
      type,
      source: xmlAttr(line, "sourceName") ?? "",
      startDate,
      endDate: xmlAttr(line, "endDate"),
      value: xmlAttr(line, "value") ?? ""
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
  function createEmptyData(referenceDate) {
    const ref = referenceDate || getLocalToday();
    const data = {
      cgm: [],
      bloodPressure: [],
      weight: [],
      bodyFat: [],
      hrv: {},
      hrvOvernight: {},
      restingHr: {},
      walkingHr: {},
      steps: {},
      sleep: {},
      watchDaily: {},
      workouts: [],
      ecg: [],
      dataAvailability: {
        hasCgm: false,
        hasBloodPressure: false,
        hasWeight: false,
        hasBodyFat: false,
        hasHrv: false,
        hasHeartRate: false,
        hasSteps: false,
        hasSleep: false,
        hasEcg: false,
        hasSpO2: false,
        hasRespiratoryRate: false,
        hasVo2Max: false,
        hasWatchActivity: false,
        hasWristTemp: false,
        hasWorkouts: false
      },
      dataQuality: {
        referenceDate: ref,
        skippedFutureCount: 0,
        futureSampleDates: []
      }
    };
    bpMaps.set(data, /* @__PURE__ */ new Map());
    return data;
  }
  function processRecord(rec, data, startDateOrOptions, endDateMaybe) {
    let startDate;
    let endDate;
    let allowFuture = false;
    let referenceDate = data.dataQuality?.referenceDate || getLocalToday();
    if (startDateOrOptions && typeof startDateOrOptions === "object") {
      startDate = startDateOrOptions.startDate;
      endDate = startDateOrOptions.endDate;
      allowFuture = Boolean(startDateOrOptions.allowFuture);
      if (startDateOrOptions.referenceDate) {
        referenceDate = startDateOrOptions.referenceDate;
      }
    } else {
      startDate = startDateOrOptions;
      endDate = endDateMaybe;
    }
    if (!data.dataQuality) {
      data.dataQuality = {
        referenceDate,
        skippedFutureCount: 0,
        futureSampleDates: []
      };
    }
    const rdate = rec.startDate;
    const date = getDate(rdate);
    if (startDate && date < startDate) return;
    if (endDate && date > endDate) return;
    if (!allowFuture && isFutureDate(date, referenceDate)) {
      noteSkippedFuture(data, date);
      return;
    }
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
    } else if (rec.type === "HKQuantityTypeIdentifierBodyFatPercentage") {
      const pct = numericValue <= 1 ? numericValue * 100 : numericValue;
      if (Number.isFinite(pct) && pct > 0 && pct < 80) {
        data.bodyFat.push({ datetime: rdate, date, value: pct, source: rec.source });
        data.dataAvailability.hasBodyFat = true;
      }
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
    } else if (rec.type === "HKQuantityTypeIdentifierActiveEnergyBurned") {
      if (!Number.isFinite(numericValue) || numericValue <= 0) return;
      const w = ensureWatchDay(data, date);
      w.activeKcal += numericValue;
      data.dataAvailability.hasWatchActivity = true;
    } else if (rec.type === "HKQuantityTypeIdentifierAppleExerciseTime") {
      if (!Number.isFinite(numericValue) || numericValue <= 0) return;
      const w = ensureWatchDay(data, date);
      w.exerciseMin += numericValue;
      data.dataAvailability.hasWatchActivity = true;
    } else if (rec.type === "HKQuantityTypeIdentifierAppleStandTime") {
      if (!Number.isFinite(numericValue) || numericValue <= 0) return;
      const w = ensureWatchDay(data, date);
      w.standMin += numericValue;
      data.dataAvailability.hasWatchActivity = true;
    } else if (rec.type === "HKQuantityTypeIdentifierTimeInDaylight") {
      if (!Number.isFinite(numericValue) || numericValue <= 0) return;
      const w = ensureWatchDay(data, date);
      w.daylightMin += numericValue;
    } else if (rec.type === "HKQuantityTypeIdentifierOxygenSaturation") {
      if (!Number.isFinite(numericValue) || numericValue <= 0) return;
      const pct = numericValue <= 1.5 ? numericValue * 100 : numericValue;
      if (pct < 50 || pct > 100) return;
      const w = ensureWatchDay(data, date);
      w.spo2Sum += pct;
      w.spo2Count += 1;
      w.spo2Min = Math.min(w.spo2Min, pct);
      const hour = getHour(rdate);
      if (hour >= 0 && hour < 8) {
        w.spo2NightSum += pct;
        w.spo2NightCount += 1;
        w.spo2NightMin = Math.min(w.spo2NightMin, pct);
      } else {
        w.spo2DaySum += pct;
        w.spo2DayCount += 1;
        w.spo2DayMin = Math.min(w.spo2DayMin, pct);
      }
      data.dataAvailability.hasSpO2 = true;
    } else if (rec.type === "HKQuantityTypeIdentifierRespiratoryRate") {
      if (!Number.isFinite(numericValue) || numericValue < 5 || numericValue > 40) return;
      const w = ensureWatchDay(data, date);
      w.rrSum += numericValue;
      w.rrCount += 1;
      data.dataAvailability.hasRespiratoryRate = true;
    } else if (rec.type === "HKQuantityTypeIdentifierVO2Max") {
      if (!Number.isFinite(numericValue) || numericValue < 10 || numericValue > 90) return;
      const w = ensureWatchDay(data, date);
      w.vo2Max = numericValue;
      data.dataAvailability.hasVo2Max = true;
    } else if (rec.type === "HKQuantityTypeIdentifierAppleSleepingWristTemperature") {
      if (!Number.isFinite(numericValue) || numericValue < 30 || numericValue > 40) return;
      const w = ensureWatchDay(data, date);
      w.wristTempSum += numericValue;
      w.wristTempCount += 1;
      data.dataAvailability.hasWristTemp = true;
    } else if (rec.type === "HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances") {
      if (!Number.isFinite(numericValue)) return;
      const w = ensureWatchDay(data, date);
      w.breathingDisturbance = numericValue;
    } else if (rec.type === "HKQuantityTypeIdentifierHeartRate") {
      if (!Number.isFinite(numericValue) || numericValue < 30 || numericValue > 220) return;
      const hour = getHour(rdate);
      if (hour >= 0 && hour < 6) {
        const w = ensureWatchDay(data, date);
        w.nightHrSum += numericValue;
        w.nightHrCount += 1;
      }
    }
  }
  function processWorkoutBlock(block, data, options = {}) {
    if (!data.workouts) data.workouts = [];
    const headMatch = block.match(/<Workout\b[^>]*>/);
    const head = headMatch ? headMatch[0] : block;
    const startDate = xmlAttr(head, "startDate");
    if (!startDate) return;
    const date = getDate(startDate);
    const allowFuture = Boolean(options.allowFuture);
    const referenceDate = options.referenceDate || data.dataQuality?.referenceDate || getLocalToday();
    if (!data.dataQuality) {
      data.dataQuality = { referenceDate, skippedFutureCount: 0, futureSampleDates: [] };
    }
    if (!allowFuture && isFutureDate(date, referenceDate)) {
      noteSkippedFuture(data, date);
      return;
    }
    if (options.startDate && date < options.startDate) return;
    if (options.endDate && date > options.endDate) return;
    let durationMin = parseFloat(xmlAttr(head, "duration") || "");
    const durationUnit = (xmlAttr(head, "durationUnit") || "min").toLowerCase();
    if (!Number.isFinite(durationMin) || durationMin <= 0) return;
    if (durationUnit.startsWith("sec") || durationUnit === "s") durationMin /= 60;
    else if (durationUnit.startsWith("hr") || durationUnit === "h") durationMin *= 60;
    const activityType = shortWorkoutType(xmlAttr(head, "workoutActivityType") || "Other");
    const session = {
      startDate,
      endDate: xmlAttr(head, "endDate"),
      date,
      activityType,
      durationMin,
      source: xmlAttr(head, "sourceName")
    };
    const metsM = block.match(/key="HKAverageMETs"\s+value="([0-9.]+)/);
    if (metsM) {
      const v = parseFloat(metsM[1]);
      if (Number.isFinite(v)) session.avgMets = v;
    }
    const indoorM = block.match(/key="HKIndoorWorkout"\s+value="([01])"/);
    if (indoorM) session.indoor = indoorM[1] === "1";
    const statRe = /<WorkoutStatistics\b[^>]*>/g;
    let sm;
    while ((sm = statRe.exec(block)) !== null) {
      const tag = sm[0];
      const st = xmlAttr(tag, "type") || "";
      if (st.includes("ActiveEnergyBurned")) {
        const sum = parseFloat(xmlAttr(tag, "sum") || "");
        if (Number.isFinite(sum) && sum > 0) session.activeKcal = sum;
      } else if (st.includes("DistanceWalkingRunning") || st.includes("DistanceCycling")) {
        const sum = parseFloat(xmlAttr(tag, "sum") || "");
        const unit = (xmlAttr(tag, "unit") || "km").toLowerCase();
        if (Number.isFinite(sum) && sum > 0) {
          session.distanceKm = unit === "m" ? sum / 1e3 : sum;
        }
      } else if (st.includes("HeartRate")) {
        const avg = parseFloat(xmlAttr(tag, "average") || "");
        const min = parseFloat(xmlAttr(tag, "minimum") || "");
        const max = parseFloat(xmlAttr(tag, "maximum") || "");
        if (Number.isFinite(avg)) session.hrAvg = avg;
        if (Number.isFinite(min)) session.hrMin = min;
        if (Number.isFinite(max)) session.hrMax = max;
      }
    }
    data.workouts.push(session);
    data.dataAvailability.hasWorkouts = true;
  }
  function createParseLineState() {
    return { workoutBuf: null };
  }
  function processXmlLine(line, data, options, state) {
    if (state.workoutBuf) {
      state.workoutBuf.push(line);
      if (line.indexOf("</Workout>") !== -1) {
        processWorkoutBlock(state.workoutBuf.join("\n"), data, options);
        state.workoutBuf = null;
      }
      return;
    }
    if (line.indexOf("<Workout ") !== -1 || line.indexOf("<Workout	") !== -1) {
      const trimmed = line.trim();
      if (/\/>\s*$/.test(trimmed)) {
        processWorkoutBlock(line, data, options);
      } else {
        state.workoutBuf = [line];
      }
      return;
    }
    if (line.indexOf("<Record ") !== -1 || line.indexOf("<Record	") !== -1) {
      const rec = parseRecordLine(line);
      if (rec && rec.value !== "") processRecord(rec, data, options);
    }
  }
  function flushParseLineState(state, data, options) {
    if (state.workoutBuf && state.workoutBuf.length) {
      processWorkoutBlock(state.workoutBuf.join("\n"), data, options);
      state.workoutBuf = null;
    }
  }
  function mergeBodyFatIntoWeight(data) {
    if (!data.bodyFat?.length || !data.weight?.length) return;
    const fatByDate = {};
    for (const f of data.bodyFat) {
      if (!fatByDate[f.date]) fatByDate[f.date] = [];
      fatByDate[f.date].push({ datetime: f.datetime, value: f.value });
    }
    for (const w of data.weight) {
      if (w.bodyFat != null) continue;
      const list = fatByDate[w.date];
      if (!list?.length) continue;
      let best = list[0];
      let bestDiff = Math.abs(parseAppleDate(w.datetime) - parseAppleDate(best.datetime));
      for (let i = 1; i < list.length; i++) {
        const diff = Math.abs(parseAppleDate(w.datetime) - parseAppleDate(list[i].datetime));
        if (diff < bestDiff) {
          best = list[i];
          bestDiff = diff;
        }
      }
      if (bestDiff <= 3 * 3600 * 1e3) {
        w.bodyFat = best.value;
      }
    }
  }
  function finalizeData(data) {
    for (const date in data.steps) {
      data.steps[date].max = Math.max(data.steps[date].watch, data.steps[date].iphone);
    }
    const map = bpMaps.get(data);
    if (map && map.size > 0) {
      const byDt = /* @__PURE__ */ new Map();
      for (const r of data.bloodPressure || []) {
        byDt.set(r.datetime, { ...r });
      }
      for (const r of map.values()) {
        const cur = byDt.get(r.datetime) || {
          datetime: r.datetime,
          date: r.date,
          systolic: 0,
          diastolic: 0
        };
        if (r.systolic > 0) cur.systolic = r.systolic;
        if (r.diastolic > 0) cur.diastolic = r.diastolic;
        byDt.set(r.datetime, cur);
      }
      data.bloodPressure = [...byDt.values()].filter((r) => r.systolic > 0 && r.diastolic > 0);
      bpMaps.delete(data);
    } else {
      data.bloodPressure = (data.bloodPressure || []).filter((r) => r.systolic > 0 && r.diastolic > 0);
      if (map) bpMaps.delete(data);
    }
    data.bloodPressure.sort((a, b) => a.datetime.localeCompare(b.datetime));
    data.cgm.sort((a, b) => a.datetime.localeCompare(b.datetime));
    data.weight.sort((a, b) => a.datetime.localeCompare(b.datetime));
    if (data.bodyFat) {
      data.bodyFat.sort((a, b) => a.datetime.localeCompare(b.datetime));
    }
    mergeBodyFatIntoWeight(data);
    if (data.bodyFat?.length) data.dataAvailability.hasBodyFat = true;
    if (data.watchDaily) {
      for (const d of Object.keys(data.watchDaily)) {
        const w = data.watchDaily[d];
        if (w.activeKcal === 0 && w.exerciseMin === 0 && w.standMin === 0 && w.spo2Count === 0 && w.rrCount === 0 && w.nightHrCount === 0 && w.wristTempCount === 0 && w.vo2Max == null && w.breathingDisturbance == null && w.daylightMin === 0) {
          delete data.watchDaily[d];
        } else {
          if (w.spo2Min === Infinity) w.spo2Min = 0;
          if (w.spo2NightMin === Infinity) w.spo2NightMin = 0;
          if (w.spo2DayMin === Infinity) w.spo2DayMin = 0;
        }
      }
    }
    if (data.workouts?.length) {
      data.workouts.sort((a, b) => a.startDate.localeCompare(b.startDate));
      data.dataAvailability.hasWorkouts = true;
    }
  }
  function parseHealthXml(xmlText, options = {}) {
    const { startDate, endDate, onProgress, allowFuture, referenceDate } = options;
    const data = createEmptyData(referenceDate);
    const recOpts = {
      startDate,
      endDate,
      allowFuture,
      referenceDate: data.dataQuality.referenceDate
    };
    const state = createParseLineState();
    const lines = xmlText.split("\n");
    const total = lines.length;
    const reportEvery = Math.max(1, Math.floor(total / 100));
    for (let i = 0; i < total; i++) {
      processXmlLine(lines[i], data, recOpts, state);
      if (onProgress && i % reportEvery === 0) {
        onProgress(i / total);
      }
    }
    flushParseLineState(state, data, recOpts);
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
  async function forEachXmlLine(source, onLine, onProgress) {
    if (typeof source === "string") {
      let pos = 0;
      const len = source.length;
      let i = 0;
      let lastReport = 0;
      while (pos < len) {
        let endPos = source.indexOf("\n", pos);
        if (endPos === -1) endPos = len;
        onLine(source.substring(pos, endPos));
        pos = endPos + 1;
        i++;
        if (i - lastReport > 5e3) {
          lastReport = i;
          if (onProgress) onProgress(pos / len);
        }
      }
      if (onProgress) onProgress(1);
      return;
    }
    const view = source instanceof Uint8Array ? source : new Uint8Array(source);
    const decoder = new TextDecoder("utf-8");
    const totalBytes = view.byteLength;
    const chunkSize = 4 * 1024 * 1024;
    let pendingLine = "";
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
      for (const line of lines) onLine(line);
      if (onProgress) onProgress((offset + chunk.byteLength) / totalBytes);
      if (Date.now() - lastYield > 50) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = Date.now();
      }
    }
    if (pendingLine) onLine(pendingLine);
    if (onProgress) onProgress(1);
  }
  async function parseHealthXmlAsync(source, options = {}) {
    const { startDate, endDate, onProgress, allowFuture, referenceDate } = options;
    const data = createEmptyData(referenceDate);
    const recOpts = {
      startDate,
      endDate,
      allowFuture,
      referenceDate: data.dataQuality.referenceDate
    };
    const state = createParseLineState();
    await forEachXmlLine(
      source,
      (line) => processXmlLine(line, data, recOpts, state),
      onProgress
    );
    flushParseLineState(state, data, recOpts);
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
    const mean2 = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean2) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const cv = mean2 > 0 ? std / mean2 * 100 : 0;
    return {
      mean: mean2,
      std,
      cv,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n
    };
  }
  function cgmSegment(points) {
    if (!points.length) return null;
    const sorted = [...points].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const values = sorted.map((p) => p.value);
    const total = values.length;
    const overall = calcStats(values);
    return {
      ...overall,
      timeRange: `${sorted[0].datetime} \u81F3 ${sorted[sorted.length - 1].datetime}`,
      pctBelow39: values.filter((v) => v < 3.9).length / total * 100,
      pctBelow30: values.filter((v) => v < 3).length / total * 100,
      pctInRange: values.filter((v) => v >= 3.9 && v <= 10).length / total * 100,
      pctAbove78: values.filter((v) => v > 7.8).length / total * 100,
      pctAbove100: values.filter((v) => v > 10).length / total * 100
    };
  }
  function calcCgmStats(cgm) {
    if (cgm.length === 0) return null;
    const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const overall = cgmSegment(sorted);
    const firstDayDate = getDate(sorted[0].datetime);
    const firstDayPoints = sorted.filter((p) => getDate(p.datetime) === firstDayDate);
    const stablePoints = sorted.filter((p) => getDate(p.datetime) !== firstDayDate);
    const firstDay = cgmSegment(firstDayPoints);
    const stable = stablePoints.length ? cgmSegment(stablePoints) : null;
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
    return {
      overall,
      firstDayDate,
      firstDay,
      stable,
      daily,
      maxRises
    };
  }
  function meanBp(records) {
    if (!records.length) return null;
    const meanSys = records.reduce((a, b) => a + b.systolic, 0) / records.length;
    const meanDia = records.reduce((a, b) => a + b.diastolic, 0) / records.length;
    const lowCount = records.filter((r) => r.systolic < 90 || r.diastolic < 60).length;
    return {
      systolic: meanSys,
      diastolic: meanDia,
      count: records.length,
      lowCount
    };
  }
  function calcBloodPressureStats(records) {
    if (records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));
    function inLastDays(days) {
      const latest = sorted[sorted.length - 1].date;
      const latestDate = /* @__PURE__ */ new Date(`${latest}T00:00:00Z`);
      latestDate.setUTCDate(latestDate.getUTCDate() - days);
      const startStr = latestDate.toISOString().slice(0, 10);
      return sorted.filter((r) => r.date >= startStr && r.date <= latest);
    }
    function periodStats(days, pred) {
      let filtered = inLastDays(days);
      if (pred) filtered = filtered.filter(pred);
      return meanBp(filtered);
    }
    const isMorning = (r) => getHour(r.datetime) < 12;
    const isEvening = (r) => getHour(r.datetime) >= 18;
    return {
      records: sorted,
      mean7d: periodStats(7),
      mean14d: periodStats(14),
      mean30d: periodStats(30),
      morning7d: periodStats(7, isMorning),
      evening7d: periodStats(7, isEvening),
      morning14d: periodStats(14, isMorning),
      evening14d: periodStats(14, isEvening),
      lowest: sorted.reduce((min, r) => r.systolic < min.systolic ? r : min, sorted[0]),
      highest: sorted.reduce((max, r) => r.systolic > max.systolic ? r : max, sorted[0])
    };
  }
  function calcWeightStats(weight) {
    if (!weight.length) return null;
    const sorted = [...weight].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const byDate = {};
    for (const w of sorted) {
      if (!byDate[w.date]) byDate[w.date] = [];
      byDate[w.date].push(w);
    }
    const daily = [];
    for (const date of Object.keys(byDate).sort()) {
      const all = byDate[date].sort((a, b) => a.datetime.localeCompare(b.datetime));
      const mornings = all.filter((w) => getHour(w.datetime) < 12);
      const evenings = all.filter((w) => getHour(w.datetime) >= 18);
      const morning = mornings.length ? mornings[0] : null;
      const evening = evenings.length ? evenings[evenings.length - 1] : null;
      const trend = morning || all[0];
      daily.push({
        date,
        trend,
        morning,
        evening,
        allCount: all.length
      });
    }
    const trendSeries = daily.map((d) => ({
      date: d.date,
      weight: d.trend.value,
      bodyFat: d.trend.bodyFat
    }));
    const withFat = trendSeries.filter((t) => t.bodyFat != null && Number.isFinite(t.bodyFat));
    const latestTrend = trendSeries.length ? trendSeries[trendSeries.length - 1] : null;
    const earliestTrend = trendSeries.length ? trendSeries[0] : null;
    const morningsOnly = daily.map((d) => d.morning).filter(Boolean);
    return {
      daily,
      trendSeries,
      rawCount: sorted.length,
      dayCount: daily.length,
      latestTrend,
      earliestTrend,
      latestMorning: morningsOnly.length ? morningsOnly[morningsOnly.length - 1] : null,
      bodyFatLatest: withFat.length ? withFat[withFat.length - 1].bodyFat : null,
      bodyFatEarliest: withFat.length ? withFat[0].bodyFat : null,
      bodyFatDelta: withFat.length >= 2 ? withFat[withFat.length - 1].bodyFat - withFat[0].bodyFat : null,
      bodyFatDayCount: withFat.length
    };
  }
  function summarizeHrvByDay(hrv, hrvOvernight) {
    const result = {};
    for (const date of Object.keys(hrv).sort()) {
      const vals = hrv[date];
      const overnight = hrvOvernight[date] || [];
      result[date] = {
        allMean: vals.reduce((a, b) => a + b, 0) / vals.length,
        overnightMean: overnight.length > 0 ? overnight.reduce((a, b) => a + b, 0) / overnight.length : null,
        min: Math.min(...vals),
        max: Math.max(...vals),
        count: vals.length
      };
    }
    return result;
  }
  function meanLastN(values, n) {
    const vals = values.filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    const slice = vals.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
  function minLastN(values, n) {
    const vals = values.filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return Math.min(...vals.slice(-n));
  }
  function toWatchView(date, w) {
    const finiteMin = (v, count) => count > 0 && v > 0 && v < Infinity ? v : null;
    return {
      date,
      activeKcal: w.activeKcal,
      exerciseMin: w.exerciseMin,
      standMin: w.standMin,
      daylightMin: w.daylightMin,
      spo2Mean: w.spo2Count > 0 ? w.spo2Sum / w.spo2Count : null,
      spo2Min: finiteMin(w.spo2Min, w.spo2Count),
      spo2NightMean: w.spo2NightCount > 0 ? w.spo2NightSum / w.spo2NightCount : null,
      spo2NightMin: finiteMin(w.spo2NightMin, w.spo2NightCount),
      spo2DayMean: w.spo2DayCount > 0 ? w.spo2DaySum / w.spo2DayCount : null,
      spo2DayMin: finiteMin(w.spo2DayMin, w.spo2DayCount),
      rrMean: w.rrCount > 0 ? w.rrSum / w.rrCount : null,
      nightHrMean: w.nightHrCount > 0 ? w.nightHrSum / w.nightHrCount : null,
      vo2Max: w.vo2Max ?? null,
      wristTempMean: w.wristTempCount > 0 ? w.wristTempSum / w.wristTempCount : null,
      breathingDisturbance: w.breathingDisturbance ?? null
    };
  }
  function calcWatchStats(watchDaily) {
    if (!watchDaily || !Object.keys(watchDaily).length) return null;
    const days = Object.keys(watchDaily).sort().map((d) => toWatchView(d, watchDaily[d]));
    const vo2Series = days.filter((d) => d.vo2Max != null);
    const vo2Latest = vo2Series.length ? vo2Series[vo2Series.length - 1].vo2Max : null;
    const vo2Earliest = vo2Series.length ? vo2Series[0].vo2Max : null;
    return {
      days,
      activeKcalMean7d: meanLastN(days.map((d) => d.activeKcal), 7),
      exerciseMinMean7d: meanLastN(days.map((d) => d.exerciseMin), 7),
      spo2Mean7d: meanLastN(days.map((d) => d.spo2Mean), 7),
      // 近 7 个有血氧日的「日最低」中的最小值（不是日最低的均值）
      spo2Min7d: minLastN(days.map((d) => d.spo2Min), 7),
      spo2NightMean7d: meanLastN(days.map((d) => d.spo2NightMean), 7),
      spo2NightMin7d: minLastN(days.map((d) => d.spo2NightMin), 7),
      spo2DayMean7d: meanLastN(days.map((d) => d.spo2DayMean), 7),
      spo2DayMin7d: minLastN(days.map((d) => d.spo2DayMin), 7),
      rrMean7d: meanLastN(days.map((d) => d.rrMean), 7),
      nightHrMean7d: meanLastN(days.map((d) => d.nightHrMean), 7),
      vo2Latest,
      vo2Earliest,
      vo2Delta: vo2Latest != null && vo2Earliest != null ? vo2Latest - vo2Earliest : null,
      wristTempMean7d: meanLastN(days.map((d) => d.wristTempMean), 7),
      dayCount: days.length,
      spo2DayCount: days.filter((d) => d.spo2Mean != null).length,
      spo2NightDayCount: days.filter((d) => d.spo2NightMean != null).length,
      vo2DayCount: vo2Series.length
    };
  }
  function daysBetween(a, b) {
    const ta = Date.parse(`${a}T00:00:00Z`);
    const tb = Date.parse(`${b}T00:00:00Z`);
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
    return Math.round((tb - ta) / (24 * 3600 * 1e3));
  }
  function calcWorkoutStats(workouts, referenceDate) {
    if (!workouts || !workouts.length) return null;
    const sessions = [...workouts].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const last = sessions[sessions.length - 1];
    const latestDate = referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ? referenceDate : last.date;
    const inWindow = (s, days) => daysBetween(s.date, latestDate) <= days - 1 && s.date <= latestDate;
    const s30 = sessions.filter((s) => inWindow(s, 30));
    const s7 = sessions.filter((s) => inWindow(s, 7));
    const sumDur = (list) => list.reduce((a, s) => a + (s.durationMin || 0), 0);
    const sumKcal = (list) => list.reduce((a, s) => a + (s.activeKcal != null && Number.isFinite(s.activeKcal) ? s.activeKcal : 0), 0);
    const byTypeMap = /* @__PURE__ */ new Map();
    for (const s of sessions) {
      const cur = byTypeMap.get(s.activityType) || {
        activityType: s.activityType,
        count: 0,
        durationMin: 0,
        activeKcal: 0
      };
      cur.count += 1;
      cur.durationMin += s.durationMin || 0;
      cur.activeKcal += s.activeKcal || 0;
      byTypeMap.set(s.activityType, cur);
    }
    const byType = [...byTypeMap.values()].sort((a, b) => b.durationMin - a.durationMin);
    const hr30 = s30.map((s) => s.hrAvg).filter((v) => v != null && Number.isFinite(v));
    const hrAvgMean30d = hr30.length > 0 ? hr30.reduce((a, b) => a + b, 0) / hr30.length : null;
    return {
      sessions,
      count: sessions.length,
      totalDurationMin: sumDur(sessions),
      totalActiveKcal: sumKcal(sessions),
      count30d: s30.length,
      durationSum30d: sumDur(s30),
      durationMean30d: s30.length ? sumDur(s30) / s30.length : null,
      activeKcalSum30d: sumKcal(s30),
      count7d: s7.length,
      durationSum7d: sumDur(s7),
      byType,
      lastSession: last,
      hrAvgMean30d
    };
  }
  function analyzeAll(data) {
    const allDates = [
      ...data.cgm.map((x) => getDate(x.datetime)),
      ...data.bloodPressure.map((x) => x.date),
      ...data.weight.map((x) => x.date),
      ...(data.bodyFat || []).map((x) => x.date),
      ...Object.keys(data.hrv),
      ...Object.keys(data.restingHr),
      ...Object.keys(data.walkingHr),
      ...Object.keys(data.steps),
      ...Object.keys(data.sleep),
      ...Object.keys(data.watchDaily || {}),
      ...(data.workouts || []).map((w) => w.date)
    ];
    allDates.sort();
    const start = allDates[0] || "";
    const end = allDates[allDates.length - 1] || "";
    return {
      data,
      cgmStats: calcCgmStats(data.cgm),
      bpStats: calcBloodPressureStats(data.bloodPressure),
      weightStats: calcWeightStats(data.weight),
      watchStats: calcWatchStats(data.watchDaily),
      // 近 7/30 日相对整体数据结束日，避免「很久没练」被误算成仍有训练
      workoutStats: calcWorkoutStats(data.workouts, end || void 0),
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

  // src/signals.ts
  function mean(values) {
    const v = values.filter(Number.isFinite);
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }
  function recentDates(keys, n) {
    return [...keys].sort().slice(-n);
  }
  function detectCrossSignals(analysis) {
    const signals = [];
    const data = analysis.data;
    const hrvByDate = analysis.hrvByDate || {};
    const restMap = analysis.restingHrByDate || data.restingHr || {};
    const walkMap = analysis.walkingHrByDate || data.walkingHr || {};
    const stepsMap = analysis.stepsByDate || {};
    const sleepMap = analysis.sleepByDate || data.sleep || {};
    const hrvDates = Object.keys(hrvByDate).sort();
    const hrv7 = recentDates(hrvDates, 7);
    const hrvBase = mean(hrv7.map((d) => hrvByDate[d].allMean));
    const rest7 = recentDates(Object.keys(restMap), 7);
    const restBase = mean(rest7.map((d) => restMap[d]));
    const commonDays = hrvDates.filter((d) => restMap[d] != null);
    for (const d of commonDays.slice(-14)) {
      const h = hrvByDate[d].allMean;
      const r = restMap[d];
      if (hrvBase != null && restBase != null && h < hrvBase * 0.75 && r > restBase + 8) {
        signals.push({
          severity: "watch",
          date: d,
          title: "\u6062\u590D\u538B\u529B\u65E5\uFF08HRV\u2193 + \u9759\u606F\u5FC3\u7387\u2191\uFF09",
          detail: `${d}\uFF1AHRV \u5168\u5929\u5747\u503C ${h.toFixed(1)} ms\uFF08\u8FD1 7 \u65E5\u5747 ${hrvBase.toFixed(1)}\uFF09\uFF0C\u9759\u606F\u5FC3\u7387 ${r} bpm\uFF08\u8FD1 7 \u65E5\u5747 ${restBase.toFixed(1)}\uFF09\u3002\u53EF\u80FD\u4E0E\u75B2\u52B3\u3001\u7761\u7720\u4E0D\u8DB3\u3001\u75BE\u75C5\u6216\u8BAD\u7EC3\u8D1F\u8377\u6709\u5173\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u75C7\u72B6\u89C2\u5BDF 1-2 \u5929\u3002`,
          dimensions: ["HRV", "\u9759\u606F\u5FC3\u7387"]
        });
      }
    }
    const sleepDays = Object.keys(sleepMap).sort();
    for (const d of sleepDays.slice(-10)) {
      const sleepH = sleepMap[d]?.total;
      const steps = stepsMap[d];
      if (sleepH != null && sleepH < 6 && steps != null && steps < 3e3) {
        signals.push({
          severity: "info",
          date: d,
          title: "\u4F4E\u7761\u7720\u4E14\u6D3B\u52A8\u91CF\u504F\u4F4E",
          detail: `${d}\uFF1A\u603B\u7761\u7720 ${sleepH.toFixed(2)} h\uFF0C\u6B65\u6570 ${Math.round(steps)}\u3002\u82E5\u6301\u7EED\u591A\u65E5\uFF0C\u53EF\u4F18\u5148\u4FDD\u8BC1\u7761\u7720\u4E0E\u57FA\u7840\u6D3B\u52A8\uFF0C\u907F\u514D\u8FC7\u5EA6\u89E3\u8BFB\u5355\u65E5\u6307\u6807\u3002`,
          dimensions: ["\u7761\u7720", "\u6B65\u6570"]
        });
      }
    }
    if (analysis.bpStats?.mean7d && analysis.bpStats.mean7d.lowCount > 0) {
      const m = analysis.bpStats.mean7d;
      signals.push({
        severity: m.lowCount >= 3 ? "watch" : "info",
        title: "\u8FD1 7 \u5929\u51FA\u73B0\u504F\u4F4E\u8840\u538B\u8BFB\u6570",
        detail: `\u8FD1 7 \u5929\u5747\u503C ${m.systolic.toFixed(1)}/${m.diastolic.toFixed(1)} mmHg\uFF0C\u5176\u4E2D ${m.lowCount} \u6761 <90/60\u3002\u7ED3\u5408\u5934\u6655\u3001\u4E4F\u529B\u7B49\u75C7\u72B6\u5224\u65AD\uFF1B\u7528\u836F\u8C03\u6574\u8BF7\u9075\u533B\u5631\u3002`,
        dimensions: ["\u8840\u538B"]
      });
    }
    if (analysis.cgmStats) {
      const o = analysis.cgmStats.overall;
      if (o.pctBelow30 > 0) {
        signals.push({
          severity: "alert",
          title: "CGM \u51FA\u73B0 <3.0 mmol/L \u8BFB\u6570",
          detail: `\u6574\u4F53 <3.0 \u5360\u6BD4 ${o.pctBelow30.toFixed(1)}%\uFF0C\u6700\u4F4E ${o.min.toFixed(1)} mmol/L\u3002\u987B\u6307\u5C16\u8840\u590D\u6838\uFF1B\u4E0D\u80FD\u4EC5\u51ED CGM \u5224\u5B9A\u4F4E\u8840\u7CD6\u3002`,
          dimensions: ["CGM"]
        });
      } else if (o.pctBelow39 >= 5) {
        signals.push({
          severity: "watch",
          title: "CGM <3.9 mmol/L \u5360\u6BD4\u8F83\u9AD8",
          detail: `\u6574\u4F53 <3.9 \u5360\u6BD4 ${o.pctBelow39.toFixed(1)}%\u3002\u6CE8\u610F\u533A\u5206\u4F20\u611F\u5668\u4F2A\u5F71\u4E0E\u771F\u5B9E\u4F4E\u503C\uFF0C\u5F02\u5E38\u65F6\u6307\u5C16\u8840\u590D\u6838\u3002`,
          dimensions: ["CGM"]
        });
      }
      for (const [date, day] of Object.entries(analysis.cgmStats.daily)) {
        if (day.pctBelow39 >= 20 && day.count >= 12) {
          signals.push({
            severity: "watch",
            date,
            title: `CGM \u5355\u65E5\u4F4E\u503C\u504F\u591A\uFF08${date}\uFF09`,
            detail: `${date}\uFF1A<3.9 \u5360\u6BD4 ${day.pctBelow39.toFixed(1)}%\uFF08${day.count} \u6761\uFF09\uFF0C\u6700\u4F4E ${day.min.toFixed(1)}\u3002\u4F18\u5148\u6392\u67E5\u538B\u8FEB\u4F4E\u503C/\u4F20\u611F\u5668\u9996\u65E5\u504F\u5DEE\uFF0C\u5E76\u6307\u5C16\u8840\u590D\u6838\u53EF\u7591\u65F6\u6BB5\u3002`,
            dimensions: ["CGM"]
          });
        }
      }
    }
    const trend = analysis.weightStats?.trendSeries || [];
    if (trend.length >= 4) {
      const last = trend[trend.length - 1];
      const refIdx = Math.max(0, trend.length - 8);
      const ref = trend[refIdx];
      const drop = ref.weight - last.weight;
      if (drop >= 1.5) {
        signals.push({
          severity: drop >= 2.5 ? "watch" : "info",
          date: last.date,
          title: "\u4F53\u91CD\u77ED\u671F\u4E0B\u964D\u504F\u5FEB\uFF08\u6668\u8D77\u8D8B\u52BF\uFF09",
          detail: `\u76F8\u5BF9\u7EA6\u4E00\u5468\u524D\u8D8B\u52BF\u4F53\u91CD ${ref.weight.toFixed(1)} kg\uFF08${ref.date}\uFF09\uFF0C\u6700\u65B0 ${last.weight.toFixed(1)} kg\uFF08${last.date}\uFF09\uFF0C\u7EA6\u4E0B\u964D ${drop.toFixed(1)} kg\u3002\u82E5\u4F34\u968F\u4E4F\u529B\u3001HRV \u4E0B\u964D\u6216\u8840\u538B\u504F\u4F4E\uFF0C\u5EFA\u8BAE\u7EFC\u5408\u5173\u6CE8\u80FD\u91CF\u6444\u5165\u4E0E\u6062\u590D\u3002`,
          dimensions: ["\u4F53\u91CD"]
        });
      }
    }
    if (analysis.cgmStats?.stable && analysis.cgmStats.firstDay) {
      const st = analysis.cgmStats.stable;
      const fd = analysis.cgmStats.firstDay;
      if (fd.pctBelow39 >= 15 && st.pctBelow39 < 2 && st.pctBelow30 === 0) {
        signals.push({
          severity: "info",
          date: analysis.cgmStats.firstDayDate || void 0,
          title: "CGM \u4F4E\u503C\u4E3B\u8981\u96C6\u4E2D\u5728\u4F20\u611F\u5668\u9996\u65E5",
          detail: `\u9996\u65E5 <3.9 \u5360\u6BD4 ${fd.pctBelow39.toFixed(1)}%\uFF0C\u7A33\u5B9A\u671F\u4EC5 ${st.pctBelow39.toFixed(1)}% \u4E14\u65E0 <3.0\u3002\u89E3\u8BFB\u65F6\u8BF7\u4EE5\u7A33\u5B9A\u671F\u4E3A\u51C6\uFF0C\u9996\u65E5\u4F4E\u503C\u4F18\u5148\u8003\u8651\u538B\u8FEB/\u6821\u51C6\u4F2A\u5F71\u5E76\u6307\u5C16\u8840\u590D\u6838\u53EF\u7591\u65F6\u6BB5\u3002`,
          dimensions: ["CGM"]
        });
      }
    }
    if (hrvBase != null && restBase != null) {
      const walk7 = recentDates(Object.keys(walkMap), 7);
      const walkBase = mean(walk7.map((d) => walkMap[d]));
      if (walkBase != null && walkBase >= 120 && hrvBase < 25) {
        signals.push({
          severity: "info",
          title: "\u8FD1 7 \u65E5\u6B65\u884C\u5FC3\u7387\u504F\u9AD8\u4E14 HRV \u504F\u4F4E",
          detail: `\u6B65\u884C\u5FC3\u7387\u8FD1 7 \u65E5\u5747\u7EA6 ${walkBase.toFixed(0)} bpm\uFF0CHRV \u8FD1 7 \u65E5\u5747\u7EA6 ${hrvBase.toFixed(1)} ms\u3002\u53EF\u80FD\u53CD\u6620\u6709\u6C27\u80FD\u529B/\u6062\u590D\u72B6\u6001\u504F\u7D27\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u7761\u7720\u4E0E\u4E3B\u89C2\u75B2\u52B3\u5224\u65AD\u3002`,
          dimensions: ["\u6B65\u884C\u5FC3\u7387", "HRV"]
        });
      }
    }
    const ws = analysis.watchStats;
    if (ws && ws.dayCount > 0) {
      if (ws.spo2Min7d != null && ws.spo2Min7d < 92) {
        signals.push({
          severity: "watch",
          title: "\u8FD1 7 \u65E5\u51FA\u73B0\u8F83\u4F4E\u8840\u6C27\u8BFB\u6570",
          detail: `\u8840\u6C27\u8FD1 7 \u65E5\u5747\u503C\u7EA6 ${ws.spo2Mean7d != null ? ws.spo2Mean7d.toFixed(1) : "\u2014"}%\uFF0C\u671F\u95F4\u6700\u4F4E\u7EA6 ${ws.spo2Min7d.toFixed(1)}%\uFF08${ws.spo2DayCount} \u5929\u6709\u6837\u672C\uFF09\u3002Apple Watch \u8840\u6C27\u6613\u53D7\u8FD0\u52A8/\u59FF\u52BF/\u4F69\u6234\u5F71\u54CD\uFF1B\u82E5\u4F34\u968F\u80F8\u95F7\u3001\u6C14\u77ED\u6216\u53CD\u590D\u504F\u4F4E\uFF0C\u5EFA\u8BAE\u590D\u6D4B\u5E76\u5FC5\u8981\u65F6\u5C31\u533B\u8BC4\u4F30\u3002`,
          dimensions: ["\u8840\u6C27"]
        });
      } else if (ws.spo2Mean7d != null && ws.spo2Mean7d < 95) {
        signals.push({
          severity: "info",
          title: "\u8FD1 7 \u65E5\u8840\u6C27\u5747\u503C\u7565\u504F\u4F4E",
          detail: `\u8840\u6C27\u8FD1 7 \u65E5\u5747\u503C\u7EA6 ${ws.spo2Mean7d.toFixed(1)}%\u3002\u65E0\u75C7\u72B6\u65F6\u4F18\u5148\u89C2\u5BDF\u8D8B\u52BF\u4E0E\u590D\u6D4B\uFF1B\u52FF\u5355\u6B21\u8BFB\u6570\u5B9A\u8BBA\u3002`,
          dimensions: ["\u8840\u6C27"]
        });
      }
      if (ws.exerciseMinMean7d != null && ws.exerciseMinMean7d < 5 && ws.dayCount >= 5) {
        const lowActDays = ws.days.slice(-7).filter((d) => d.exerciseMin < 5 && d.activeKcal < 150);
        if (lowActDays.length >= 4) {
          signals.push({
            severity: "info",
            title: "\u8FD1 7 \u65E5 Watch \u6D3B\u52A8\u91CF\u504F\u4F4E",
            detail: `\u65E5\u5747\u953B\u70BC\u7EA6 ${ws.exerciseMinMean7d.toFixed(0)} \u5206\u949F` + (ws.activeKcalMean7d != null ? `\uFF0C\u6D3B\u52A8\u6D88\u8017\u7EA6 ${ws.activeKcalMean7d.toFixed(0)} kcal` : "") + `\u3002\u53EF\u4E0E\u6B65\u6570/\u7761\u7720\u5BF9\u7167\uFF1B\u4E45\u5750\u65E5\u53EF\u7A7F\u63D2\u77ED\u65F6\u8D70\u52A8\uFF0C\u907F\u514D\u4EC5\u51ED\u6212\u6307\u7C7B\u73AF\u8FBE\u6807\u7126\u8651\u3002`,
            dimensions: ["Watch\u6D3B\u52A8", "\u6B65\u6570"]
          });
        }
      }
      if (ws.exerciseMinMean7d != null && ws.exerciseMinMean7d < 10 && hrvBase != null && hrvBase < 25) {
        signals.push({
          severity: "info",
          title: "\u4F4E\u6D3B\u52A8\u4E14 HRV \u504F\u4F4E",
          detail: `\u8FD1 7 \u65E5\u65E5\u5747\u953B\u70BC\u7EA6 ${ws.exerciseMinMean7d.toFixed(0)} \u5206\u949F\uFF0CHRV \u7EA6 ${hrvBase.toFixed(1)} ms\u3002\u53EF\u80FD\u5904\u4E8E\u6062\u590D\u4E0D\u8DB3\u6216\u6D3B\u52A8\u8FC7\u5C11\u72B6\u6001\uFF0C\u5EFA\u8BAE\u4F18\u5148\u7761\u7720\u4E0E\u8F7B\u5EA6\u65E5\u5E38\u6D3B\u52A8\uFF0C\u52FF\u5728\u4F4E\u6062\u590D\u65E5\u5F3A\u4E0A\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\u3002`,
          dimensions: ["Watch\u6D3B\u52A8", "HRV"]
        });
      }
      if (ws.nightHrMean7d != null && restBase != null && ws.nightHrMean7d > restBase + 10) {
        signals.push({
          severity: "info",
          title: "\u591C\u95F4\u5FC3\u7387\u9AD8\u4E8E\u65E5\u95F4\u9759\u606F",
          detail: `\u8FD1 7 \u65E5 0\u20136 \u70B9\u5FC3\u7387\u5747\u503C\u7EA6 ${ws.nightHrMean7d.toFixed(0)} bpm\uFF0C\u65E5\u95F4\u9759\u606F\u7EA6 ${restBase.toFixed(0)} bpm\u3002\u53EF\u7ED3\u5408\u7761\u7720\u8D28\u91CF\u3001\u996E\u9152\u3001\u75BE\u75C5\u6216\u5BA4\u6E29\u89E3\u8BFB\uFF1B\u6301\u7EED\u504F\u9AD8\u53EF\u89C2\u5BDF\u662F\u5426\u4F34\u968F HRV \u4E0B\u964D\u3002`,
          dimensions: ["\u591C\u95F4\u5FC3\u7387", "\u9759\u606F\u5FC3\u7387"]
        });
      }
      if (ws.spo2NightMin7d != null && ws.spo2NightMin7d < 92) {
        signals.push({
          severity: "watch",
          title: "\u8FD1 7 \u65E5\u591C\u6BB5\u8840\u6C27\u51FA\u73B0\u4F4E\u503C",
          detail: `\u591C\u6BB5(0\u20138\u70B9)\u6700\u4F4E\u7EA6 ${ws.spo2NightMin7d.toFixed(1)}%` + (ws.spo2NightMean7d != null ? `\uFF0C\u591C\u6BB5\u5747\u503C\u7EA6 ${ws.spo2NightMean7d.toFixed(1)}%` : "") + (ws.spo2DayMean7d != null ? `\uFF1B\u65E5\u6BB5\u5747\u503C\u7EA6 ${ws.spo2DayMean7d.toFixed(1)}%` : "") + "\u3002\u591C\u6BB5\u504F\u4F4E\u66F4\u9700\u7ED3\u5408\u7761\u7720\u59FF\u52BF\u3001\u547C\u5438\u4E0E\u75C7\u72B6\uFF1B\u65E0\u75C7\u72B6\u65F6\u4F18\u5148\u590D\u6D4B\u4E0E\u8D8B\u52BF\u89C2\u5BDF\u3002",
          dimensions: ["\u8840\u6C27", "\u7761\u7720"]
        });
      } else if (ws.spo2NightMean7d != null && ws.spo2DayMean7d != null && ws.spo2NightMean7d <= ws.spo2DayMean7d - 1.5) {
        signals.push({
          severity: "info",
          title: "\u591C\u6BB5\u8840\u6C27\u5747\u503C\u4F4E\u4E8E\u65E5\u6BB5",
          detail: `\u8FD1 7 \u65E5\u591C\u6BB5 SpO\u2082 \u5747\u503C\u7EA6 ${ws.spo2NightMean7d.toFixed(1)}%\uFF0C\u65E5\u6BB5\u7EA6 ${ws.spo2DayMean7d.toFixed(1)}%\u3002\u5DEE\u503C\u5728 Watch \u6D4B\u91CF\u8BEF\u5DEE\u8303\u56F4\u5185\u4E5F\u53EF\u51FA\u73B0\uFF1B\u82E5\u4F34\u6253\u9F3E/\u767D\u5929\u55DC\u7761\u53EF\u8BB0\u5F55\u540E\u54A8\u8BE2\u533B\u751F\u3002`,
          dimensions: ["\u8840\u6C27", "\u7761\u7720"]
        });
      }
      if (hrvBase != null && ws.nightHrMean7d != null && restBase != null && hrvBase < 28 && ws.nightHrMean7d >= restBase + 5) {
        const ex = ws.exerciseMinMean7d;
        const wos2 = analysis.workoutStats;
        const trainNote = wos2 && wos2.count7d > 0 ? `\u8FD1 7 \u65E5 Workout ${wos2.count7d} \u573A\u3001\u5171\u7EA6 ${wos2.durationSum7d.toFixed(0)} \u5206\u949F` : ex != null ? `\u8FD1 7 \u65E5\u65E5\u5747\u953B\u70BC\u7EA6 ${ex.toFixed(0)} \u5206\u949F` : "\u8FD1\u671F\u6D3B\u52A8";
        signals.push({
          severity: hrvBase < 22 ? "watch" : "info",
          title: "\u6062\u590D\u504F\u7D27\uFF08HRV\u2193 + \u591C HR\u2191\uFF09",
          detail: `${trainNote}\uFF1BHRV \u8FD1 7 \u65E5\u5747\u7EA6 ${hrvBase.toFixed(1)} ms\uFF0C\u591C\u95F4\u5FC3\u7387\u7EA6 ${ws.nightHrMean7d.toFixed(0)} bpm\uFF08\u9759\u606F\u7EA6 ${restBase.toFixed(0)}\uFF09\u3002\u53EF\u80FD\u53CD\u6620\u7761\u7720/\u8D1F\u8377/\u75BE\u75C5\u6062\u590D\u538B\u529B\uFF0C\u5EFA\u8BAE\u4F18\u5148\u7761\u7720\u4E0E\u4F4E\u5F3A\u5EA6\u65E5\uFF0C\u907F\u514D\u8FDE\u7EED\u9AD8\u5F3A\u5EA6\u3002`,
          dimensions: ["HRV", "\u591C\u95F4\u5FC3\u7387", "Watch\u6D3B\u52A8"]
        });
      }
    }
    const wos = analysis.workoutStats;
    if (wos && wos.sessions.length && Object.keys(hrvByDate).length) {
      for (const s of wos.sessions.slice(-20)) {
        if ((s.durationMin || 0) < 40 && (s.activeKcal || 0) < 300) continue;
        const next = /* @__PURE__ */ new Date(`${s.date}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextDate = next.toISOString().slice(0, 10);
        const hNext = hrvByDate[nextDate];
        if (!hNext || hrvBase == null) continue;
        if (hNext.allMean < hrvBase * 0.75) {
          signals.push({
            severity: "info",
            date: nextDate,
            title: "\u8F83\u5927\u8BAD\u7EC3\u540E\u6B21\u65E5 HRV \u504F\u4F4E",
            detail: `${s.date} ${s.activityType} \u7EA6 ${s.durationMin.toFixed(0)} min` + (s.activeKcal != null ? ` / ${s.activeKcal.toFixed(0)} kcal` : "") + (s.hrAvg != null ? `\uFF0C\u5747 HR ${s.hrAvg.toFixed(0)}` : "") + `\uFF1B\u6B21\u65E5 ${nextDate} HRV ${hNext.allMean.toFixed(1)} ms\uFF08\u8FD1 7 \u65E5\u5747 ${hrvBase.toFixed(1)}\uFF09\u3002\u5C5E\u5E38\u89C1\u6062\u590D\u53CD\u5E94\uFF0C\u53EF\u5B89\u6392\u8F7B\u677E\u65E5\u3002`,
            dimensions: ["Workout", "HRV"]
          });
        }
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const s of signals) {
      const k = `${s.title}|${s.date || ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(s);
    }
    const rank = { alert: 0, watch: 1, info: 2 };
    unique.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.date || "").localeCompare(String(a.date || "")));
    return unique.slice(0, 20);
  }
  function formatCrossSignalsForLLM(signals) {
    if (!signals.length) {
      return "## \u8DE8\u7EF4\u5EA6\u63D0\u793A\n\n\uFF08\u5F53\u524D\u89C4\u5219\u672A\u89E6\u53D1\u660E\u663E\u7EC4\u5408\u4FE1\u53F7\uFF09\n";
    }
    const lines = [
      "## \u8DE8\u7EF4\u5EA6\u63D0\u793A\uFF08\u542F\u53D1\u5F0F\uFF0C\u975E\u8BCA\u65AD\uFF09",
      "",
      "| \u7EA7\u522B | \u65E5\u671F | \u6807\u9898 | \u8BF4\u660E |",
      "|---|---|---|---|"
    ];
    for (const s of signals) {
      const level = s.severity === "alert" ? "\u9700\u5173\u6CE8" : s.severity === "watch" ? "\u89C2\u5BDF" : "\u63D0\u793A";
      const detail = s.detail.replace(/\|/g, "/").replace(/\n/g, " ");
      lines.push(`| ${level} | ${s.date || "\u2014"} | ${s.title} | ${detail} |`);
    }
    lines.push("");
    lines.push("> \u4EE5\u4E0A\u4E3A\u7A0B\u5E8F\u89C4\u5219\u751F\u6210\u7684\u7EBF\u7D22\uFF0C\u987B\u4E0E\u539F\u59CB\u6570\u636E\u4EA4\u53C9\u6838\u5BF9\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u7597\u5224\u65AD\u3002");
    lines.push("");
    return lines.join("\n");
  }

  // src/insights.ts
  function toneFromSeverity(sev) {
    if (sev === "alert") return "alert";
    if (sev === "watch") return "watch";
    return "neutral";
  }
  function buildInsightBullets(analysis) {
    const bullets = [];
    const data = analysis.data;
    const range = analysis.dateRange;
    if (range?.start && range?.end) {
      bullets.push({
        tone: "neutral",
        title: "\u6570\u636E\u8986\u76D6",
        detail: `\u672C\u6B21\u53EF\u7528\u8BB0\u5F55\u7EA6 ${range.start} \u81F3 ${range.end}\u3002\u5B8C\u6574\u660E\u7EC6\u9ED8\u8BA4\u53EA\u5728\u672C\u9875\u5185\u5B58\uFF0C\u5237\u65B0\u9700\u91CD\u65B0\u4E0A\u4F20\u3002`,
        anchor: "overview"
      });
    }
    const ws = analysis.weightStats;
    if (ws?.latestTrend && ws.earliestTrend) {
      const delta = ws.latestTrend.weight - ws.earliestTrend.weight;
      const fat = ws.bodyFatLatest != null ? `\uFF1B\u4F53\u8102\u7EA6 ${ws.bodyFatLatest.toFixed(1)}%` : "";
      const tone = delta <= -8 ? "watch" : delta <= -2 ? "neutral" : delta >= 2 ? "watch" : "positive";
      bullets.push({
        tone,
        title: "\u4F53\u91CD\u8D8B\u52BF\uFF08\u6668\u8D77\uFF09",
        detail: `\u6700\u65B0\u8D8B\u52BF ${ws.latestTrend.weight.toFixed(1)} kg\uFF08${ws.latestTrend.date}\uFF09\uFF0C\u76F8\u5BF9\u6700\u65E9 ${ws.earliestTrend.weight.toFixed(1)} kg \u53D8\u5316 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} kg${fat}\u3002\u8D8B\u52BF\u6309\u6BCF\u65E5\u6668\u8D77\u91CD\uFF0C\u907F\u514D\u665A\u95F4\u6CE2\u52A8\u5E72\u6270\u3002`,
        anchor: "summary-weight"
      });
    }
    if (analysis.cgmStats) {
      const st = analysis.cgmStats.stable || analysis.cgmStats.overall;
      const fd = analysis.cgmStats.firstDay;
      let tone = "positive";
      if (st.pctBelow30 > 0) tone = "alert";
      else if (st.pctBelow39 >= 5) tone = "watch";
      else if (st.pctInRange >= 90 && st.pctAbove78 < 5) tone = "positive";
      else tone = "neutral";
      let detail = `\u7A33\u5B9A\u671F/\u53EF\u7528\u6BB5\u5747\u503C ${st.mean.toFixed(2)} mmol/L\uFF0CTIR ${st.pctInRange.toFixed(1)}%\uFF0C<3.9 \u5360 ${st.pctBelow39.toFixed(1)}%\uFF08n=${st.count}\uFF09\u3002`;
      if (fd && analysis.cgmStats.firstDayDate && fd.pctBelow39 >= 10) {
        detail += ` \u9996\u65E5 ${analysis.cgmStats.firstDayDate} \u4F4E\u503C\u504F\u591A\uFF08<3.9 ${fd.pctBelow39.toFixed(1)}%\uFF09\uFF0C\u89E3\u8BFB\u8BF7\u4EE5\u7A33\u5B9A\u671F\u4E3A\u51C6\u5E76\u6307\u5C16\u8840\u590D\u6838\u53EF\u7591\u65F6\u6BB5\u3002`;
        if (tone === "positive") tone = "neutral";
      }
      bullets.push({ tone, title: "\u8840\u7CD6\uFF08CGM\uFF09", detail, anchor: "summary-cgm" });
    }
    if (analysis.bpStats?.mean7d) {
      const m = analysis.bpStats.mean7d;
      const morn = analysis.bpStats.morning7d;
      const eve = analysis.bpStats.evening7d;
      let tone = "neutral";
      if (m.lowCount >= 3 || m.systolic < 95) tone = "watch";
      else if (m.systolic >= 130 || m.diastolic >= 85) tone = "watch";
      else if (m.systolic >= 100 && m.systolic < 120 && m.lowCount === 0) tone = "positive";
      let detail = `\u8FD1 7 \u65E5\u5168\u5929\u5747\u503C\u7EA6 ${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)} mmHg\uFF08${m.count} \u6761`;
      if (m.lowCount) detail += `\uFF0C\u5176\u4E2D ${m.lowCount} \u6761 <90/60`;
      detail += "\uFF09\u3002";
      if (morn && eve) {
        detail += ` \u6668\u95F4\u7EA6 ${morn.systolic.toFixed(0)}/${morn.diastolic.toFixed(0)}\uFF0C\u665A\u95F4\u7EA6 ${eve.systolic.toFixed(0)}/${eve.diastolic.toFixed(0)}\u3002`;
      }
      bullets.push({ tone, title: "\u8840\u538B", detail, anchor: "summary-bp" });
    }
    const hrvDates = Object.keys(analysis.hrvByDate || {}).sort();
    if (hrvDates.length) {
      const recent = hrvDates.slice(-7);
      const hrvVals = recent.map((d) => analysis.hrvByDate[d].allMean).filter(Number.isFinite);
      const rhrMap = analysis.restingHrByDate || data.restingHr || {};
      const rhrRecent = Object.keys(rhrMap).sort().slice(-7).map((d) => rhrMap[d]).filter(Number.isFinite);
      if (hrvVals.length) {
        const hrvAvg = hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length;
        const rhrAvg = rhrRecent.length ? rhrRecent.reduce((a, b) => a + b, 0) / rhrRecent.length : null;
        let tone = "neutral";
        if (hrvAvg < 25 && rhrAvg != null && rhrAvg >= 85) tone = "watch";
        else if (hrvAvg >= 35 && (rhrAvg == null || rhrAvg < 75)) tone = "positive";
        bullets.push({
          tone,
          title: "\u6062\u590D\uFF08HRV / \u9759\u606F\u5FC3\u7387\uFF09",
          detail: `\u8FD1 7 \u65E5 HRV \u5168\u5929\u5747\u503C\u7EA6 ${hrvAvg.toFixed(1)} ms` + (rhrAvg != null ? `\uFF0C\u9759\u606F\u5FC3\u7387\u7EA6 ${rhrAvg.toFixed(0)} bpm` : "") + "\u3002\u6570\u503C\u53D7\u7761\u7720\u3001\u8BAD\u7EC3\u4E0E\u75BE\u75C5\u5F71\u54CD\uFF0C\u5355\u65E5\u6CE2\u52A8\u4E0D\u5FC5\u8FC7\u5EA6\u89E3\u8BFB\u3002",
          anchor: "summary-hrv"
        });
      }
    }
    const wsWatch = analysis.watchStats;
    if (wsWatch && wsWatch.dayCount > 0) {
      if (wsWatch.exerciseMinMean7d != null || wsWatch.activeKcalMean7d != null) {
        const ex = wsWatch.exerciseMinMean7d;
        const kcal = wsWatch.activeKcalMean7d;
        let tone = "neutral";
        if (ex != null && ex >= 20) tone = "positive";
        else if (ex != null && ex < 5) tone = "watch";
        bullets.push({
          tone,
          title: "Watch \u6D3B\u52A8",
          detail: `\u8FD1 7 \u65E5\u65E5\u5747\u953B\u70BC\u7EA6 ${ex != null ? ex.toFixed(0) : "\u2014"} \u5206\u949F` + (kcal != null ? `\uFF0C\u6D3B\u52A8\u6D88\u8017\u7EA6 ${kcal.toFixed(0)} kcal` : "") + "\u3002\u4F4E\u6D3B\u52A8\u65E5\u53EF\u4E0E\u7761\u7720/HRV \u5BF9\u7167\uFF0C\u907F\u514D\u8FC7\u5EA6\u89E3\u8BFB\u5355\u65E5\u3002",
          anchor: "summary-watch"
        });
      }
      if (wsWatch.spo2Mean7d != null) {
        let tone = "positive";
        if (wsWatch.spo2NightMin7d != null && wsWatch.spo2NightMin7d < 92 || wsWatch.spo2Min7d != null && wsWatch.spo2Min7d < 92) {
          tone = "watch";
        } else if (wsWatch.spo2Mean7d < 95) tone = "watch";
        const nightBit = wsWatch.spo2NightMean7d != null ? `\uFF1B\u591C\u6BB5\u5747 ${wsWatch.spo2NightMean7d.toFixed(1)}%` + (wsWatch.spo2NightMin7d != null ? `\uFF08\u6700\u4F4E ${wsWatch.spo2NightMin7d.toFixed(1)}%\uFF09` : "") : "";
        const dayBit = wsWatch.spo2DayMean7d != null ? `\uFF0C\u65E5\u6BB5\u5747 ${wsWatch.spo2DayMean7d.toFixed(1)}%` : "";
        bullets.push({
          tone,
          title: "\u8840\u6C27\uFF08Watch\uFF09",
          detail: `\u8FD1 7 \u65E5\u8840\u6C27\u5747\u503C\u7EA6 ${wsWatch.spo2Mean7d.toFixed(1)}%` + (wsWatch.spo2Min7d != null ? `\uFF0C\u671F\u95F4\u6700\u4F4E\u7EA6 ${wsWatch.spo2Min7d.toFixed(1)}%` : "") + nightBit + dayBit + `\uFF08${wsWatch.spo2DayCount} \u5929\u6709\u6837\u672C\uFF09\u3002\u4F4E\u503C\u9700\u7ED3\u5408\u75C7\u72B6\uFF0C\u52FF\u5355\u6B21\u5B9A\u8BBA\u3002`,
          anchor: "summary-watch"
        });
      }
      if (wsWatch.vo2Latest != null) {
        const delta = wsWatch.vo2Delta;
        bullets.push({
          tone: delta != null && delta <= -2 ? "watch" : "neutral",
          title: "\u5FC3\u80BA\u9002\u80FD VO\u2082 max",
          detail: `\u6700\u65B0\u7EA6 ${wsWatch.vo2Latest.toFixed(1)} mL/kg/min` + (wsWatch.vo2Earliest != null ? `\uFF08\u76F8\u5BF9\u6700\u65E9 ${wsWatch.vo2Earliest.toFixed(1)}\uFF0C\u53D8\u5316 ${delta != null && delta >= 0 ? "+" : ""}${delta?.toFixed(1)}\uFF09` : "") + `\uFF0C\u5171 ${wsWatch.vo2DayCount} \u5929\u6709\u4F30\u7B97\u3002Apple \u4F30\u7B97\u503C\u4EC5\u4F9B\u8D8B\u52BF\u53C2\u8003\u3002`,
          anchor: "summary-watch"
        });
      }
      if (wsWatch.nightHrMean7d != null) {
        bullets.push({
          tone: wsWatch.nightHrMean7d >= 80 ? "watch" : "neutral",
          title: "\u591C\u95F4\u5FC3\u7387",
          detail: `\u8FD1 7 \u65E5 0\u20136 \u70B9\u5FC3\u7387\u5747\u503C\u7EA6 ${wsWatch.nightHrMean7d.toFixed(0)} bpm\uFF08\u7531 Watch \u8FDE\u7EED\u5FC3\u7387\u62BD\u6837\u6C47\u603B\uFF09\u3002\u53EF\u4E0E\u9759\u606F\u5FC3\u7387\u3001\u7761\u7720\u5BF9\u7167\u3002`,
          anchor: "summary-watch"
        });
      }
      if (wsWatch.rrMean7d != null) {
        bullets.push({
          tone: wsWatch.rrMean7d >= 20 || wsWatch.rrMean7d < 10 ? "watch" : "neutral",
          title: "\u547C\u5438\u9891\u7387",
          detail: `\u8FD1 7 \u65E5\u547C\u5438\u9891\u7387\u65E5\u5747\u7EA6 ${wsWatch.rrMean7d.toFixed(1)} \u6B21/\u5206\uFF08Watch \u7761\u7720/\u9759\u606F\u91C7\u6837\uFF09\u3002\u663E\u8457\u504F\u79BB\u4E60\u60EF\u57FA\u7EBF\u65F6\u7ED3\u5408\u75C7\u72B6\u89C2\u5BDF\u3002`,
          anchor: "summary-watch"
        });
      }
      if (wsWatch.wristTempMean7d != null) {
        bullets.push({
          tone: "neutral",
          title: "\u7761\u7720\u8155\u6E29",
          detail: `\u8FD1 7 \u65E5\u7761\u7720\u8155\u6E29\u65E5\u5747\u7EA6 ${wsWatch.wristTempMean7d.toFixed(2)} \xB0C\u3002Apple \u8155\u6E29\u591A\u4E3A\u76F8\u5BF9\u504F\u5DEE\u7528\u9014\uFF0C\u9002\u5408\u770B\u81EA\u8EAB\u8D8B\u52BF\u800C\u975E\u7EDD\u5BF9\u4F53\u6E29\u3002`,
          anchor: "summary-watch"
        });
      }
    }
    const wos = analysis.workoutStats;
    if (wos && wos.count > 0) {
      const top = wos.byType.slice(0, 3).map((t) => `${t.activityType}\xD7${t.count}`).join("\u3001");
      const last = wos.lastSession;
      let tone = "neutral";
      if (wos.count30d >= 8) tone = "positive";
      else if (wos.count30d === 0) tone = "watch";
      bullets.push({
        tone,
        title: "Workout \u8BAD\u7EC3",
        detail: `\u5171 ${wos.count} \u573A` + (wos.count30d ? `\uFF0C\u8FD1 30 \u65E5 ${wos.count30d} \u573A / \u5171 ${wos.durationSum30d.toFixed(0)} min` : "") + (wos.count7d ? `\uFF0C\u8FD1 7 \u65E5 ${wos.count7d} \u573A` : "") + (top ? `\uFF1B\u7C7B\u578B ${top}` : "") + (last ? `\u3002\u6700\u8FD1\uFF1A${last.date} ${last.activityType} ${last.durationMin.toFixed(0)} min` + (last.hrAvg != null ? `\uFF0C\u5747 HR ${last.hrAvg.toFixed(0)}` : "") : "") + "\u3002",
        anchor: "summary-workout"
      });
    }
    const signals = detectCrossSignals(analysis);
    for (const s of signals.slice(0, 4)) {
      if (s.severity === "info" && bullets.length >= 6) continue;
      bullets.push({
        tone: toneFromSeverity(s.severity),
        title: s.title,
        detail: s.detail,
        anchor: "signals"
      });
    }
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const b of bullets) {
      if (seen.has(b.title)) continue;
      seen.add(b.title);
      unique.push(b);
    }
    const rank = {
      alert: 0,
      watch: 1,
      positive: 3,
      neutral: 2
    };
    const head = unique.filter((b) => b.title === "\u6570\u636E\u8986\u76D6");
    const rest = unique.filter((b) => b.title !== "\u6570\u636E\u8986\u76D6").sort((a, b) => rank[a.tone] - rank[b.tone]);
    return [...head, ...rest].slice(0, 7);
  }
  function formatInsightsForLLM(bullets) {
    if (!bullets.length) return "";
    const lines = [
      "## \u81EA\u52A8\u76D1\u6D4B\u6458\u8981\uFF08\u7A0B\u5E8F\u751F\u6210\uFF0C\u975E\u8BCA\u65AD\uFF09",
      ""
    ];
    bullets.forEach((b, i) => {
      const tag = b.tone === "alert" ? "\u9700\u5173\u6CE8" : b.tone === "watch" ? "\u89C2\u5BDF" : b.tone === "positive" ? "\u79EF\u6781" : "\u63D0\u793A";
      lines.push(`${i + 1}. **[${tag}] ${b.title}**\uFF1A${b.detail}`);
    });
    lines.push("");
    lines.push("> \u4EE5\u4E0B\u4E3A\u5206\u7EF4\u5EA6\u539F\u59CB\u7EDF\u8BA1\u4E0E\u660E\u7EC6\uFF0C\u8BF7\u4E0E\u6458\u8981\u4EA4\u53C9\u6838\u5BF9\u3002");
    lines.push("");
    return lines.join("\n");
  }
  function generateInsightsOnlyPrompt(analysis, options = {}) {
    const bullets = buildInsightBullets(analysis);
    const body = formatInsightsForLLM(bullets).replace("> \u4EE5\u4E0B\u4E3A\u5206\u7EF4\u5EA6\u539F\u59CB\u7EDF\u8BA1\u4E0E\u660E\u7EC6\uFF0C\u8BF7\u4E0E\u6458\u8981\u4EA4\u53C9\u6838\u5BF9\u3002\n\n", "").trim();
    const lines = [
      "\u8BF7\u57FA\u4E8E\u4EE5\u4E0B\u300C\u4E2A\u4EBA\u5065\u5EB7\u81EA\u6211\u76D1\u6D4B\u6458\u8981\u300D\u7ED9\u51FA\u7B80\u6D01\u4E2D\u6587\u5EFA\u8BAE\uFF08Markdown\uFF09\uFF1A",
      "- \u4E0D\u4E0B\u8BCA\u65AD\u3001\u4E0D\u5F00\u836F\u3001\u4E0D\u66FF\u4EE3\u95E8\u8BCA",
      "- \u6307\u51FA\u6700\u503C\u5F97\u4F18\u5148\u5173\u6CE8\u7684 3 \u70B9\uFF0C\u5E76\u7ED9\u51FA\u53EF\u64CD\u4F5C\u7684\u81EA\u6211\u76D1\u6D4B\u5EFA\u8BAE",
      "- \u5F02\u5E38\u9700\u63D0\u793A\u590D\u6838\uFF08\u5982 CGM \u6307\u5C16\u8840\u3001\u8840\u538B\u590D\u6D4B\uFF09",
      ""
    ];
    if (options.prefix && options.prefix.trim()) {
      lines.push(options.prefix.trim());
      lines.push("");
    }
    lines.push(body || "\uFF08\u6682\u65E0\u6458\u8981\uFF09");
    lines.push("");
    lines.push("\uFF08\u672C\u6BB5\u4EC5\u4E3A\u7A0B\u5E8F\u6458\u8981\uFF0C\u975E\u5B8C\u6574\u539F\u59CB\u6570\u636E\u3002\u9700\u8981\u5B8C\u6574\u7EDF\u8BA1\u8BF7\u4F7F\u7528\u5B8C\u6574\u63D0\u793A\u8BCD\u3002\uFF09");
    return lines.join("\n");
  }

  // src/prompts/llm-prompt.ts
  var MAIN_PROMPT_TEMPLATE = `# \u89D2\u8272\u4E0E\u4EFB\u52A1
\u4F60\u662F\u4E00\u4F4D\u4E25\u8C28\u7684\u4E34\u5E8A\u6570\u636E\u5206\u6790\u5E08\u3002\u8BF7\u57FA\u4E8E\u4E0B\u65B9\u300C\u4E2A\u4EBA\u80CC\u666F\uFF08\u5982\u6709\uFF09\u300D\u300C\u81EA\u52A8\u76D1\u6D4B\u6458\u8981\u300D\u4E0E\u300C\u539F\u59CB\u6570\u636E\u4E0E\u7EDF\u8BA1\u300D\u751F\u6210\u4E00\u4EFD\u300A\u4E2A\u4EBA\u5065\u5EB7\u81EA\u6211\u76D1\u6D4B\u6DF1\u5EA6\u5206\u6790\u62A5\u544A\u300B\uFF0C\u4E25\u683C\u6309\u7167\u4EE5\u4E0B\u7ED3\u6784\u4E0E\u98CE\u683C\uFF1A
- \u4E0D\u4E0B\u8BCA\u65AD\u7ED3\u8BBA\u3001\u4E0D\u5F00\u836F\u3001\u4E0D\u66FF\u4EE3\u95E8\u8BCA
- \u53EF\u53C2\u8003\u300C\u81EA\u52A8\u76D1\u6D4B\u6458\u8981\u300D\u7EC4\u7EC7\u300C\u603B\u7ED3\u5224\u65AD\u300D\uFF0C\u4F46\u987B\u4E0E\u539F\u59CB\u7EDF\u8BA1\u4EA4\u53C9\u6838\u5BF9\uFF0C\u52FF\u7167\u6284\u53E3\u53F7
- \u82E5\u63D0\u4F9B\u4E86\u7528\u836F/\u76EE\u6807\u4F53\u91CD/\u5173\u6CE8\u70B9\uFF0C\u8BF7\u5728\u89E3\u8BFB\u4E2D\u5BF9\u7167\u4F7F\u7528\uFF0C\u4F46\u4ECD\u4E0D\u5F97\u6539\u836F\u6216\u4E0B\u8BCA\u65AD
- \u5173\u6CE8\u8D8B\u52BF\u3001\u76F8\u5173\u6027\u4E0E\u53EF\u64CD\u4F5C\u5EFA\u8BAE\uFF1B\u4F53\u91CD\u7528\u6668\u8D77\u8D8B\u52BF\uFF0CCGM \u4F18\u5148\u7A33\u5B9A\u671F\uFF0C\u8840\u538B\u533A\u5206\u6668\u665A
- Watch \u8840\u6C27 / VO\u2082 max \u4E3A\u4F30\u7B97\u503C\uFF0C\u4F4E\u8840\u6C27\u987B\u7ED3\u5408\u75C7\u72B6\uFF1BVO\u2082 \u770B\u957F\u671F\u8D8B\u52BF\u52FF\u5355\u6B21\u5B9A\u8BBA
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
## Apple Watch\uFF08\u6D3B\u52A8 / \u8840\u6C27 / \u547C\u5438 / VO\u2082 / \u8155\u6E29\uFF09
## Workout \u8BAD\u7EC3\u4F1A\u8BDD
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
- \u7761\u7720/\u6B65\u6570/HRV/\u8840\u6C27/VO\u2082 \u6570\u636E\u6765\u81EA Apple Watch\uFF0C\u5B58\u5728\u6D4B\u91CF\u8BEF\u5DEE\u4E0E\u7B97\u6CD5\u4F30\u7B97
- \u8840\u6C27\u5355\u6B21\u504F\u4F4E\u5E38\u89C1\u4E8E\u8FD0\u52A8/\u7761\u7720\u59FF\u52BF/\u4F69\u6234\u677E\u52A8\uFF0C\u65E0\u75C7\u72B6\u65F6\u4F18\u5148\u590D\u6D4B\u4E0E\u5BF9\u7167\u8D8B\u52BF
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
    const { data, cgmStats, bpStats, weightStats, watchStats, workoutStats, hrvByDate, dateRange } = analysis;
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
    const fmtSeg = (title, o) => {
      sections.push(`**${title}**\uFF08\u5171 ${o.count} \u6761\uFF0C${o.timeRange}\uFF09`);
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
    };
    sections.push(`> \u660E\u7EC6\u8868\u9ED8\u8BA4\u5C55\u793A\u6700\u8FD1 ${detailDays} \u5929\uFF1B\u66F4\u65E9\u6570\u636E\u5DF2\u7EB3\u5165\u603B\u4F53\u7EDF\u8BA1\uFF0C\u4F46\u4E3A\u63A7\u5236\u63D0\u793A\u8BCD\u957F\u5EA6\u672A\u9010\u6761\u5C55\u5F00\u3002`);
    sections.push(`> \u4F53\u91CD\u8D8B\u52BF\u9ED8\u8BA4\u53D6**\u6BCF\u65E5\u6668\u8D77**\uFF0812:00 \u524D\u6700\u65E9\u4E00\u6761\uFF0C\u82E5\u65E0\u5219\u53D6\u5168\u65E5\u6700\u65E9\uFF09\uFF1BCGM \u8BF7\u4F18\u5148\u770B**\u7A33\u5B9A\u671F**\uFF08\u6392\u9664\u4F20\u611F\u5668\u9996\u4E2A\u65E5\u5386\u65E5\uFF09\u3002`);
    sections.push(``);
    const av = data.dataAvailability;
    sections.push(`## \u6570\u636E\u53EF\u7528\u6027`);
    sections.push(``);
    sections.push(`| \u7EF4\u5EA6 | \u662F\u5426\u5B58\u5728 | \u6570\u636E\u91CF |`);
    sections.push(`|---|---|---|`);
    sections.push(`| CGM \u52A8\u6001\u8840\u7CD6 | ${av.hasCgm ? "\u2705" : "\u274C"} | ${data.cgm.length} \u6761 |`);
    sections.push(`| \u8840\u538B | ${av.hasBloodPressure ? "\u2705" : "\u274C"} | ${data.bloodPressure.length} \u6761 |`);
    sections.push(`| \u4F53\u91CD | ${av.hasWeight ? "\u2705" : "\u274C"} | ${data.weight.length} \u6761\u539F\u59CB / ${weightStats?.dayCount ?? 0} \u8D8B\u52BF\u65E5 |`);
    sections.push(`| \u4F53\u8102 | ${av.hasBodyFat ? "\u2705" : "\u274C"} | ${data.bodyFat?.length ?? 0} \u6761 / ${weightStats?.bodyFatDayCount ?? 0} \u8D8B\u52BF\u65E5 |`);
    sections.push(`| HRV | ${av.hasHrv ? "\u2705" : "\u274C"} | ${Object.keys(hrvByDate).length} \u5929 |`);
    sections.push(`| \u9759\u606F/\u6B65\u884C\u5FC3\u7387 | ${av.hasHeartRate ? "\u2705" : "\u274C"} | ${Object.keys(data.restingHr).length} \u5929 |`);
    sections.push(`| \u6B65\u6570 | ${av.hasSteps ? "\u2705" : "\u274C"} | ${Object.keys(data.steps).length} \u5929 |`);
    sections.push(`| \u7761\u7720 | ${av.hasSleep ? "\u2705" : "\u274C"} | ${Object.keys(data.sleep).length} \u5929 |`);
    sections.push(`| Watch \u6D3B\u52A8 | ${av.hasWatchActivity ? "\u2705" : "\u274C"} | ${watchStats?.dayCount ?? Object.keys(data.watchDaily || {}).length} \u5929 |`);
    sections.push(`| \u8840\u6C27 SpO\u2082 | ${av.hasSpO2 ? "\u2705" : "\u274C"} | ${watchStats?.spo2DayCount ?? 0} \u5929\u6709\u6837\u672C |`);
    sections.push(`| \u547C\u5438\u9891\u7387 | ${av.hasRespiratoryRate ? "\u2705" : "\u274C"} | \u2014 |`);
    sections.push(`| VO\u2082 max | ${av.hasVo2Max ? "\u2705" : "\u274C"} | ${watchStats?.vo2DayCount ?? 0} \u5929 |`);
    sections.push(`| \u7761\u7720\u8155\u6E29 | ${av.hasWristTemp ? "\u2705" : "\u274C"} | \u2014 |`);
    sections.push(`| Workout \u4F1A\u8BDD | ${av.hasWorkouts ? "\u2705" : "\u274C"} | ${workoutStats?.count ?? data.workouts?.length ?? 0} \u573A |`);
    sections.push(`| ECG | ${av.hasEcg ? "\u2705" : "\u274C"} | ${data.ecg.length} \u4EFD |`);
    sections.push(``);
    sections.push(`\u6570\u636E\u65F6\u95F4\u8303\u56F4\uFF1A${dateRange.start} \u81F3 ${dateRange.end}`);
    const dq = data.dataQuality;
    if (dq && dq.skippedFutureCount > 0) {
      sections.push(``);
      sections.push(`### \u6570\u636E\u8D28\u91CF\u63D0\u793A\uFF08\u672A\u6765\u65E5\u671F\u5DF2\u6392\u9664\uFF09`);
      sections.push(``);
      sections.push(
        `- \u53C2\u8003\u65E5\uFF08\u672C\u5730\u300C\u4ECA\u5929\u300D\uFF09\uFF1A\`${dq.referenceDate}\``
      );
      sections.push(
        `- \u5DF2\u8DF3\u8FC7 **${dq.skippedFutureCount}** \u6761\u8D77\u59CB\u65E5\u671F\u665A\u4E8E\u53C2\u8003\u65E5\u7684\u8BB0\u5F55\uFF08\u5E38\u89C1\u4E8E\u8BEF\u5F55\u7684\u672A\u6765\u4F53\u91CD\u7B49\uFF09`
      );
      if (dq.futureSampleDates && dq.futureSampleDates.length) {
        sections.push(
          `- \u89C1\u5230\u7684\u672A\u6765\u65E5\u671F\u6837\u672C\uFF1A${dq.futureSampleDates.map((d) => `\`${d}\``).join("\u3001")}`
        );
      }
      sections.push(
        `- \u8BF7\u5728 iPhone\u300C\u5065\u5EB7\u300DApp \u4E2D\u6838\u5BF9\u5E76\u5220\u9664\u9519\u8BEF\u672A\u6765\u6761\u76EE\uFF1B\u672C\u62A5\u544A\u7EDF\u8BA1**\u4E0D\u5305\u542B**\u8FD9\u4E9B\u672A\u6765\u8BB0\u5F55`
      );
    }
    sections.push(``);
    if (cgmStats) {
      sections.push(`## CGM \u52A8\u6001\u8840\u7CD6`);
      sections.push(``);
      if (cgmStats.firstDayDate) {
        sections.push(
          `> \u4F20\u611F\u5668\u9996\u4E2A\u65E5\u5386\u65E5\u4E3A \`${cgmStats.firstDayDate}\`\uFF0C\u8BE5\u65E5\u4F4E\u503C\u6613\u4E3A\u4F69\u6234/\u6821\u51C6\u4F2A\u5F71\uFF1B**\u89E3\u8BFB\u8BF7\u4F18\u5148\u91C7\u7528\u7A33\u5B9A\u671F**\u3002`
        );
        sections.push(``);
      }
      fmtSeg("\u5168\u7A0B\u7EDF\u8BA1", cgmStats.overall);
      if (cgmStats.firstDay) {
        fmtSeg(`\u9996\u65E5\uFF08${cgmStats.firstDayDate}\uFF09`, cgmStats.firstDay);
      }
      if (cgmStats.stable) {
        fmtSeg("\u7A33\u5B9A\u671F\uFF08\u6392\u9664\u9996\u65E5\uFF09", cgmStats.stable);
      }
      sections.push(`**\u5206\u65E5\u7EDF\u8BA1**\uFF1A`);
      sections.push(``);
      sections.push(`| \u65E5\u671F | \u6761\u6570 | \u5747\u503C | \u6700\u4F4E | \u6700\u9AD8 | CV% | <3.9% | >7.8% | \u5907\u6CE8 |`);
      sections.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`);
      const recentDates2 = recentDateSet(Object.keys(cgmStats.daily));
      for (const date of Object.keys(cgmStats.daily).filter((date2) => recentDates2.has(date2)).sort()) {
        const d = cgmStats.daily[date];
        const tag = date === cgmStats.firstDayDate ? "\u9996\u65E5" : "";
        sections.push(
          `| ${date} | ${d.count} | ${d.mean.toFixed(2)} | ${d.min.toFixed(1)} | ${d.max.toFixed(1)} | ${d.cv.toFixed(1)} | ${d.pctBelow39.toFixed(1)} | ${d.pctAbove78.toFixed(1)} | ${tag} |`
        );
      }
      sections.push(``);
      sections.push(`**\u6700\u5927\u8840\u7CD6\u4E0A\u5347**\uFF1A30\u5206\u949F ${cgmStats.maxRises["30min"].rise.toFixed(1)} mmol/L, 60\u5206\u949F ${cgmStats.maxRises["60min"].rise.toFixed(1)} mmol/L, 120\u5206\u949F ${cgmStats.maxRises["120min"].rise.toFixed(1)} mmol/L`);
      sections.push(``);
    }
    if (bpStats && bpStats.records.length > 0) {
      sections.push(`## \u8840\u538B`);
      sections.push(``);
      sections.push(`**\u8BB0\u5F55\u660E\u7EC6**\uFF08\u5171 ${bpStats.records.length} \u6761\uFF1B\u6668\u95F4=hour&lt;12\uFF0C\u665A\u95F4=hour\u226518\uFF09\uFF1A`);
      sections.push(``);
      sections.push(`| \u65F6\u95F4 | \u6536\u7F29\u538B | \u8212\u5F20\u538B | \u5907\u6CE8 |`);
      sections.push(`|---|---:|---:|---|`);
      const recentDates2 = recentDateSet(bpStats.records.map((r) => r.date));
      for (const r of bpStats.records.filter((r2) => recentDates2.has(r2.date))) {
        const low = r.systolic < 90 || r.diastolic < 60 ? " \u26A0\uFE0F" : "";
        sections.push(`| ${r.datetime} | ${r.systolic} | ${r.diastolic} |${low} |`);
      }
      sections.push(``);
      sections.push(`**\u65F6\u6BB5\u5747\u503C**\uFF1A`);
      sections.push(``);
      sections.push(`| \u65F6\u6BB5 | \u6536\u7F29\u538B | \u8212\u5F20\u538B | \u6761\u6570 | <90/60 |`);
      sections.push(`|---|---:|---:|---:|---:|`);
      const pushBp = (label, m) => {
        if (!m) return;
        sections.push(`| ${label} | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      };
      pushBp("\u6700\u8FD1 7 \u5929\uFF08\u5168\u5929\uFF09", bpStats.mean7d);
      pushBp("\u6700\u8FD1 7 \u5929\u6668\u95F4", bpStats.morning7d);
      pushBp("\u6700\u8FD1 7 \u5929\u665A\u95F4", bpStats.evening7d);
      pushBp("\u6700\u8FD1 14 \u5929\uFF08\u5168\u5929\uFF09", bpStats.mean14d);
      pushBp("\u6700\u8FD1 14 \u5929\u6668\u95F4", bpStats.morning14d);
      pushBp("\u6700\u8FD1 14 \u5929\u665A\u95F4", bpStats.evening14d);
      pushBp("\u6700\u8FD1 30 \u5929\uFF08\u5168\u5929\uFF09", bpStats.mean30d);
      sections.push(``);
    }
    if (weightStats && weightStats.dayCount > 0) {
      sections.push(`## \u4F53\u91CD\u4E0E\u4F53\u8102`);
      sections.push(``);
      sections.push(
        `\u539F\u59CB\u79F0\u91CD ${weightStats.rawCount} \u6761 \u2192 \u8D8B\u52BF\u65E5 ${weightStats.dayCount} \u5929\uFF08\u6BCF\u65E5\u4E00\u70B9\uFF1A\u4F18\u5148\u6668\u8D77\uFF09\u3002`
      );
      if (weightStats.latestTrend && weightStats.earliestTrend) {
        sections.push(
          `\u8D8B\u52BF\u4F53\u91CD\uFF1A\u6700\u65E9 ${weightStats.earliestTrend.weight.toFixed(1)} kg\uFF08${weightStats.earliestTrend.date}\uFF09\u2192 \u6700\u65B0 ${weightStats.latestTrend.weight.toFixed(1)} kg\uFF08${weightStats.latestTrend.date}\uFF09\uFF0C\u53D8\u5316 ${(weightStats.latestTrend.weight - weightStats.earliestTrend.weight).toFixed(1)} kg\u3002`
        );
      }
      if (weightStats.bodyFatDayCount > 0) {
        sections.push(
          `\u4F53\u8102\u8D8B\u52BF\u65E5 ${weightStats.bodyFatDayCount}\uFF1A\u6700\u65E9 ${weightStats.bodyFatEarliest?.toFixed(1)}% \u2192 \u6700\u65B0 ${weightStats.bodyFatLatest?.toFixed(1)}%` + (weightStats.bodyFatDelta != null ? `\uFF0C\u53D8\u5316 ${weightStats.bodyFatDelta.toFixed(1)} \u4E2A\u767E\u5206\u70B9\u3002` : "\u3002")
        );
      }
      sections.push(``);
      sections.push(`| \u65E5\u671F | \u8D8B\u52BF\u4F53\u91CD(kg) | \u6668\u8D77 | \u665A\u95F4 | \u4F53\u8102% | \u5F53\u65E5\u6761\u6570 |`);
      sections.push(`|---|---:|---:|---:|---:|---:|`);
      const recentDates2 = recentDateSet(weightStats.daily.map((d) => d.date));
      for (const d of weightStats.daily.filter((x) => recentDates2.has(x.date))) {
        const morn = d.morning ? d.morning.value.toFixed(1) : "\u2014";
        const eve = d.evening ? d.evening.value.toFixed(1) : "\u2014";
        const fat = d.trend.bodyFat != null ? d.trend.bodyFat.toFixed(1) : "\u2014";
        sections.push(
          `| ${d.date} | ${d.trend.value.toFixed(1)} | ${morn} | ${eve} | ${fat} | ${d.allCount} |`
        );
      }
      sections.push(``);
    } else if (data.weight.length > 0) {
      sections.push(`## \u4F53\u91CD`);
      sections.push(``);
      sections.push(`| \u65F6\u95F4 | \u4F53\u91CD (kg) | \u4F53\u8102% |`);
      sections.push(`|---|---:|---:|`);
      const recentDates2 = recentDateSet(data.weight.map((w) => w.date));
      for (const w of data.weight.filter((w2) => recentDates2.has(w2.date))) {
        sections.push(`| ${w.datetime} | ${w.value.toFixed(1)} | ${w.bodyFat != null ? w.bodyFat.toFixed(1) : "\u2014"} |`);
      }
      sections.push(``);
    }
    if (Object.keys(hrvByDate).length > 0) {
      sections.push(`## HRV \u5FC3\u7387\u53D8\u5F02\u6027`);
      sections.push(``);
      sections.push(`| \u65E5\u671F | \u5168\u5929\u5747\u503C | \u591C\u95F4\u5747\u503C | \u6700\u4F4E | \u6700\u9AD8 | \u6837\u672C\u6570 |`);
      sections.push(`|---|---:|---:|---:|---:|---:|`);
      const recentDates2 = recentDateSet(Object.keys(hrvByDate));
      for (const date of Object.keys(hrvByDate).filter((date2) => recentDates2.has(date2)).sort()) {
        const h = hrvByDate[date];
        const night = h.overnightMean == null || !Number.isFinite(h.overnightMean) ? "\u2014" : h.overnightMean.toFixed(1);
        sections.push(
          `| ${date} | ${h.allMean.toFixed(1)} | ${night} | ${h.min.toFixed(1)} | ${h.max.toFixed(1)} | ${h.count} |`
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
      const recentDates2 = recentDateSet(Array.from(allDates));
      const visibleDates = Array.from(allDates).filter((date) => recentDates2.has(date));
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
      const recentDates2 = recentDateSet(Array.from(allDates));
      sections.push(`| \u65E5\u671F | \u6B65\u6570 | \u7761\u7720(h) | \u6DF1\u7761(h) | REM(h) |`);
      sections.push(`|---|---:|---:|---:|---:|`);
      for (const date of Array.from(allDates).filter((date2) => recentDates2.has(date2)).sort()) {
        const steps = data.steps[date]?.max ?? "\u2014";
        const sleep = data.sleep[date];
        const sleepStr = sleep ? sleep.total.toFixed(2) : "\u2014";
        const deepStr = sleep ? sleep.deep.toFixed(2) : "\u2014";
        const remStr = sleep ? sleep.rem.toFixed(2) : "\u2014";
        sections.push(`| ${date} | ${steps} | ${sleepStr} | ${deepStr} | ${remStr} |`);
      }
      sections.push(``);
    }
    if (watchStats && watchStats.dayCount > 0) {
      sections.push(`## Apple Watch\uFF08\u6D3B\u52A8 / \u8840\u6C27 / \u547C\u5438 / VO\u2082 / \u8155\u6E29\uFF09`);
      sections.push(``);
      sections.push(
        `> \u65E5\u6C47\u603B\u5171 ${watchStats.dayCount} \u5929\uFF1B\u8840\u6C27/\u547C\u5438\u4E3A\u65E5\u5185\u6837\u672C\u5747\u503C\uFF0CVO\u2082 \u4E3A Apple \u4F30\u7B97\uFF0C\u591C\u95F4\u5FC3\u7387\u4E3A 0\u20136 \u70B9\u62BD\u6837\u3002`
      );
      sections.push(``);
      sections.push(`**\u8FD1 7 \u65E5\u6458\u8981**\uFF1A`);
      sections.push(``);
      sections.push(`| \u6307\u6807 | \u503C |`);
      sections.push(`|---|---|`);
      if (watchStats.exerciseMinMean7d != null) {
        sections.push(`| \u65E5\u5747\u953B\u70BC | ${watchStats.exerciseMinMean7d.toFixed(0)} min |`);
      }
      if (watchStats.activeKcalMean7d != null) {
        sections.push(`| \u65E5\u5747\u6D3B\u52A8\u6D88\u8017 | ${watchStats.activeKcalMean7d.toFixed(0)} kcal |`);
      }
      if (watchStats.spo2Mean7d != null) {
        sections.push(
          `| \u8840\u6C27\u5747\u503C / \u6700\u4F4E | ${watchStats.spo2Mean7d.toFixed(1)}%` + (watchStats.spo2Min7d != null ? ` / ${watchStats.spo2Min7d.toFixed(1)}%` : "") + `\uFF08${watchStats.spo2DayCount} \u5929\uFF09 |`
        );
      }
      if (watchStats.spo2NightMean7d != null || watchStats.spo2DayMean7d != null) {
        sections.push(
          `| \u8840\u6C27 \u591C\u6BB5(0\u20138) / \u65E5\u6BB5 | ` + (watchStats.spo2NightMean7d != null ? `${watchStats.spo2NightMean7d.toFixed(1)}%` + (watchStats.spo2NightMin7d != null ? `\uFF08\u6700\u4F4E ${watchStats.spo2NightMin7d.toFixed(1)}%\uFF09` : "") : "\u2014") + ` / ` + (watchStats.spo2DayMean7d != null ? `${watchStats.spo2DayMean7d.toFixed(1)}%` + (watchStats.spo2DayMin7d != null ? `\uFF08\u6700\u4F4E ${watchStats.spo2DayMin7d.toFixed(1)}%\uFF09` : "") : "\u2014") + ` |`
        );
      }
      if (watchStats.rrMean7d != null) {
        sections.push(`| \u547C\u5438\u9891\u7387\u65E5\u5747 | ${watchStats.rrMean7d.toFixed(1)} \u6B21/\u5206 |`);
      }
      if (watchStats.nightHrMean7d != null) {
        sections.push(`| \u591C\u95F4\u5FC3\u7387 (0\u20136h) | ${watchStats.nightHrMean7d.toFixed(0)} bpm |`);
      }
      if (watchStats.vo2Latest != null) {
        const d = watchStats.vo2Delta;
        sections.push(
          `| VO\u2082 max \u6700\u65B0` + (watchStats.vo2Earliest != null ? " / \u6700\u65E9 / \u0394" : "") + ` | ${watchStats.vo2Latest.toFixed(1)}` + (watchStats.vo2Earliest != null ? ` / ${watchStats.vo2Earliest.toFixed(1)} / ${d != null && d >= 0 ? "+" : ""}${d?.toFixed(1)}` : "") + ` mL/kg/min\uFF08${watchStats.vo2DayCount} \u5929\uFF09 |`
        );
      }
      if (watchStats.wristTempMean7d != null) {
        sections.push(`| \u7761\u7720\u8155\u6E29\u65E5\u5747 | ${watchStats.wristTempMean7d.toFixed(2)} \xB0C |`);
      }
      sections.push(``);
      sections.push(`**\u5206\u65E5\u660E\u7EC6**\uFF08\u6700\u8FD1 ${detailDays} \u5929\uFF09\uFF1A`);
      sections.push(``);
      sections.push(
        `| \u65E5\u671F | \u6D3B\u52A8kcal | \u953B\u70BCmin | SpO\u2082\u5747 | \u591C\u5747 | \u65E5\u5747 | \u547C\u5438 | \u591C\u95F4HR | VO\u2082 | \u8155\u6E29 |`
      );
      sections.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
      const recentWatch = recentDateSet(watchStats.days.map((d) => d.date));
      for (const d of watchStats.days.filter((x) => recentWatch.has(x.date))) {
        const f = (v, dig = 1) => v != null && Number.isFinite(v) ? v.toFixed(dig) : "\u2014";
        sections.push(
          `| ${d.date} | ${d.activeKcal ? d.activeKcal.toFixed(0) : "\u2014"} | ${d.exerciseMin ? d.exerciseMin.toFixed(0) : "\u2014"} | ${f(d.spo2Mean)} | ${f(d.spo2NightMean)} | ${f(d.spo2DayMean)} | ${f(
            d.rrMean
          )} | ${f(d.nightHrMean, 0)} | ${f(d.vo2Max)} | ${f(d.wristTempMean, 2)} |`
        );
      }
      sections.push(``);
    }
    if (workoutStats && workoutStats.count > 0) {
      sections.push(`## Workout \u8BAD\u7EC3\u4F1A\u8BDD`);
      sections.push(``);
      sections.push(
        `\u5171 ${workoutStats.count} \u573A\uFF1B\u8FD1 30 \u65E5 ${workoutStats.count30d} \u573A / ${workoutStats.durationSum30d.toFixed(0)} min` + (workoutStats.activeKcalSum30d ? ` / ${workoutStats.activeKcalSum30d.toFixed(0)} kcal` : "") + (workoutStats.hrAvgMean30d != null ? `\uFF0C\u8FD1 30 \u65E5\u573A\u5747\u5FC3\u7387 ${workoutStats.hrAvgMean30d.toFixed(0)} bpm` : "") + `\uFF1B\u8FD1 7 \u65E5 ${workoutStats.count7d} \u573A / ${workoutStats.durationSum7d.toFixed(0)} min\u3002`
      );
      if (workoutStats.byType.length) {
        sections.push(``);
        sections.push(`**\u7C7B\u578B\u5206\u5E03**\uFF1A`);
        sections.push(``);
        sections.push(`| \u7C7B\u578B | \u573A\u6B21 | \u603B\u5206\u949F | \u6D3B\u52A8kcal |`);
        sections.push(`|---|---:|---:|---:|`);
        for (const t of workoutStats.byType) {
          sections.push(
            `| ${t.activityType} | ${t.count} | ${t.durationMin.toFixed(0)} | ${t.activeKcal.toFixed(0)} |`
          );
        }
      }
      sections.push(``);
      sections.push(`**\u6700\u8FD1\u4F1A\u8BDD**\uFF08\u6700\u591A 40 \u573A\uFF09\uFF1A`);
      sections.push(``);
      sections.push(`| \u5F00\u59CB | \u7C7B\u578B | \u5206\u949F | kcal | \u8DDD\u79BBkm | HR\u5747 | HR\u6700\u5927 | METs |`);
      sections.push(`|---|---|---:|---:|---:|---:|---:|---:|`);
      const recentW = workoutStats.sessions.slice(-40);
      for (const s of recentW) {
        sections.push(
          `| ${s.startDate.slice(0, 16)} | ${s.activityType} | ${s.durationMin.toFixed(1)} | ${s.activeKcal != null ? s.activeKcal.toFixed(0) : "\u2014"} | ${s.distanceKm != null ? s.distanceKm.toFixed(2) : "\u2014"} | ${s.hrAvg != null ? s.hrAvg.toFixed(0) : "\u2014"} | ${s.hrMax != null ? s.hrMax.toFixed(0) : "\u2014"} | ${s.avgMets != null ? s.avgMets.toFixed(1) : "\u2014"} |`
        );
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
    const insightsSection = formatInsightsForLLM(buildInsightBullets(analysis));
    const dataSection = formatAnalysisForLLM(analysis);
    const ctxSection = formatUserContext(userContext);
    const signalsSection = formatCrossSignalsForLLM(detectCrossSignals(analysis));
    const parts = [ctxSection, insightsSection, dataSection, signalsSection].filter(
      (s) => s && s.trim()
    );
    return parts.join("\n");
  }
  function generateLLMPrompt(analysis, userContext) {
    const dataSection = combineContextAndData(analysis, userContext);
    return MAIN_PROMPT_TEMPLATE.replace("{ANALYSIS_JSON}", dataSection).replace("{ANALYSIS_DATA}", dataSection);
  }
  function generateDataOnly(analysis, userContext) {
    return combineContextAndData(analysis, userContext);
  }
  var SHORT_SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u4E25\u8C28\u7684\u5065\u5EB7\u6570\u636E\u5206\u6790\u5E08\u3002\u57FA\u4E8E\u7528\u6237\u63D0\u4F9B\u7684 Apple Health \u7EDF\u8BA1\u751F\u6210\u4E2D\u6587 Markdown \u62A5\u544A\uFF1B\u53EA\u5206\u6790\u5B9E\u9645\u5B58\u5728\u7684\u6570\u636E\uFF0C\u6309\u201C\u603B\u7ED3\u5224\u65AD\u3001\u6570\u636E\u7EF4\u5EA6\u3001\u76D1\u6D4B\u4EEA\u8868\u76D8\u3001\u9700\u8981\u590D\u67E5\u6216\u5347\u7EA7\u5904\u7406\u7684\u4FE1\u53F7\u3001\u5F53\u524D\u5DE5\u4F5C\u5047\u8BBE\u3001\u53C2\u8003\u4F9D\u636E\u201D\u987A\u5E8F\u7EC4\u7EC7\u3002\u4E0D\u4E0B\u8BCA\u65AD\u7ED3\u8BBA\uFF1BCGM <3.9 \u5FC5\u987B\u5EFA\u8BAE\u6307\u5C16\u8840\u590D\u6838\uFF0CCGM \u4E0D\u80FD\u5355\u72EC\u7528\u4E8E\u8BCA\u65AD\uFF1B\u5355\u6B21\u5F02\u5E38\u5148\u590D\u6D4B\u5E76\u7ED3\u5408\u75C7\u72B6\u5224\u65AD\uFF1B\u6240\u6709\u7528\u836F\u8C03\u6574\u8BF7\u9075\u533B\u5631\u3002`;

  // src/snapshot.ts
  function meanOf(values) {
    const vals = values.filter(Number.isFinite);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function lastNMeans(map, n) {
    const dates = Object.keys(map).sort();
    if (dates.length === 0) return null;
    const recent = dates.slice(-n).map((d) => map[d]).filter(Number.isFinite);
    return meanOf(recent);
  }
  function makeId() {
    return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function buildAnalysisSnapshot(analysis, options = {}) {
    const data = analysis.data;
    const ws = analysis.weightStats;
    const latestW = ws?.latestTrend?.weight ?? null;
    const earliestW = ws?.earliestTrend?.weight ?? null;
    const hrvMeans = {};
    for (const [d, h] of Object.entries(analysis.hrvByDate || {})) {
      hrvMeans[d] = h.allMean;
    }
    const sleepTotals = {};
    for (const [d, s] of Object.entries(analysis.sleepByDate || data.sleep || {})) {
      sleepTotals[d] = s.total;
    }
    const cgm = analysis.cgmStats?.overall;
    const cgmStable = analysis.cgmStats?.stable;
    return {
      id: options.id || makeId(),
      savedAt: options.savedAt || (/* @__PURE__ */ new Date()).toISOString(),
      generatedAt: analysis.generatedAt,
      dateRange: { ...analysis.dateRange },
      label: options.label,
      metrics: {
        cgmMean: cgm ? cgm.mean : null,
        cgmTir: cgm ? cgm.pctInRange : null,
        cgmStableMean: cgmStable ? cgmStable.mean : null,
        cgmStableTir: cgmStable ? cgmStable.pctInRange : null,
        cgmMin: cgm ? cgm.min : null,
        cgmMax: cgm ? cgm.max : null,
        cgmCount: cgm ? cgm.count : data.cgm.length,
        cgmPctBelow39: cgmStable ? cgmStable.pctBelow39 : cgm ? cgm.pctBelow39 : null,
        weightLatest: latestW,
        weightEarliest: earliestW,
        weightDelta: latestW != null && earliestW != null ? latestW - earliestW : null,
        weightCount: ws?.dayCount ?? data.weight.length,
        bodyFatLatest: ws?.bodyFatLatest ?? null,
        bodyFatDelta: ws?.bodyFatDelta ?? null,
        bpMean7dSys: analysis.bpStats?.mean7d?.systolic ?? null,
        bpMean7dDia: analysis.bpStats?.mean7d?.diastolic ?? null,
        bpMorning7dSys: analysis.bpStats?.morning7d?.systolic ?? null,
        bpEvening7dSys: analysis.bpStats?.evening7d?.systolic ?? null,
        bpCount: analysis.bpStats?.records?.length ?? data.bloodPressure.length,
        bpLowCount7d: analysis.bpStats?.mean7d?.lowCount ?? null,
        hrvMean7d: lastNMeans(hrvMeans, 7),
        hrvDays: Object.keys(analysis.hrvByDate || {}).length,
        restingHrMean7d: lastNMeans(analysis.restingHrByDate || data.restingHr || {}, 7),
        walkingHrMean7d: lastNMeans(analysis.walkingHrByDate || data.walkingHr || {}, 7),
        stepsMean7d: lastNMeans(analysis.stepsByDate || {}, 7),
        stepsDays: Object.keys(analysis.stepsByDate || data.steps || {}).length,
        sleepMean7d: lastNMeans(sleepTotals, 7),
        sleepDays: Object.keys(sleepTotals).length,
        ecgCount: data.ecg?.length || 0,
        exerciseMinMean7d: analysis.watchStats?.exerciseMinMean7d ?? null,
        activeKcalMean7d: analysis.watchStats?.activeKcalMean7d ?? null,
        spo2Mean7d: analysis.watchStats?.spo2Mean7d ?? null,
        spo2Min7d: analysis.watchStats?.spo2Min7d ?? null,
        nightHrMean7d: analysis.watchStats?.nightHrMean7d ?? null,
        vo2Latest: analysis.watchStats?.vo2Latest ?? null,
        vo2Delta: analysis.watchStats?.vo2Delta ?? null,
        watchDayCount: analysis.watchStats?.dayCount ?? 0,
        spo2NightMean7d: analysis.watchStats?.spo2NightMean7d ?? null,
        workoutCount30d: analysis.workoutStats?.count30d ?? 0,
        workoutDuration30d: analysis.workoutStats?.durationSum30d ?? null
      }
    };
  }
  var DIFF_FIELDS = [
    { key: "cgmMean", label: "CGM \u5168\u7A0B\u5747\u503C", unit: "mmol/L" },
    { key: "cgmStableMean", label: "CGM \u7A33\u5B9A\u671F\u5747\u503C", unit: "mmol/L" },
    { key: "cgmStableTir", label: "CGM \u7A33\u5B9A\u671F TIR", unit: "%" },
    { key: "cgmPctBelow39", label: "CGM <3.9 \u5360\u6BD4(\u7A33)", unit: "%" },
    { key: "weightLatest", label: "\u6700\u65B0\u8D8B\u52BF\u4F53\u91CD(\u6668\u4F18)", unit: "kg" },
    { key: "bodyFatLatest", label: "\u6700\u65B0\u4F53\u8102", unit: "%" },
    { key: "bpMean7dSys", label: "\u8840\u538B 7 \u5929\u6536\u7F29\u538B", unit: "mmHg" },
    { key: "bpMorning7dSys", label: "\u8840\u538B 7 \u5929\u6668\u95F4\u6536\u7F29\u538B", unit: "mmHg" },
    { key: "bpEvening7dSys", label: "\u8840\u538B 7 \u5929\u665A\u95F4\u6536\u7F29\u538B", unit: "mmHg" },
    { key: "hrvMean7d", label: "HRV \u8FD1 7 \u5929\u5747\u503C", unit: "ms" },
    { key: "restingHrMean7d", label: "\u9759\u606F\u5FC3\u7387\u8FD1 7 \u5929\u5747\u503C", unit: "bpm" },
    { key: "walkingHrMean7d", label: "\u6B65\u884C\u5FC3\u7387\u8FD1 7 \u5929\u5747\u503C", unit: "bpm" },
    { key: "stepsMean7d", label: "\u6B65\u6570\u8FD1 7 \u5929\u65E5\u5747", unit: "\u6B65" },
    { key: "sleepMean7d", label: "\u7761\u7720\u8FD1 7 \u5929\u65E5\u5747", unit: "h" },
    { key: "exerciseMinMean7d", label: "\u953B\u70BC\u8FD1 7 \u5929\u65E5\u5747", unit: "min" },
    { key: "activeKcalMean7d", label: "\u6D3B\u52A8\u6D88\u8017\u8FD1 7 \u5929\u65E5\u5747", unit: "kcal" },
    { key: "spo2Mean7d", label: "\u8840\u6C27\u8FD1 7 \u5929\u5747\u503C", unit: "%" },
    { key: "nightHrMean7d", label: "\u591C\u95F4\u5FC3\u7387\u8FD1 7 \u5929", unit: "bpm" },
    { key: "vo2Latest", label: "VO\u2082 max \u6700\u65B0", unit: "mL/kg/min" },
    { key: "spo2NightMean7d", label: "\u591C\u6BB5\u8840\u6C27\u8FD1 7 \u5929\u5747\u503C", unit: "%" },
    { key: "workoutCount30d", label: "Workout \u8FD1 30 \u65E5\u573A\u6B21", unit: "\u573A" },
    { key: "workoutDuration30d", label: "Workout \u8FD1 30 \u65E5\u603B\u5206\u949F", unit: "min" }
  ];
  function compareSnapshots(previous, current) {
    const rows = [];
    for (const f of DIFF_FIELDS) {
      const prev = previous.metrics[f.key];
      const curr = current.metrics[f.key];
      const p = prev == null || !Number.isFinite(Number(prev)) ? null : Number(prev);
      const c = curr == null || !Number.isFinite(Number(curr)) ? null : Number(curr);
      if (p == null && c == null) continue;
      rows.push({
        key: f.key,
        label: f.label,
        previous: p,
        current: c,
        delta: p != null && c != null ? c - p : null,
        unit: f.unit
      });
    }
    return rows;
  }

  // src/export.ts
  function csvEscape(value) {
    if (value == null) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function toCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      lines.push(row.map(csvEscape).join(","));
    }
    return lines.join("\n") + "\n";
  }
  function buildExportBundle(analysis) {
    const snapshot = buildAnalysisSnapshot(analysis);
    const signals = detectCrossSignals(analysis);
    const data = analysis.data;
    const csvFiles = [];
    csvFiles.push({
      filename: "summary_metrics.csv",
      content: toCsv(
        ["metric", "value"],
        [
          ["generatedAt", analysis.generatedAt],
          ["dateStart", analysis.dateRange.start],
          ["dateEnd", analysis.dateRange.end],
          ...Object.entries(snapshot.metrics).map(([k, v]) => [k, v == null ? "" : v])
        ]
      )
    });
    if (analysis.cgmStats) {
      const daily = analysis.cgmStats.daily;
      csvFiles.push({
        filename: "cgm_daily.csv",
        content: toCsv(
          ["date", "count", "mean", "min", "max", "cv", "pctBelow39", "pctAbove78", "pctAbove100"],
          Object.keys(daily).sort().map((d) => {
            const x = daily[d];
            return [d, x.count, x.mean, x.min, x.max, x.cv, x.pctBelow39, x.pctAbove78, x.pctAbove100];
          })
        )
      });
    }
    if (data.bloodPressure.length) {
      csvFiles.push({
        filename: "blood_pressure.csv",
        content: toCsv(
          ["datetime", "date", "systolic", "diastolic"],
          data.bloodPressure.map((r) => [r.datetime, r.date, r.systolic, r.diastolic])
        )
      });
    }
    if (data.weight.length) {
      csvFiles.push({
        filename: "weight.csv",
        content: toCsv(
          ["datetime", "date", "value_kg", "body_fat_pct"],
          data.weight.map((w) => [w.datetime, w.date, w.value, w.bodyFat ?? ""])
        )
      });
    }
    if (analysis.weightStats?.trendSeries?.length) {
      csvFiles.push({
        filename: "weight_trend_daily.csv",
        content: toCsv(
          ["date", "trend_kg", "body_fat_pct", "morning_kg", "evening_kg", "raw_count"],
          analysis.weightStats.daily.map((d) => [
            d.date,
            d.trend.value,
            d.trend.bodyFat ?? "",
            d.morning?.value ?? "",
            d.evening?.value ?? "",
            d.allCount
          ])
        )
      });
    }
    if (data.bodyFat?.length) {
      csvFiles.push({
        filename: "body_fat.csv",
        content: toCsv(
          ["datetime", "date", "body_fat_pct", "source"],
          data.bodyFat.map((f) => [f.datetime, f.date, f.value, f.source ?? ""])
        )
      });
    }
    const hrvDates = Object.keys(analysis.hrvByDate || {}).sort();
    if (hrvDates.length) {
      csvFiles.push({
        filename: "hrv_daily.csv",
        content: toCsv(
          ["date", "allMean", "overnightMean", "min", "max", "count"],
          hrvDates.map((d) => {
            const h = analysis.hrvByDate[d];
            return [d, h.allMean, h.overnightMean, h.min, h.max, h.count];
          })
        )
      });
    }
    const rest = analysis.restingHrByDate || data.restingHr || {};
    const walk = analysis.walkingHrByDate || data.walkingHr || {};
    const hrDates = Array.from(/* @__PURE__ */ new Set([...Object.keys(rest), ...Object.keys(walk)])).sort();
    if (hrDates.length) {
      csvFiles.push({
        filename: "heart_rate.csv",
        content: toCsv(
          ["date", "resting", "walking"],
          hrDates.map((d) => [d, rest[d] ?? "", walk[d] ?? ""])
        )
      });
    }
    const steps = analysis.stepsByDate || {};
    const stepDates = Object.keys(steps).sort();
    if (stepDates.length) {
      csvFiles.push({
        filename: "steps.csv",
        content: toCsv(
          ["date", "steps"],
          stepDates.map((d) => [d, steps[d]])
        )
      });
    }
    const sleep = analysis.sleepByDate || data.sleep || {};
    const sleepDates = Object.keys(sleep).sort();
    if (sleepDates.length) {
      csvFiles.push({
        filename: "sleep.csv",
        content: toCsv(
          ["date", "total_h", "deep_h", "rem_h", "core_h", "awake_h"],
          sleepDates.map((d) => {
            const s = sleep[d];
            return [d, s.total, s.deep, s.rem, s.core, s.awake];
          })
        )
      });
    }
    if (analysis.watchStats?.days?.length) {
      csvFiles.push({
        filename: "watch_daily.csv",
        content: toCsv(
          [
            "date",
            "active_kcal",
            "exercise_min",
            "stand_min",
            "daylight_min",
            "spo2_mean",
            "spo2_min",
            "spo2_night_mean",
            "spo2_night_min",
            "spo2_day_mean",
            "spo2_day_min",
            "rr_mean",
            "night_hr_mean",
            "vo2_max",
            "wrist_temp_mean",
            "breathing_disturbance"
          ],
          analysis.watchStats.days.map((d) => [
            d.date,
            d.activeKcal || "",
            d.exerciseMin || "",
            d.standMin || "",
            d.daylightMin || "",
            d.spo2Mean ?? "",
            d.spo2Min ?? "",
            d.spo2NightMean ?? "",
            d.spo2NightMin ?? "",
            d.spo2DayMean ?? "",
            d.spo2DayMin ?? "",
            d.rrMean ?? "",
            d.nightHrMean ?? "",
            d.vo2Max ?? "",
            d.wristTempMean ?? "",
            d.breathingDisturbance ?? ""
          ])
        )
      });
    }
    if (analysis.workoutStats?.sessions?.length) {
      csvFiles.push({
        filename: "workouts.csv",
        content: toCsv(
          [
            "start",
            "end",
            "date",
            "activity",
            "duration_min",
            "active_kcal",
            "distance_km",
            "hr_avg",
            "hr_min",
            "hr_max",
            "avg_mets",
            "indoor",
            "source"
          ],
          analysis.workoutStats.sessions.map((s) => [
            s.startDate,
            s.endDate ?? "",
            s.date,
            s.activityType,
            s.durationMin,
            s.activeKcal ?? "",
            s.distanceKm ?? "",
            s.hrAvg ?? "",
            s.hrMin ?? "",
            s.hrMax ?? "",
            s.avgMets ?? "",
            s.indoor == null ? "" : s.indoor ? 1 : 0,
            s.source ?? ""
          ])
        )
      });
    }
    if (signals.length) {
      csvFiles.push({
        filename: "cross_signals.csv",
        content: toCsv(
          ["severity", "date", "title", "detail", "dimensions"],
          signals.map((s) => [s.severity, s.date || "", s.title, s.detail, s.dimensions.join("|")])
        )
      });
    }
    const analysisJson = JSON.stringify(
      {
        generatedAt: analysis.generatedAt,
        dateRange: analysis.dateRange,
        dataAvailability: data.dataAvailability,
        cgmStats: analysis.cgmStats,
        bpStats: analysis.bpStats ? {
          mean7d: analysis.bpStats.mean7d,
          mean14d: analysis.bpStats.mean14d,
          mean30d: analysis.bpStats.mean30d,
          lowest: analysis.bpStats.lowest,
          highest: analysis.bpStats.highest,
          records: analysis.bpStats.records
        } : null,
        watchStats: analysis.watchStats ? {
          dayCount: analysis.watchStats.dayCount,
          spo2DayCount: analysis.watchStats.spo2DayCount,
          spo2NightDayCount: analysis.watchStats.spo2NightDayCount,
          vo2DayCount: analysis.watchStats.vo2DayCount,
          activeKcalMean7d: analysis.watchStats.activeKcalMean7d,
          exerciseMinMean7d: analysis.watchStats.exerciseMinMean7d,
          spo2Mean7d: analysis.watchStats.spo2Mean7d,
          spo2Min7d: analysis.watchStats.spo2Min7d,
          spo2NightMean7d: analysis.watchStats.spo2NightMean7d,
          spo2NightMin7d: analysis.watchStats.spo2NightMin7d,
          spo2DayMean7d: analysis.watchStats.spo2DayMean7d,
          spo2DayMin7d: analysis.watchStats.spo2DayMin7d,
          rrMean7d: analysis.watchStats.rrMean7d,
          nightHrMean7d: analysis.watchStats.nightHrMean7d,
          vo2Latest: analysis.watchStats.vo2Latest,
          vo2Earliest: analysis.watchStats.vo2Earliest,
          vo2Delta: analysis.watchStats.vo2Delta,
          wristTempMean7d: analysis.watchStats.wristTempMean7d,
          days: analysis.watchStats.days
        } : null,
        workoutStats: analysis.workoutStats ? {
          count: analysis.workoutStats.count,
          count30d: analysis.workoutStats.count30d,
          count7d: analysis.workoutStats.count7d,
          durationSum30d: analysis.workoutStats.durationSum30d,
          durationSum7d: analysis.workoutStats.durationSum7d,
          activeKcalSum30d: analysis.workoutStats.activeKcalSum30d,
          hrAvgMean30d: analysis.workoutStats.hrAvgMean30d,
          byType: analysis.workoutStats.byType,
          lastSession: analysis.workoutStats.lastSession,
          sessions: analysis.workoutStats.sessions
        } : null,
        hrvByDate: analysis.hrvByDate,
        restingHrByDate: analysis.restingHrByDate,
        walkingHrByDate: analysis.walkingHrByDate,
        stepsByDate: analysis.stepsByDate,
        sleepByDate: analysis.sleepByDate,
        weight: data.weight,
        cgm: data.cgm,
        ecg: data.ecg,
        signals,
        snapshot
      },
      null,
      2
    );
    return {
      analysisJson,
      snapshotJson: JSON.stringify(snapshot, null, 2),
      csvFiles,
      signals,
      snapshot
    };
  }
  function joinCsvBundle(csvFiles) {
    return csvFiles.map((f) => `### ${f.filename}
${f.content}`).join("\n");
  }

  // src/csv-import.ts
  function stripBom(text) {
    return text.replace(/^\uFEFF/, "");
  }
  function parseCsvLine(line) {
    return line.split(",").map((c) => c.trim());
  }
  function normalizeDt(raw) {
    const s = raw.trim().replace("T", " ");
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !/[+-]\d{4}$/.test(s) && !/Z$/.test(s)) {
      return `${s} +0800`;
    }
    return s;
  }
  function parseNum(s) {
    if (s == null || s === "") return null;
    const n = Number(String(s).replace(/%/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  function parseWeightScaleCsv(text) {
    const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (names) => {
      for (const n of names) {
        const i = header.findIndex((h) => h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iDt = idx(["\u6D4B\u91CF\u65E5\u671F\u65F6\u95F4", "\u65E5\u671F\u65F6\u95F4", "datetime", "\u65F6\u95F4", "date"]);
    const iW = idx(["\u4F53\u91CD", "weight"]);
    const iFat = idx(["\u4F53\u8102\u80AA", "\u4F53\u8102", "bodyfat", "body fat"]);
    const iBmi = idx(["bmi"]);
    const iMuscle = idx(["\u9AA8\u9ABC\u808C", "muscle"]);
    if (iDt < 0 || iW < 0) return [];
    const out = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r]);
      if (!cols[iDt] || !cols[iW]) continue;
      const datetime = normalizeDt(cols[iDt]);
      const value = parseNum(cols[iW]);
      if (value == null || value < 20 || value > 300) continue;
      const rec = {
        datetime,
        date: getDate(datetime),
        value
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
  function parseBloodPressureCsv(text) {
    const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (names) => {
      for (const n of names) {
        const i = header.findIndex((h) => h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iDt = idx(["\u6D4B\u91CF\u65E5\u671F\u65F6\u95F4", "\u65E5\u671F\u65F6\u95F4", "datetime", "\u65F6\u95F4", "date"]);
    const iSys = idx(["\u9AD8\u538B", "\u6536\u7F29", "systolic", "sys"]);
    const iDia = idx(["\u4F4E\u538B", "\u8212\u5F20", "diastolic", "dia"]);
    if (iDt < 0 || iSys < 0 || iDia < 0) return [];
    const out = [];
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
        diastolic
      });
    }
    return out;
  }
  function sameMinute(a, b) {
    return a.slice(0, 16) === b.slice(0, 16);
  }
  function mergeExternalCsvIntoData(data, options = {}) {
    const result = {
      weightAdded: 0,
      weightUpdated: 0,
      bpAdded: 0,
      bodyFatFilled: 0,
      skipped: 0,
      notes: []
    };
    if (options.weightCsvText) {
      const rows = parseWeightScaleCsv(options.weightCsvText);
      if (!rows.length) {
        result.notes.push("\u4F53\u91CD CSV \u672A\u8BC6\u522B\u5230\u6709\u6548\u884C\uFF08\u8BF7\u786E\u8BA4\u542B\u300C\u6D4B\u91CF\u65E5\u671F\u65F6\u95F4\u300D\u300C\u4F53\u91CD\u300D\u5217\uFF09");
      }
      for (const row of rows) {
        const hit = data.weight.find(
          (w) => sameMinute(w.datetime, row.datetime) || w.date === row.date && Math.abs(w.value - row.value) < 0.05
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
              source: "external-csv"
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
        result.notes.push("\u8840\u538B CSV \u672A\u8BC6\u522B\u5230\u6709\u6548\u884C\uFF08\u8BF7\u786E\u8BA4\u542B\u300C\u6D4B\u91CF\u65E5\u671F\u65F6\u95F4\u300D\u300C\u9AD8\u538B\u300D\u300C\u4F4E\u538B\u300D\u5217\uFF09");
      }
      for (const row of rows) {
        const hit = data.bloodPressure.find(
          (b) => sameMinute(b.datetime, row.datetime) || b.date === row.date && b.systolic === row.systolic && b.diastolic === row.diastolic
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
  return __toCommonJS(browser_exports);
})();
