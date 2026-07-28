/**
 * 轻量 Canvas 折线图（无第三方依赖）
 * 暴露 window.HealthCharts；颜色跟随 CSS 变量（支持暗色模式）
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
   * @param {{ color?: string, yLabel?: string, fill?: boolean, thresholds?: {y:number,color:string,label?:string}[], onHover?: function }} options
   */
  function drawLineChart(canvas, points, options) {
    options = options || {};
    if (!canvas || !points || points.length === 0) {
      if (canvas) clearCanvas(canvas);
      return null;
    }

    const theme = themeColors();
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

      ctx.strokeStyle = theme.grid;
      ctx.fillStyle = theme.label;
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
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(points[i].y), 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (activeIndex != null && activeIndex >= 0 && activeIndex < n) {
        const ax = xAt(activeIndex);
        const ay = yAt(points[activeIndex].y);
        ctx.strokeStyle = theme.label;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, pad.top);
        ctx.lineTo(ax, pad.top + h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = theme.bg;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = theme.label;
      ctx.textBaseline = 'top';
      const labelIdx = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
      for (const i of labelIdx) {
        const label = formatX(points[i].x);
        ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        ctx.fillText(label, xAt(i), pad.top + h + 8);
      }

      if (options.yLabel) {
        ctx.save();
        ctx.fillStyle = theme.label;
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
          const xv = formatXFull(p.x);
          readoutEl.textContent = `${xv}  ·  ${Number(p.y).toFixed(p.y >= 100 ? 0 : 2)}${options.unit ? ' ' + options.unit : ''}`;
        }
        if (typeof options.onHover === 'function') options.onHover(points[idx], idx);
      };
      const onLeave = () => {
        paint(null);
        if (readoutEl) {
          const last = points[n - 1];
          const min = Math.min(...ys);
          const max = Math.max(...ys);
          readoutEl.textContent = `最新 ${Number(last.y).toFixed(last.y >= 100 ? 0 : 2)}  ·  范围 ${min.toFixed(min >= 100 ? 0 : 1)}–${max.toFixed(max >= 100 ? 0 : 1)}`;
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

  function statsLine(points, unit) {
    const ys = points.map((p) => p.y).filter(Number.isFinite);
    if (!ys.length) return '';
    const last = ys[ys.length - 1];
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const u = unit ? ' ' + unit : '';
    return `最新 ${last.toFixed(last >= 100 ? 0 : 2)}${u}  ·  最低 ${min.toFixed(min >= 100 ? 0 : 1)}${u}  ·  最高 ${max.toFixed(max >= 100 ? 0 : 1)}${u}  ·  ${points.length} 点`;
  }

  /**
   * 从 FullAnalysis 渲染可用图表
   */
  function renderAnalysisCharts(container, analysis) {
    if (!container) return;
    container.innerHTML = '';
    if (!analysis || !analysis.data) {
      container.innerHTML = '<div class="chart-empty">暂无图表数据</div>';
      return;
    }

    const blocks = [];
    const data = analysis.data;
    const theme = themeColors();

    if (data.cgm && data.cgm.length > 0) {
      const sorted = [...data.cgm].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      const lastDate = String(sorted[sorted.length - 1].datetime).slice(0, 10);
      const cutoffDate = new Date(`${lastDate}T00:00:00Z`);
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 6);
      const cut = cutoffDate.toISOString().slice(0, 10);
      const recent = sorted.filter((p) => String(p.datetime).slice(0, 10) >= cut);
      const pts = downsample(
        recent.map((p) => ({ x: p.datetime, y: p.value })),
        400
      );
      blocks.push({
        key: 'cgm',
        title: 'CGM（最近约 7 天）',
        color: '#e74c3c',
        yLabel: 'mmol/L',
        unit: 'mmol/L',
        points: pts,
        thresholds: [
          { y: 3.9, color: '#e67e22', label: '3.9' },
          { y: 7.8, color: '#9b59b6', label: '7.8' },
        ],
        legend: [
          { color: '#e74c3c', label: '血糖', dashed: false },
          { color: '#e67e22', label: '3.9 阈值', dashed: true },
          { color: '#9b59b6', label: '7.8 阈值', dashed: true },
        ],
      });
    }

    const trend = analysis.weightStats && analysis.weightStats.trendSeries;
    if (trend && trend.length > 0) {
      const recent = trend.slice(-90);
      blocks.push({
        key: 'weight',
        title: '体重趋势（晨起优先，最多 90 日）',
        color: '#1abc9c',
        yLabel: 'kg',
        unit: 'kg',
        points: recent.map((w) => ({ x: w.date, y: w.weight })),
        legend: [{ color: '#1abc9c', label: '趋势体重', dashed: false }],
      });
      const fatPts = recent.filter((w) => w.bodyFat != null && Number.isFinite(w.bodyFat));
      if (fatPts.length >= 2) {
        blocks.push({
          key: 'bodyfat',
          title: '体脂趋势（与体重同日合并，最多 90 日）',
          color: '#9b59b6',
          yLabel: '%',
          unit: '%',
          points: fatPts.map((w) => ({ x: w.date, y: w.bodyFat })),
          legend: [{ color: '#9b59b6', label: '体脂%', dashed: false }],
        });
      }
    } else if (data.weight && data.weight.length > 0) {
      const sorted = [...data.weight].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
      const recent = sorted.slice(-90);
      blocks.push({
        key: 'weight',
        title: '体重（最多 90 条原始）',
        color: '#1abc9c',
        yLabel: 'kg',
        unit: 'kg',
        points: recent.map((w) => ({ x: w.datetime || w.date, y: w.value })),
        legend: [{ color: '#1abc9c', label: '体重', dashed: false }],
      });
    }

    const hrvByDate = analysis.hrvByDate || {};
    const hrvDates = Object.keys(hrvByDate).sort();
    if (hrvDates.length > 0) {
      const recent = hrvDates.slice(-30);
      blocks.push({
        key: 'hrv',
        title: 'HRV 全天均值（最近最多 30 天）',
        color: theme.primary,
        yLabel: 'ms',
        unit: 'ms',
        points: recent.map((d) => ({ x: d, y: hrvByDate[d].allMean })),
        legend: [{ color: theme.primary, label: 'HRV', dashed: false }],
      });
    }

    if (analysis.bpStats && analysis.bpStats.records && analysis.bpStats.records.length > 0) {
      const recs = analysis.bpStats.records.slice(-40);
      blocks.push({
        key: 'bp',
        title: '收缩压（最近最多 40 条）',
        color: '#e74c3c',
        yLabel: 'mmHg',
        unit: 'mmHg',
        points: recs.map((r) => ({ x: r.datetime, y: r.systolic })),
        thresholds: [
          { y: 90, color: '#e67e22', label: '90' },
          { y: 140, color: '#c0392b', label: '140' },
        ],
        legend: [
          { color: '#e74c3c', label: '收缩压', dashed: false },
          { color: '#e67e22', label: '90', dashed: true },
          { color: '#c0392b', label: '140', dashed: true },
        ],
      });
    }

    if (blocks.length === 0) {
      container.innerHTML = '<div class="chart-empty">当前数据维度不足以绘制趋势图。上传含 CGM / 体重 / HRV / 血压的导出后再试。</div>';
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
      canvas.setAttribute('aria-label', b.title + '，可按住查看读数');
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
      readout.textContent = statsLine(b.points, b.unit);
      wrap.appendChild(readout);

      container.appendChild(wrap);
      requestAnimationFrame(() => {
        const api = drawLineChart(canvas, b.points, {
          color: b.color,
          yLabel: b.yLabel,
          thresholds: b.thresholds,
          unit: b.unit,
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
