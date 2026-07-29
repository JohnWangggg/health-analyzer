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
      ariaInteractive: '，可按住查看读数',
      titleCgm: 'CGM（{range}）',
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
      ariaInteractive: ', hold to read values',
      titleCgm: 'CGM ({range})',
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
    },
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
   * @param {HTMLCanvasElement} canvas
   * @param {{ label: string, x: number|string, y: number }[]} points
   * @param {{ color?: string, yLabel?: string, fill?: boolean, thresholds?: {y:number,color:string,label?:string}[], onHover?: function, unit?: string, strings?: object }} options
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

    const pad = { top: 16, right: 12, bottom: 28, left: 44 };
    const w = cssW - pad.left - pad.right;
    const h = cssH - pad.top - pad.bottom;
    if (w <= 0 || h <= 0) return null;

    const ys = points.map((p) => p.y).filter(Number.isFinite);
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
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    const n = points.length;
    const xAt = (i) => pad.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const yAt = (v) => pad.top + h - ((v - yMin) / (yMax - yMin)) * h;

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

      const color = options.color || theme.primary;

      if (options.fill !== false) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xAt(i);
          const y = yAt(points[i].y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(xAt(n - 1), pad.top + h);
        ctx.lineTo(xAt(0), pad.top + h);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.fill();
      }

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xAt(i);
        const y = yAt(points[i].y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      for (const i of [0, n - 1]) {
        const ex = xAt(i), ey = yAt(points[i].y);
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
        const ay = yAt(points[activeIndex].y);
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

      ctx.fillStyle = theme.text;
      ctx.font = '500 12px ' + fontBase;
      ctx.textBaseline = 'top';
      const labelIdx = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
      for (const i of labelIdx) {
        const label = formatX(points[i].x);
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

    function bindHover(readoutEl) {
      const onMove = (clientX) => {
        const idx = indexFromClientX(clientX);
        paint(idx);
        const p = points[idx];
        if (readoutEl && p) {
          readoutEl.classList.add('is-hover');
          const xv = formatXFull(p.x);
          readoutEl.textContent = `${xv}  ·  ${Number(p.y).toFixed(p.y >= 100 ? 0 : 2)}${options.unit ? ' ' + options.unit : ''}`;
        }
        if (typeof options.onHover === 'function') options.onHover(points[idx], idx);
      };
      const onLeave = () => {
        paint(null);
        if (readoutEl) {
          readoutEl.classList.remove('is-hover');
          const last = points[n - 1];
          const min = Math.min(...ys);
          const max = Math.max(...ys);
          readoutEl.textContent =
            `${S.latest} ${Number(last.y).toFixed(last.y >= 100 ? 0 : 2)}  ·  ${S.range} ${min.toFixed(min >= 100 ? 0 : 1)}–${max.toFixed(max >= 100 ? 0 : 1)}`;
        }
      };
      canvas.addEventListener('pointermove', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerdown', (e) => onMove(e.clientX));
      canvas.addEventListener('pointerleave', onLeave);
      onLeave();
    }

    return { paint, bindHover, points, yMin, yMax };
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
   * 从 FullAnalysis 渲染可用图表
   * @param {HTMLElement} container
   * @param {object} analysis
   * @param {{ days?: number, locale?: string }} options days: 7|30|90|0(全部)；CGM 默认 7，体重/HRV/BP 默认 90
   */
  function renderAnalysisCharts(container, analysis, options) {
    options = options || {};
    const daysOpt = options.days;
    const localeKey = resolveLocale(options);
    const S = getStrings(localeKey);
    if (!container) return;
    container.innerHTML = '';
    if (!analysis || !analysis.data) {
      container.innerHTML = `<div class="chart-empty">${S.emptyNoData}</div>`;
      return;
    }

    const blocks = [];
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

    if (blocks.length === 0) {
      container.innerHTML = `<div class="chart-empty">${S.emptyInsufficient}</div>`;
      return;
    }

    for (const b of blocks) {
      if (!b.points || b.points.length === 0) continue;
      const wrap = document.createElement('div');
      wrap.className = 'chart-block';
      if (b.key) wrap.setAttribute('data-chart', b.key);
      wrap.id = b.key ? `chart-block-${b.key}` : undefined;

      const title = document.createElement('h3');
      title.textContent = b.title;
      wrap.appendChild(title);

      const canvas = document.createElement('canvas');
      canvas.className = 'chart-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', b.title + S.ariaInteractive);
      wrap.appendChild(canvas);

      if (b.legend && b.legend.length) {
        const legend = document.createElement('div');
        legend.className = 'chart-legend';
        legend.innerHTML = b.legend.map((item) => {
          const sw = item.dashed
            ? `<span class="chart-legend-swatch dashed" style="color:${item.color}"></span>`
            : `<span class="chart-legend-swatch" style="background:${item.color}"></span>`;
          return `<span class="chart-legend-item">${sw}${item.label}</span>`;
        }).join('');
        wrap.appendChild(legend);
      }

      const readout = document.createElement('div');
      readout.className = 'chart-readout';
      readout.textContent = statsLine(b.points, b.unit, S);
      wrap.appendChild(readout);

      container.appendChild(wrap);
      requestAnimationFrame(() => {
        const api = drawLineChart(canvas, b.points, {
          color: b.color,
          yLabel: b.yLabel,
          thresholds: b.thresholds,
          unit: b.unit,
          strings: S,
          locale: options.locale,
        });
        if (api && api.bindHover) api.bindHover(readout);
      });
    }
  }

  global.HealthCharts = {
    drawLineChart,
    downsample,
    renderAnalysisCharts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
