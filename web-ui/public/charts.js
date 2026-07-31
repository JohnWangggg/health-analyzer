/**
 * 轻量 Canvas 折线图（无第三方依赖）
 * 暴露 window.HealthCharts；颜色跟随 CSS 变量（支持暗色模式）
 * 文案：options.locale 或 window.I18n.getLocale()；zh* → 中文，否则 en
 */
(function (global) {
  'use strict';

  /** 图表自包含文案（zh-TW 等 zh* 回退中文） */
  var STRINGS = {
    zh: {
      emptyNoData: '暂无图表数据',
      emptyInsufficient:
        '当前数据维度不足以绘制趋势图。上传含 CGM / 体重 / HRV / 血压 / Watch / Workout 的导出后再试。',
      rangeAll: '全部',
      rangeDays: '近 {n} 天',
      latest: '最新',
      range: '范围',
      min: '最低',
      max: '最高',
      points: '点',
      ariaInteractive: '，可触摸或使用左右方向键查看读数',
      titleCgm: 'CGM（{range}）',
      titleAgp: 'CGM AGP 14 日分位带（按小时）',
      agpInsufficientHint: '覆盖不足时分位仅供参考',
      titleWeightTrend: '体重趋势（晨起优先，{range}）',
      titleBodyFat: '体脂趋势（{range}）',
      titleWeight: '体重（{range}）',
      titleHrv: 'HRV 全天均值（{range}）',
      titleBp: '收缩压（{range}）',
      titleSpo2: '血氧 SpO₂ 日均（{range}）',
      titleExercise: 'Watch 锻炼分钟（{range}）',
      titleVo2: 'VO₂ max 估算（{range}）',
      titleSpo2Night: '夜段血氧 SpO₂（0–8h，{range}）',
      titleBreathing: '睡眠呼吸紊乱（{range}）',
      titleWorkout: 'Workout 日总时长（{range}）',
      titleRecovery: '周恢复分（近 {n} 周）',
      titleLoad: '周负荷分（近 {n} 周）',
      legendGlucose: '血糖',
      legendThr39: '3.9 阈值',
      legendThr78: '7.8 阈值',
      legendThr10: '10.0 阈值',
      legendP5P95: 'p5–p95',
      legendP25P75: 'p25–p75',
      legendP50: 'p50 中位',
      legendWeightTrend: '趋势体重',
      legendBodyFat: '体脂%',
      legendWeight: '体重',
      legendHrv: 'HRV',
      legendSys: '收缩压',
      legendSpo2: 'SpO₂ 日均',
      legendExercise: '锻炼 min',
      legendVo2: 'VO₂ max',
      legendSpo2Night: '夜段 SpO₂',
      legendBreathing: '睡眠呼吸紊乱',
      legendWorkout: '训练 min',
      legendRecovery: '恢复分',
      legendLoad: '负荷分',
      unitScore: '分',
      hourLabel: '{h}时',
      legendBaseline: '个人基线',
      legendEvents: '事件',
      legendCompare: '对比',
      overlayTitle: '{primary} + {compare}',
      conclusionInsufficient: '数据不足，暂无法概括趋势（非诊断）',
      conclusionSparse: '约 {days} 天有数据，点偏少，趋势仅供参考（非诊断）',
      conclusionStable: '近 {range} · 约 {days} 天有数据 · 大致稳定（描述性，非诊断）',
      conclusionUp: '近 {range} · 约 {days} 天有数据 · 末值较前偏高约 {delta}（描述性，非诊断）',
      conclusionDown: '近 {range} · 约 {days} 天有数据 · 末值较前偏低约 {delta}（描述性，非诊断）',
      metricCgm: '血糖 CGM',
      metricAgp: 'CGM AGP',
      metricWeight: '体重',
      metricBodyfat: '体脂',
      metricHrv: 'HRV',
      metricBp: '收缩压',
      metricSpo2: '血氧 SpO₂',
      metricExercise: '锻炼分钟',
      metricVo2: 'VO₂ max',
      metricSpo2Night: '夜段血氧',
      metricBreathing: '呼吸紊乱',
      metricWorkout: 'Workout',
      metricRecovery: '周恢复分',
      metricLoad: '周负荷分',
    },
    en: {
      emptyNoData: 'No chart data',
      emptyInsufficient:
        'Not enough dimensions to draw trends. Upload an export with CGM / weight / HRV / BP / Watch / Workout and try again.',
      rangeAll: 'All',
      rangeDays: 'Last {n} days',
      latest: 'Latest',
      range: 'range',
      min: 'min',
      max: 'max',
      points: 'pts',
      ariaInteractive: ', touch or use the left and right arrow keys to inspect values',
      titleCgm: 'CGM ({range})',
      titleAgp: 'CGM AGP 14-day hourly bands',
      agpInsufficientHint: 'Insufficient coverage — bands illustrative only',
      titleWeightTrend: 'Weight trend (morning preferred, {range})',
      titleBodyFat: 'Body fat trend ({range})',
      titleWeight: 'Weight ({range})',
      titleHrv: 'HRV daily mean ({range})',
      titleBp: 'Systolic BP ({range})',
      titleSpo2: 'SpO₂ daily mean ({range})',
      titleExercise: 'Watch exercise minutes ({range})',
      titleVo2: 'VO₂ max estimate ({range})',
      titleSpo2Night: 'Night SpO₂ (0–8h, {range})',
      titleBreathing: 'Sleep breathing disturbance ({range})',
      titleWorkout: 'Workout daily duration ({range})',
      titleRecovery: 'Weekly recovery score (last {n} weeks)',
      titleLoad: 'Weekly load score (last {n} weeks)',
      legendGlucose: 'Glucose',
      legendThr39: '3.9 threshold',
      legendThr78: '7.8 threshold',
      legendThr10: '10.0 threshold',
      legendP5P95: 'p5–p95',
      legendP25P75: 'p25–p75',
      legendP50: 'p50 median',
      legendWeightTrend: 'Trend weight',
      legendBodyFat: 'Body fat %',
      legendWeight: 'Weight',
      legendHrv: 'HRV',
      legendSys: 'Systolic',
      legendSpo2: 'SpO₂ daily',
      legendExercise: 'Exercise min',
      legendVo2: 'VO₂ max',
      legendSpo2Night: 'Night SpO₂',
      legendBreathing: 'Breathing disturbance',
      legendWorkout: 'Workout min',
      legendRecovery: 'Recovery',
      legendLoad: 'Load',
      unitScore: 'pts',
      hourLabel: '{h}h',
      legendBaseline: 'Personal baseline',
      legendEvents: 'Events',
      legendCompare: 'Compare',
      overlayTitle: '{primary} + {compare}',
      conclusionInsufficient: 'Not enough data to summarize the trend (not a diagnosis)',
      conclusionSparse: 'About {days} day(s) with data — sparse; trend is illustrative only (not a diagnosis)',
      conclusionStable: 'Last {range} · ~{days} days with data · roughly stable (descriptive, not a diagnosis)',
      conclusionUp: 'Last {range} · ~{days} days with data · latest higher by ~{delta} (descriptive, not a diagnosis)',
      conclusionDown: 'Last {range} · ~{days} days with data · latest lower by ~{delta} (descriptive, not a diagnosis)',
      metricCgm: 'Glucose CGM',
      metricAgp: 'CGM AGP',
      metricWeight: 'Weight',
      metricBodyfat: 'Body fat',
      metricHrv: 'HRV',
      metricBp: 'Systolic BP',
      metricSpo2: 'SpO₂',
      metricExercise: 'Exercise min',
      metricVo2: 'VO₂ max',
      metricSpo2Night: 'Night SpO₂',
      metricBreathing: 'Breathing disturbance',
      metricWorkout: 'Workout',
      metricRecovery: 'Weekly recovery',
      metricLoad: 'Weekly load',
    },
  };

  /** Chart key → i18n-ish label field on STRINGS */
  var METRIC_LABEL_KEYS = {
    cgm: 'metricCgm',
    agp: 'metricAgp',
    weight: 'metricWeight',
    bodyfat: 'metricBodyfat',
    hrv: 'metricHrv',
    bp: 'metricBp',
    spo2: 'metricSpo2',
    exercise: 'metricExercise',
    vo2: 'metricVo2',
    'spo2-night': 'metricSpo2Night',
    breathing: 'metricBreathing',
    workout: 'metricWorkout',
    recovery: 'metricRecovery',
    load: 'metricLoad',
  };

  function resolveLocale(options) {
    var loc = '';
    if (options && options.locale) loc = String(options.locale);
    else {
      try {
        if (global.I18n && typeof global.I18n.getLocale === 'function') {
          loc = String(global.I18n.getLocale() || '');
        }
      } catch (e) { /* ignore */ }
    }
    if (!loc) {
      try {
        loc = (global.document && global.document.documentElement &&
          (global.document.documentElement.getAttribute('data-locale') ||
            global.document.documentElement.lang)) || '';
      } catch (e2) { /* ignore */ }
    }
    // zh*（含 zh-CN / zh-TW）用中文；其余 en
    if (/^zh/i.test(loc)) return 'zh';
    if (/^en/i.test(loc)) return 'en';
    // 无 locale 信息时默认中文（与 app 默认一致）
    return loc ? 'en' : 'zh';
  }

  function getStrings(localeKey) {
    return STRINGS[localeKey] || STRINGS.zh;
  }

  function fmt(template, vars) {
    if (!template) return '';
    return String(template).replace(/\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? String(vars[k]) : '';
    });
  }

  function downsample(points, maxPoints) {
    if (!points || points.length <= maxPoints) return points || [];
    const step = (points.length - 1) / (maxPoints - 1);
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
      out.push(points[Math.round(i * step)]);
    }
    return out;
  }

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function themeColors() {
    return {
      bg: cssVar('--chart-bg', '#fbfcfe'),
      grid: cssVar('--chart-grid', '#e8eef4'),
      label: cssVar('--chart-label', '#7f8c8d'),
      primary: cssVar('--primary', '#2980b9'),
      text: cssVar('--text', '#2c3e50'),
    };
  }

  /**
   * Map event date (YYYY-MM-DD) to canvas x within point date span.
   * @returns {number|null}
   */
  function eventXFromDate(eventDate, points, pad, plotW) {
    if (!eventDate || !points || !points.length) return null;
    const te = Date.parse(String(eventDate).slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(te)) return null;
    const times = points
      .map((p) => Date.parse(String(p.x).slice(0, 10) + 'T00:00:00Z'))
      .filter(Number.isFinite);
    if (!times.length) return null;
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    if (te < t0 || te > t1) return null;
    if (t1 === t0) return pad.left + plotW / 2;
    return pad.left + ((te - t0) / (t1 - t0)) * plotW;
  }

  function medianOf(values) {
    const arr = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
    return arr[mid];
  }

  function uniqueDayCount(points) {
    const set = {};
    for (const p of points || []) {
      const d = String(p.x).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set[d] = true;
    }
    return Object.keys(set).length;
  }

  function formatDeltaVal(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 100) return a.toFixed(0);
    if (a >= 10) return a.toFixed(1);
    return a.toFixed(2);
  }

  /**
   * Descriptive (non-diagnostic) one-line chart conclusion.
   * @param {{x:*, y:number}[]} points
   * @param {number} rangeDays 0 = all
   * @param {object} S strings
   */
  function chartConclusion(points, rangeDays, S) {
    S = S || STRINGS.zh;
    if (!points || points.length < 2) return S.conclusionInsufficient;
    const ys = points.map((p) => p.y).filter(Number.isFinite);
    if (ys.length < 2) return S.conclusionInsufficient;
    const days = uniqueDayCount(points);
    const rangeText = !rangeDays || rangeDays <= 0 ? S.rangeAll : fmt(S.rangeDays, { n: rangeDays });
    if (days < 3) return fmt(S.conclusionSparse, { days: days });
    const first = ys[0];
    const last = ys[ys.length - 1];
    const mid = (Math.abs(first) + Math.abs(last)) / 2 || 1;
    const delta = last - first;
    const rel = Math.abs(delta) / mid;
    // Relative 2% or tiny absolute change → stable
    if (rel < 0.02 || Math.abs(delta) < 1e-6) {
      return fmt(S.conclusionStable, { range: rangeText, days: days });
    }
    if (delta > 0) {
      return fmt(S.conclusionUp, {
        range: rangeText,
        days: days,
        delta: formatDeltaVal(delta),
      });
    }
    return fmt(S.conclusionDown, {
      range: rangeText,
      days: days,
      delta: formatDeltaVal(delta),
    });
  }

  function dateKeyOf(x) {
    return String(x == null ? '' : x).slice(0, 10);
  }

  /**
   * Align two series on union of dates (YYYY-MM-DD). Missing days → null.
   * @returns {{ dates: string[], a: (number|null)[], b: (number|null)[] }}
   */
  function alignSeriesByDate(pointsA, pointsB) {
    const mapA = new Map();
    (pointsA || []).forEach((p) => {
      if (!p || !Number.isFinite(p.y)) return;
      mapA.set(dateKeyOf(p.x), p.y);
    });
    const mapB = new Map();
    (pointsB || []).forEach((p) => {
      if (!p || !Number.isFinite(p.y)) return;
      mapB.set(dateKeyOf(p.x), p.y);
    });
    const dates = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    return {
      dates,
      a: dates.map((d) => (mapA.has(d) ? mapA.get(d) : null)),
      b: dates.map((d) => (mapB.has(d) ? mapB.get(d) : null)),
    };
  }

  function strokeSeriesPath(ctx, n, xAt, yAtFn, values, color, lineWidth, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([5, 4]);
    let started = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      const x = xAt(i);
      const y = yAtFn(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ label: string, x: number|string, y: number }[]} points
   * @param {{ color?: string, yLabel?: string, fill?: boolean, thresholds?: {y:number,color:string,label?:string}[], baseline?: {y:number,color?:string,label?:string}, events?: {date:string,title?:string}[], onHover?: function, unit?: string, strings?: object, secondary?: { points: object[], color?: string, unit?: string, yLabel?: string, label?: string } }} options
   */
  function drawLineChart(canvas, points, options) {
    options = options || {};
    if (!canvas || !points || points.length === 0) {
      if (canvas) clearCanvas(canvas);
      return null;
    }

    const theme = themeColors();
    const S = options.strings || getStrings(resolveLocale(options));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width || 320;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sec = options.secondary && options.secondary.points && options.secondary.points.length
      ? options.secondary
      : null;
    const dualY =
      !!(sec && String(sec.unit || '') !== String(options.unit || ''));
    const pad = { top: 16, right: dualY ? 48 : 12, bottom: 28, left: 44 };
    const w = cssW - pad.left - pad.right;
    const h = cssH - pad.top - pad.bottom;
    if (w <= 0 || h <= 0) return null;

    // Build plot series (optionally date-aligned when overlaying)
    let plotDates = null;
    let primaryVals = null;
    let secondaryVals = null;
    let plotPoints = points;
    if (sec) {
      const aligned = alignSeriesByDate(points, sec.points);
      if (aligned.dates.length >= 2) {
        plotDates = aligned.dates;
        primaryVals = aligned.a;
        secondaryVals = aligned.b;
        plotPoints = aligned.dates.map((d, i) => ({
          x: d,
          y: aligned.a[i] != null ? aligned.a[i] : NaN,
        })).filter((p) => Number.isFinite(p.y));
        // Keep full aligned arrays for drawing gaps
      }
    }

    const ys = (primaryVals
      ? primaryVals.filter((v) => v != null && Number.isFinite(v))
      : points.map((p) => p.y).filter(Number.isFinite));
    if (ys.length === 0) return null;
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (options.thresholds) {
      for (const t of options.thresholds) {
        if (Number.isFinite(t.y)) {
          yMin = Math.min(yMin, t.y);
          yMax = Math.max(yMax, t.y);
        }
      }
    }
    if (options.baseline && Number.isFinite(options.baseline.y)) {
      yMin = Math.min(yMin, options.baseline.y);
      yMax = Math.max(yMax, options.baseline.y);
    }
    // Same-scale overlay: include secondary in primary range
    if (sec && !dualY && secondaryVals) {
      for (const v of secondaryVals) {
        if (v != null && Number.isFinite(v)) {
          yMin = Math.min(yMin, v);
          yMax = Math.max(yMax, v);
        }
      }
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    // Secondary independent scale
    let y2Min = 0;
    let y2Max = 1;
    if (sec && dualY) {
      const ys2 = (secondaryVals || sec.points.map((p) => p.y)).filter(
        (v) => v != null && Number.isFinite(v)
      );
      if (ys2.length) {
        y2Min = Math.min(...ys2);
        y2Max = Math.max(...ys2);
        if (y2Min === y2Max) {
          y2Min -= 1;
          y2Max += 1;
        }
        const p2 = (y2Max - y2Min) * 0.08;
        y2Min -= p2;
        y2Max += p2;
      }
    }

    const n = primaryVals ? primaryVals.length : points.length;
    const xAt = (i) => pad.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const yAt = (v) => pad.top + h - ((v - yMin) / (yMax - yMin)) * h;
    const y2At = (v) => pad.top + h - ((v - y2Min) / (y2Max - y2Min)) * h;
    const seriesA = primaryVals || points.map((p) => p.y);
    const seriesB = secondaryVals || (sec ? sec.points.map((p) => p.y) : null);
    const xLabels = plotDates || points.map((p) => p.x);

    function paint(activeIndex) {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, cssW, cssH);

      const fontBase = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.55;
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const y = yAt(v);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.text;
      ctx.font = '500 12px ' + fontBase;
      for (let i = 0; i <= ticks; i++) {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const y = yAt(v);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), pad.left - 6, y);
      }
      // Right axis for dual-Y overlay
      if (sec && dualY) {
        ctx.fillStyle = sec.color || '#e67e22';
        for (let i = 0; i <= ticks; i++) {
          const v = y2Min + ((y2Max - y2Min) * i) / ticks;
          const y = y2At(v);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), pad.left + w + 6, y);
        }
      }

      // Event markers (vertical) — behind series
      if (options.events && options.events.length) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = cssVar('--text-light', '#95a5a6');
        ctx.fillStyle = cssVar('--text-light', '#95a5a6');
        ctx.globalAlpha = 0.55;
        ctx.font = '500 10px ' + fontBase;
        let labeled = 0;
        const refPts = plotDates
          ? plotDates.map((d) => ({ x: d, y: 0 }))
          : points;
        for (const ev of options.events) {
          const x = eventXFromDate(ev.date || ev.x, refPts, pad, w);
          if (x == null) continue;
          ctx.beginPath();
          ctx.moveTo(x, pad.top);
          ctx.lineTo(x, pad.top + h);
          ctx.stroke();
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(x, pad.top + 3, 2.5, 0, Math.PI * 2);
          ctx.fill();
          if (ev.title && labeled < 4) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const short = String(ev.title).slice(0, 8);
            ctx.fillText(short, x, pad.top + 6);
            labeled += 1;
          }
          ctx.globalAlpha = 0.55;
        }
        ctx.restore();
      }

      if (options.thresholds) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.font = '500 11px ' + fontBase;
        for (const t of options.thresholds) {
          if (!Number.isFinite(t.y)) continue;
          const y = yAt(t.y);
          ctx.strokeStyle = t.color || '#e74c3c';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + w, y);
          ctx.stroke();
          if (t.label) {
            ctx.fillStyle = t.color || '#e74c3c';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(t.label, pad.left + 6, y - 3);
          }
        }
        ctx.restore();
      }

      // Personal baseline (median) — primary scale only
      if (options.baseline && Number.isFinite(options.baseline.y)) {
        ctx.save();
        const by = yAt(options.baseline.y);
        const bColor = options.baseline.color || '#7f8c8d';
        ctx.strokeStyle = bColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.75;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, by);
        ctx.lineTo(pad.left + w, by);
        ctx.stroke();
        const blabel = options.baseline.label || S.legendBaseline;
        ctx.fillStyle = bColor;
        ctx.font = '600 11px ' + fontBase;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.globalAlpha = 0.9;
        ctx.fillText(blabel, pad.left + w - 4, by - 3);
        ctx.restore();
      }

      const color = options.color || theme.primary;
      const secColor = (sec && sec.color) || '#e67e22';

      // Primary fill (only continuous segments without dual overlay clutter when dual)
      if (options.fill !== false && !sec) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xAt(i);
          const y = yAt(seriesA[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(xAt(n - 1), pad.top + h);
        ctx.lineTo(xAt(0), pad.top + h);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.fill();
      }

      strokeSeriesPath(ctx, n, xAt, yAt, seriesA, color, 2, false);
      if (sec && seriesB) {
        strokeSeriesPath(
          ctx,
          n,
          xAt,
          dualY ? y2At : yAt,
          seriesB,
          secColor,
          2,
          true
        );
      }

      // Endpoint dots for primary finite values
      for (const i of [0, n - 1]) {
        if (seriesA[i] == null || !Number.isFinite(seriesA[i])) continue;
        const ex = xAt(i);
        const ey = yAt(seriesA[i]);
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.bg;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (activeIndex != null && activeIndex >= 0 && activeIndex < n) {
        const ax = xAt(activeIndex);
        ctx.save();
        ctx.strokeStyle = theme.label;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, pad.top);
        ctx.lineTo(ax, pad.top + h);
        ctx.stroke();
        ctx.restore();
        if (seriesA[activeIndex] != null && Number.isFinite(seriesA[activeIndex])) {
          const ay = yAt(seriesA[activeIndex]);
          ctx.beginPath();
          ctx.arc(ax, ay, 5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = theme.bg;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (sec && seriesB && seriesB[activeIndex] != null && Number.isFinite(seriesB[activeIndex])) {
          const ay2 = (dualY ? y2At : yAt)(seriesB[activeIndex]);
          ctx.beginPath();
          ctx.arc(ax, ay2, 4, 0, Math.PI * 2);
          ctx.fillStyle = secColor;
          ctx.fill();
          ctx.strokeStyle = theme.bg;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.fillStyle = theme.text;
      ctx.font = '500 12px ' + fontBase;
      ctx.textBaseline = 'top';
      const labelIdx = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
      for (const i of labelIdx) {
        const label = formatX(xLabels[i]);
        ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        ctx.fillText(label, xAt(i), pad.top + h + 8);
      }

      if (options.yLabel) {
        ctx.save();
        ctx.fillStyle = theme.text;
        ctx.font = '600 11px ' + fontBase;
        ctx.translate(12, pad.top + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(options.yLabel, 0, 0);
        ctx.restore();
      }
      if (sec && dualY && (sec.yLabel || sec.unit)) {
        ctx.save();
        ctx.fillStyle = secColor;
        ctx.font = '600 11px ' + fontBase;
        ctx.translate(cssW - 12, pad.top + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sec.yLabel || sec.unit || '', 0, 0);
        ctx.restore();
      }
    }

    paint(null);

    function indexFromClientX(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      if (n <= 1) return 0;
      const t = (x - pad.left) / w;
      const idx = Math.round(t * (n - 1));
      return Math.max(0, Math.min(n - 1, idx));
    }

    function fmtNum(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return Number(v).toFixed(v >= 100 ? 0 : 2);
    }

    function bindHover(readoutEl) {
      const readableIndexes = [];
      for (let i = 0; i < n; i++) {
        const primaryReadable = Number.isFinite(seriesA[i]);
        const secondaryReadable = !!(sec && seriesB && Number.isFinite(seriesB[i]));
        if (primaryReadable || secondaryReadable) readableIndexes.push(i);
      }
      let keyboardCursor = Math.max(0, readableIndexes.length - 1);

      const selectIndex = (idx) => {
        if (idx == null || idx < 0 || idx >= n) return;
        const readablePosition = readableIndexes.indexOf(idx);
        if (readablePosition >= 0) keyboardCursor = readablePosition;
        paint(idx);
        if (readoutEl) {
          readoutEl.classList.add('is-hover');
          const xv = formatXFull(xLabels[idx]);
          let text = `${xv}  ·  ${fmtNum(seriesA[idx])}${options.unit ? ' ' + options.unit : ''}`;
          if (sec && seriesB) {
            text += `  ·  ${fmtNum(seriesB[idx])}${sec.unit ? ' ' + sec.unit : ''}`;
          }
          readoutEl.textContent = text;
        }
        if (typeof options.onHover === 'function') {
          options.onHover({ x: xLabels[idx], y: seriesA[idx] }, idx);
        }
      };
      const onMove = (clientX) => selectIndex(indexFromClientX(clientX));
      const onLeave = () => {
        paint(null);
        if (readoutEl) {
          readoutEl.classList.remove('is-hover');
          const lastA = [...seriesA].reverse().find((v) => v != null && Number.isFinite(v));
          const min = Math.min(...ys);
          const max = Math.max(...ys);
          let text =
            `${S.latest} ${fmtNum(lastA)}  ·  ${S.range} ${min.toFixed(min >= 100 ? 0 : 1)}–${max.toFixed(max >= 100 ? 0 : 1)}`;
          if (sec && seriesB) {
            const ys2 = seriesB.filter((v) => v != null && Number.isFinite(v));
            if (ys2.length) {
              const lastB = [...seriesB].reverse().find((v) => v != null && Number.isFinite(v));
              text += `  ·  ${sec.label || S.legendCompare || 'B'}: ${fmtNum(lastB)}`;
            }
          }
          readoutEl.textContent = text;
        }
      };
      canvas.addEventListener('pointermove', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerdown', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('focus', () => {
        if (readableIndexes.length) selectIndex(readableIndexes[keyboardCursor]);
      });
      canvas.addEventListener('keydown', (e) => {
        if (!readableIndexes.length) return;
        let nextCursor = keyboardCursor;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextCursor -= 1;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nextCursor += 1;
        else if (e.key === 'Home') nextCursor = 0;
        else if (e.key === 'End') nextCursor = readableIndexes.length - 1;
        else return;
        e.preventDefault();
        keyboardCursor = Math.max(0, Math.min(readableIndexes.length - 1, nextCursor));
        selectIndex(readableIndexes[keyboardCursor]);
      });
      canvas.addEventListener('blur', onLeave);
      onLeave();
      // Rendering is scheduled in requestAnimationFrame. If a keyboard user
      // focused the canvas before handlers finished binding, announce the
      // current point immediately instead of waiting for a second focus cycle.
      if (document.activeElement === canvas && readableIndexes.length) {
        selectIndex(readableIndexes[keyboardCursor]);
      }
    }

    return { paint, bindHover, points: plotPoints, yMin, yMax, dualY: !!dualY };
  }

  /**
   * AGP-style 24h percentile band chart (p5–p95 outer, p25–p75 IQR, p50 median).
   * @param {HTMLCanvasElement} canvas
   * @param {{ hour:number, p5:number|null, p25:number|null, p50:number|null, p75:number|null, p95:number|null, mean?:number|null, count?:number }[]} bins
   * @param {{ color?: string, yLabel?: string, thresholds?: {y:number,color:string,label?:string}[], unit?: string, strings?: object, locale?: string, onHover?: function }} options
   */
  function drawAgpBandChart(canvas, bins, options) {
    options = options || {};
    if (!canvas || !bins || !bins.length) {
      if (canvas) clearCanvas(canvas);
      return null;
    }

    const theme = themeColors();
    const S = options.strings || getStrings(resolveLocale(options));
    const color = options.color || theme.primary;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width || 320;
    const cssH = canvas.clientHeight || 200;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { top: 16, right: 12, bottom: 28, left: 44 };
    const w = cssW - pad.left - pad.right;
    const h = cssH - pad.top - pad.bottom;
    if (w <= 0 || h <= 0) return null;

    // Normalize to hour 0–23 map (prefer bin.hour)
    const byHour = new Array(24).fill(null);
    for (const b of bins) {
      const hour = Number.isFinite(b.hour) ? Math.round(b.hour) : -1;
      if (hour < 0 || hour > 23) continue;
      byHour[hour] = b;
    }

    function hasBand(b, loKey, hiKey) {
      return b && Number.isFinite(b[loKey]) && Number.isFinite(b[hiKey]);
    }
    function hasP50(b) {
      return b && Number.isFinite(b.p50);
    }

    const ys = [];
    for (const b of byHour) {
      if (!b) continue;
      for (const k of ['p5', 'p25', 'p50', 'p75', 'p95', 'mean']) {
        if (Number.isFinite(b[k])) ys.push(b[k]);
      }
    }
    if (ys.length === 0) {
      clearCanvas(canvas);
      return null;
    }

    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (options.thresholds) {
      for (const t of options.thresholds) {
        if (Number.isFinite(t.y)) {
          yMin = Math.min(yMin, t.y);
          yMax = Math.max(yMax, t.y);
        }
      }
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    const xAt = (hour) => pad.left + (hour / 23) * w;
    const yAt = (v) => pad.top + h - ((v - yMin) / (yMax - yMin)) * h;

    /** Consecutive hour indices with valid lo/hi */
    function bandSegments(loKey, hiKey) {
      const segs = [];
      let cur = null;
      for (let hour = 0; hour < 24; hour++) {
        const b = byHour[hour];
        if (hasBand(b, loKey, hiKey)) {
          if (!cur) cur = [];
          cur.push(hour);
        } else if (cur) {
          segs.push(cur);
          cur = null;
        }
      }
      if (cur) segs.push(cur);
      return segs;
    }

    function fillBand(loKey, hiKey, fillStyle) {
      const segs = bandSegments(loKey, hiKey);
      for (const seg of segs) {
        if (!seg.length) continue;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const hour = seg[i];
          const x = xAt(hour);
          const y = yAt(byHour[hour][hiKey]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = seg.length - 1; i >= 0; i--) {
          const hour = seg[i];
          const x = xAt(hour);
          const y = yAt(byHour[hour][loKey]);
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
    }

    function strokeMedian(strokeStyle, lineWidth) {
      const segs = [];
      let cur = null;
      for (let hour = 0; hour < 24; hour++) {
        if (hasP50(byHour[hour])) {
          if (!cur) cur = [];
          cur.push(hour);
        } else if (cur) {
          segs.push(cur);
          cur = null;
        }
      }
      if (cur) segs.push(cur);

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const seg of segs) {
        if (!seg.length) continue;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const hour = seg[i];
          const x = xAt(hour);
          const y = yAt(byHour[hour].p50);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function paint(activeHour) {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, cssW, cssH);

      const fontBase = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.55;
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const y = yAt(v);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.text;
      ctx.font = '500 12px ' + fontBase;
      for (let i = 0; i <= ticks; i++) {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const y = yAt(v);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), pad.left - 6, y);
      }

      if (options.thresholds) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.font = '500 11px ' + fontBase;
        for (const t of options.thresholds) {
          if (!Number.isFinite(t.y)) continue;
          const y = yAt(t.y);
          ctx.strokeStyle = t.color || '#e74c3c';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + w, y);
          ctx.stroke();
          if (t.label) {
            ctx.fillStyle = t.color || '#e74c3c';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(t.label, pad.left + 6, y - 3);
          }
        }
        ctx.restore();
      }

      // Outer p5–p95 then IQR p25–p75, then median
      fillBand('p5', 'p95', hexToRgba(color, 0.14));
      fillBand('p25', 'p75', hexToRgba(color, 0.32));
      strokeMedian(color, 2.25);

      // Endpoint dots on median where present at 0 / 23
      for (const hour of [0, 23]) {
        if (!hasP50(byHour[hour])) continue;
        const ex = xAt(hour);
        const ey = yAt(byHour[hour].p50);
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.bg;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (activeHour != null && activeHour >= 0 && activeHour < 24 && hasP50(byHour[activeHour])) {
        const ax = xAt(activeHour);
        const ay = yAt(byHour[activeHour].p50);
        ctx.save();
        ctx.strokeStyle = theme.label;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, pad.top);
        ctx.lineTo(ax, pad.top + h);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = theme.bg;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // X labels: 0, 6, 12, 18, 23
      ctx.fillStyle = theme.text;
      ctx.font = '500 12px ' + fontBase;
      ctx.textBaseline = 'top';
      const hourLabels = [0, 6, 12, 18, 23];
      for (const hour of hourLabels) {
        const label = String(hour).padStart(2, '0');
        ctx.textAlign = hour === 0 ? 'left' : hour === 23 ? 'right' : 'center';
        ctx.fillText(label, xAt(hour), pad.top + h + 8);
      }

      if (options.yLabel) {
        ctx.save();
        ctx.fillStyle = theme.text;
        ctx.font = '600 11px ' + fontBase;
        ctx.translate(12, pad.top + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(options.yLabel, 0, 0);
        ctx.restore();
      }
    }

    paint(null);

    function hourFromClientX(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const t = (x - pad.left) / w;
      const hour = Math.round(t * 23);
      return Math.max(0, Math.min(23, hour));
    }

    function nearestValidHour(hour) {
      if (hasP50(byHour[hour])) return hour;
      for (let d = 1; d < 24; d++) {
        if (hour - d >= 0 && hasP50(byHour[hour - d])) return hour - d;
        if (hour + d < 24 && hasP50(byHour[hour + d])) return hour + d;
      }
      return null;
    }

    function fmtVal(v) {
      if (!Number.isFinite(v)) return '—';
      return Number(v).toFixed(v >= 100 ? 0 : 2);
    }

    function summaryReadout() {
      const meds = byHour.filter(hasP50).map((b) => b.p50);
      if (!meds.length) return '';
      const unit = options.unit ? ' ' + options.unit : '';
      const min = Math.min(...meds);
      const max = Math.max(...meds);
      // Prefer noon-ish median as "latest" stand-in if present, else last valid
      let mid = byHour[12] && hasP50(byHour[12]) ? byHour[12].p50 : meds[meds.length - 1];
      return `${S.latest} ${fmtVal(mid)}${unit}  ·  ${S.range} ${fmtVal(min)}–${fmtVal(max)}${unit}`;
    }

    function bindHover(readoutEl) {
      const readableHours = byHour
        .map((bin, hour) => (hasP50(bin) ? hour : null))
        .filter((hour) => hour != null);
      let keyboardCursor = Math.max(0, readableHours.length - 1);

      const selectHour = (hour) => {
        if (hour == null) return;
        const readablePosition = readableHours.indexOf(hour);
        if (readablePosition >= 0) keyboardCursor = readablePosition;
        paint(hour);
        const b = byHour[hour];
        if (readoutEl && b) {
          readoutEl.classList.add('is-hover');
          const unit = options.unit ? ' ' + options.unit : '';
          const hh = String(hour).padStart(2, '0') + ':00';
          readoutEl.textContent =
            `${hh}  ·  p50 ${fmtVal(b.p50)}${unit}` +
            (hasBand(b, 'p25', 'p75') ? `  ·  IQR ${fmtVal(b.p25)}–${fmtVal(b.p75)}` : '') +
            (hasBand(b, 'p5', 'p95') ? `  ·  p5–p95 ${fmtVal(b.p5)}–${fmtVal(b.p95)}` : '');
        }
        if (typeof options.onHover === 'function') options.onHover(b, hour);
      };
      const onMove = (clientX) => {
        const raw = hourFromClientX(clientX);
        selectHour(nearestValidHour(raw));
      };
      const onLeave = () => {
        paint(null);
        if (readoutEl) {
          readoutEl.classList.remove('is-hover');
          readoutEl.textContent = summaryReadout();
        }
      };
      canvas.addEventListener('pointermove', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerdown', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('focus', () => {
        if (readableHours.length) selectHour(readableHours[keyboardCursor]);
      });
      canvas.addEventListener('keydown', (e) => {
        if (!readableHours.length) return;
        let nextCursor = keyboardCursor;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextCursor -= 1;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nextCursor += 1;
        else if (e.key === 'Home') nextCursor = 0;
        else if (e.key === 'End') nextCursor = readableHours.length - 1;
        else return;
        e.preventDefault();
        keyboardCursor = Math.max(0, Math.min(readableHours.length - 1, nextCursor));
        selectHour(readableHours[keyboardCursor]);
      });
      canvas.addEventListener('blur', onLeave);
      onLeave();
      if (document.activeElement === canvas && readableHours.length) {
        selectHour(readableHours[keyboardCursor]);
      }
    }

    return { paint, bindHover, byHour, yMin, yMax, summaryReadout };
  }

  function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function formatX(x) {
    const s = String(x);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10);
    return s.length > 10 ? s.slice(0, 10) : s;
  }

  function formatXFull(x) {
    const s = String(x);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 16).replace('T', ' ');
    return s;
  }

  function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(41,128,185,${alpha})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
  }

  function statsLine(points, unit, S) {
    S = S || STRINGS.zh;
    const ys = points.map((p) => p.y).filter(Number.isFinite);
    if (!ys.length) return '';
    const last = ys[ys.length - 1];
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const u = unit ? ' ' + unit : '';
    return `${S.latest} ${last.toFixed(last >= 100 ? 0 : 2)}${u}  ·  ${S.min} ${min.toFixed(min >= 100 ? 0 : 1)}${u}  ·  ${S.max} ${max.toFixed(max >= 100 ? 0 : 1)}${u}  ·  ${points.length} ${S.points}`;
  }

  function sliceByDays(points, days) {
    if (!points || !points.length) return [];
    if (!days || days <= 0) return points;
    const dates = points.map((p) => String(p.x).slice(0, 10)).filter(Boolean).sort();
    if (!dates.length) return points;
    const latest = dates[dates.length - 1];
    const cutoff = new Date(`${latest}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
    const cut = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => String(p.x).slice(0, 10) >= cut);
  }

  function rangeLabel(days, S) {
    S = S || STRINGS.zh;
    if (!days || days <= 0) return S.rangeAll;
    return fmt(S.rangeDays, { n: days });
  }

  /**
   * Build chart blocks from analysis (same logic as render, without DOM).
   * @returns {{ blocks: object[], cgmDays: number, seriesDays: number, localeKey: string, S: object }}
   */
  function buildChartBlocks(analysis, options) {
    options = options || {};
    const daysOpt = options.days;
    const localeKey = resolveLocale(options);
    const S = getStrings(localeKey);
    const blocks = [];
    if (!analysis || !analysis.data) {
      return { blocks, cgmDays: 7, seriesDays: 90, localeKey, S };
    }
    const data = analysis.data;
    const theme = themeColors();
    // 默认：CGM 看 7 天，其余看 90 天；用户 chips 会统一 days
    const cgmDays = daysOpt === undefined ? 7 : daysOpt;
    const seriesDays = daysOpt === undefined ? 90 : daysOpt;

    if (data.cgm && data.cgm.length > 0) {
      const sorted = [...data.cgm].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      let pts = sorted.map((p) => ({ x: p.datetime, y: p.value }));
      pts = sliceByDays(pts, cgmDays);
      pts = downsample(pts, 400);
      blocks.push({
        key: 'cgm',
        title: fmt(S.titleCgm, { range: rangeLabel(cgmDays, S) }),
        color: '#e74c3c',
        yLabel: 'mmol/L',
        unit: 'mmol/L',
        points: pts,
        thresholds: [
          { y: 3.9, color: '#e67e22', label: '3.9' },
          { y: 7.8, color: '#9b59b6', label: '7.8' },
        ],
        legend: [
          { color: '#e74c3c', label: S.legendGlucose, dashed: false },
          { color: '#e67e22', label: S.legendThr39, dashed: true },
          { color: '#9b59b6', label: S.legendThr78, dashed: true },
        ],
      });

      // AGP 14-day hourly percentile bands (independent of range chips)
      try {
        const HA = global.HealthAnalyzer;
        if (HA && typeof HA.buildCgm14DayReport === 'function') {
          const cgm14 = HA.buildCgm14DayReport(analysis, {
            locale: options.locale || localeKey,
          });
          if (
            cgm14 &&
            cgm14.hourlyProfile &&
            cgm14.hourlyProfile.some((b) => b && b.p50 != null && Number.isFinite(b.p50))
          ) {
            const agpColor = '#2980b9';
            blocks.push({
              key: 'agp',
              type: 'agp',
              title: S.titleAgp,
              subtitle: cgm14.sufficient ? null : S.agpInsufficientHint,
              color: agpColor,
              yLabel: 'mmol/L',
              unit: 'mmol/L',
              bins: cgm14.hourlyProfile,
              thresholds: [
                { y: 3.9, color: '#e67e22', label: '3.9' },
                { y: 7.8, color: '#9b59b6', label: '7.8' },
                { y: 10.0, color: '#c0392b', label: '10.0' },
              ],
              legend: [
                { color: hexToRgba(agpColor, 0.22), label: S.legendP5P95, band: true },
                { color: hexToRgba(agpColor, 0.45), label: S.legendP25P75, band: true },
                { color: agpColor, label: S.legendP50, dashed: false },
                { color: '#e67e22', label: S.legendThr39, dashed: true },
                { color: '#c0392b', label: S.legendThr10, dashed: true },
              ],
            });
          }
        }
      } catch (e) {
        /* AGP optional — ignore build failures */
      }
    }

    const trend = analysis.weightStats && analysis.weightStats.trendSeries;
    if (trend && trend.length > 0) {
      let recent = trend.map((w) => ({ x: w.date, y: w.weight, bodyFat: w.bodyFat }));
      recent = sliceByDays(recent, seriesDays);
      blocks.push({
        key: 'weight',
        title: fmt(S.titleWeightTrend, { range: rangeLabel(seriesDays, S) }),
        color: '#1abc9c',
        yLabel: 'kg',
        unit: 'kg',
        points: recent.map((w) => ({ x: w.x, y: w.y })),
        legend: [{ color: '#1abc9c', label: S.legendWeightTrend, dashed: false }],
      });
      const fatPts = recent.filter((w) => w.bodyFat != null && Number.isFinite(w.bodyFat));
      if (fatPts.length >= 2) {
        blocks.push({
          key: 'bodyfat',
          title: fmt(S.titleBodyFat, { range: rangeLabel(seriesDays, S) }),
          color: '#9b59b6',
          yLabel: '%',
          unit: '%',
          points: fatPts.map((w) => ({ x: w.x, y: w.bodyFat })),
          legend: [{ color: '#9b59b6', label: S.legendBodyFat, dashed: false }],
        });
      }
    } else if (data.weight && data.weight.length > 0) {
      const sorted = [...data.weight].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      let recent = sorted.map((w) => ({ x: w.datetime || w.date, y: w.value }));
      recent = sliceByDays(recent, seriesDays);
      blocks.push({
        key: 'weight',
        title: fmt(S.titleWeight, { range: rangeLabel(seriesDays, S) }),
        color: '#1abc9c',
        yLabel: 'kg',
        unit: 'kg',
        points: recent,
        legend: [{ color: '#1abc9c', label: S.legendWeight, dashed: false }],
      });
    }

    const hrvByDate = analysis.hrvByDate || {};
    const hrvDates = Object.keys(hrvByDate).sort();
    if (hrvDates.length > 0) {
      let pts = hrvDates.map((d) => ({ x: d, y: hrvByDate[d].allMean }));
      const hrvDays = daysOpt === undefined ? 30 : daysOpt;
      pts = sliceByDays(pts, hrvDays);
      blocks.push({
        key: 'hrv',
        title: fmt(S.titleHrv, { range: rangeLabel(hrvDays, S) }),
        color: theme.primary,
        yLabel: 'ms',
        unit: 'ms',
        points: pts,
        legend: [{ color: theme.primary, label: S.legendHrv, dashed: false }],
      });
    }

    if (analysis.bpStats && analysis.bpStats.records && analysis.bpStats.records.length > 0) {
      let pts = analysis.bpStats.records.map((r) => ({ x: r.datetime, y: r.systolic }));
      const bpDays = daysOpt === undefined ? 90 : daysOpt;
      pts = sliceByDays(pts, bpDays);
      // 点数过多时降采样
      if (pts.length > 120) pts = downsample(pts, 120);
      blocks.push({
        key: 'bp',
        title: fmt(S.titleBp, { range: rangeLabel(bpDays, S) }),
        color: '#e74c3c',
        yLabel: 'mmHg',
        unit: 'mmHg',
        points: pts,
        thresholds: [
          { y: 90, color: '#e67e22', label: '90' },
          { y: 140, color: '#c0392b', label: '140' },
        ],
        legend: [
          { color: '#e74c3c', label: S.legendSys, dashed: false },
          { color: '#e67e22', label: '90', dashed: true },
          { color: '#c0392b', label: '140', dashed: true },
        ],
      });
    }

    const wdays = analysis.watchStats && analysis.watchStats.days;
    if (wdays && wdays.length > 0) {
      const watchDays = daysOpt === undefined ? 30 : daysOpt;
      let spo2Pts = wdays
        .filter((d) => d.spo2Mean != null && Number.isFinite(d.spo2Mean))
        .map((d) => ({ x: d.date, y: d.spo2Mean }));
      spo2Pts = sliceByDays(spo2Pts, watchDays);
      if (spo2Pts.length >= 2) {
        blocks.push({
          key: 'spo2',
          title: fmt(S.titleSpo2, { range: rangeLabel(watchDays, S) }),
          color: '#3498db',
          yLabel: '%',
          unit: '%',
          points: spo2Pts,
          thresholds: [
            { y: 95, color: '#e67e22', label: '95' },
            { y: 92, color: '#c0392b', label: '92' },
          ],
          legend: [
            { color: '#3498db', label: S.legendSpo2, dashed: false },
            { color: '#e67e22', label: '95%', dashed: true },
            { color: '#c0392b', label: '92%', dashed: true },
          ],
        });
      }
      let exPts = wdays
        .filter((d) => d.exerciseMin != null && Number.isFinite(d.exerciseMin))
        .map((d) => ({ x: d.date, y: d.exerciseMin }));
      exPts = sliceByDays(exPts, watchDays);
      // 过滤全 0 序列
      if (exPts.length >= 2 && exPts.some((p) => p.y > 0)) {
        blocks.push({
          key: 'exercise',
          title: fmt(S.titleExercise, { range: rangeLabel(watchDays, S) }),
          color: '#27ae60',
          yLabel: 'min',
          unit: 'min',
          points: exPts,
          legend: [{ color: '#27ae60', label: S.legendExercise, dashed: false }],
        });
      }
      let vo2Pts = wdays
        .filter((d) => d.vo2Max != null && Number.isFinite(d.vo2Max))
        .map((d) => ({ x: d.date, y: d.vo2Max }));
      vo2Pts = sliceByDays(vo2Pts, watchDays === 0 ? 0 : Math.max(watchDays, 90));
      if (vo2Pts.length >= 2) {
        blocks.push({
          key: 'vo2',
          title: fmt(S.titleVo2, {
            range: rangeLabel(watchDays === 0 ? 0 : Math.max(watchDays, 90), S),
          }),
          color: '#8e44ad',
          yLabel: 'mL/kg/min',
          unit: 'mL/kg/min',
          points: vo2Pts,
          legend: [{ color: '#8e44ad', label: S.legendVo2, dashed: false }],
        });
      }
      let nightSpo2 = wdays
        .filter((d) => d.spo2NightMean != null && Number.isFinite(d.spo2NightMean))
        .map((d) => ({ x: d.date, y: d.spo2NightMean }));
      nightSpo2 = sliceByDays(nightSpo2, watchDays);
      if (nightSpo2.length >= 2) {
        blocks.push({
          key: 'spo2-night',
          title: fmt(S.titleSpo2Night, { range: rangeLabel(watchDays, S) }),
          color: '#2980b9',
          yLabel: '%',
          unit: '%',
          points: nightSpo2,
          thresholds: [
            { y: 95, color: '#e67e22', label: '95' },
            { y: 92, color: '#c0392b', label: '92' },
          ],
          legend: [
            { color: '#2980b9', label: S.legendSpo2Night, dashed: false },
            { color: '#e67e22', label: '95%', dashed: true },
            { color: '#c0392b', label: '92%', dashed: true },
          ],
        });
      }
      let bdPts = wdays
        .filter((d) => d.breathingDisturbance != null && Number.isFinite(d.breathingDisturbance))
        .map((d) => ({ x: d.date, y: d.breathingDisturbance }));
      bdPts = sliceByDays(bdPts, watchDays === 0 ? 0 : Math.max(watchDays, 30));
      if (bdPts.length >= 2) {
        blocks.push({
          key: 'breathing',
          title: fmt(S.titleBreathing, {
            range: rangeLabel(watchDays === 0 ? 0 : Math.max(watchDays, 30), S),
          }),
          color: '#16a085',
          yLabel: 'BD',
          unit: '',
          points: bdPts,
          legend: [{ color: '#16a085', label: S.legendBreathing, dashed: false }],
        });
      }
    }

    const wos = analysis.workoutStats;
    if (wos && wos.sessions && wos.sessions.length > 0) {
      const workoutDays = daysOpt === undefined ? 90 : daysOpt;
      // 按日汇总时长
      const byDate = {};
      for (const s of wos.sessions) {
        if (!byDate[s.date]) byDate[s.date] = 0;
        byDate[s.date] += s.durationMin || 0;
      }
      let wPts = Object.keys(byDate)
        .sort()
        .map((d) => ({ x: d, y: byDate[d] }));
      wPts = sliceByDays(wPts, workoutDays);
      if (wPts.length >= 2 && wPts.some((p) => p.y > 0)) {
        blocks.push({
          key: 'workout',
          title: fmt(S.titleWorkout, { range: rangeLabel(workoutDays, S) }),
          color: '#d35400',
          yLabel: 'min',
          unit: 'min',
          points: wPts,
          legend: [{ color: '#d35400', label: S.legendWorkout, dashed: false }],
        });
      }
    }

    // 多周恢复 / 负荷（周粒度，不受日 chips 裁剪）
    const rWeeks = analysis.recoveryWeeks;
    if (rWeeks && rWeeks.length >= 2) {
      const recPts = rWeeks
        .filter((p) => p.recoveryScore != null && Number.isFinite(p.recoveryScore))
        .map((p) => ({ x: p.weekEnd, y: p.recoveryScore }));
      if (recPts.length >= 2) {
        blocks.push({
          key: 'recovery',
          title: fmt(S.titleRecovery, { n: rWeeks.length }),
          color: '#16a085',
          yLabel: S.unitScore,
          unit: S.unitScore,
          points: recPts,
          legend: [{ color: '#16a085', label: S.legendRecovery, dashed: false }],
        });
      }
      const loadPts = rWeeks
        .filter((p) => p.loadScore != null && Number.isFinite(p.loadScore))
        .map((p) => ({ x: p.weekEnd, y: p.loadScore }));
      if (loadPts.length >= 2) {
        blocks.push({
          key: 'load',
          title: fmt(S.titleLoad, { n: rWeeks.length }),
          color: '#e67e22',
          yLabel: S.unitScore,
          unit: S.unitScore,
          points: loadPts,
          legend: [{ color: '#e67e22', label: S.legendLoad, dashed: false }],
        });
      }
    }

    return { blocks, cgmDays, seriesDays, localeKey, S };
  }

  /**
   * List selectable metric keys (excludes AGP — shown with CGM).
   * @returns {{ key: string, label: string }[]}
   */
  function listAvailableChartKeys(analysis, options) {
    const built = buildChartBlocks(analysis, options || {});
    const S = built.S;
    const seen = {};
    const out = [];
    for (const b of built.blocks) {
      if (!b || !b.key || b.key === 'agp') continue;
      if (seen[b.key]) continue;
      seen[b.key] = true;
      const lk = METRIC_LABEL_KEYS[b.key];
      out.push({ key: b.key, label: (lk && S[lk]) || b.key });
    }
    return out;
  }

  /**
   * Filter / order blocks for workbench (primary + optional compare).
   * AGP is kept when primary is cgm.
   */
  function applyWorkbenchFilter(blocks, options) {
    options = options || {};
    const primaryKey = options.primaryKey ? String(options.primaryKey) : '';
    const compareKey = options.compareKey ? String(options.compareKey) : '';
    if (!primaryKey) return blocks.slice();

    const byKey = {};
    for (const b of blocks) {
      if (b && b.key) byKey[b.key] = b;
    }
    const ordered = [];
    if (byKey[primaryKey]) ordered.push(byKey[primaryKey]);
    // CGM primary also shows AGP profile when available
    if (primaryKey === 'cgm' && byKey.agp) ordered.push(byKey.agp);
    if (compareKey && compareKey !== primaryKey && byKey[compareKey]) {
      ordered.push(byKey[compareKey]);
    }
    // Fallback: if primary missing, show all
    if (!ordered.length) return blocks.slice();
    return ordered;
  }

  /**
   * 从 FullAnalysis 渲染可用图表
   * @param {HTMLElement} container
   * @param {object} analysis
   * @param {{
   *   days?: number,
   *   locale?: string,
   *   primaryKey?: string,
   *   compareKey?: string,
   *   showBaseline?: boolean,
   *   events?: { date: string, title?: string }[],
   * }} options days: 7|30|90|0(全部)；CGM 默认 7，体重/HRV/BP 默认 90
   */
  function renderAnalysisCharts(container, analysis, options) {
    options = options || {};
    if (!container) return;
    container.innerHTML = '';

    const built = buildChartBlocks(analysis, options);
    const S = built.S;
    let blocks = built.blocks;
    const daysOpt = options.days;

    if (!analysis || !analysis.data) {
      container.innerHTML = `<div class="chart-empty">${S.emptyNoData}</div>`;
      return;
    }

    if (options.primaryKey) {
      blocks = applyWorkbenchFilter(blocks, options);
    }

    if (blocks.length === 0) {
      container.innerHTML = `<div class="chart-empty">${S.emptyInsufficient}</div>`;
      return;
    }

    // v1.70: compare overlays on primary (dual-Y when units differ); AGP stays separate
    const compareKey = options.compareKey ? String(options.compareKey) : '';
    const primaryKey = options.primaryKey ? String(options.primaryKey) : '';
    const compareBlock =
      compareKey && primaryKey && compareKey !== primaryKey
        ? blocks.find((b) => b.key === compareKey && b.type !== 'agp' && b.points && b.points.length)
        : null;
    const hasCompare = !!compareBlock;
    // Overlay mode — single column (no dual sticky cards)
    container.classList.remove('charts-content--compare');
    if (hasCompare) container.classList.add('charts-content--overlay');
    else container.classList.remove('charts-content--overlay');

    const events = Array.isArray(options.events) ? options.events : [];
    const showBaseline = !!options.showBaseline;
    let chartOrdinal = 0;

    for (const b of blocks) {
      const isAgp = b.type === 'agp';
      // Skip standalone compare chart — drawn as secondary on primary
      if (hasCompare && b.key === compareKey) continue;
      if (!isAgp && (!b.points || b.points.length === 0)) continue;
      if (isAgp && (!b.bins || !b.bins.length)) continue;
      const currentChartOrdinal = chartOrdinal++;

      const isPrimaryOverlay =
        hasCompare && b.key === primaryKey && !isAgp && compareBlock;

      const wrap = document.createElement('div');
      let roleClass = '';
      if (b.key && primaryKey && b.key === primaryKey) {
        roleClass = ' chart-block-primary' + (isPrimaryOverlay ? ' chart-block-overlay' : '');
      } else if (b.key === 'agp' && primaryKey === 'cgm') roleClass = ' chart-block-primary-aux';
      wrap.className = 'chart-block' + (isAgp ? ' chart-block-agp' : '') + roleClass;
      if (b.key) wrap.setAttribute('data-chart', b.key);
      if (isPrimaryOverlay) wrap.setAttribute('data-compare', compareKey);
      wrap.id = b.key ? `chart-block-${b.key}` : undefined;

      // Conclusion summary (line charts only; non-diagnostic)
      if (!isAgp && b.points) {
        const rangeForBlock =
          b.key === 'cgm'
            ? (daysOpt === undefined ? 7 : daysOpt)
            : (daysOpt === undefined ? 90 : daysOpt);
        const conclusion = chartConclusion(b.points, rangeForBlock, S);
        if (conclusion) {
          const sum = document.createElement('p');
          sum.className = 'chart-conclusion';
          sum.textContent = conclusion;
          wrap.appendChild(sum);
        }
      }

      const title = document.createElement('h3');
      if (isPrimaryOverlay) {
        const pName = (b.legend && b.legend[0] && b.legend[0].label) || b.title;
        const cName =
          (compareBlock.legend && compareBlock.legend[0] && compareBlock.legend[0].label) ||
          compareBlock.title;
        title.textContent = fmt(S.overlayTitle || '{primary} + {compare}', {
          primary: pName,
          compare: cName,
        });
      } else {
        title.textContent = b.title;
      }
      wrap.appendChild(title);

      if (b.subtitle) {
        const sub = document.createElement('p');
        sub.className = 'chart-subtitle';
        sub.textContent = b.subtitle;
        wrap.appendChild(sub);
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'chart-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', title.textContent + S.ariaInteractive);
      canvas.tabIndex = 0;
      wrap.appendChild(canvas);

      // Legend (+ baseline / events / compare when enabled)
      const legendItems = (b.legend && b.legend.slice()) || [];
      if (isPrimaryOverlay && compareBlock) {
        legendItems.push({
          color: compareBlock.color || '#e67e22',
          label:
            (compareBlock.legend && compareBlock.legend[0] && compareBlock.legend[0].label) ||
            S.legendCompare,
          dashed: true,
        });
      }
      if (!isAgp && showBaseline) {
        legendItems.push({
          color: '#7f8c8d',
          label: S.legendBaseline,
          dashed: true,
        });
      }
      if (!isAgp && events.length) {
        legendItems.push({
          color: '#95a5a6',
          label: S.legendEvents,
          dashed: true,
        });
      }
      if (legendItems.length) {
        const legend = document.createElement('div');
        legend.className = 'chart-legend';
        legend.innerHTML = legendItems.map((item) => {
          let sw;
          if (item.band) {
            sw = `<span class="chart-legend-swatch band" style="background:${item.color}"></span>`;
          } else if (item.dashed) {
            sw = `<span class="chart-legend-swatch dashed" style="color:${item.color}"></span>`;
          } else {
            sw = `<span class="chart-legend-swatch" style="background:${item.color}"></span>`;
          }
          return `<span class="chart-legend-item">${sw}${item.label}</span>`;
        }).join('');
        wrap.appendChild(legend);
      }

      const readout = document.createElement('div');
      readout.className = 'chart-readout';
      readout.id = `chart-readout-${currentChartOrdinal}`;
      readout.setAttribute('aria-live', 'polite');
      readout.setAttribute('aria-atomic', 'true');
      canvas.setAttribute('aria-describedby', readout.id);
      if (!isAgp) {
        readout.textContent = statsLine(b.points, b.unit, S);
      }
      wrap.appendChild(readout);

      container.appendChild(wrap);

      // Baseline: median of series in view
      let baselineOpt = null;
      if (!isAgp && showBaseline && b.points) {
        const med = medianOf(b.points.map((p) => p.y));
        if (med != null) {
          baselineOpt = {
            y: med,
            color: '#7f8c8d',
            label: S.legendBaseline,
          };
        }
      }
      const eventsOpt = !isAgp && events.length ? events : null;
      const secondaryOpt =
        isPrimaryOverlay && compareBlock
          ? {
              points: compareBlock.points,
              color: compareBlock.color || '#e67e22',
              unit: compareBlock.unit,
              yLabel: compareBlock.yLabel || compareBlock.unit,
              label:
                (compareBlock.legend && compareBlock.legend[0] && compareBlock.legend[0].label) ||
                S.legendCompare,
            }
          : null;

      requestAnimationFrame(() => {
        if (isAgp) {
          const api = drawAgpBandChart(canvas, b.bins, {
            color: b.color,
            yLabel: b.yLabel,
            thresholds: b.thresholds,
            unit: b.unit,
            strings: S,
            locale: options.locale,
          });
          if (api && api.bindHover) api.bindHover(readout);
        } else {
          const api = drawLineChart(canvas, b.points, {
            color: b.color,
            yLabel: b.yLabel,
            thresholds: b.thresholds,
            unit: b.unit,
            strings: S,
            locale: options.locale,
            baseline: baselineOpt,
            events: eventsOpt,
            secondary: secondaryOpt,
          });
          if (api && api.bindHover) api.bindHover(readout);
        }
      });
    }
  }

  global.HealthCharts = {
    drawLineChart,
    drawAgpBandChart,
    downsample,
    renderAnalysisCharts,
    listAvailableChartKeys,
    chartConclusion,
    medianOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
