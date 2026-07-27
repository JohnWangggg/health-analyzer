/**
 * 轻量 Canvas 折线图（无第三方依赖）
 * 暴露 window.HealthCharts
 */
(function (global) {
  'use strict';

  function downsample(points, maxPoints) {
    if (!points || points.length <= maxPoints) return points || [];
    const step = (points.length - 1) / (maxPoints - 1);
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
      out.push(points[Math.round(i * step)]);
    }
    return out;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ label: string, x: number|string, y: number }[]} points
   * @param {{ color?: string, yLabel?: string, fill?: boolean, thresholds?: {y:number,color:string,label?:string}[] }} options
   */
  function drawLineChart(canvas, points, options) {
    options = options || {};
    if (!canvas || !points || points.length === 0) {
      if (canvas) clearCanvas(canvas);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width || 320;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { top: 16, right: 12, bottom: 28, left: 44 };
    const w = cssW - pad.left - pad.right;
    const h = cssH - pad.top - pad.bottom;
    if (w <= 0 || h <= 0) return;

    const ys = points.map((p) => p.y).filter(Number.isFinite);
    if (ys.length === 0) return;
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

    // background
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#fbfcfe';
    ctx.fillRect(0, 0, cssW, cssH);

    // grid + y ticks
    ctx.strokeStyle = '#e8eef4';
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + ((yMax - yMin) * i) / ticks;
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), pad.left - 6, y);
    }

    // thresholds
    if (options.thresholds) {
      for (const t of options.thresholds) {
        if (!Number.isFinite(t.y)) continue;
        const y = yAt(t.y);
        ctx.strokeStyle = t.color || '#e74c3c';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (t.label) {
          ctx.fillStyle = t.color || '#e74c3c';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(t.label, pad.left + 4, y - 2);
        }
      }
    }

    const color = options.color || '#2980b9';

    // fill under line
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

    // line
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

    // endpoints
    for (const i of [0, n - 1]) {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(points[i].y), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // x labels (first / mid / last)
    ctx.fillStyle = '#7f8c8d';
    ctx.textBaseline = 'top';
    const labelIdx = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
    for (const i of labelIdx) {
      const label = formatX(points[i].x);
      ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
      ctx.fillText(label, xAt(i), pad.top + h + 8);
    }

    if (options.yLabel) {
      ctx.save();
      ctx.fillStyle = '#95a5a6';
      ctx.translate(12, pad.top + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.yLabel, 0, 0);
      ctx.restore();
    }
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

  function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(41,128,185,${alpha})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
  }

  /**
   * 从 FullAnalysis 渲染可用图表
   * @param {HTMLElement} container
   * @param {object} analysis
   */
  function renderAnalysisCharts(container, analysis) {
    if (!container) return;
    container.innerHTML = '';
    if (!analysis || !analysis.data) {
      container.innerHTML = '<p class="hint">暂无图表数据</p>';
      return;
    }

    const blocks = [];
    const data = analysis.data;

    // CGM：最近 7 天点，降采样
    if (data.cgm && data.cgm.length > 0) {
      const sorted = [...data.cgm].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      const lastDt = sorted[sorted.length - 1].datetime;
      const lastDate = String(lastDt).slice(0, 10);
      const cutoffDate = new Date(`${lastDate}T00:00:00Z`);
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 6);
      const cut = cutoffDate.toISOString().slice(0, 10);
      const recent = sorted.filter((p) => String(p.datetime).slice(0, 10) >= cut);
      const pts = downsample(
        recent.map((p) => ({ x: p.datetime, y: p.value, label: p.datetime })),
        400
      );
      blocks.push({
        title: '🩸 CGM（最近约 7 天）',
        color: '#c0392b',
        yLabel: 'mmol/L',
        points: pts,
        thresholds: [
          { y: 3.9, color: '#e67e22', label: '3.9' },
          { y: 7.8, color: '#8e44ad', label: '7.8' },
        ],
      });
    }

    // 体重
    if (data.weight && data.weight.length > 0) {
      const sorted = [...data.weight].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      const recent = sorted.slice(-90);
      blocks.push({
        title: '⚖️ 体重（最多 90 条）',
        color: '#16a085',
        yLabel: 'kg',
        points: recent.map((w) => ({ x: w.datetime || w.date, y: w.value })),
      });
    }

    // HRV 日均
    const hrvByDate = analysis.hrvByDate || {};
    const hrvDates = Object.keys(hrvByDate).sort();
    if (hrvDates.length > 0) {
      const recent = hrvDates.slice(-30);
      blocks.push({
        title: '📊 HRV 全天均值（最近最多 30 天）',
        color: '#2980b9',
        yLabel: 'ms',
        points: recent.map((d) => ({ x: d, y: hrvByDate[d].allMean })),
      });
    }

    // 血压
    if (analysis.bpStats && analysis.bpStats.records && analysis.bpStats.records.length > 0) {
      const recs = analysis.bpStats.records.slice(-40);
      blocks.push({
        title: '❤️ 收缩压（最近最多 40 条）',
        color: '#e74c3c',
        yLabel: 'mmHg',
        points: recs.map((r) => ({ x: r.datetime, y: r.systolic })),
        thresholds: [
          { y: 90, color: '#e67e22', label: '90' },
          { y: 140, color: '#c0392b', label: '140' },
        ],
      });
    }

    if (blocks.length === 0) {
      container.innerHTML = '<p class="hint">当前数据维度不足以绘制趋势图。</p>';
      return;
    }

    for (const b of blocks) {
      if (!b.points || b.points.length === 0) continue;
      const wrap = document.createElement('div');
      wrap.className = 'chart-block';
      const title = document.createElement('h3');
      title.textContent = b.title;
      const canvas = document.createElement('canvas');
      canvas.className = 'chart-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', b.title);
      wrap.appendChild(title);
      wrap.appendChild(canvas);
      container.appendChild(wrap);
      // layout then draw
      requestAnimationFrame(() => {
        drawLineChart(canvas, b.points, {
          color: b.color,
          yLabel: b.yLabel,
          thresholds: b.thresholds,
        });
      });
    }
  }

  global.HealthCharts = {
    drawLineChart,
    downsample,
    renderAnalysisCharts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
