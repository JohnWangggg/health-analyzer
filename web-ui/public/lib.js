/**
 * 健康分析库 - 浏览器版本（流式版）
 * 纯 JavaScript 实现，可在 PWA 中直接加载
 * 无外部依赖，全部本地运行
 * 支持大文件流式解析（不一次性读入内存）
 */

(function(global) {
  'use strict';

  // ============================================================
  // 工具函数
  // ============================================================

  function getDate(dt) { return dt.slice(0, 10); }
  function getHour(dt) { return parseInt(dt.slice(11, 13), 10); }

  function parseRecordLine(line) {
    const attr = name => {
      const match = line.match(new RegExp("\\b" + name + "\\s*=\\s*([\"'])(.*?)\\1"));
      return match ? match[2] : undefined;
    };
    const type = attr('type');
    const startDate = attr('startDate');
    if (!type || !startDate) return null;
    return {
      type: type,
      source: attr('sourceName') || '',
      startDate: startDate,
      endDate: attr('endDate'),
      value: attr('value') || '',
    };
  }

  function parseAppleDate(dt) {
    return Date.parse(dt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  }

  // ============================================================
  // 统计
  // ============================================================

  function calcStats(values) {
    if (values.length === 0) {
      return { mean: 0, std: 0, cv: 0, min: 0, max: 0, count: 0 };
    }
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? (std / mean) * 100 : 0;
    return {
      mean, std, cv,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n,
    };
  }

  function calcCgmStats(cgm) {
    if (cgm.length === 0) return null;
    const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const values = sorted.map(p => p.value);
    const total = values.length;

    const overall = calcStats(values);
    const overallObj = Object.assign({}, overall, {
      timeRange: sorted[0].datetime + ' 至 ' + sorted[sorted.length - 1].datetime,
      pctBelow39: (values.filter(v => v < 3.9).length / total) * 100,
      pctBelow30: (values.filter(v => v < 3.0).length / total) * 100,
      pctInRange: (values.filter(v => v >= 3.9 && v <= 10.0).length / total) * 100,
      pctAbove78: (values.filter(v => v > 7.8).length / total) * 100,
      pctAbove100: (values.filter(v => v > 10.0).length / total) * 100,
    });

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
      daily[date] = Object.assign({}, s, {
        pctBelow39: (vals.filter(v => v < 3.9).length / vals.length) * 100,
        pctAbove78: (vals.filter(v => v > 7.8).length / vals.length) * 100,
        pctAbove100: (vals.filter(v => v > 10.0).length / vals.length) * 100,
      });
    }

    const maxRises = { '30min': { rise: 0, time: '' }, '60min': { rise: 0, time: '' }, '120min': { rise: 0, time: '' } };
    for (const window of [30, 60, 120]) {
      const windowSec = window * 60;
      let maxRise = 0;
      let maxTime = '';
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const t1 = new Date(sorted[i].datetime.slice(0, 19)).getTime();
          const t2 = new Date(sorted[j].datetime.slice(0, 19)).getTime();
          const diff = (t2 - t1) / 1000;
          if (diff > windowSec) break;
          if (diff > 0) {
            const rise = sorted[j].value - sorted[i].value;
            if (rise > maxRise) {
              maxRise = rise;
              maxTime = sorted[i].datetime + ' -> ' + sorted[j].datetime;
            }
          }
        }
      }
      maxRises[window + 'min'] = { rise: maxRise, time: maxTime };
    }

    return { overall: overallObj, daily: daily, maxRises: maxRises };
  }

  function calcBpStats(records) {
    if (records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));
    function periodStats(days) {
      if (records.length === 0) return null;
      const latest = sorted[sorted.length - 1].date;
      const latestDate = new Date(latest + 'T00:00:00Z');
      const startDate = new Date(latestDate);
      startDate.setUTCDate(startDate.getUTCDate() - days);
      const startStr = startDate.toISOString().slice(0, 10);
      const filtered = sorted.filter(r => r.date >= startStr && r.date <= latest);
      if (filtered.length === 0) return null;
      const meanSys = filtered.reduce((a, b) => a + b.systolic, 0) / filtered.length;
      const meanDia = filtered.reduce((a, b) => a + b.diastolic, 0) / filtered.length;
      const lowCount = filtered.filter(r => r.systolic < 90 || r.diastolic < 60).length;
      return { systolic: meanSys, diastolic: meanDia, count: filtered.length, lowCount };
    }
    return {
      records: sorted,
      mean7d: periodStats(7),
      mean14d: periodStats(14),
      mean30d: periodStats(30),
      lowest: sorted.reduce((min, r) => r.systolic < min.systolic ? r : min, sorted[0]),
      highest: sorted.reduce((max, r) => r.systolic > max.systolic ? r : max, sorted[0]),
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
        count: vals.length,
      };
    }
    return result;
  }

  // ============================================================
  // 流式 XML 解析
  // ============================================================

  /**
   * 异步流式解析 XML 文本（按行）
   * @param {string|ArrayBuffer|Uint8Array} source - 文本字符串或字节
   * @param {Function} onRecord - 每条 Record 回调 (rec, line) => void
   * @param {Function} onProgress - 进度回调 (p) => void
   * @returns {Promise<{totalLines: number, totalBytes: number}>}
   */
  async function parseXmlStream(source, onRecord, onProgress) {
    // 文本直接 split；字节先按块解码
    if (typeof source === 'string') {
      return parseStringStream(source, onRecord, onProgress);
    }
    return parseBytesStream(source, onRecord, onProgress);
  }

  function parseStringStream(text, onRecord, onProgress) {
    // 按 \n 切行（XML 文件 line 很长，但能跑）
    let pos = 0;
    const len = text.length;
    const chunkSize = 10 * 1024 * 1024; // 10MB 字符串
    let lastReport = 0;
    let i = 0;

    while (pos < len) {
      // 找到下一个 \n
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

      // 让出主线程 + 进度上报
      if (i - lastReport > 5000) {
        lastReport = i;
        if (onProgress) onProgress(pos / len);
      }
    }
    if (onProgress) onProgress(1);
    return Promise.resolve({ totalLines: i, totalBytes: len });
  }

  /**
   * 字节流式解析：用 TextDecoder 按块解码，避免一次性解码大字符串
   * 关键：跨块边界的行需要拼接
   */
  async function parseBytesStream(bytes, onRecord, onProgress) {
    const decoder = new TextDecoder('utf-8');
    const totalBytes = bytes.byteLength || bytes.length;
    const chunkSize = 4 * 1024 * 1024; // 4MB 块

    let pendingLine = '';
    let processed = 0;
    let i = 0;
    let lastYield = Date.now();

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, totalBytes));
      let text = decoder.decode(chunk, { stream: true });
      text = pendingLine + text;
      pendingLine = '';

      const lines = text.split('\n');
      // 最后一段如果不是完整行，留到下一块
      if (offset + chunkSize < totalBytes) {
        pendingLine = lines.pop();
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

      processed = offset + chunk.byteLength;
      if (onProgress) onProgress(processed / totalBytes);

      // 每 50ms 让出主线程，避免阻塞 UI
      if (Date.now() - lastYield > 50) {
        await new Promise(r => setTimeout(r, 0));
        lastYield = Date.now();
      }
    }

    // 处理最后一行
    if (pendingLine) {
      if (pendingLine.indexOf('<Record ') !== -1) {
        const rec = parseRecordLine(pendingLine);
        if (rec && rec.value !== '') onRecord(rec, i);
      }
    }

    if (onProgress) onProgress(1);
    return { totalLines: i, totalBytes };
  }

  /**
   * 高层 API：异步解析（用于大文件）
   */
  async function parseHealthXmlAsync(source, options) {
    options = options || {};
    const startDate = options.startDate;
    const endDate = options.endDate;
    const onProgress = options.onProgress;

    const data = createEmptyData();

    await parseXmlStream(source, (rec) => {
      processRecord(rec, data, startDate, endDate);
    }, onProgress);

    finalizeData(data);
    return data;
  }

  /**
   * 同步解析（用于小文件，< 50MB）
   */
  function parseHealthXml(text, options) {
    options = options || {};
    const startDate = options.startDate;
    const endDate = options.endDate;
    const onProgress = options.onProgress;

    const data = createEmptyData();
    const lines = text.split('\n');
    const total = lines.length;
    const reportEvery = Math.max(1, Math.floor(total / 100));

    for (let i = 0; i < total; i++) {
      const line = lines[i];
      if (line.indexOf('<Record ') === -1 && line.indexOf('<Record\t') === -1) continue;
      const rec = parseRecordLine(line);
      if (!rec || rec.value === '') continue;
      processRecord(rec, data, startDate, endDate);
      if (onProgress && i % reportEvery === 0) onProgress(i / total);
    }
    finalizeData(data);
    if (onProgress) onProgress(1);
    return data;
  }

  function createEmptyData() {
    return {
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
        hasCgm: false, hasBloodPressure: false, hasWeight: false,
        hasHrv: false, hasHeartRate: false, hasSteps: false,
        hasSleep: false, hasEcg: false,
      },
    };
  }

  function processRecord(rec, data, startDate, endDate) {
    const rdate = rec.startDate;
    const date = getDate(rdate);
    if (startDate && date < startDate) return;
    if (endDate && date > endDate) return;

    const numericValue = parseFloat(rec.value);
    if (!Number.isFinite(numericValue) && rec.type !== 'HKCategoryTypeIdentifierSleepAnalysis') return;

    if (rec.type === 'HKQuantityTypeIdentifierBloodGlucose') {
      const sourceLower = rec.source.toLowerCase();
      if (rec.source.includes('欧态') || sourceLower.includes('cgm') || sourceLower.includes('libre') || sourceLower.includes('glucose')) {
        data.cgm.push({ datetime: rdate, value: numericValue });
        data.dataAvailability.hasCgm = true;
      }
    } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureSystolic') {
      const idx = data.bloodPressure.findIndex(r => r.datetime === rdate);
      if (idx === -1) {
        data.bloodPressure.push({ datetime: rdate, date: date, systolic: numericValue, diastolic: 0 });
      } else {
        data.bloodPressure[idx].systolic = numericValue;
      }
      data.dataAvailability.hasBloodPressure = true;
    } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureDiastolic') {
      const idx = data.bloodPressure.findIndex(r => r.datetime === rdate);
      if (idx === -1) {
        data.bloodPressure.push({ datetime: rdate, date: date, systolic: 0, diastolic: numericValue });
      } else {
        data.bloodPressure[idx].diastolic = numericValue;
      }
    } else if (rec.type === 'HKQuantityTypeIdentifierBodyMass') {
      data.weight.push({ datetime: rdate, date: date, value: numericValue });
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
      if (!data.steps[date]) data.steps[date] = { watch: 0, iphone: 0, max: 0 };
      if (rec.source.includes('Watch')) data.steps[date].watch += numericValue;
      else if (rec.source.includes('iPhone')) data.steps[date].iphone += numericValue;
      data.dataAvailability.hasSteps = true;
    } else if (rec.type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      if (!rec.source.includes('Watch')) return;
      if (!rec.endDate) return;
      try {
        const startMs = new Date(rdate.slice(0, 19)).getTime();
        const endMs = new Date(rec.endDate.slice(0, 19)).getTime();
        const durationSec = (endMs - startMs) / 1000;
        if (!data.sleep[date]) data.sleep[date] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
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
      } catch (e) { /* ignore */ }
    }
  }

  function finalizeData(data) {
    for (const date in data.steps) {
      data.steps[date].max = Math.max(data.steps[date].watch, data.steps[date].iphone);
    }
    data.bloodPressure = data.bloodPressure.filter(r => r.systolic > 0 && r.diastolic > 0);
    data.bloodPressure.sort((a, b) => a.datetime.localeCompare(b.datetime));
    data.cgm.sort((a, b) => a.datetime.localeCompare(b.datetime));
    data.weight.sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  function parseEcgCsv(text) {
    const lines = text.split('\n');
    const summary = { datetime: '', classification: 'unknown' };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('记录日期,')) summary.datetime = trimmed.replace('记录日期,', '').trim();
      else if (trimmed.startsWith('分类,')) summary.classification = trimmed.replace('分类,', '').trim();
      else if (trimmed.startsWith('设备,')) summary.device = trimmed.replace('设备,', '').replace(/"/g, '').trim();
      if (/^-?\d/.test(trimmed) && trimmed.includes('.')) break;
    }
    return summary;
  }

  // ============================================================
  // 主分析
  // ============================================================

  function analyzeAll(data) {
    const allDates = [
      ...data.cgm.map(x => getDate(x.datetime)),
      ...data.bloodPressure.map(x => x.date),
      ...data.weight.map(x => x.date),
      ...Object.keys(data.hrv), ...Object.keys(data.restingHr),
      ...Object.keys(data.walkingHr), ...Object.keys(data.steps),
      ...Object.keys(data.sleep),
    ];
    allDates.sort();
    return {
      data: data,
      cgmStats: calcCgmStats(data.cgm),
      bpStats: calcBpStats(data.bloodPressure),
      hrvByDate: summarizeHrvByDay(data.hrv, data.hrvOvernight),
      restingHrByDate: data.restingHr,
      walkingHrByDate: data.walkingHr,
      stepsByDate: Object.fromEntries(Object.entries(data.steps).map(([d, v]) => [d, v.max])),
      sleepByDate: data.sleep,
      dateRange: { start: allDates[0] || '', end: allDates[allDates.length - 1] || '' },
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // 大模型提示词生成
  // ============================================================

  const MAIN_PROMPT_TEMPLATE = `# 角色与任务
你是一位严谨的健康数据分析师。请基于下方"原始数据与统计"生成一份《个人健康自我监测深度分析报告》，严格按照以下结构与风格：
- 不下诊断结论、不开药、不替代门诊
- 关注趋势、相关性与可操作建议
- 数字优先、辅以解释，避免空话
- 任何可疑异常必须给"复核建议"

# 输出结构（必须按以下固定标题顺序输出；没有数据的维度跳过）

## 0. 总结判断
- 用 3-5 个要点概括本次数据给出的最重要发现
- 列出当前监测优先级（按风险/关注度排序）

## 数据概览
## CGM 动态血糖
## 血压
## 体重
## HRV 心率变异性
## 心率
## 步数与睡眠
## ECG 心电图
（仅输出有数据的维度；每个维度包含：现状、趋势、解读、风险与建议）

## 监测仪表盘
每天只看 8 个核心指标，表格：模块 | 指标 | 目标/警戒

## 需要复查或升级处理的信号
区分“立即寻求急诊帮助”“尽快联系医生”“复测并持续记录”，不要因单次无症状异常直接下结论。

## 当前工作假设
列出 5-7 个最符合现有数据的工作假设

## 参考依据
- ADA CGM Time in Range: https://diabetes.org/about-diabetes/devices-technology/cgm-time-in-range
- International Consensus on Time in Range: https://diabetesjournals.org/care/article/42/8/1593/36184/Clinical-Targets-for-Continuous-Glucose-Monitoring
- Abbott FreeStyle Libre 滞后说明: https://www.freestylelibre.com.au/difference-between-glucose-interstitial-glucose
- U-M CGM 夜间低值说明: https://teamdynamix.umich.edu/TDClient/210/DepressionCenter/KB/Article/10689/CGM-Is-Reading-Low-Values

# 写作风格要求
- 中文输出，Markdown 表格呈现数据
- 表格数字右对齐，阈值和警戒值使用 \`代码格式\` 标注
- 关键发现用 **加粗**
- 区分"已确认"vs"待验证"vs"假设"
- CGM <3.9 mmol/L 必须说"必须指尖血复核"
- <3.0 mmol/L 升级为"按低血糖处理"
- 高血糖参考阈值：随机 >11.1 mmol/L 或空腹 >7.0 mmol/L；CGM 不能单独用于诊断，需结合复测和医生/实验室评估

# 数据使用边界
- CGM 测量组织间液葡萄糖，与指尖血存在 5-10 分钟滞后
- 异常低值必须用指尖血复核
- 睡眠/步数/HRV 数据来自 Apple Watch，存在测量误差
- 单次异常应先复测并结合症状、持续时间和重复次数判断
- 本报告不替代医生门诊，所有降压/降糖方案调整请遵医嘱

---

# 原始数据与统计
（请基于下方数据生成报告）

{ANALYSIS_DATA}
`;

  const SHORT_SYSTEM_PROMPT = `你是一位严谨的健康数据分析师。基于用户提供的 Apple Health 统计生成中文 Markdown 报告；只分析实际存在的数据，按“总结判断、数据维度、监测仪表盘、需要复查或升级处理的信号、当前工作假设、参考依据”顺序组织。不下诊断结论；CGM <3.9 必须建议指尖血复核，CGM 不能单独用于诊断；单次异常先复测并结合症状判断；所有用药调整请遵医嘱。`;

  function formatAnalysisForLLM(analysis) {
    const sections = [];
    const data = analysis.data;
    const av = data.dataAvailability;
    const detailDays = 90;
    const recentDateSet = dates => {
      const sorted = [...dates].sort();
      const latest = sorted[sorted.length - 1];
      if (!latest) return new Set();
      const cutoff = new Date(latest + 'T00:00:00Z');
      cutoff.setUTCDate(cutoff.getUTCDate() - (detailDays - 1));
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      return new Set(sorted.filter(date => date >= cutoffDate));
    };

    sections.push('## 数据可用性\n');
    sections.push(`> 明细表默认展示最近 ${detailDays} 天；更早数据已纳入总体统计，但为控制提示词长度未逐条展开。\n`);
    sections.push('| 维度 | 是否存在 | 数据量 |');
    sections.push('|---|---|---|');
    sections.push(`| CGM 动态血糖 | ${av.hasCgm ? '✅' : '❌'} | ${data.cgm.length} 条 |`);
    sections.push(`| 血压 | ${av.hasBloodPressure ? '✅' : '❌'} | ${data.bloodPressure.length} 条 |`);
    sections.push(`| 体重 | ${av.hasWeight ? '✅' : '❌'} | ${data.weight.length} 条 |`);
    sections.push(`| HRV | ${av.hasHrv ? '✅' : '❌'} | ${Object.keys(analysis.hrvByDate).length} 天 |`);
    sections.push(`| 静息/步行心率 | ${av.hasHeartRate ? '✅' : '❌'} | ${Object.keys(data.restingHr).length} 天 |`);
    sections.push(`| 步数 | ${av.hasSteps ? '✅' : '❌'} | ${Object.keys(data.steps).length} 天 |`);
    sections.push(`| 睡眠 | ${av.hasSleep ? '✅' : '❌'} | ${Object.keys(data.sleep).length} 天 |`);
    sections.push(`| ECG | ${av.hasEcg ? '✅' : '❌'} | ${data.ecg.length} 份 |\n`);
    sections.push(`数据时间范围：${analysis.dateRange.start} 至 ${analysis.dateRange.end}\n`);

    if (analysis.cgmStats) {
      const o = analysis.cgmStats.overall;
      sections.push('## CGM 动态血糖\n');
      sections.push(`**总体统计**（共 ${o.count} 条，时间范围：${o.timeRange}）\n`);
      sections.push('| 指标 | 值 |');
      sections.push('|---|---|');
      sections.push(`| 平均 | ${o.mean.toFixed(2)} mmol/L |`);
      sections.push(`| 标准差 | ${o.std.toFixed(2)} mmol/L |`);
      sections.push(`| CV 变异系数 | ${o.cv.toFixed(1)}% |`);
      sections.push(`| 最低 | ${o.min.toFixed(1)} mmol/L |`);
      sections.push(`| 最高 | ${o.max.toFixed(1)} mmol/L |`);
      sections.push(`| TIR (3.9-10.0 mmol/L) | ${o.pctInRange.toFixed(1)}% |`);
      sections.push(`| <3.9 mmol/L | ${o.pctBelow39.toFixed(1)}% |`);
      sections.push(`| <3.0 mmol/L | ${o.pctBelow30.toFixed(1)}% |`);
      sections.push(`| >7.8 mmol/L | ${o.pctAbove78.toFixed(1)}% |`);
      sections.push(`| >10.0 mmol/L | ${o.pctAbove100.toFixed(1)}% |\n`);
      sections.push('**分日统计**：\n');
      sections.push('| 日期 | 条数 | 均值 | 最低 | 最高 | CV% | <3.9% | >7.8% |');
      sections.push('|---|---:|---:|---:|---:|---:|---:|---:|');
      const recentDates = recentDateSet(Object.keys(analysis.cgmStats.daily));
      for (const date of Object.keys(analysis.cgmStats.daily).filter(date => recentDates.has(date)).sort()) {
        const d = analysis.cgmStats.daily[date];
        sections.push(`| ${date} | ${d.count} | ${d.mean.toFixed(2)} | ${d.min.toFixed(1)} | ${d.max.toFixed(1)} | ${d.cv.toFixed(1)} | ${d.pctBelow39.toFixed(1)} | ${d.pctAbove78.toFixed(1)} |`);
      }
      sections.push('');
      sections.push(`**最大血糖上升**：30分钟 ${analysis.cgmStats.maxRises['30min'].rise.toFixed(1)} mmol/L, 60分钟 ${analysis.cgmStats.maxRises['60min'].rise.toFixed(1)} mmol/L, 120分钟 ${analysis.cgmStats.maxRises['120min'].rise.toFixed(1)} mmol/L\n`);
    }

    if (analysis.bpStats && analysis.bpStats.records.length > 0) {
      sections.push('## 血压\n');
      sections.push(`**所有血压记录**（共 ${analysis.bpStats.records.length} 条）：\n`);
      sections.push('| 时间 | 收缩压 | 舒张压 | 备注 |');
      sections.push('|---|---:|---:|---|');
      const recentDates = recentDateSet(analysis.bpStats.records.map(r => r.date));
      for (const r of analysis.bpStats.records.filter(r => recentDates.has(r.date))) {
        const low = r.systolic < 90 || r.diastolic < 60 ? ' ⚠️' : '';
        sections.push(`| ${r.datetime} | ${r.systolic} | ${r.diastolic} |${low} |`);
      }
      sections.push('');
      sections.push('**时段均值**：\n');
      sections.push('| 时段 | 收缩压 | 舒张压 | 条数 | <90/60 |');
      sections.push('|---|---:|---:|---:|---:|');
      if (analysis.bpStats.mean7d) {
        const m = analysis.bpStats.mean7d;
        sections.push(`| 最近 7 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      if (analysis.bpStats.mean14d) {
        const m = analysis.bpStats.mean14d;
        sections.push(`| 最近 14 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      if (analysis.bpStats.mean30d) {
        const m = analysis.bpStats.mean30d;
        sections.push(`| 最近 30 天 | ${m.systolic.toFixed(1)} | ${m.diastolic.toFixed(1)} | ${m.count} | ${m.lowCount} |`);
      }
      sections.push('');
    }

    if (data.weight.length > 0) {
      sections.push('## 体重\n');
      sections.push('| 时间 | 体重 (kg) |');
      sections.push('|---|---:|');
      const recentDates = recentDateSet(data.weight.map(w => w.date));
      for (const w of data.weight.filter(w => recentDates.has(w.date))) {
        sections.push(`| ${w.datetime} | ${w.value.toFixed(1)} |`);
      }
      sections.push('');
    }

    if (Object.keys(analysis.hrvByDate).length > 0) {
      sections.push('## HRV 心率变异性\n');
      sections.push('| 日期 | 全天均值 | 夜间均值 | 最低 | 最高 | 样本数 |');
      sections.push('|---|---:|---:|---:|---:|---:|');
      const recentDates = recentDateSet(Object.keys(analysis.hrvByDate));
      for (const date of Object.keys(analysis.hrvByDate).filter(date => recentDates.has(date)).sort()) {
        const h = analysis.hrvByDate[date];
        sections.push(`| ${date} | ${h.allMean.toFixed(1)} | ${h.overnightMean.toFixed(1)} | ${h.min.toFixed(1)} | ${h.max.toFixed(1)} | ${h.count} |`);
      }
      sections.push('');
    }

    if (Object.keys(data.restingHr).length > 0 || Object.keys(data.walkingHr).length > 0) {
      sections.push('## 心率\n');
      const allDates = new Set([...Object.keys(data.restingHr), ...Object.keys(data.walkingHr)]);
      const recentDates = recentDateSet(Array.from(allDates));
      sections.push('| 日期 | 静息心率 | 步行心率 |');
      sections.push('|---|---:|---:|');
      for (const date of Array.from(allDates).filter(date => recentDates.has(date)).sort()) {
        const r = data.restingHr[date] ?? '—';
        const w = data.walkingHr[date] ?? '—';
        sections.push(`| ${date} | ${r} | ${w} |`);
      }
      sections.push('');
    }

    if (Object.keys(data.steps).length > 0 || Object.keys(data.sleep).length > 0) {
      sections.push('## 步数与睡眠\n');
      const allDates = new Set([...Object.keys(data.steps), ...Object.keys(data.sleep)]);
      const recentDates = recentDateSet(Array.from(allDates));
      sections.push('| 日期 | 步数 | 睡眠(h) | 深睡(h) | REM(h) |');
      sections.push('|---|---:|---:|---:|---:|');
      for (const date of Array.from(allDates).filter(date => recentDates.has(date)).sort()) {
        const steps = data.steps[date]?.max ?? '—';
        const sleep = data.sleep[date];
        const sleepStr = sleep ? sleep.total.toFixed(2) : '—';
        const deepStr = sleep ? sleep.deep.toFixed(2) : '—';
        const remStr = sleep ? sleep.rem.toFixed(2) : '—';
        sections.push(`| ${date} | ${steps} | ${sleepStr} | ${deepStr} | ${remStr} |`);
      }
      sections.push('');
    }

    if (data.ecg.length > 0) {
      sections.push('## ECG 心电图\n');
      sections.push(`共 ${data.ecg.length} 份 ECG\n`);
      const counts = {};
      for (const e of data.ecg) counts[e.classification] = (counts[e.classification] || 0) + 1;
      sections.push('分类统计：');
      for (const k of Object.keys(counts)) {
        sections.push(`- ${k}: ${counts[k]} 份`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  function generateLLMPrompt(analysis) {
    const dataSection = formatAnalysisForLLM(analysis);
    return MAIN_PROMPT_TEMPLATE.replace('{ANALYSIS_DATA}', dataSection).replace('{ANALYSIS_JSON}', dataSection);
  }

  function generateDataOnly(analysis) {
    return formatAnalysisForLLM(analysis);
  }

  // ============================================================
  // ZIP 处理
  // ============================================================

  async function extractXmlFromZip(zipFile) {
    if (typeof global.fflate === 'undefined') {
      throw new Error('fflate 库未加载');
    }
    const buf = await zipFile.arrayBuffer();
    const unzipped = global.fflate.unzipSync(new Uint8Array(buf));

    // 修复 macOS ZIP 文件名 UTF-8 编码问题
    const decodedEntries = {};
    for (const key of Object.keys(unzipped)) {
      const bytes = new Uint8Array(key.length);
      for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
      let decoded;
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        decoded = key;
      }
      if (decoded.includes('\ufffd')) decoded = key;
      decodedEntries[decoded] = unzipped[key];
    }

    // 优先选主 export.xml（不是 export_cda.xml）
    const xmlKeys = Object.keys(decodedEntries).filter(k => /\.xml$/i.test(k));
    const xmlFile = xmlKeys.find(k =>
      k.endsWith('export.xml') && !k.endsWith('export_cda.xml')
    ) || xmlKeys.find(k => /导出\.xml$/i.test(k)) || xmlKeys
      .filter(k => !k.endsWith('export_cda.xml'))
      .sort((a, b) => decodedEntries[b].byteLength - decodedEntries[a].byteLength)[0];

    if (!xmlFile) {
      const fileList = Object.keys(decodedEntries).slice(0, 10).join(', ');
      throw new Error(`ZIP 包中未找到 export.xml 或 导出.xml。前 10 个文件: ${fileList}`);
    }

    return {
      xmlBytes: decodedEntries[xmlFile],  // 字节流，让上层决定怎么解析
      ecgEntries: Object.keys(decodedEntries)
        .filter(k => /electrocardiograms/.test(k) && k.endsWith('.csv'))
        .map(k => ({
          filename: k,
          text: new TextDecoder('utf-8').decode(decodedEntries[k]),
        })),
      xmlFileName: xmlFile,
    };
  }

  // ============================================================
  // 导出
  // ============================================================

  global.HealthAnalyzer = {
    parseHealthXml,
    parseHealthXmlAsync,
    parseXmlStream,
    parseBytesStream,
    parseEcgCsv,
    analyzeAll,
    calcCgmStats,
    calcBpStats,
    summarizeHrvByDay,
    generateLLMPrompt,
    generateDataOnly,
    formatAnalysisForLLM,
    extractXmlFromZip,
    SHORT_SYSTEM_PROMPT,
    MAIN_PROMPT_TEMPLATE,
  };

})(typeof window !== 'undefined' ? window : globalThis);
