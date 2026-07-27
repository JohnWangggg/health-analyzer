/**
 * 苹果健康数据分析 PWA - 主应用
 */

(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');

  let currentAnalysis = null;
  let currentPromptTab = 'full';
  let deferredInstallPrompt = null;
  const CTX_STORAGE_KEY = 'health-analyzer-user-context-v1';

  // ============================================================
  // 添加到主屏幕引导
  // ============================================================

  const installGuide = $('install-guide');
  const installGuideText = $('install-guide-text');
  const installAction = $('install-action');
  const installDismiss = $('install-dismiss');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const installDismissed = (() => {
    try { return window.localStorage.getItem('health-analyzer-install-dismissed') === '1'; } catch { return false; }
  })();

  function showInstallGuide() {
    if (!installGuide || isStandalone || installDismissed) return;
    installGuide.classList.remove('hidden');
    if (isIos) {
      installGuideText.textContent = 'Safari：点击底部分享按钮 → 添加到主屏幕。';
      installAction.textContent = '查看 iPhone 方法';
    } else {
      installGuideText.textContent = '浏览器菜单中选择“添加到主屏幕”或“安装应用”。';
      installAction.textContent = '查看添加方法';
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallGuide();
    if (installAction) installAction.textContent = '安装应用';
  });

  installAction?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installGuide?.classList.add('hidden');
      return;
    }
    const message = isIos
      ? '请点击 Safari 底部的分享按钮，然后选择“添加到主屏幕”。'
      : '请打开浏览器菜单，选择“添加到主屏幕”或“安装应用”。';
    alert(message);
  });

  installDismiss?.addEventListener('click', () => {
    installGuide?.classList.add('hidden');
    try { window.localStorage.setItem('health-analyzer-install-dismissed', '1'); } catch { /* ignore */ }
  });

  showInstallGuide();

  // ============================================================
  // 个人背景（localStorage，仅本机）
  // ============================================================

  function getUserContextFromForm() {
    const num = (id) => {
      const el = $(id);
      if (!el || el.value === '' || el.value == null) return null;
      const n = Number(el.value);
      return Number.isFinite(n) ? n : null;
    };
    const text = (id) => {
      const el = $(id);
      if (!el) return '';
      return String(el.value || '').trim();
    };
    return {
      age: num('ctx-age'),
      sex: text('ctx-sex') || null,
      heightCm: num('ctx-height'),
      targetWeightKg: num('ctx-target-weight'),
      medications: text('ctx-medications') || null,
      conditions: text('ctx-conditions') || null,
      focus: text('ctx-focus') || null,
      notes: text('ctx-notes') || null,
    };
  }

  function applyUserContextToForm(ctx) {
    if (!ctx) return;
    const set = (id, v) => {
      const el = $(id);
      if (!el) return;
      el.value = v == null || v === '' ? '' : String(v);
    };
    set('ctx-age', ctx.age);
    set('ctx-sex', ctx.sex);
    set('ctx-height', ctx.heightCm);
    set('ctx-target-weight', ctx.targetWeightKg);
    set('ctx-medications', ctx.medications);
    set('ctx-conditions', ctx.conditions);
    set('ctx-focus', ctx.focus);
    set('ctx-notes', ctx.notes);
  }

  function loadUserContext() {
    try {
      const raw = window.localStorage.getItem(CTX_STORAGE_KEY);
      if (!raw) return;
      applyUserContextToForm(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  function saveUserContext() {
    const ctx = getUserContextFromForm();
    try {
      window.localStorage.setItem(CTX_STORAGE_KEY, JSON.stringify(ctx));
      const status = $('ctx-status');
      if (status) {
        status.textContent = '✓ 已保存到本机';
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2000);
      }
    } catch (e) {
      alert('无法写入 localStorage：' + (e && e.message ? e.message : e));
    }
    if (currentAnalysis) renderPrompt();
  }

  function clearUserContext() {
    applyUserContextToForm({
      age: null, sex: '', heightCm: null, targetWeightKg: null,
      medications: '', conditions: '', focus: '', notes: '',
    });
    try { window.localStorage.removeItem(CTX_STORAGE_KEY); } catch (e) { /* ignore */ }
    const status = $('ctx-status');
    if (status) {
      status.textContent = '已清空';
      status.classList.add('show');
      setTimeout(() => status.classList.remove('show'), 2000);
    }
    if (currentAnalysis) renderPrompt();
  }

  loadUserContext();
  $('btn-ctx-save')?.addEventListener('click', saveUserContext);
  $('btn-ctx-clear')?.addEventListener('click', clearUserContext);
  // 编辑后即时刷新提示词（若已有分析结果）
  ['ctx-age', 'ctx-sex', 'ctx-height', 'ctx-target-weight', 'ctx-medications', 'ctx-conditions', 'ctx-focus', 'ctx-notes']
    .forEach((id) => {
      $(id)?.addEventListener('change', () => { if (currentAnalysis) renderPrompt(); });
      $(id)?.addEventListener('input', () => { if (currentAnalysis) renderPrompt(); });
    });

  // ============================================================
  // Web Worker 解析（失败则回退主线程）
  // ============================================================

  function parseWithWorker(source, options) {
    return new Promise((resolve, reject) => {
      if (typeof Worker === 'undefined') {
        reject(new Error('Worker 不可用'));
        return;
      }
      let worker;
      try {
        worker = new Worker('./parse-worker.js');
      } catch (e) {
        reject(e);
        return;
      }

      const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const cleanup = () => {
        try { worker.terminate(); } catch (e) { /* ignore */ }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Worker 解析超时'));
      }, 10 * 60 * 1000);

      worker.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'worker-error') {
          clearTimeout(timer);
          cleanup();
          reject(new Error(msg.error || 'Worker 初始化失败'));
          return;
        }
        if (msg.id !== id) return;
        if (msg.type === 'progress') {
          if (options && typeof options.onProgress === 'function') {
            options.onProgress(msg.progress);
          }
          return;
        }
        if (msg.type === 'result') {
          clearTimeout(timer);
          cleanup();
          resolve(msg.data);
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(timer);
          cleanup();
          reject(new Error(msg.error || 'Worker 解析失败'));
        }
      };
      worker.onerror = (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err.error || new Error(err.message || 'Worker 错误'));
      };

      const payload = {
        startDate: options && options.startDate,
        endDate: options && options.endDate,
      };

      try {
        if (source instanceof Uint8Array) {
          // 复制一份再 transfer，避免调用方 buffer 被 detach 带来意外
          const copy = source.slice();
          payload.buffer = copy.buffer;
          worker.postMessage({ id, type: 'parse', payload }, [copy.buffer]);
        } else if (source && source.buffer && source.byteLength != null) {
          const copy = new Uint8Array(source).slice();
          payload.buffer = copy.buffer;
          worker.postMessage({ id, type: 'parse', payload }, [copy.buffer]);
        } else {
          payload.source = source;
          worker.postMessage({ id, type: 'parse', payload });
        }
      } catch (e) {
        clearTimeout(timer);
        cleanup();
        reject(e);
      }
    });
  }

  async function parseHealthData(source, parseOptions) {
    const opts = {
      startDate: parseOptions.startDate,
      endDate: parseOptions.endDate,
      onProgress: parseOptions.onProgress,
    };
    // 优先 Worker；失败回退主线程 async 解析
    try {
      return await parseWithWorker(source, opts);
    } catch (err) {
      console.warn('Worker 解析失败，回退主线程:', err);
      return window.HealthAnalyzer.parseHealthXmlAsync(source, opts);
    }
  }

  // ============================================================
  // 上传处理
  // ============================================================

  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  const uploadHint = $('upload-hint');
  const uploadText = $('upload-text');
  const isTouchDevice = (() => {
    try {
      return window.matchMedia('(hover: none) and (pointer: coarse)').matches
        || ('ontouchstart' in window);
    } catch {
      return false;
    }
  })();

  function updateUploadLabels() {
    const checked = document.querySelector('input[name="source"]:checked');
    const val = checked ? checked.value : 'apple_health_export';
    if (val === 'folder') {
      fileInput.hidden = true;
      folderInput.hidden = false;
      if (uploadText) uploadText.textContent = '点击选择文件夹';
      if (uploadHint) uploadHint.textContent = '需包含 export.xml；建议使用电脑 Chrome / Edge';
    } else if (val === 'xml_only') {
      fileInput.hidden = false;
      folderInput.hidden = true;
      fileInput.accept = '.xml';
      if (uploadText) uploadText.textContent = isTouchDevice ? '点击选择 XML 文件' : '点击或拖拽 XML 文件';
      if (uploadHint) uploadHint.textContent = 'export.xml 或 导出.xml';
    } else {
      fileInput.hidden = false;
      folderInput.hidden = true;
      fileInput.accept = '.zip,.xml';
      if (uploadText) {
        uploadText.textContent = isTouchDevice
          ? '点击选择 ZIP 文件'
          : '点击或拖拽 ZIP / XML';
      }
      if (uploadHint) {
        uploadHint.textContent = isTouchDevice
          ? '推荐苹果健康导出的 .zip；大文件建议用电脑浏览器'
          : '推荐 .zip；也可直接选 export.xml';
      }
    }
  }

  document.querySelectorAll('input[name="source"]').forEach(radio => {
    radio.addEventListener('change', updateUploadLabels);
  });
  updateUploadLabels();

  function openFilePicker() {
    const folderRadio = document.querySelector('input[name="source"][value="folder"]');
    if (folderRadio && folderRadio.checked) {
      folderInput.click();
    } else {
      fileInput.click();
    }
  }

  dropZone.addEventListener('click', openFilePicker);
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const items = [...(e.dataTransfer.items || [])];
    if (items.length && items[0].webkitGetAsEntry) {
      const entries = items.map(it => it.webkitGetAsEntry()).filter(Boolean);
      handleEntries(entries);
    } else {
      const files = [...e.dataTransfer.files];
      handleFiles(files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (files.length) handleFiles(files);
  });

  folderInput.addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (files.length) handleFiles(files);
  });

  async function handleEntries(entries) {
    const fileEntries = entries.filter(e => e.isFile);
    if (fileEntries.length === 0) return;
    const files = await Promise.all(fileEntries.map(fe => new Promise(res => fe.file(res))));
    handleFiles(files);
  }

  async function handleFiles(files) {
    const source = document.querySelector('input[name="source"]:checked').value;

    show('step-progress');
    setProgress(0, '准备解析...');

    try {
      let xmlText = '';
      let xmlBytes = null;  // 流式解析的字节流
      let ecgFiles = [];

      if (source === 'apple_health_export') {
        const zipFile = files.find(f => f.name.endsWith('.zip'));
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (zipFile) {
          const result = await extractXmlFromZipBrowser(zipFile);
          xmlBytes = result.xmlBytes;  // 直接使用字节流，避免 512MB 字符串限制
          ecgFiles = result.ecgEntries.map(e => ({ name: e.filename, _text: e.text }));
        } else if (xmlFile) {
          xmlText = await readFileAsText(xmlFile);
        } else {
          throw new Error('请选择 .zip 包或 .xml 文件');
        }
      } else if (source === 'xml_only') {
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error('未选择 XML 文件');
        xmlText = await readFileAsText(xmlFile);
      } else if (source === 'folder') {
        const xmlFile = files.find(f => /export|导出/i.test(f.name) && f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error('文件夹中未找到 export.xml 或 导出.xml');
        xmlText = await readFileAsText(xmlFile);
        // 收集 ECG 文件（electrocardiograms 目录或文件名含 ecg）
        ecgFiles = files.filter(f => f.name.endsWith('.csv') && (f.name.includes('ecg') || (f.webkitRelativePath || '').includes('electrocardiograms')));
      }

      setProgress(0.05, '解析 XML 中（后台线程）...');

      // 可选日期范围（YYYY-MM-DD）；留空则不过滤
      const parseOptions = getDateFilterOptions();
      parseOptions.onProgress = (p) => setProgress(0.05 + p * 0.7, `解析中... ${Math.round(p * 100)}%`);

      // Worker 优先；失败自动回退主线程
      let data;
      if (xmlBytes) {
        data = await parseHealthData(xmlBytes, parseOptions);
      } else {
        data = await parseHealthData(xmlText, parseOptions);
      }

      // 解析 ECG
      if (ecgFiles.length > 0) {
        for (const f of ecgFiles) {
          try {
            // 如果是从 ZIP 解出来的，已经有 _text
            const text = f._text || await readFileAsText(f);
            const summary = window.HealthAnalyzer.parseEcgCsv(text);
            if (!ecgWithinDateFilter(summary, parseOptions)) continue;
            data.ecg.push(summary);
            data.dataAvailability.hasEcg = true;
          } catch (e) { /* ignore */ }
        }
      } else {
        // 即使没有 ECG CSV，也检查文件夹中所有 .csv
        const allCsv = files.filter(f => f.name.endsWith('.csv'));
        for (const f of allCsv) {
          try {
            const text = await readFileAsText(f);
            if (text.includes('分类') && text.includes('记录日期')) {
              const summary = window.HealthAnalyzer.parseEcgCsv(text);
              if (!ecgWithinDateFilter(summary, parseOptions)) continue;
              data.ecg.push(summary);
              data.dataAvailability.hasEcg = true;
            }
          } catch (e) { /* ignore */ }
        }
      }

      setProgress(0.85, '生成统计中...');
      currentAnalysis = window.HealthAnalyzer.analyzeAll(data);

      setProgress(1, '完成');
      setTimeout(() => {
        hide('step-progress');
        renderResults(currentAnalysis);
      }, 200);

    } catch (err) {
      setProgress(0, '错误: ' + err.message);
      console.error(err);
      showError(err.message);
      hide('step-progress');
    }
  }

  const PROGRESS_CARD_HTML = `
      <h2><span class="step-num">2</span> 解析中</h2>
      <div class="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <p id="progress-text" class="progress-text">准备中...</p>
  `;

  function ensureProgressCard() {
    const card = $('step-progress');
    if (!card) return;
    if (!$('progress-fill') || !$('progress-text')) {
      card.innerHTML = PROGRESS_CARD_HTML;
    }
  }

  function setProgress(ratio, text) {
    ensureProgressCard();
    const fill = $('progress-fill');
    const label = $('progress-text');
    if (fill) fill.style.width = (ratio * 100) + '%';
    if (label) label.textContent = text;
  }

  function showError(msg) {
    const card = $('step-progress');
    card.innerHTML = `
      <h2><span class="step-num">✗</span> 解析失败</h2>
      <div class="error-box" role="alert">
        <strong>错误信息：</strong> ${escapeHtml(msg)}
      </div>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;color:var(--primary);">可能的解决方案</summary>
        <ul style="padding-left:24px;margin-top:8px;font-size:14px;line-height:1.8;">
          <li>确认 ZIP 包是 iPhone 苹果健康 App 导出的原始数据</li>
          <li>ZIP 包内应包含 <code>apple_health_export/export.xml</code> 或 <code>导出.xml</code> 主文件</li>
          <li>如 ZIP 解压有问题，可手动解压后选择"📁 已解压的文件夹"或"📄 单独的 XML 文件"</li>
          <li>大型文件（500MB+）解析可能需要 30-60 秒，请耐心等待</li>
          <li>如浏览器内存不足，请关闭其他标签页后重试</li>
          <li>若设置了日期范围，请确认开始日期不晚于结束日期</li>
        </ul>
      </details>
      <button id="btn-retry" class="btn-primary" style="margin-top:16px;" type="button">↺ 重新选择文件</button>
    `;
    show('step-progress');
    const retryBtn = $('btn-retry');
    retryBtn?.focus();
    retryBtn?.addEventListener('click', () => {
      card.innerHTML = PROGRESS_CARD_HTML;
      hide('step-progress');
      fileInput.value = '';
      folderInput.value = '';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  /**
   * 浏览器内解压 ZIP（使用本地 fflate 库）
   */
  async function extractXmlFromZipBrowser(zipFile) {
    if (!window.fflate) {
      throw new Error('fflate 库未加载，请检查 fflate.min.js 是否在 public 目录中');
    }
    const buf = await zipFile.arrayBuffer();
    const unzipped = window.fflate.unzipSync(new Uint8Array(buf));

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
      xmlBytes: decodedEntries[xmlFile],  // 字节流，让上层流式解析
      ecgEntries: Object.keys(decodedEntries)
        .filter(k => /electrocardiograms/.test(k) && k.endsWith('.csv'))
        .map(k => ({
          filename: k,
          text: new TextDecoder('utf-8').decode(decodedEntries[k]),
        })),
    };
  }

  // ============================================================
  // 结果渲染
  // ============================================================

  function setResultsVisible(visible) {
    document.body.classList.toggle('has-results', !!visible);
    const sticky = $('sticky-cta');
    if (sticky) sticky.classList.toggle('hidden', !visible);
  }

  function renderResults(analysis) {
    show('step-overview');
    show('step-summary');
    show('step-signals');
    show('step-charts');
    show('step-export');
    show('step-prompt');
    setResultsVisible(true);

    renderAvailability(analysis);
    renderKpis(analysis);
    renderSummary(analysis);
    renderSignals(analysis);
    renderCharts(analysis);
    renderPrompt();
    refreshHistorySelect().catch(() => { /* ignore */ });

    $('step-overview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderKpis(analysis) {
    const grid = $('kpi-grid');
    if (!grid) return;
    const data = analysis.data || {};
    const items = [];

    if (analysis.cgmStats && analysis.cgmStats.overall) {
      const o = analysis.cgmStats.overall;
      items.push({
        label: 'CGM 均值',
        value: o.mean.toFixed(2),
        unit: 'mmol/L',
        sub: `TIR ${o.pctInRange.toFixed(0)}% · n=${o.count}`,
      });
    }
    if (analysis.bpStats && analysis.bpStats.mean7d) {
      const m = analysis.bpStats.mean7d;
      items.push({
        label: '血压 7 日均',
        value: `${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)}`,
        unit: 'mmHg',
        sub: `${m.count} 条` + (m.lowCount ? ` · ${m.lowCount} 次偏低` : ''),
      });
    }
    if (data.weight && data.weight.length) {
      const latest = data.weight[data.weight.length - 1];
      const earliest = data.weight[0];
      const delta = latest.value - earliest.value;
      items.push({
        label: '最新体重',
        value: latest.value.toFixed(1),
        unit: 'kg',
        sub: `较最早 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg`,
      });
    }
    const hrvDates = Object.keys(analysis.hrvByDate || {}).sort();
    if (hrvDates.length) {
      const recent = hrvDates.slice(-7);
      const vals = recent.map((d) => analysis.hrvByDate[d].allMean).filter(Number.isFinite);
      const avg = meanOf(vals);
      items.push({
        label: 'HRV 近 7 日',
        value: avg != null ? avg.toFixed(1) : '—',
        unit: 'ms',
        sub: `${hrvDates.length} 天有数据`,
      });
    }
    if (!items.length) {
      items.push({
        label: '数据维度',
        value: String(
          Object.values(data.dataAvailability || {}).filter(Boolean).length
        ),
        unit: '类',
        sub: '详见下方可用性',
      });
    }

    let signalNote = '';
    try {
      const sigs = window.HealthAnalyzer.detectCrossSignals(analysis) || [];
      const alerts = sigs.filter((s) => s.severity === 'alert' || s.severity === 'watch').length;
      if (sigs.length) {
        signalNote = `<p class="kpi-signal-note">${alerts ? `有 ${alerts} 条需观察/关注的跨维度提示` : `有 ${sigs.length} 条提示`}，见下方「跨维度提示」。</p>`;
      }
    } catch (e) { /* ignore */ }

    grid.innerHTML = items.map((it) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(it.label)}</div>
        <div class="kpi-value"><span class="kpi-num">${escapeHtml(it.value)}</span><span class="kpi-unit">${escapeHtml(it.unit)}</span></div>
        <div class="kpi-sub">${escapeHtml(it.sub || '')}</div>
      </div>
    `).join('') + signalNote;
  }

  async function copyFullPrompt(statusEl) {
    if (!currentAnalysis) {
      alert('请先完成分析');
      return;
    }
    // 确保为完整提示词
    currentPromptTab = 'full';
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const on = b.dataset.tab === 'full';
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderPrompt();
    const text = $('prompt-output') ? $('prompt-output').value : '';
    try {
      await navigator.clipboard.writeText(text);
      const els = [statusEl, $('copy-status')].filter(Boolean);
      els.forEach((status) => {
        status.textContent = '✓ 已复制完整提示词';
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2200);
      });
      // 吸底按钮短暂反馈
      const sticky = $('btn-copy-sticky');
      if (sticky) {
        const prev = sticky.textContent;
        sticky.textContent = '✓ 已复制';
        setTimeout(() => { sticky.textContent = prev; }, 1600);
      }
      const hero = $('btn-copy-hero');
      if (hero && statusEl !== hero) {
        const prev = hero.textContent;
        hero.textContent = '✓ 已复制';
        setTimeout(() => { hero.textContent = prev; }, 1600);
      }
    } catch (e) {
      if ($('prompt-output')) {
        $('prompt-output').select();
        document.execCommand('copy');
      }
      alert('已尝试复制到剪贴板');
    }
  }

  function severityLabel(sev) {
    if (sev === 'alert') return '需关注';
    if (sev === 'watch') return '观察';
    return '提示';
  }

  function renderSignals(analysis) {
    const container = $('signals-content');
    if (!container) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.detectCrossSignals !== 'function') {
      container.innerHTML = '<p class="hint">信号模块未加载。</p>';
      return;
    }
    const signals = window.HealthAnalyzer.detectCrossSignals(analysis);
    if (!signals.length) {
      container.innerHTML = '<p class="hint">当前规则未触发明显组合信号。数据仍建议人工复核关键边界值。</p>';
      return;
    }
    container.innerHTML = `<div class="signals-list">${signals.map((s) => `
      <article class="signal-card severity-${escapeHtml(s.severity)}">
        <div class="signal-meta">
          <span class="signal-badge">${severityLabel(s.severity)}</span>
          ${s.date ? `<span>${escapeHtml(s.date)}</span>` : ''}
          <span>${escapeHtml((s.dimensions || []).join(' · '))}</span>
        </div>
        <h3 class="signal-title">${escapeHtml(s.title)}</h3>
        <p class="signal-detail">${escapeHtml(s.detail)}</p>
      </article>
    `).join('')}</div>`;
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadText(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }));
  }

  function showExportStatus(msg) {
    const el = $('export-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  function getExportBundle() {
    if (!currentAnalysis) throw new Error('请先完成分析');
    return window.HealthAnalyzer.buildExportBundle(currentAnalysis);
  }

  function exportJson() {
    try {
      const bundle = getExportBundle();
      const day = new Date().toISOString().slice(0, 10);
      downloadText(`health-analysis-${day}.json`, bundle.analysisJson, 'application/json');
      showExportStatus('✓ JSON 已下载');
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function exportCsvBundle() {
    try {
      const bundle = getExportBundle();
      const day = new Date().toISOString().slice(0, 10);
      if (window.fflate && typeof window.fflate.zipSync === 'function') {
        const files = {};
        for (const f of bundle.csvFiles) {
          files[f.filename] = window.fflate.strToU8(f.content);
        }
        const zipped = window.fflate.zipSync(files);
        downloadBlob(`health-analysis-csv-${day}.zip`, new Blob([zipped], { type: 'application/zip' }));
        showExportStatus('✓ CSV ZIP 已下载');
      } else {
        const joined = window.HealthAnalyzer.joinCsvBundle(bundle.csvFiles);
        downloadText(`health-analysis-csv-${day}.txt`, joined, 'text/plain');
        showExportStatus('✓ CSV 文本已下载');
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function exportSnapshot() {
    try {
      const bundle = getExportBundle();
      const day = new Date().toISOString().slice(0, 10);
      downloadText(`health-snapshot-${day}.json`, bundle.snapshotJson, 'application/json');
      showExportStatus('✓ 摘要快照已下载');
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function refreshHistorySelect() {
    const select = $('history-select');
    if (!select || !window.HealthHistory) return;
    let rows = [];
    try {
      rows = await window.HealthHistory.listSnapshots();
    } catch (e) {
      select.innerHTML = '<option value="">（IndexedDB 不可用）</option>';
      return;
    }
    if (!rows.length) {
      select.innerHTML = '<option value="">（暂无历史）</option>';
      $('history-compare').innerHTML = '';
      return;
    }
    select.innerHTML = rows.map((s) => {
      const when = (s.savedAt || '').slice(0, 16).replace('T', ' ');
      const range = s.dateRange ? `${s.dateRange.start}~${s.dateRange.end}` : '';
      const label = s.label ? ` · ${s.label}` : '';
      const w = s.metrics && s.metrics.weightLatest != null ? ` · ${Number(s.metrics.weightLatest).toFixed(1)}kg` : '';
      return `<option value="${escapeHtml(s.id)}">${escapeHtml(when)} · ${escapeHtml(range)}${escapeHtml(label)}${escapeHtml(w)}</option>`;
    }).join('');
    // 默认与最近一条对比
    await renderHistoryCompare(select.value);
  }

  async function saveCurrentToHistory() {
    if (!currentAnalysis) {
      alert('请先完成分析');
      return;
    }
    if (!window.HealthHistory || !window.HealthAnalyzer.buildAnalysisSnapshot) {
      alert('历史模块不可用');
      return;
    }
    try {
      const labelEl = $('history-label');
      const label = labelEl && labelEl.value.trim() ? labelEl.value.trim() : undefined;
      const snap = window.HealthAnalyzer.buildAnalysisSnapshot(currentAnalysis, { label });
      await window.HealthHistory.saveSnapshot(snap);
      showExportStatus('✓ 已保存到本机历史');
      await refreshHistorySelect();
    } catch (e) {
      alert('保存失败: ' + (e.message || e));
    }
  }

  async function renderHistoryCompare(historyId) {
    const box = $('history-compare');
    if (!box) return;
    if (!historyId || !currentAnalysis) {
      box.innerHTML = '<p class="hint">选择一条历史快照后，将与<strong>当前分析</strong>环比关键指标。</p>';
      return;
    }
    try {
      const prev = await window.HealthHistory.getSnapshot(historyId);
      if (!prev) {
        box.innerHTML = '<p class="hint">未找到该快照。</p>';
        return;
      }
      const curr = window.HealthAnalyzer.buildAnalysisSnapshot(currentAnalysis);
      const diffs = window.HealthAnalyzer.compareSnapshots(prev, curr);
      if (!diffs.length) {
        box.innerHTML = '<p class="hint">无重叠指标可对比。</p>';
        return;
      }
      const fmt = (v, unit) => {
        if (v == null || !Number.isFinite(v)) return '—';
        const d = unit === '步' ? 0 : unit === '%' || unit === 'ms' || unit === 'bpm' || unit === 'mmHg' ? 1 : 2;
        return v.toFixed(d);
      };
      const deltaClass = (d) => {
        if (d == null || !Number.isFinite(d)) return 'delta-zero';
        if (Math.abs(d) < 1e-9) return 'delta-zero';
        return d > 0 ? 'delta-up' : 'delta-down';
      };
      box.innerHTML = `
        <p class="hint">历史：${escapeHtml((prev.savedAt || '').slice(0, 16).replace('T', ' '))}
          （数据 ${escapeHtml(prev.dateRange?.start || '')} ~ ${escapeHtml(prev.dateRange?.end || '')}）
          → 当前分析</p>
        <table>
          <thead><tr><th>指标</th><th class="num">历史</th><th class="num">当前</th><th class="num">变化</th></tr></thead>
          <tbody>
            ${diffs.map((r) => `
              <tr>
                <td>${escapeHtml(r.label)}</td>
                <td class="num">${fmt(r.previous, r.unit)} ${escapeHtml(r.unit)}</td>
                <td class="num">${fmt(r.current, r.unit)} ${escapeHtml(r.unit)}</td>
                <td class="num ${deltaClass(r.delta)}">${r.delta == null ? '—' : ((r.delta > 0 ? '+' : '') + fmt(r.delta, r.unit))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      box.innerHTML = `<p class="hint">对比失败：${escapeHtml(e.message || String(e))}</p>`;
    }
  }

  function renderCharts(analysis) {
    const container = $('charts-content');
    if (!container) return;
    if (window.HealthCharts && typeof window.HealthCharts.renderAnalysisCharts === 'function') {
      window.HealthCharts.renderAnalysisCharts(container, analysis);
    } else {
      container.innerHTML = '<p class="hint">图表模块未加载。</p>';
    }
  }

  function renderAvailability(analysis) {
    const av = analysis.data.dataAvailability;
    const grid = $('availability-grid');
    const items = [
      { key: 'hasCgm', icon: '🩸', name: 'CGM 动态血糖', count: analysis.data.cgm.length + ' 条' },
      { key: 'hasBloodPressure', icon: '❤️', name: '血压', count: analysis.data.bloodPressure.length + ' 条' },
      { key: 'hasWeight', icon: '⚖️', name: '体重', count: analysis.data.weight.length + ' 条' },
      { key: 'hasHrv', icon: '📊', name: 'HRV 心率变异性', count: Object.keys(analysis.hrvByDate).length + ' 天' },
      { key: 'hasHeartRate', icon: '💗', name: '静息/步行心率', count: Object.keys(analysis.data.restingHr).length + ' 天' },
      { key: 'hasSteps', icon: '👟', name: '步数', count: Object.keys(analysis.data.steps).length + ' 天' },
      { key: 'hasSleep', icon: '😴', name: '睡眠', count: Object.keys(analysis.data.sleep).length + ' 天' },
      { key: 'hasEcg', icon: '📈', name: 'ECG 心电图', count: analysis.data.ecg.length + ' 份' },
    ];

    grid.innerHTML = items.map(it => `
      <div class="availability-item ${av[it.key] ? 'has-data' : 'no-data'}">
        <div class="av-icon">${it.icon}</div>
        <div class="av-info">
          <div class="av-name">${it.name}</div>
          <div class="av-count">${av[it.key] ? it.count : '无数据'}</div>
        </div>
      </div>
    `).join('');

    $('date-range-info').textContent =
      `📅 数据时间范围: ${analysis.dateRange.start} 至 ${analysis.dateRange.end}`;
  }

  /** 对数值数组求简单均值；不足 1 条返回 null */
  function meanOf(values) {
    if (!values || values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  function formatMean(v, digits) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(digits);
  }

  function getDateFilterOptions() {
    const startEl = $('filter-start-date');
    const endEl = $('filter-end-date');
    const startDate = (startEl && startEl.value) ? startEl.value.trim() : '';
    const endDate = (endEl && endEl.value) ? endEl.value.trim() : '';
    if (startDate && endDate && startDate > endDate) {
      throw new Error('开始日期不能晚于结束日期');
    }
    const opts = {};
    if (startDate) opts.startDate = startDate;
    if (endDate) opts.endDate = endDate;
    return opts;
  }

  /** ECG 记录日期是否在可选过滤范围内（无日期字段则保留） */
  function ecgWithinDateFilter(summary, opts) {
    if (!opts || (!opts.startDate && !opts.endDate)) return true;
    const raw = (summary && summary.datetime) ? String(summary.datetime) : '';
    const date = raw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
    if (opts.startDate && date < opts.startDate) return false;
    if (opts.endDate && date > opts.endDate) return false;
    return true;
  }

  function renderSummary(analysis) {
    const container = $('summary-content');
    const blocks = [];
    const data = analysis.data;

    if (analysis.cgmStats) {
      const o = analysis.cgmStats.overall;
      blocks.push(`
        <div class="section-block">
          <h3>🩸 CGM 血糖总览</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>均值</td><td class="num">${o.mean.toFixed(2)} mmol/L</td></tr>
            <tr><td>最低 / 最高</td><td class="num">${o.min.toFixed(1)} / ${o.max.toFixed(1)}</td></tr>
            <tr><td>TIR (3.9-10.0)</td><td class="num">${o.pctInRange.toFixed(1)}%</td></tr>
            <tr><td>&lt;3.9 mmol/L</td><td class="num">${o.pctBelow39.toFixed(1)}%</td></tr>
            <tr><td>&lt;3.0 mmol/L</td><td class="num">${o.pctBelow30.toFixed(1)}%</td></tr>
            <tr><td>&gt;7.8 mmol/L</td><td class="num">${o.pctAbove78.toFixed(1)}%</td></tr>
          </table>
        </div>
      `);
    }

    if (analysis.bpStats && analysis.bpStats.records.length > 0) {
      const bp = analysis.bpStats;
      const rows = bp.records.slice(-5).reverse().map(r => {
        const low = r.systolic < 90 || r.diastolic < 60 ? ' ⚠️' : '';
        return `<tr><td>${r.datetime.slice(5, 16)}</td><td class="num">${r.systolic}/${r.diastolic}${low}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>❤️ 血压总览</h3>
          <table class="summary-table">
            <tr><th>时段</th><th>均值</th></tr>
            ${bp.mean7d ? `<tr><td>最近 7 天 (${bp.mean7d.count}条)</td><td class="num">${bp.mean7d.systolic.toFixed(1)}/${bp.mean7d.diastolic.toFixed(1)}</td></tr>` : ''}
            ${bp.mean14d ? `<tr><td>最近 14 天 (${bp.mean14d.count}条)</td><td class="num">${bp.mean14d.systolic.toFixed(1)}/${bp.mean14d.diastolic.toFixed(1)}</td></tr>` : ''}
            ${bp.lowest ? `<tr><td>最低</td><td class="num">${bp.lowest.systolic}/${bp.lowest.diastolic} (${bp.lowest.datetime.slice(5, 16)})</td></tr>` : ''}
            ${bp.highest ? `<tr><td>最高</td><td class="num">${bp.highest.systolic}/${bp.highest.diastolic} (${bp.highest.datetime.slice(5, 16)})</td></tr>` : ''}
          </table>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;color:var(--primary);font-size:13px;">最近 5 条血压记录</summary>
            <table class="summary-table" style="margin-top:8px;">
              <tr><th>时间</th><th>血压</th></tr>
              ${rows}
            </table>
          </details>
        </div>
      `);
    }

    if (data.weight.length > 0) {
      const w = data.weight;
      const latest = w[w.length - 1];
      const earliest = w[0];
      blocks.push(`
        <div class="section-block">
          <h3>⚖️ 体重</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最新</td><td class="num">${latest.value.toFixed(1)} kg (${latest.datetime.slice(0, 10)})</td></tr>
            <tr><td>最早</td><td class="num">${earliest.value.toFixed(1)} kg (${earliest.datetime.slice(0, 10)})</td></tr>
            <tr><td>变化</td><td class="num">${(latest.value - earliest.value).toFixed(1)} kg</td></tr>
            <tr><td>记录数</td><td class="num">${w.length}</td></tr>
          </table>
        </div>
      `);
    }

    if (Object.keys(analysis.hrvByDate).length > 0) {
      const dates = Object.keys(analysis.hrvByDate).sort();
      const recent = dates.slice(-7);
      const recentMeans = recent.map(d => analysis.hrvByDate[d].allMean);
      const avg7 = meanOf(recentMeans);
      const rows = recent.map(d => {
        const h = analysis.hrvByDate[d];
        return `<tr><td>${d}</td><td class="num">${h.allMean.toFixed(1)} ms</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>📊 HRV 心率变异性（最近 7 天）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最近 ${recent.length} 天均值</td><td class="num">${formatMean(avg7, 1)} ms</td></tr>
            <tr><td>有数据天数</td><td class="num">${dates.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>全天均值</th></tr>
            ${rows}
          </table>
        </div>
      `);
    }

    // 静息 / 步行心率
    const restingMap = analysis.restingHrByDate || data.restingHr || {};
    const walkingMap = analysis.walkingHrByDate || data.walkingHr || {};
    const hrDates = new Set([...Object.keys(restingMap), ...Object.keys(walkingMap)]);
    if (hrDates.size > 0) {
      const sorted = Array.from(hrDates).sort();
      const recent = sorted.slice(-7);
      const restVals = recent.map(d => restingMap[d]).filter(v => v != null && Number.isFinite(v));
      const walkVals = recent.map(d => walkingMap[d]).filter(v => v != null && Number.isFinite(v));
      const rows = recent.map(d => {
        const r = restingMap[d] != null ? restingMap[d] : '—';
        const w = walkingMap[d] != null ? walkingMap[d] : '—';
        return `<tr><td>${d}</td><td class="num">${r}</td><td class="num">${w}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>💗 静息 / 步行心率（最近 ${recent.length} 天）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最近静息均值 (${restVals.length} 天)</td><td class="num">${formatMean(meanOf(restVals), 1)} bpm</td></tr>
            <tr><td>最近步行均值 (${walkVals.length} 天)</td><td class="num">${formatMean(meanOf(walkVals), 1)} bpm</td></tr>
            <tr><td>有数据天数</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>静息</th><th>步行</th></tr>
            ${rows}
          </table>
        </div>
      `);
    }

    // 步数
    const stepsMap = analysis.stepsByDate || {};
    const stepsKeys = Object.keys(stepsMap).length
      ? Object.keys(stepsMap)
      : Object.keys(data.steps || {});
    if (stepsKeys.length > 0) {
      const getSteps = (d) => {
        if (stepsMap[d] != null) return stepsMap[d];
        return data.steps[d] && data.steps[d].max != null ? data.steps[d].max : null;
      };
      const sorted = stepsKeys.sort();
      const recent = sorted.slice(-7);
      const vals = recent.map(getSteps).filter(v => v != null && Number.isFinite(v));
      const rows = recent.map(d => {
        const v = getSteps(d);
        return `<tr><td>${d}</td><td class="num">${v != null ? Math.round(v) : '—'}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>👟 步数（最近 ${recent.length} 天）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最近日均 (${vals.length} 天)</td><td class="num">${vals.length ? Math.round(meanOf(vals)) : '—'} 步</td></tr>
            <tr><td>有数据天数</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>步数</th></tr>
            ${rows}
          </table>
        </div>
      `);
    }

    // 睡眠
    const sleepMap = analysis.sleepByDate || data.sleep || {};
    if (Object.keys(sleepMap).length > 0) {
      const sorted = Object.keys(sleepMap).sort();
      const recent = sorted.slice(-7);
      const totals = recent.map(d => sleepMap[d] && sleepMap[d].total).filter(v => v != null && Number.isFinite(v));
      const deeps = recent.map(d => sleepMap[d] && sleepMap[d].deep).filter(v => v != null && Number.isFinite(v));
      const rems = recent.map(d => sleepMap[d] && sleepMap[d].rem).filter(v => v != null && Number.isFinite(v));
      const rows = recent.map(d => {
        const s = sleepMap[d] || {};
        return `<tr><td>${d}</td><td class="num">${s.total != null ? s.total.toFixed(2) : '—'}</td><td class="num">${s.deep != null ? s.deep.toFixed(2) : '—'}</td><td class="num">${s.rem != null ? s.rem.toFixed(2) : '—'}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>😴 睡眠（最近 ${recent.length} 天）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最近日均总睡眠</td><td class="num">${formatMean(meanOf(totals), 2)} h</td></tr>
            <tr><td>最近日均深睡</td><td class="num">${formatMean(meanOf(deeps), 2)} h</td></tr>
            <tr><td>最近日均 REM</td><td class="num">${formatMean(meanOf(rems), 2)} h</td></tr>
            <tr><td>有数据天数</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>总睡眠(h)</th><th>深睡(h)</th><th>REM(h)</th></tr>
            ${rows}
          </table>
        </div>
      `);
    }

    // ECG 分类汇总
    if (data.ecg && data.ecg.length > 0) {
      const counts = {};
      for (const e of data.ecg) {
        const k = e.classification || 'unknown';
        counts[k] = (counts[k] || 0) + 1;
      }
      const classRows = Object.keys(counts).sort().map(k =>
        `<tr><td>${escapeHtml(k)}</td><td class="num">${counts[k]}</td></tr>`
      ).join('');
      const recentList = data.ecg.slice(-5).reverse().map(e => {
        const dt = e.datetime ? escapeHtml(String(e.datetime).slice(0, 16)) : '—';
        const cls = escapeHtml(e.classification || 'unknown');
        return `<tr><td>${dt}</td><td>${cls}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>📈 ECG 心电图</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>总份数</td><td class="num">${data.ecg.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>分类</th><th>份数</th></tr>
            ${classRows}
          </table>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;color:var(--primary);font-size:13px;">最近 5 份记录</summary>
            <table class="summary-table" style="margin-top:8px;">
              <tr><th>时间</th><th>分类</th></tr>
              ${recentList}
            </table>
          </details>
        </div>
      `);
    }

    if (blocks.length === 0) {
      container.innerHTML = '<p class="hint">未发现可识别的健康数据维度。请确认导出的 ZIP 包来源。</p>';
      return;
    }
    // 各维度默认折叠，减轻长页滚动压力
    container.innerHTML = `<div class="summary-accordions">${blocks.map((html, idx) => {
      const open = idx === 0 ? ' open' : '';
      // 从块内 h3 抽标题
      const m = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const title = m ? m[1].replace(/<[^>]+>/g, '').trim() : `维度 ${idx + 1}`;
      const body = html.replace(/<h3[^>]*>[\s\S]*?<\/h3>/, '');
      return `<details class="summary-acc"${open}><summary>${title}</summary><div class="summary-acc-body">${body}</div></details>`;
    }).join('')}</div>`;
  }

  // ============================================================
  // 提示词渲染
  // ============================================================

  function renderPrompt() {
    if (!currentAnalysis) return;
    const ctx = getUserContextFromForm();
    let text = '';
    if (currentPromptTab === 'full') {
      text = window.HealthAnalyzer.generateLLMPrompt(currentAnalysis, ctx);
    } else if (currentPromptTab === 'data') {
      text = window.HealthAnalyzer.generateDataOnly(currentAnalysis, ctx);
    } else {
      text = window.HealthAnalyzer.SHORT_SYSTEM_PROMPT;
    }
    $('prompt-output').value = text;
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPromptTab = btn.dataset.tab;
      renderPrompt();
    });
  });

  // 提示词区：复制当前标签内容
  $('btn-copy')?.addEventListener('click', async () => {
    if (!currentAnalysis) return;
    renderPrompt();
    const text = $('prompt-output').value;
    try {
      await navigator.clipboard.writeText(text);
      const status = $('copy-status');
      if (status) {
        status.textContent = '✓ 已复制';
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2000);
      }
    } catch (err) {
      $('prompt-output').select();
      document.execCommand('copy');
      alert('已尝试复制');
    }
  });

  // 主 CTA / 吸底：始终复制完整提示词
  $('btn-copy-hero')?.addEventListener('click', () => copyFullPrompt($('copy-status')));
  $('btn-copy-sticky')?.addEventListener('click', () => copyFullPrompt($('copy-status')));
  $('btn-scroll-prompt')?.addEventListener('click', () => {
    $('step-prompt')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('btn-sticky-top')?.addEventListener('click', () => {
    $('step-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('btn-download')?.addEventListener('click', () => {
    const text = $('prompt-output').value;
    const tab = currentPromptTab === 'system' ? 'system-prompt' : (currentPromptTab === 'data' ? 'data-only' : 'full-prompt');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-analyzer-${tab}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $('btn-export-json')?.addEventListener('click', exportJson);
  $('btn-export-csv')?.addEventListener('click', exportCsvBundle);
  $('btn-export-snapshot')?.addEventListener('click', exportSnapshot);
  $('btn-history-save')?.addEventListener('click', () => { saveCurrentToHistory(); });
  $('btn-history-refresh')?.addEventListener('click', () => { refreshHistorySelect(); });
  $('btn-history-clear')?.addEventListener('click', async () => {
    if (!window.HealthHistory) return;
    if (!window.confirm('确定清空本机全部历史摘要快照？此操作不可恢复。')) return;
    try {
      await window.HealthHistory.clearAll();
      await refreshHistorySelect();
      showExportStatus('✓ 历史已清空');
    } catch (e) {
      alert(e.message || String(e));
    }
  });
  $('history-select')?.addEventListener('change', (e) => {
    renderHistoryCompare(e.target.value);
  });

  // 结果区内锚点平滑滚动
  document.querySelectorAll('.result-nav-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('btn-reset')?.addEventListener('click', () => {
    currentAnalysis = null;
    setResultsVisible(false);
    hide('step-overview');
    hide('step-summary');
    hide('step-signals');
    hide('step-charts');
    hide('step-export');
    hide('step-prompt');
    const charts = $('charts-content');
    if (charts) charts.innerHTML = '';
    const signals = $('signals-content');
    if (signals) signals.innerHTML = '';
    const hist = $('history-compare');
    if (hist) hist.innerHTML = '';
    const kpis = $('kpi-grid');
    if (kpis) kpis.innerHTML = '';
    show('step-source');
    fileInput.value = '';
    folderInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 窗口尺寸变化时重绘图表
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!currentAnalysis) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCharts(currentAnalysis), 150);
  });

  // ============================================================
  // Service Worker 注册
  // ============================================================

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW 注册失败（可忽略）:', err);
      });
    });
  }

})();
