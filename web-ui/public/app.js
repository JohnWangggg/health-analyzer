/**
 * 苹果健康数据分析 PWA - 主应用
 */

(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');
  /** UI i18n helper (falls back to Chinese key text when i18n.js missing) */
  const t = (key, vars) =>
    (window.I18n && typeof window.I18n.t === 'function') ? window.I18n.t(key, vars) : key;

  let currentAnalysis = null;
  let currentPromptTab = 'full';
  let deferredInstallPrompt = null;
  /** 图表时间范围：7|30|90|0(全部) */
  const CHART_RANGE_KEY = 'health-analyzer-chart-range';
  const SIDE_NAV_COLLAPSED_KEY = 'health-analyzer-side-nav-collapsed';
  let chartRangeDays = (() => {
    try {
      const v = Number(window.localStorage.getItem(CHART_RANGE_KEY));
      if (v === 0 || v === 7 || v === 30 || v === 90) return v;
    } catch (e) { /* ignore */ }
    return 30;
  })();
  /** 最近一次成功选中的文件，供失败后「重试（保留设置）」 */
  let lastSelectedFiles = null;
  /** 最近一次 CSV 合并说明（展示在质量横幅旁） */
  let lastCsvMergeNote = '';
  const CTX_STORAGE_KEY = 'health-analyzer-user-context-v1';
  const RECOVERY_WEIGHTS_KEY = 'health-analyzer-recovery-weights';
  const THEME_KEY = 'health-analyzer-theme'; // system | light | dark

  const DEFAULT_RECOVERY_WEIGHTS = {
    hrv: 1,
    sleep: 1,
    nightHr: 1,
    spo2Night: 1,
    exercise: 1,
    workout: 1,
    steps: 1,
  };

  function getDefaultRecoveryWeights() {
    const libDef =
      window.HealthAnalyzer && window.HealthAnalyzer.DEFAULT_RECOVERY_WEIGHTS;
    if (libDef && typeof libDef === 'object') {
      return { ...DEFAULT_RECOVERY_WEIGHTS, ...libDef };
    }
    return { ...DEFAULT_RECOVERY_WEIGHTS };
  }

  function normalizeRecoveryWeightsLocal(raw) {
    if (
      window.HealthAnalyzer &&
      typeof window.HealthAnalyzer.normalizeRecoveryWeights === 'function'
    ) {
      return window.HealthAnalyzer.normalizeRecoveryWeights(raw);
    }
    const base = getDefaultRecoveryWeights();
    if (!raw || typeof raw !== 'object') return base;
    for (const k of Object.keys(base)) {
      const v = Number(raw[k]);
      if (Number.isFinite(v) && v > 0) base[k] = v;
    }
    return base;
  }

  function loadRecoveryWeights() {
    try {
      const raw = window.localStorage.getItem(RECOVERY_WEIGHTS_KEY);
      if (!raw) return getDefaultRecoveryWeights();
      return normalizeRecoveryWeightsLocal(JSON.parse(raw));
    } catch (e) {
      return getDefaultRecoveryWeights();
    }
  }

  function saveRecoveryWeights(weights) {
    const w = normalizeRecoveryWeightsLocal(weights);
    try {
      window.localStorage.setItem(RECOVERY_WEIGHTS_KEY, JSON.stringify(w));
    } catch (e) {
      /* ignore quota */
    }
    return w;
  }

  /** 当前生效的恢复权重（内存缓存，与 localStorage 同步） */
  let recoveryWeights = loadRecoveryWeights();

  // ============================================================
  // 外观（浅色 / 深色 / 跟随系统）
  // ============================================================

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(THEME_KEY) || 'system';
    } catch {
      return 'system';
    }
  }

  function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyTheme(mode) {
    const m = mode || getStoredTheme();
    const root = document.documentElement;
    if (m === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', m);
    }
    const resolved = resolveTheme(m);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1a5276' : '#2980b9');
    const icon = $('theme-toggle-icon');
    const label = $('theme-toggle-label');
    if (icon) icon.textContent = resolved === 'dark' ? '☾' : '☀';
    if (label) {
      label.textContent = m === 'system' ? '自动' : (m === 'dark' ? '深色' : '浅色');
    }
    const btn = $('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', '当前外观：' + (m === 'system' ? '跟随系统' : m === 'dark' ? '深色' : '浅色') + '，点击切换');
      btn.title = '点击切换：浅色 → 深色 → 自动';
    }
    // 主题变更后重绘图表
    if (currentAnalysis) {
      try { renderCharts(currentAnalysis); } catch (e) { /* ignore early */ }
    }
  }

  function cycleTheme() {
    const cur = getStoredTheme();
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    applyTheme(next);
  }

  applyTheme(getStoredTheme());
  $('theme-toggle')?.addEventListener('click', cycleTheme);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    });
  } catch (e) { /* ignore */ }

  // ============================================================
  // 添加到主屏幕引导
  // ============================================================

  const installGuide = $('install-guide');
  const installGuideText = $('install-guide-text');
  const installAction = $('install-action');
  const installDismiss = $('install-dismiss');
  const installSteps = $('install-steps');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const installDismissed = (() => {
    try { return window.localStorage.getItem('health-analyzer-install-dismissed') === '1'; } catch { return false; }
  })();

  function fillInstallSteps() {
    if (!installSteps) return;
    const steps = isIos
      ? [
          '用 Safari 打开本页（其他浏览器通常无法添加到主屏幕）',
          '点底部中间的「分享」按钮',
          '向下滑动，选择「添加到主屏幕」',
          '确认名称后点「添加」',
        ]
      : [
          '打开浏览器菜单（⋮ 或 ⋯）',
          '选择「安装应用」或「添加到主屏幕」',
          '确认安装后，从桌面图标启动即可离线使用',
        ];
    installSteps.innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  }

  function showInstallGuide() {
    if (!installGuide || isStandalone || installDismissed) return;
    installGuide.classList.remove('hidden');
    fillInstallSteps();
    if (isIos) {
      if (installGuideText) installGuideText.textContent = 'iPhone：用 Safari 分享 → 添加到主屏幕，可像 App 一样打开。';
      if (installAction) installAction.textContent = '查看 iPhone 步骤';
    } else {
      if (installGuideText) installGuideText.textContent = '可安装到桌面，离线也能打开本工具（健康数据仍只在本机处理）。';
      if (installAction) installAction.textContent = deferredInstallPrompt ? '安装应用' : '查看安装步骤';
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
    if (installSteps) {
      const showing = !installSteps.classList.contains('hidden');
      installSteps.classList.toggle('hidden', showing);
      if (installAction) {
        installAction.textContent = showing
          ? (isIos ? '查看 iPhone 步骤' : '查看安装步骤')
          : '收起步骤';
      }
      return;
    }
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
    if (files && files.length) {
      lastSelectedFiles = Array.from(files);
    }
    const source = document.querySelector('input[name="source"]:checked').value;

    show('step-progress');
    setProgress(0.02, '准备中…', { stage: 'read', hint: '正在准备读取文件…' });

    try {
      let xmlText = '';
      let xmlBytes = null;  // 流式解析的字节流
      let ecgFiles = [];

      if (source === 'apple_health_export') {
        const zipFile = files.find(f => f.name.endsWith('.zip'));
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (zipFile) {
          setProgress(0.04, '解压 ZIP…', {
            stage: 'read',
            hint: zipFile.size > 200 * 1024 * 1024
              ? '文件较大（200MB+），解压与解析可能需要 30–90 秒…'
              : '正在本机解压，不会上传…',
          });
          const result = await extractXmlFromZipBrowser(zipFile);
          xmlBytes = result.xmlBytes;  // 直接使用字节流，避免 512MB 字符串限制
          ecgFiles = result.ecgEntries.map(e => ({ name: e.filename, _text: e.text }));
        } else if (xmlFile) {
          setProgress(0.04, '读取 XML…', { stage: 'read' });
          xmlText = await readFileAsText(xmlFile);
        } else {
          throw new Error('请选择 .zip 包或 .xml 文件');
        }
        // ZIP/XML 同批上传的 ECG CSV 一并收录
        if (!ecgFiles.length) {
          ecgFiles = files.filter(
            (f) =>
              f.name.endsWith('.csv') &&
              (f.name.includes('ecg') ||
                (f.webkitRelativePath || '').includes('electrocardiograms'))
          );
        }
      } else if (source === 'xml_only') {
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error('未选择 XML 文件');
        setProgress(0.04, '读取 XML…', { stage: 'read' });
        xmlText = await readFileAsText(xmlFile);
        // 同批多选的 CSV 一并尝试作为 ECG（内容校验在 ingest）
        ecgFiles = files.filter((f) => f.name.endsWith('.csv'));
      } else if (source === 'folder') {
        const xmlFile = files.find(f => /export|导出/i.test(f.name) && f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error('文件夹中未找到 export.xml 或 导出.xml');
        setProgress(0.04, '读取文件夹…', { stage: 'read' });
        xmlText = await readFileAsText(xmlFile);
        // 收集 ECG 文件（electrocardiograms 目录或文件名含 ecg）
        ecgFiles = files.filter(f => f.name.endsWith('.csv') && (f.name.includes('ecg') || (f.webkitRelativePath || '').includes('electrocardiograms')));
      }

      setProgress(0.08, '解析健康记录…', {
        stage: 'parse',
        hint: '优先在后台线程解析；失败时自动回退主线程…',
      });

      // 可选日期范围（YYYY-MM-DD）；留空则不过滤
      const parseOptions = getDateFilterOptions();
      parseOptions.onProgress = (p) =>
        setProgress(0.08 + p * 0.72, `解析记录… ${Math.round(p * 100)}%`, {
          stage: 'parse',
          hint: p < 0.5 ? '正在扫描 Record…' : '后半段通常包含心率/活动等高频数据…',
        });

      // Worker 优先；失败自动回退主线程
      let data;
      if (xmlBytes) {
        data = await parseHealthData(xmlBytes, parseOptions);
      } else {
        data = await parseHealthData(xmlText, parseOptions);
      }

      // 解析 ECG（同样排除未来日期）
      const ingestEcg = (summary) => {
        if (!ecgWithinDateFilter(summary, parseOptions)) {
          const raw = summary && summary.datetime ? String(summary.datetime).slice(0, 10) : '';
          const ref =
            parseOptions.referenceDate ||
            (window.HealthAnalyzer.getLocalToday && window.HealthAnalyzer.getLocalToday());
          if (ref && raw > ref) noteEcgSkippedFuture(data, summary);
          return;
        }
        data.ecg.push(summary);
        data.dataAvailability.hasEcg = true;
      };

      if (ecgFiles.length > 0) {
        for (const f of ecgFiles) {
          try {
            const text = f._text || await readFileAsText(f);
            ingestEcg(window.HealthAnalyzer.parseEcgCsv(text));
          } catch (e) { /* ignore */ }
        }
      } else {
        const allCsv = files.filter(f => f.name.endsWith('.csv'));
        for (const f of allCsv) {
          try {
            const text = await readFileAsText(f);
            if (text.includes('分类') && text.includes('记录日期')) {
              ingestEcg(window.HealthAnalyzer.parseEcgCsv(text));
            }
          } catch (e) { /* ignore */ }
        }
      }

      // 可选：合并外部 CSV（上传区已选文件）
      setProgress(0.86, '合并外部 CSV…', { stage: 'stats', hint: '若已选择体脂秤/血压 CSV 则合并…' });
      lastCsvMergeNote = '';
      try {
        const mergeNote = await applySelectedCsvToData(data);
        if (mergeNote) lastCsvMergeNote = mergeNote;
      } catch (e) {
        console.warn('CSV 合并跳过', e);
      }

      setProgress(0.92, '生成统计与摘要…', { stage: 'stats', hint: '计算 KPI、晨重、CGM 稳定期与提示词…' });
      recoveryWeights = loadRecoveryWeights();
      currentAnalysis = window.HealthAnalyzer.analyzeAll(data, {
        recoveryWeights,
      });

      setProgress(1, '完成', { stage: 'done', hint: '即将展示监测概览…' });
      setTimeout(() => {
        hide('step-progress');
        renderResults(currentAnalysis);
      }, 220);

    } catch (err) {
      setProgress(0, '错误: ' + err.message);
      console.error(err);
      showError(err.message);
      hide('step-progress');
    }
  }

  const PROGRESS_CARD_HTML = `
      <h2><span class="step-num">2</span> 正在分析</h2>
      <p class="progress-lead">数据只在本机处理，不会上传。大文件可能需要几十秒，请保持页面打开。</p>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <p id="progress-text" class="progress-text">准备中...</p>
      <p id="progress-hint" class="progress-hint">正在读取文件…</p>
      <ol class="progress-stages" id="progress-stages">
        <li data-stage="read">读取文件</li>
        <li data-stage="parse">解析记录</li>
        <li data-stage="stats">生成统计</li>
        <li data-stage="done">完成</li>
      </ol>
  `;

  function ensureProgressCard() {
    const card = $('step-progress');
    if (!card) return;
    if (!$('progress-fill') || !$('progress-text')) {
      card.innerHTML = PROGRESS_CARD_HTML;
    }
  }

  function setProgressStage(stage) {
    const stages = document.querySelectorAll('#progress-stages [data-stage]');
    let hit = false;
    stages.forEach((el) => {
      const key = el.getAttribute('data-stage');
      el.classList.remove('is-active', 'is-done');
      if (key === stage) {
        el.classList.add('is-active');
        hit = true;
      } else if (!hit) {
        el.classList.add('is-done');
      }
    });
  }

  function setProgress(ratio, text, opts) {
    ensureProgressCard();
    const fill = $('progress-fill');
    const label = $('progress-text');
    const hint = $('progress-hint');
    const bar = $('progress-bar');
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    if (fill) fill.style.width = pct + '%';
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
    if (label) label.textContent = text;
    if (hint) {
      if (opts && opts.hint) hint.textContent = opts.hint;
      else if (ratio < 0.05) hint.textContent = '正在读取与解压文件（ZIP 越大越慢）…';
      else if (ratio < 0.75) hint.textContent = '正在扫描健康记录，可后台进行，请勿关闭页面…';
      else if (ratio < 1) hint.textContent = '正在汇总指标与生成摘要…';
      else hint.textContent = '即将展示结果…';
    }
    if (opts && opts.stage) setProgressStage(opts.stage);
    else if (ratio < 0.05) setProgressStage('read');
    else if (ratio < 0.85) setProgressStage('parse');
    else if (ratio < 1) setProgressStage('stats');
    else setProgressStage('done');
  }

  function showError(msg) {
    const card = $('step-progress');
    const canRetrySame = !!(lastSelectedFiles && lastSelectedFiles.length);
    card.innerHTML = `
      <h2><span class="step-num">✗</span> 解析失败</h2>
      <div class="error-box" role="alert">
        <strong>错误信息：</strong> ${escapeHtml(msg)}
      </div>
      <p class="progress-hint" style="text-align:left;margin-top:10px;">
        日期范围与个人背景仍会保留。可直接重试同一文件，或重新选择文件。
      </p>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;color:var(--primary);">可能的解决方案</summary>
        <ul style="padding-left:24px;margin-top:8px;font-size:14px;line-height:1.8;">
          <li>确认 ZIP 包是 iPhone 苹果健康 App 导出的原始数据</li>
          <li>ZIP 包内应包含 <code>export.xml</code> 或 <code>导出.xml</code>（非 export_cda.xml）</li>
          <li>解压失败时可改用「单独 XML」或电脑端文件夹导入</li>
          <li>大型文件（500MB+）请保持页面打开，并关闭其他标签页释放内存</li>
          <li>若设置了日期范围，请确认开始日期不晚于结束日期</li>
        </ul>
      </details>
      <div class="error-actions">
        ${canRetrySame ? '<button id="btn-retry-same" class="btn-primary" type="button">重试（保留设置）</button>' : ''}
        <button id="btn-retry" class="btn-secondary" type="button">重新选择文件</button>
      </div>
    `;
    show('step-progress');
    const retrySame = $('btn-retry-same');
    const retryBtn = $('btn-retry');
    (retrySame || retryBtn)?.focus();
    retrySame?.addEventListener('click', () => {
      card.innerHTML = PROGRESS_CARD_HTML;
      if (lastSelectedFiles && lastSelectedFiles.length) {
        handleFiles(lastSelectedFiles);
      }
    });
    retryBtn?.addEventListener('click', () => {
      card.innerHTML = PROGRESS_CARD_HTML;
      hide('step-progress');
      fileInput.value = '';
      folderInput.value = '';
      openFilePicker();
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

  /** Result section ids used by sticky top nav + desktop side rail */
  const RESULT_SECTION_IDS = [
    'step-overview',
    'step-summary',
    'step-signals',
    'step-charts',
    'step-export',
    'step-prompt',
  ];

  let resultNavObserver = null;

  function setResultNavActive(sectionId) {
    if (!sectionId) return;
    const href = '#' + sectionId;
    document.querySelectorAll('.result-nav-link').forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('href') === href);
    });
  }

  function teardownResultNavSpy() {
    if (resultNavObserver) {
      resultNavObserver.disconnect();
      resultNavObserver = null;
    }
    document.querySelectorAll('.result-nav-link.is-active').forEach((a) => {
      a.classList.remove('is-active');
    });
  }

  function setupResultNavSpy() {
    teardownResultNavSpy();
    if (typeof IntersectionObserver === 'undefined') return;

    const sections = RESULT_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((el) => el && !el.classList.contains('hidden'));
    if (!sections.length) return;

    // Track which sections are in view; pick the top-most intersecting one
    const visible = new Map();
    resultNavObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry);
          else visible.delete(entry.target.id);
        }
        let bestId = null;
        let bestTop = Infinity;
        visible.forEach((entry, id) => {
          const top = entry.boundingClientRect.top;
          if (top < bestTop) {
            bestTop = top;
            bestId = id;
          }
        });
        if (bestId) setResultNavActive(bestId);
      },
      {
        /* Prefer section near upper third of viewport */
        root: null,
        rootMargin: '-15% 0px -55% 0px',
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );
    sections.forEach((el) => resultNavObserver.observe(el));
  }

  function setResultsVisible(visible) {
    document.body.classList.toggle('has-results', !!visible);
    const sticky = $('sticky-cta');
    if (sticky) sticky.classList.toggle('hidden', !visible);
    // Sticky top nav (mobile/tablet) + desktop left rail (CSS hides each at wrong breakpoints)
    const nav = $('result-sticky-nav');
    if (nav) nav.classList.toggle('hidden', !visible);
    const sideNav = $('result-side-nav');
    if (sideNav) sideNav.classList.toggle('hidden', !visible);
    // 有结果后收起上传区，降低干扰
    const source = $('step-source');
    if (source) {
      if (visible) source.classList.add('source-collapsed');
      else source.classList.remove('source-collapsed');
    }
    if (visible) {
      // Defer until result sections are un-hidden by renderResults
      requestAnimationFrame(() => setupResultNavSpy());
    } else {
      teardownResultNavSpy();
    }
  }

  function loadSideNavCollapsed() {
    try { return window.localStorage.getItem(SIDE_NAV_COLLAPSED_KEY) === '1'; } catch { return false; }
  }

  function saveSideNavCollapsed(collapsed) {
    try { window.localStorage.setItem(SIDE_NAV_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }

  function applySideNavCollapsed(collapsed) {
    document.body.classList.toggle('side-nav-collapsed', !!collapsed);
    const btn = $('side-nav-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const icon = btn.querySelector('.toggle-icon');
      const text = btn.querySelector('.toggle-text');
      if (icon) icon.textContent = collapsed ? '▶' : '◀';
      if (text) text.textContent = t(collapsed ? 'nav.expand' : 'nav.collapse');
    }
  }

  function toggleSideNav() {
    const next = !document.body.classList.contains('side-nav-collapsed');
    saveSideNavCollapsed(next);
    applySideNavCollapsed(next);
  }

  function initResultNavKeyboard() {
    [$('result-sticky-nav'), $('result-side-nav')].forEach((nav) => {
      if (!nav) return;
      nav.addEventListener('keydown', (e) => {
        const links = Array.from(nav.querySelectorAll('.result-nav-link'));
        const idx = links.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = links[(idx + 1) % links.length];
          next?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = links[(idx - 1 + links.length) % links.length];
          prev?.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          links[0]?.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          links[links.length - 1]?.focus();
        }
      });
    });
  }

  // 恢复侧栏折叠状态（无结果时 class 存在但不生效，有结果后 CSS 立即响应）
  applySideNavCollapsed(loadSideNavCollapsed());
  $('side-nav-toggle')?.addEventListener('click', toggleSideNav);
  initResultNavKeyboard();

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
    bindRecoveryWeightsUi();
    renderSignals(analysis);
    renderCharts(analysis);
    renderPrompt();
    refreshHistorySelect().catch(() => { /* ignore */ });
    refreshWeeklyReportList().catch(() => { /* ignore */ });

    // 图表 DOM 就绪后再渲染可点摘要（含「看曲线」）与引导
    renderInsights(analysis);
    showInsightCoachOnce();

    $('step-overview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getRecoveryWeightPresets() {
    const lib =
      window.HealthAnalyzer && window.HealthAnalyzer.RECOVERY_WEIGHT_PRESETS;
    if (lib && typeof lib === 'object') return lib;
    // 离线兜底（与 lib types 一致）
    return {
      balanced: getDefaultRecoveryWeights(),
      recoveryFirst: {
        hrv: 1.4, sleep: 1.4, nightHr: 1.2, spo2Night: 1.1,
        exercise: 0.8, workout: 0.7, steps: 0.8,
      },
      training: {
        hrv: 0.9, sleep: 1.0, nightHr: 0.9, spo2Night: 0.8,
        exercise: 1.3, workout: 1.4, steps: 1.2,
      },
      weightLoss: {
        hrv: 1.0, sleep: 1.2, nightHr: 1.0, spo2Night: 1.0,
        exercise: 1.2, workout: 1.0, steps: 1.3,
      },
    };
  }

  function weightsRoughlyEqual(a, b) {
    if (!a || !b) return false;
    const keys = ['hrv', 'sleep', 'nightHr', 'spo2Night', 'exercise', 'workout', 'steps'];
    for (const k of keys) {
      if (Math.abs(Number(a[k] || 1) - Number(b[k] || 1)) > 0.05) return false;
    }
    return true;
  }

  function matchRecoveryPresetId(weights) {
    const w = normalizeRecoveryWeightsLocal(weights);
    const presets = getRecoveryWeightPresets();
    for (const id of ['balanced', 'recoveryFirst', 'training', 'weightLoss']) {
      if (presets[id] && weightsRoughlyEqual(w, normalizeRecoveryWeightsLocal(presets[id]))) {
        return id;
      }
    }
    return null;
  }

  function markActiveRecoveryPreset(activeId) {
    document.querySelectorAll('[data-rw-preset]').forEach((btn) => {
      const id = btn.getAttribute('data-rw-preset');
      btn.classList.toggle('is-active', id === activeId);
    });
  }

  function applyRecoveryWeightPreset(presetId) {
    const presets = getRecoveryWeightPresets();
    const raw = presets[presetId];
    if (!raw) return false;
    const w = normalizeRecoveryWeightsLocal(raw);
    fillRecoveryWeightsForm(w);
    const ok = recomputeRecoveryWithWeights(w);
    markActiveRecoveryPreset(presetId);
    const st = $('rw-weights-status');
    const label = t(`rw.preset.${presetId}`) || presetId;
    if (st) {
      st.textContent = ok
        ? t('rw.preset.applied', { name: label }) || `✓ ${label}`
        : t('export.err.needAnalysis') || '请先完成分析';
      st.classList.add('show');
      setTimeout(() => st.classList.remove('show'), 2200);
    }
    if (ok) {
      showToast(
        t('rw.preset.toast', { name: label }) || `已应用预设：${label}`,
        { ok: true, ms: 2200 }
      );
    }
    return ok;
  }

  /** 绑定恢复权重滑块与预设 chips（renderSummary 后调用） */
  function bindRecoveryWeightsUi() {
    const panel = $('rw-weights-panel');
    if (!panel || panel.dataset.bound === '1') {
      // 每次 renderSummary 重建 DOM，需重新绑定
    }
    const keys = ['hrv', 'sleep', 'nightHr', 'spo2Night', 'exercise', 'workout', 'steps'];
    for (const k of keys) {
      const el = $(`rw-weight-${k}`);
      if (!el) continue;
      el.oninput = () => {
        const lab = $(`rw-weight-${k}-val`);
        if (lab) lab.textContent = Number(el.value).toFixed(1);
        // 手动改滑块后取消预设高亮
        markActiveRecoveryPreset(null);
      };
    }
    document.querySelectorAll('[data-rw-preset]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rw-preset');
        if (id) applyRecoveryWeightPreset(id);
      };
    });
    markActiveRecoveryPreset(matchRecoveryPresetId(recoveryWeights));

    const resetBtn = $('btn-rw-weights-reset');
    if (resetBtn) {
      resetBtn.onclick = () => {
        const def = getDefaultRecoveryWeights();
        fillRecoveryWeightsForm(def);
        markActiveRecoveryPreset('balanced');
        const st = $('rw-weights-status');
        if (st) {
          st.textContent = t('rw.weights.resetHint') || '已填入默认，点应用生效';
          st.classList.add('show');
        }
      };
    }
    const applyBtn = $('btn-rw-weights-apply');
    if (applyBtn) {
      applyBtn.onclick = () => {
        const w = readRecoveryWeightsFromForm();
        const ok = recomputeRecoveryWithWeights(w);
        markActiveRecoveryPreset(matchRecoveryPresetId(w));
        const st = $('rw-weights-status');
        if (st) {
          st.textContent = ok
            ? (t('rw.weights.applied') || '✓ 已按新权重重算')
            : (t('export.err.needAnalysis') || '请先完成分析');
          st.classList.add('show');
          setTimeout(() => st.classList.remove('show'), 2200);
        }
        if (ok) {
          showToast(
            t('rw.weights.toast') || '恢复评分已按个人权重重算',
            { ok: true, ms: 2200 }
          );
        }
      };
    }
  }

  function flashEl(el, ms) {
    if (!el) return;
    el.classList.add('section-flash');
    setTimeout(() => el.classList.remove('section-flash'), ms || 1200);
  }

  function navigateToInsight(anchor, prefer) {
    const map = {
      overview: { section: 'step-overview' },
      summary: { section: 'step-summary' },
      'summary-weight': { section: 'step-summary', panel: 'weight', chart: 'weight' },
      'summary-cgm': { section: 'step-summary', panel: 'cgm', chart: 'cgm' },
      'summary-bp': { section: 'step-summary', panel: 'bp', chart: 'bp' },
      'summary-hrv': { section: 'step-summary', panel: 'hrv', chart: 'hrv' },
      'summary-watch': { section: 'step-summary', panel: 'watch', chart: 'spo2' },
      'summary-workout': { section: 'step-summary', panel: 'workout', chart: 'workout' },
      'summary-recovery': { section: 'step-summary', panel: 'recovery', chart: 'recovery' },
      'summary-ecg': { section: 'step-summary', panel: 'ecg' },
      signals: { section: 'step-signals' },
      charts: { section: 'step-charts' },
      'charts-weight': { section: 'step-charts', chart: 'weight' },
      'charts-cgm': { section: 'step-charts', chart: 'cgm' },
      'charts-bp': { section: 'step-charts', chart: 'bp' },
      'charts-hrv': { section: 'step-charts', chart: 'hrv' },
      'charts-bodyfat': { section: 'step-charts', chart: 'bodyfat' },
      'charts-spo2': { section: 'step-charts', chart: 'spo2' },
      'charts-exercise': { section: 'step-charts', chart: 'exercise' },
      'charts-workout': { section: 'step-charts', chart: 'workout' },
      'charts-recovery': { section: 'step-charts', chart: 'recovery' },
      prompt: { section: 'step-prompt' },
    };
    const target = map[anchor] || map.summary;
    // prefer: 'chart' | 'summary' | undefined
    const goChart = prefer === 'chart' || (prefer !== 'summary' && String(anchor || '').startsWith('charts-'));
    const sectionId = goChart && target.chart ? 'step-charts' : target.section;
    const section = $(sectionId);
    if (!section) return;
    section.classList.remove('hidden');

    if (!goChart && target.panel) {
      const acc = section.querySelector(`.summary-acc[data-panel="${target.panel}"]`);
      if (acc) {
        acc.open = true;
        section.querySelectorAll('.summary-acc').forEach((el) => {
          if (el !== acc) el.open = false;
        });
      }
    }

    // 跳图表：保持当前 range chip（默认不改）；若图表区尚未渲染则补一次
    if (goChart && target.chart && currentAnalysis) {
      const chartSec = $('step-charts');
      const host = $('charts-content');
      const hasBlock = host && host.querySelector(`[data-chart="${target.chart}"]`);
      if (host && (!hasBlock || !host.querySelector('.chart-block'))) {
        try { renderCharts(currentAnalysis); } catch (e) { /* ignore */ }
      }
      // 同步 chips 激活态（range 仍用 chartRangeDays，不强制切换）
      document.querySelectorAll('#chart-range-chips .chip').forEach((btn) => {
        const d = Number(btn.getAttribute('data-days'));
        btn.classList.toggle('is-active', d === chartRangeDays);
      });
      if (chartSec) chartSec.classList.remove('hidden');
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashEl(section, 1000);

    if (target.chart) {
      const chartSec = $('step-charts');
      const chartBlock = chartSec && chartSec.querySelector(`[data-chart="${target.chart}"]`);
      if (goChart && chartBlock) {
        setTimeout(() => {
          chartBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
          flashEl(chartBlock, 1400);
        }, 280);
      } else if (!goChart && chartBlock && prefer !== 'summary') {
        // 默认：先看明细，不强制滚图表；图表入口由「看曲线」触发
      }
    }
  }

  /** 轻量 toast（复制成功等） */
  function showToast(message, opts) {
    let host = document.getElementById('app-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-toast';
      host.className = 'app-toast';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.classList.add('is-show');
    if (opts && opts.ok) host.classList.add('is-ok');
    else host.classList.remove('is-ok');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      host.classList.remove('is-show');
    }, (opts && opts.ms) || 2200);
  }

  function showInsightCoachOnce() {
    try {
      if (window.localStorage.getItem('health-analyzer-insight-coach') === '1') return;
    } catch (e) { /* ignore */ }
    const panel = document.querySelector('.insight-panel');
    if (!panel || panel.querySelector('.insight-coach')) return;
    const tip = document.createElement('div');
    tip.className = 'insight-coach';
    tip.innerHTML = `
      <span>点条目看<strong>明细</strong>，或点「看曲线」核对趋势。</span>
      <button type="button" class="btn-ghost insight-coach-dismiss" aria-label="知道了">知道了</button>
    `;
    panel.insertBefore(tip, panel.querySelector('.insight-list'));
    tip.querySelector('.insight-coach-dismiss')?.addEventListener('click', () => {
      tip.remove();
      try { window.localStorage.setItem('health-analyzer-insight-coach', '1'); } catch (e) { /* ignore */ }
    });
    // 8 秒后自动收起（不强制记 localStorage，除非点知道了）
    setTimeout(() => {
      if (tip.parentNode) tip.classList.add('is-fading');
      setTimeout(() => tip.remove(), 400);
    }, 8000);
  }

  function panelKeyFromTitle(title) {
    const t = String(title || '');
    if (/CGM|血糖/.test(t)) return 'cgm';
    if (/血压/.test(t)) return 'bp';
    if (/体重|体脂/.test(t)) return 'weight';
    if (/HRV|心率变异/.test(t)) return 'hrv';
    if (/负荷|恢复/.test(t)) return 'recovery';
    if (/Workout|训练会话|训练/.test(t)) return 'workout';
    if (/Watch|血氧|VO₂|VO2|腕温|锻炼|活动|呼吸紊乱|睡眠呼吸/.test(t)) return 'watch';
    if (/静息|步行心率|心率/.test(t)) return 'hr';
    if (/步数/.test(t)) return 'steps';
    if (/睡眠/.test(t)) return 'sleep';
    if (/ECG|心电/.test(t)) return 'ecg';
    return 'other';
  }

  function getAnalysisLocale() {
    try {
      if (window.I18n && typeof window.I18n.getLocale === 'function') {
        return window.I18n.getLocale() || 'zh-CN';
      }
    } catch (_) { /* ignore */ }
    return 'zh-CN';
  }

  function analysisLocaleOpts() {
    return { locale: getAnalysisLocale() };
  }

  function renderInsights(analysis) {
    const list = $('insight-list');
    if (!list) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.buildInsightBullets !== 'function') {
      list.innerHTML = '<li class="insight-item tone-neutral"><div class="insight-title">摘要模块未加载</div></li>';
      return;
    }
    const bullets = window.HealthAnalyzer.buildInsightBullets(analysis, analysisLocaleOpts()) || [];
    if (!bullets.length) {
      list.innerHTML =
        `<li class="insight-item tone-neutral empty-state-card">` +
        `<div class="insight-title">${escapeHtml(t('empty.insights.title'))}</div>` +
        `<p class="insight-detail">${escapeHtml(t('empty.insights.detail'))}</p></li>`;
      return;
    }
    const toneLabel = (tone) => {
      if (tone === 'alert') return t('tone.alert');
      if (tone === 'watch') return t('tone.watch');
      if (tone === 'positive') return t('tone.positive');
      return t('tone.neutral');
    };
    const chartKeyFromAnchor = (a) => {
      if (!a) return '';
      if (a.includes('cgm')) return 'cgm';
      if (a.includes('bodyfat')) return 'bodyfat';
      if (a.includes('weight')) return 'weight';
      if (a.includes('bp') || a.includes('血压')) return 'bp';
      if (a.includes('hrv')) return 'hrv';
      if (a.includes('workout')) return 'workout';
      if (a.includes('recovery') || a.includes('恢复') || a.includes('负荷')) return 'recovery';
      if (a.includes('exercise')) return 'exercise';
      if (a.includes('watch') || a.includes('spo2')) return 'spo2';
      return '';
    };

    list.innerHTML = bullets.map((b, idx) => {
      const anchor = b.anchor || 'summary';
      const chartKey = chartKeyFromAnchor(anchor);
      // 图表可能尚未渲染完：根据分析数据预判；canChart 为 false 时不显示「看曲线」
      const canChart =
        chartKey === 'cgm' ? !!(analysis.cgmStats) :
        chartKey === 'weight' ? !!(analysis.weightStats || (analysis.data && analysis.data.weight && analysis.data.weight.length)) :
        chartKey === 'bodyfat' ? !!(
          analysis.weightStats &&
          analysis.weightStats.trendSeries &&
          analysis.weightStats.trendSeries.some((w) => w.bodyFat != null && Number.isFinite(w.bodyFat))
        ) :
        chartKey === 'bp' ? !!(analysis.bpStats) :
        chartKey === 'hrv' ? !!(analysis.hrvByDate && Object.keys(analysis.hrvByDate).length) :
        chartKey === 'spo2' || chartKey === 'exercise' ? !!(analysis.watchStats && analysis.watchStats.dayCount) :
        chartKey === 'workout' ? !!(analysis.workoutStats && analysis.workoutStats.count) :
        chartKey === 'recovery' ? !!(analysis.recoveryWeeks && analysis.recoveryWeeks.length >= 2) :
        false;
      const actions = `
        <span class="insight-actions">
          <button type="button" class="insight-act" data-prefer="summary" data-anchor="${escapeHtml(anchor)}">${escapeHtml(t('action.detail'))}</button>
          ${canChart ? `<button type="button" class="insight-act" data-prefer="chart" data-anchor="${escapeHtml(anchor)}">${escapeHtml(t('action.chart'))}</button>` : ''}
        </span>`;
      return `
      <li class="insight-item tone-${escapeHtml(b.tone || 'neutral')} is-clickable" data-anchor="${escapeHtml(anchor)}" data-idx="${idx}" role="button" tabindex="0">
        <div class="insight-meta">
          <span class="insight-badge">${toneLabel(b.tone)}</span>
          ${actions}
        </div>
        <div class="insight-title">${escapeHtml(b.title)}</div>
        <p class="insight-detail">${escapeHtml(b.detail)}</p>
      </li>`;
    }).join('');

    list.querySelectorAll('.insight-item[data-anchor]').forEach((el) => {
      const go = (prefer) => navigateToInsight(el.getAttribute('data-anchor'), prefer);
      el.addEventListener('click', (e) => {
        const act = e.target.closest('.insight-act');
        if (act) {
          e.stopPropagation();
          go(act.getAttribute('data-prefer') || 'summary');
          return;
        }
        go('summary');
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go('summary');
        }
      });
    });
  }

  function renderKpis(analysis) {
    const grid = $('kpi-grid');
    if (!grid) return;
    const data = analysis.data || {};
    const items = [];

    if (analysis.cgmStats) {
      const o = analysis.cgmStats.stable || analysis.cgmStats.overall;
      const label = analysis.cgmStats.stable ? 'CGM 稳定期' : 'CGM 均值';
      let tone = 'neutral';
      if (o.pctBelow30 > 0) tone = 'alert';
      else if (o.pctBelow39 >= 5) tone = 'watch';
      else if (o.pctInRange >= 90) tone = 'good';
      items.push({
        label,
        value: o.mean.toFixed(2),
        unit: 'mmol/L',
        sub: `TIR ${o.pctInRange.toFixed(0)}% · n=${o.count}` +
          (analysis.cgmStats.firstDayDate ? ` · 已排除首日` : ''),
        tone,
      });
    }
    if (analysis.bpStats && analysis.bpStats.mean7d) {
      const m = analysis.bpStats.mean7d;
      const morn = analysis.bpStats.morning7d;
      const eve = analysis.bpStats.evening7d;
      let sub = `${m.count} 条` + (m.lowCount ? ` · ${m.lowCount} 次偏低` : '');
      if (morn && eve) {
        sub = `晨 ${morn.systolic.toFixed(0)} / 晚 ${eve.systolic.toFixed(0)}`;
      }
      let tone = 'neutral';
      if (m.lowCount >= 3 || m.systolic < 95) tone = 'watch';
      else if (m.systolic >= 100 && m.systolic < 125 && m.lowCount === 0) tone = 'good';
      items.push({
        label: '血压 7 日',
        value: `${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)}`,
        unit: 'mmHg',
        sub,
        tone,
      });
    }
    if (analysis.weightStats && analysis.weightStats.latestTrend) {
      const lt = analysis.weightStats.latestTrend;
      const et = analysis.weightStats.earliestTrend;
      const delta = et ? lt.weight - et.weight : 0;
      const fat = lt.bodyFat != null ? ` · 体脂 ${lt.bodyFat.toFixed(1)}%` : '';
      items.push({
        label: '晨起体重',
        value: lt.weight.toFixed(1),
        unit: 'kg',
        sub: `${lt.date.slice(5)} · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg${fat}`,
        tone: delta <= -10 ? 'watch' : 'neutral',
      });
    } else if (data.weight && data.weight.length) {
      const latest = data.weight[data.weight.length - 1];
      items.push({
        label: '最新体重',
        value: latest.value.toFixed(1),
        unit: 'kg',
        sub: latest.date || latest.datetime.slice(0, 10),
        tone: 'neutral',
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
        tone: avg != null && avg < 25 ? 'watch' : avg != null && avg >= 40 ? 'good' : 'neutral',
      });
    }
    const wstats = analysis.watchStats;
    if (wstats && wstats.dayCount > 0) {
      if (wstats.exerciseMinMean7d != null || wstats.activeKcalMean7d != null) {
        const ex = wstats.exerciseMinMean7d;
        items.push({
          label: '锻炼 7 日',
          value: ex != null ? String(Math.round(ex)) : '—',
          unit: 'min/日',
          sub:
            (wstats.activeKcalMean7d != null
              ? `活动 ~${Math.round(wstats.activeKcalMean7d)} kcal`
              : 'Watch 活动') + ` · ${wstats.dayCount} 天`,
          tone: ex != null && ex >= 20 ? 'good' : ex != null && ex < 5 ? 'watch' : 'neutral',
        });
      }
      if (wstats.spo2Mean7d != null) {
        let tone = 'good';
        if (wstats.spo2Min7d != null && wstats.spo2Min7d < 92) tone = 'watch';
        else if (wstats.spo2Mean7d < 95) tone = 'watch';
        items.push({
          label: '血氧 7 日',
          value: wstats.spo2Mean7d.toFixed(1),
          unit: '%',
          sub:
            (wstats.spo2Min7d != null ? `最低 ${wstats.spo2Min7d.toFixed(1)}% · ` : '') +
            `${wstats.spo2DayCount} 天`,
          tone,
        });
      }
      if (wstats.vo2Latest != null) {
        const d = wstats.vo2Delta;
        items.push({
          label: 'VO₂ max',
          value: wstats.vo2Latest.toFixed(1),
          unit: 'mL/kg/min',
          sub:
            d != null
              ? `Δ ${d >= 0 ? '+' : ''}${d.toFixed(1)} · ${wstats.vo2DayCount} 天`
              : `${wstats.vo2DayCount} 天估算`,
          tone: d != null && d <= -2 ? 'watch' : 'neutral',
        });
      }
    }
    const wos = analysis.workoutStats;
    if (wos && wos.count > 0) {
      items.push({
        label: 'Workout 30 日',
        value: String(wos.count30d),
        unit: '场',
        sub:
          `${Math.round(wos.durationSum30d)} min` +
          (wos.hrAvgMean30d != null ? ` · 均HR ${wos.hrAvgMean30d.toFixed(0)}` : '') +
          ` · 共 ${wos.count} 场`,
        tone: wos.count30d >= 8 ? 'good' : wos.count30d === 0 ? 'watch' : 'neutral',
      });
    }
    const rw = analysis.recoveryWeek;
    if (rw && (rw.recoveryScore != null || rw.loadScore != null)) {
      items.push({
        label: '周恢复',
        value: rw.recoveryScore != null ? String(rw.recoveryScore) : '—',
        unit: '分',
        sub:
          (rw.loadScore != null ? `负荷 ${rw.loadScore}` : '') +
          (rw.statusLabel ? ` · ${rw.statusLabel.slice(0, 18)}` : ''),
        tone:
          rw.statusTone === 'positive' ? 'good' :
          rw.statusTone === 'watch' || rw.statusTone === 'alert' ? 'watch' : 'neutral',
      });
    }
    if (analysis.ecgStats && analysis.ecgStats.count > 0) {
      const es = analysis.ecgStats;
      items.push({
        label: 'ECG',
        value: String(es.count),
        unit: '份',
        sub:
          (es.highHrCount ? `高心率 ${es.highHrCount} · ` : '') +
          (es.latest ? es.latest.classification : '有记录'),
        tone: es.highHrCount >= 2 ? 'watch' : 'neutral',
      });
    }
    if (!items.length) {
      items.push({
        label: '数据维度',
        value: String(
          Object.values(data.dataAvailability || {}).filter(Boolean).length
        ),
        unit: '类',
        sub: '展开下方可用性',
        tone: 'neutral',
      });
    }

    grid.innerHTML = items.map((it) => `
      <div class="kpi-card tone-${escapeHtml(it.tone || 'neutral')}">
        <div class="kpi-label">${escapeHtml(it.label)}</div>
        <div class="kpi-value"><span class="kpi-num">${escapeHtml(it.value)}</span><span class="kpi-unit">${escapeHtml(it.unit)}</span></div>
        <div class="kpi-sub">${escapeHtml(it.sub || '')}</div>
      </div>
    `).join('');
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
      showToast('已复制完整提示词，可粘贴到大模型', { ok: true, ms: 2400 });
      const sticky = $('btn-copy-sticky');
      if (sticky) {
        const prev = sticky.textContent;
        sticky.textContent = '✓ 已复制';
        setTimeout(() => { sticky.textContent = prev; }, 1600);
      }
      const hero = $('btn-copy-hero');
      if (hero) {
        const prev = hero.textContent;
        hero.textContent = '✓ 已复制';
        setTimeout(() => { hero.textContent = prev; }, 1600);
      }
    } catch (e) {
      if ($('prompt-output')) {
        $('prompt-output').select();
        document.execCommand('copy');
      }
      showToast('已尝试复制（若失败请长按文本手动复制）', { ms: 2800 });
    }
  }

  function severityLabel(sev) {
    if (sev === 'alert') return t('tone.alert');
    if (sev === 'watch') return t('tone.watch');
    return t('tone.neutral');
  }

  function renderSignals(analysis) {
    const container = $('signals-content');
    if (!container) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.detectCrossSignals !== 'function') {
      container.innerHTML = '<p class="hint">信号模块未加载。</p>';
      return;
    }
    const signals = window.HealthAnalyzer.detectCrossSignals(analysis, analysisLocaleOpts());
    if (!signals.length) {
      container.innerHTML = `<p class="hint">${t('signals.empty')}</p>`;
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
      showExportStatus(t('export.ok.json'));
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
        showExportStatus(t('export.ok.csvZip'));
      } else {
        const joined = window.HealthAnalyzer.joinCsvBundle(bundle.csvFiles);
        downloadText(`health-analysis-csv-${day}.txt`, joined, 'text/plain');
        showExportStatus(t('export.ok.csvText'));
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
      showExportStatus(t('export.ok.snapshot'));
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function buildWeeklyReportMarkdown() {
    if (!currentAnalysis) throw new Error('请先完成分析');
    if (
      !window.HealthAnalyzer ||
      typeof window.HealthAnalyzer.generateWeeklyReportMarkdown !== 'function'
    ) {
      throw new Error('周报导出功能未加载，请刷新页面后重试');
    }
    const ctx = typeof getUserContextFromForm === 'function' ? getUserContextFromForm() : null;
    return window.HealthAnalyzer.generateWeeklyReportMarkdown(
      currentAnalysis,
      ctx,
      analysisLocaleOpts()
    );
  }

  function exportWeeklyReport() {
    try {
      const md = buildWeeklyReportMarkdown();
      const end =
        (currentAnalysis.dateRange && currentAnalysis.dateRange.end) ||
        new Date().toISOString().slice(0, 10);
      downloadText(`weekly-report-${end}.md`, md, 'text/markdown');
      showExportStatus(t('export.ok.weekly'));
      // 提示可保存到本机历史
      const saveBtn = $('btn-weekly-save');
      if (saveBtn) {
        saveBtn.classList.add('btn-pulse-hint');
        setTimeout(() => saveBtn.classList.remove('btn-pulse-hint'), 1800);
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function buildVisitSummaryMarkdown() {
    if (!currentAnalysis) throw new Error(t('export.err.needAnalysis'));
    if (
      !window.HealthAnalyzer ||
      typeof window.HealthAnalyzer.generateVisitSummaryMarkdown !== 'function'
    ) {
      throw new Error(t('export.err.needAnalysis'));
    }
    const ctx = typeof getUserContextFromForm === 'function' ? getUserContextFromForm() : null;
    return window.HealthAnalyzer.generateVisitSummaryMarkdown(
      currentAnalysis,
      ctx,
      analysisLocaleOpts()
    );
  }

  function exportVisitSummary() {
    try {
      const md = buildVisitSummaryMarkdown();
      const end =
        (currentAnalysis.dateRange && currentAnalysis.dateRange.end) ||
        new Date().toISOString().slice(0, 10);
      downloadText(`clinic-one-pager-${end}.md`, md, 'text/markdown');
      showExportStatus(t('export.ok.visit'));
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function saveWeeklyReportToHistory() {
    if (!currentAnalysis) {
      alert('请先完成分析');
      return;
    }
    if (!window.HealthHistory || typeof window.HealthHistory.saveWeeklyReport !== 'function') {
      alert('周报历史模块不可用');
      return;
    }
    try {
      const md = buildWeeklyReportMarkdown();
      const end =
        (currentAnalysis.dateRange && currentAnalysis.dateRange.end) ||
        new Date().toISOString().slice(0, 10);
      const labelEl = $('weekly-report-label');
      const label = labelEl && labelEl.value.trim() ? labelEl.value.trim() : '';
      const rw = currentAnalysis.recoveryWeek;
      await window.HealthHistory.saveWeeklyReport({
        weekEnd: end,
        markdown: md,
        label,
        recoveryScore: rw && rw.recoveryScore != null ? rw.recoveryScore : null,
        loadScore: rw && rw.loadScore != null ? rw.loadScore : null,
      });
      showExportStatus('✓ 周报已保存到本机历史');
      await refreshWeeklyReportList();
    } catch (e) {
      alert('保存周报失败: ' + (e.message || e));
    }
  }

  async function refreshWeeklyReportList() {
    const list = $('weekly-report-list');
    if (!list) return;
    if (!window.HealthHistory || typeof window.HealthHistory.listWeeklyReports !== 'function') {
      list.innerHTML = '<p class="hint">周报历史不可用</p>';
      return;
    }
    let rows = [];
    try {
      rows = await window.HealthHistory.listWeeklyReports();
    } catch (e) {
      list.innerHTML = '<p class="hint">IndexedDB 不可用</p>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="hint">暂无已保存的周报（本机，最多 20 条）</p>';
      return;
    }
    list.innerHTML = rows
      .map((r) => {
        const when = (r.savedAt || '').slice(0, 16).replace('T', ' ');
        const week = r.weekEnd || '—';
        const label = r.label ? escapeHtml(r.label) : '';
        const scores =
          (r.recoveryScore != null ? `恢复 ${r.recoveryScore}` : '') +
          (r.loadScore != null ? ` · 负荷 ${r.loadScore}` : '');
        return `
          <div class="weekly-report-item" data-id="${escapeHtml(r.id)}">
            <div class="weekly-report-meta">
              <strong>${escapeHtml(week)}</strong>
              <span class="muted">${escapeHtml(when)}</span>
              ${label ? `<span class="weekly-report-label-tag">${label}</span>` : ''}
              ${scores ? `<span class="muted">${escapeHtml(scores)}</span>` : ''}
            </div>
            <div class="weekly-report-actions">
              <button type="button" class="btn-ghost btn-sm" data-wr-act="copy" data-id="${escapeHtml(r.id)}">复制</button>
              <button type="button" class="btn-ghost btn-sm" data-wr-act="download" data-id="${escapeHtml(r.id)}">下载</button>
              <button type="button" class="btn-danger-text btn-sm" data-wr-act="delete" data-id="${escapeHtml(r.id)}">删除</button>
            </div>
          </div>`;
      })
      .join('');
  }

  async function handleWeeklyReportAction(act, id) {
    if (!window.HealthHistory || !id) return;
    try {
      if (act === 'delete') {
        if (!window.confirm('删除该周报历史？')) return;
        await window.HealthHistory.deleteWeeklyReport(id);
        await refreshWeeklyReportList();
        showExportStatus('✓ 已删除周报');
        return;
      }
      const row = await window.HealthHistory.getWeeklyReport(id);
      if (!row || !row.markdown) {
        alert('未找到该周报');
        return;
      }
      if (act === 'copy') {
        await navigator.clipboard.writeText(row.markdown);
        showExportStatus('✓ 周报已复制');
        showToast('周报 Markdown 已复制', { ok: true, ms: 2000 });
      } else if (act === 'download') {
        const end = row.weekEnd || new Date().toISOString().slice(0, 10);
        downloadText(`weekly-report-${end}.md`, row.markdown, 'text/markdown');
        showExportStatus('✓ 周报已下载');
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  /**
   * 仅用当前权重重算恢复分并刷新 KPI / 摘要 / 图表 / 提示词
   */
  function recomputeRecoveryWithWeights(weights) {
    if (!currentAnalysis) return false;
    const w = normalizeRecoveryWeightsLocal(weights);
    recoveryWeights = saveRecoveryWeights(w);
    const partial = {
      dateRange: currentAnalysis.dateRange,
      hrvByDate: currentAnalysis.hrvByDate,
      restingHrByDate: currentAnalysis.restingHrByDate,
      stepsByDate: currentAnalysis.stepsByDate,
      sleepByDate: currentAnalysis.sleepByDate,
      watchStats: currentAnalysis.watchStats,
      workoutStats: currentAnalysis.workoutStats,
    };
    let result;
    if (
      window.HealthAnalyzer &&
      typeof window.HealthAnalyzer.recomputeRecovery === 'function'
    ) {
      result = window.HealthAnalyzer.recomputeRecovery(partial, {
        weeks: 12,
        recoveryWeights: recoveryWeights,
      });
    } else {
      const recoveryWeeks = window.HealthAnalyzer.calcRecoveryWeeks(partial, {
        weeks: 12,
        recoveryWeights: recoveryWeights,
      });
      const recoveryWeek = window.HealthAnalyzer.calcRecoveryWeek(partial, {
        recoveryWeeks,
        recoveryWeights: recoveryWeights,
      });
      result = { recoveryWeek, recoveryWeeks };
    }
    currentAnalysis.recoveryWeek = result.recoveryWeek;
    currentAnalysis.recoveryWeeks = result.recoveryWeeks;
    // 局部刷新（摘要含权重面板，需重新绑定）
    renderKpis(currentAnalysis);
    renderSummary(currentAnalysis);
    bindRecoveryWeightsUi();
    const panel = $('rw-weights-panel');
    if (panel) panel.open = true;
    const st = $('rw-weights-status');
    if (st) {
      st.textContent = '✓ 已按新权重重算';
      st.classList.add('show');
      setTimeout(() => st.classList.remove('show'), 2200);
    }
    renderCharts(currentAnalysis);
    renderInsights(currentAnalysis);
    renderPrompt();
    return true;
  }

  function readRecoveryWeightsFromForm() {
    const keys = ['hrv', 'sleep', 'nightHr', 'spo2Night', 'exercise', 'workout', 'steps'];
    const out = {};
    for (const k of keys) {
      const el = $(`rw-weight-${k}`);
      if (!el) continue;
      const v = Number(el.value);
      out[k] = Number.isFinite(v) && v > 0 ? v : 1;
    }
    return normalizeRecoveryWeightsLocal(out);
  }

  function fillRecoveryWeightsForm(weights) {
    const w = normalizeRecoveryWeightsLocal(weights);
    for (const [k, v] of Object.entries(w)) {
      const el = $(`rw-weight-${k}`);
      if (el) el.value = String(v);
      const lab = $(`rw-weight-${k}-val`);
      if (lab) lab.textContent = Number(v).toFixed(1);
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
      const days = chartRangeDays;
      window.HealthCharts.renderAnalysisCharts(container, analysis, {
        // 0 = 全部；chips 默认 30
        days: days === 0 ? 0 : (days || 30),
        locale: getAnalysisLocale(),
      });
    } else {
      container.innerHTML = `<p class="hint chart-empty">${escapeHtml(t('charts.title'))} — module not loaded</p>`;
    }
    // 同步 chips 激活态
    document.querySelectorAll('#chart-range-chips .chip').forEach((btn) => {
      const d = Number(btn.getAttribute('data-days'));
      btn.classList.toggle('is-active', d === chartRangeDays);
    });
  }

  document.querySelectorAll('#chart-range-chips .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      chartRangeDays = Number(btn.getAttribute('data-days')) || 0;
      try { window.localStorage.setItem(CHART_RANGE_KEY, String(chartRangeDays)); } catch (e) { /* ignore */ }
      if (currentAnalysis) renderCharts(currentAnalysis);
    });
  });

  $('btn-csv-apply')?.addEventListener('click', () => { reapplyCsvAndRefresh(); });

  function renderDataQualityBanner(analysis) {
    const host = $('data-quality-banner');
    if (!host) return;
    const dq = analysis && analysis.data && analysis.data.dataQuality;
    const parts = [];
    if (dq && dq.skippedFutureCount) {
      const samples = (dq.futureSampleDates || []).slice(0, 5).join('、') || '（未列出）';
      parts.push(`
        <div class="quality-banner" role="status">
          <strong>已排除未来日期数据</strong>
          <p>
            参考日 <code>${escapeHtml(dq.referenceDate)}</code> 之后共跳过
            <strong>${dq.skippedFutureCount}</strong> 条记录
            （日期样本：${escapeHtml(samples)}）。
            请到手机「健康」中删除错误条目；统计与提示词均<strong>不含</strong>这些未来记录。
          </p>
        </div>
      `);
    }
    if (lastCsvMergeNote) {
      parts.push(`
        <div class="quality-banner quality-banner-info" role="status">
          <strong>已合并外部 CSV</strong>
          <p>${escapeHtml(lastCsvMergeNote)}</p>
        </div>
      `);
    }
    if (!parts.length) {
      host.innerHTML = '';
      host.classList.add('hidden');
      return;
    }
    host.classList.remove('hidden');
    host.innerHTML = parts.join('');
  }

  async function readOptionalCsv(inputId) {
    const el = $(inputId);
    if (!el || !el.files || !el.files[0]) return '';
    return readFileAsText(el.files[0]);
  }

  async function applySelectedCsvToData(data) {
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.mergeExternalCsvIntoData !== 'function') {
      return '';
    }
    const weightCsvText = await readOptionalCsv('csv-weight-input');
    const bpCsvText = await readOptionalCsv('csv-bp-input');
    if (!weightCsvText && !bpCsvText) return '';
    const result = window.HealthAnalyzer.mergeExternalCsvIntoData(data, {
      weightCsvText: weightCsvText || undefined,
      bpCsvText: bpCsvText || undefined,
    });
    const bits = [];
    if (result.weightAdded) bits.push(`体重 +${result.weightAdded}`);
    if (result.weightUpdated) bits.push(`补全体脂/BMI ${result.weightUpdated}`);
    if (result.bodyFatFilled) bits.push(`体脂字段 ${result.bodyFatFilled}`);
    if (result.bpAdded) bits.push(`血压 +${result.bpAdded}`);
    if (result.skipped) bits.push(`跳过重复 ${result.skipped}`);
    if (result.notes && result.notes.length) bits.push(result.notes.join('；'));
    return bits.length ? bits.join(' · ') : 'CSV 已处理（无新增）';
  }

  async function reapplyCsvAndRefresh() {
    if (!currentAnalysis || !currentAnalysis.data) {
      showToast('请先完成苹果健康数据解析');
      return;
    }
    try {
      const note = await applySelectedCsvToData(currentAnalysis.data);
      lastCsvMergeNote = note || 'CSV 已处理';
      recoveryWeights = loadRecoveryWeights();
      currentAnalysis = window.HealthAnalyzer.analyzeAll(currentAnalysis.data, {
        recoveryWeights,
      });
      renderResults(currentAnalysis);
      const st = $('csv-merge-status');
      if (st) {
        st.textContent = '✓ ' + lastCsvMergeNote;
        st.classList.add('show');
        setTimeout(() => st.classList.remove('show'), 3000);
      }
      showToast('已合并 CSV 并刷新分析', { ok: true });
    } catch (e) {
      showToast('CSV 合并失败：' + (e.message || e), { ms: 2800 });
    }
  }

  function renderAvailability(analysis) {
    renderDataQualityBanner(analysis);
    const av = analysis.data.dataAvailability;
    const grid = $('availability-grid');
    const items = [
      { key: 'hasCgm', icon: '🩸', name: 'CGM 动态血糖', count: analysis.data.cgm.length + ' 条' },
      { key: 'hasBloodPressure', icon: '❤️', name: '血压', count: analysis.data.bloodPressure.length + ' 条' },
      { key: 'hasWeight', icon: '⚖️', name: '体重', count: (analysis.weightStats ? analysis.weightStats.dayCount + ' 趋势日 / ' : '') + analysis.data.weight.length + ' 条' },
      { key: 'hasBodyFat', icon: '📉', name: '体脂', count: (analysis.weightStats?.bodyFatDayCount || analysis.data.bodyFat?.length || 0) + ' 点' },
      { key: 'hasHrv', icon: '📊', name: 'HRV 心率变异性', count: Object.keys(analysis.hrvByDate).length + ' 天' },
      { key: 'hasHeartRate', icon: '💗', name: '静息/步行心率', count: Object.keys(analysis.data.restingHr).length + ' 天' },
      { key: 'hasSteps', icon: '👟', name: '步数', count: Object.keys(analysis.data.steps).length + ' 天' },
      { key: 'hasSleep', icon: '😴', name: '睡眠', count: Object.keys(analysis.data.sleep).length + ' 天' },
      {
        key: 'hasWatchActivity',
        icon: '⌚',
        name: 'Watch 活动',
        count: (analysis.watchStats?.dayCount || Object.keys(analysis.data.watchDaily || {}).length) + ' 天',
      },
      {
        key: 'hasSpO2',
        icon: '🫁',
        name: '血氧 SpO₂',
        count: (analysis.watchStats?.spo2DayCount || 0) + ' 天',
      },
      {
        key: 'hasRespiratoryRate',
        icon: '🌬️',
        name: '呼吸频率',
        count: analysis.watchStats?.rrMean7d != null ? '近 7 日 ' + analysis.watchStats.rrMean7d.toFixed(1) + '/分' : '有数据',
      },
      {
        key: 'hasVo2Max',
        icon: '🏃',
        name: 'VO₂ max',
        count:
          analysis.watchStats?.vo2Latest != null
            ? analysis.watchStats.vo2Latest.toFixed(1) + ' · ' + (analysis.watchStats.vo2DayCount || 0) + ' 天'
            : (analysis.watchStats?.vo2DayCount || 0) + ' 天',
      },
      {
        key: 'hasWristTemp',
        icon: '🌡️',
        name: '睡眠腕温',
        count: analysis.watchStats?.wristTempMean7d != null
          ? analysis.watchStats.wristTempMean7d.toFixed(2) + ' °C'
          : '有数据',
      },
      {
        key: 'hasBreathingDisturbance',
        icon: '😮‍💨',
        name: '睡眠呼吸紊乱',
        count:
          analysis.watchStats?.breathingDisturbanceDayCount > 0
            ? (analysis.watchStats.breathingDisturbanceMean7d != null
                ? '近7日均 ' + analysis.watchStats.breathingDisturbanceMean7d.toFixed(2) + ' · '
                : '') +
              analysis.watchStats.breathingDisturbanceDayCount +
              ' 天'
            : '有数据',
      },
      {
        key: 'hasWorkouts',
        icon: '🏋️',
        name: 'Workout 会话',
        count: analysis.workoutStats
          ? analysis.workoutStats.count + ' 场 · 近30日 ' + analysis.workoutStats.count30d
          : (analysis.data.workouts?.length || 0) + ' 场',
      },
      { key: 'hasEcg', icon: '📈', name: 'ECG 心电图', count: analysis.data.ecg.length + ' 份' },
    ];

    grid.innerHTML = items.map(it => `
      <div class="availability-item ${av[it.key] ? 'has-data' : 'no-data'}">
        <div class="av-icon">${it.icon}</div>
        <div class="av-info">
          <div class="av-name">${it.name}</div>
          <div class="av-count">${av[it.key] ? it.count : escapeHtml(t('av.noData'))}</div>
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
    const raw = (summary && summary.datetime) ? String(summary.datetime) : '';
    const date = raw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
    if (opts) {
      if (opts.startDate && date < opts.startDate) return false;
      if (opts.endDate && date > opts.endDate) return false;
    }
    // 与解析器一致：默认排除未来日期 ECG
    const ref =
      (opts && opts.referenceDate) ||
      (window.HealthAnalyzer && typeof window.HealthAnalyzer.getLocalToday === 'function'
        ? window.HealthAnalyzer.getLocalToday()
        : null);
    if (ref && date > ref) return false;
    return true;
  }

  function noteEcgSkippedFuture(data, summary) {
    if (!data) return;
    if (!data.dataQuality) {
      data.dataQuality = {
        referenceDate:
          (window.HealthAnalyzer && window.HealthAnalyzer.getLocalToday
            ? window.HealthAnalyzer.getLocalToday()
            : '') || '',
        skippedFutureCount: 0,
        futureSampleDates: [],
      };
    }
    const raw = summary && summary.datetime ? String(summary.datetime) : '';
    const date = raw.slice(0, 10);
    data.dataQuality.skippedFutureCount += 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !data.dataQuality.futureSampleDates.includes(date)) {
      if (data.dataQuality.futureSampleDates.length < 8) {
        data.dataQuality.futureSampleDates.push(date);
        data.dataQuality.futureSampleDates.sort();
      }
    }
  }

  function renderSummary(analysis) {
    const container = $('summary-content');
    const blocks = [];
    const data = analysis.data;

    if (analysis.cgmStats) {
      const o = analysis.cgmStats.overall;
      const st = analysis.cgmStats.stable;
      const fd = analysis.cgmStats.firstDay;
      blocks.push(`
        <div class="section-block">
          <h3>🩸 CGM 血糖总览</h3>
          <table class="summary-table">
            <tr><th>分段</th><th>均值</th><th>TIR</th><th>&lt;3.9%</th><th>条数</th></tr>
            <tr><td>全程</td><td class="num">${o.mean.toFixed(2)}</td><td class="num">${o.pctInRange.toFixed(1)}%</td><td class="num">${o.pctBelow39.toFixed(1)}%</td><td class="num">${o.count}</td></tr>
            ${fd ? `<tr><td>首日 ${escapeHtml(analysis.cgmStats.firstDayDate || '')}</td><td class="num">${fd.mean.toFixed(2)}</td><td class="num">${fd.pctInRange.toFixed(1)}%</td><td class="num">${fd.pctBelow39.toFixed(1)}%</td><td class="num">${fd.count}</td></tr>` : ''}
            ${st ? `<tr><td><strong>稳定期</strong></td><td class="num">${st.mean.toFixed(2)}</td><td class="num">${st.pctInRange.toFixed(1)}%</td><td class="num">${st.pctBelow39.toFixed(1)}%</td><td class="num">${st.count}</td></tr>` : ''}
            <tr><td colspan="5" class="hint" style="background:transparent;padding:8px 0 0;margin:0;">最低/最高（全程）：${o.min.toFixed(1)} / ${o.max.toFixed(1)} mmol/L</td></tr>
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
      const row = (label, m) => m
        ? `<tr><td>${label} (${m.count}条)</td><td class="num">${m.systolic.toFixed(1)}/${m.diastolic.toFixed(1)}${m.lowCount ? ' · 偏低' + m.lowCount : ''}</td></tr>`
        : '';
      blocks.push(`
        <div class="section-block">
          <h3>❤️ 血压总览</h3>
          <table class="summary-table">
            <tr><th>时段</th><th>均值</th></tr>
            ${row('近 7 天全天', bp.mean7d)}
            ${row('近 7 天晨间', bp.morning7d)}
            ${row('近 7 天晚间', bp.evening7d)}
            ${row('近 14 天全天', bp.mean14d)}
            ${row('近 14 天晨间', bp.morning14d)}
            ${row('近 14 天晚间', bp.evening14d)}
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

    if (analysis.weightStats && analysis.weightStats.dayCount > 0) {
      const ws = analysis.weightStats;
      const lt = ws.latestTrend;
      const et = ws.earliestTrend;
      const recent = ws.daily.slice(-7).reverse().map((d) => {
        const fat = d.trend.bodyFat != null ? d.trend.bodyFat.toFixed(1) + '%' : '—';
        const morn = d.morning ? d.morning.value.toFixed(1) : '—';
        const eve = d.evening ? d.evening.value.toFixed(1) : '—';
        return `<tr><td>${d.date}</td><td class="num">${d.trend.value.toFixed(1)}</td><td class="num">${morn}</td><td class="num">${eve}</td><td class="num">${fat}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>⚖️ 体重与体脂（晨起趋势）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>最新趋势体重</td><td class="num">${lt ? lt.weight.toFixed(1) + ' kg (' + lt.date + ')' : '—'}</td></tr>
            <tr><td>最早趋势体重</td><td class="num">${et ? et.weight.toFixed(1) + ' kg (' + et.date + ')' : '—'}</td></tr>
            <tr><td>趋势变化</td><td class="num">${lt && et ? (lt.weight - et.weight).toFixed(1) + ' kg' : '—'}</td></tr>
            <tr><td>最新体脂</td><td class="num">${ws.bodyFatLatest != null ? ws.bodyFatLatest.toFixed(1) + '%' : '—'}</td></tr>
            <tr><td>体脂变化</td><td class="num">${ws.bodyFatDelta != null ? ws.bodyFatDelta.toFixed(1) + ' 百分点' : '—'}</td></tr>
            <tr><td>原始条数 / 趋势日</td><td class="num">${ws.rawCount} / ${ws.dayCount}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>趋势</th><th>晨</th><th>晚</th><th>体脂</th></tr>
            ${recent}
          </table>
        </div>
      `);
    } else if (data.weight.length > 0) {
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

    // Watch 活动 / 血氧 / VO2 / 呼吸紊乱
    if (analysis.watchStats && analysis.watchStats.dayCount > 0) {
      const ws = analysis.watchStats;
      const recent = ws.days.slice(-7).reverse();
      const showBd = (ws.breathingDisturbanceDayCount || 0) > 0;
      const rows = recent.map((d) => {
        const spo2 = d.spo2Mean != null ? d.spo2Mean.toFixed(1) : '—';
        const spo2Min = d.spo2Min != null ? d.spo2Min.toFixed(1) : '—';
        const rr = d.rrMean != null ? d.rrMean.toFixed(1) : '—';
        const nhr = d.nightHrMean != null ? d.nightHrMean.toFixed(0) : '—';
        const vo2 = d.vo2Max != null ? d.vo2Max.toFixed(1) : '—';
        const bd = d.breathingDisturbance != null ? d.breathingDisturbance.toFixed(2) : '—';
        return `<tr><td>${d.date}</td><td class="num">${d.exerciseMin ? d.exerciseMin.toFixed(0) : '—'}</td><td class="num">${d.activeKcal ? d.activeKcal.toFixed(0) : '—'}</td><td class="num">${spo2}</td><td class="num">${spo2Min}</td><td class="num">${rr}</td><td class="num">${nhr}</td><td class="num">${vo2}</td>${showBd ? `<td class="num">${bd}</td>` : ''}</tr>`;
      }).join('');
      const vo2Delta =
        ws.vo2Delta != null
          ? `${ws.vo2Delta >= 0 ? '+' : ''}${ws.vo2Delta.toFixed(1)}`
          : '—';
      blocks.push(`
        <div class="section-block">
          <h3>⌚ Watch 活动 / 血氧 / VO₂（最近 ${recent.length} 天）</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>日均锻炼（近 7 日样本）</td><td class="num">${ws.exerciseMinMean7d != null ? ws.exerciseMinMean7d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>日均活动消耗</td><td class="num">${ws.activeKcalMean7d != null ? ws.activeKcalMean7d.toFixed(0) + ' kcal' : '—'}</td></tr>
            <tr><td>血氧均值 / 最低</td><td class="num">${ws.spo2Mean7d != null ? ws.spo2Mean7d.toFixed(1) + '%' : '—'}${ws.spo2Min7d != null ? ' / ' + ws.spo2Min7d.toFixed(1) + '%' : ''}</td></tr>
            <tr><td>夜段血氧 (0–8h)</td><td class="num">${ws.spo2NightMean7d != null ? ws.spo2NightMean7d.toFixed(1) + '%' : '—'}${ws.spo2NightMin7d != null ? ' · 最低 ' + ws.spo2NightMin7d.toFixed(1) + '%' : ''}</td></tr>
            <tr><td>日段血氧</td><td class="num">${ws.spo2DayMean7d != null ? ws.spo2DayMean7d.toFixed(1) + '%' : '—'}${ws.spo2DayMin7d != null ? ' · 最低 ' + ws.spo2DayMin7d.toFixed(1) + '%' : ''}</td></tr>
            <tr><td>呼吸频率日均</td><td class="num">${ws.rrMean7d != null ? ws.rrMean7d.toFixed(1) + ' /分' : '—'}</td></tr>
            <tr><td>夜间心率 (0–6h)</td><td class="num">${ws.nightHrMean7d != null ? ws.nightHrMean7d.toFixed(0) + ' bpm' : '—'}</td></tr>
            <tr><td>VO₂ max 最新 / Δ</td><td class="num">${ws.vo2Latest != null ? ws.vo2Latest.toFixed(1) : '—'} / ${vo2Delta}</td></tr>
            <tr><td>睡眠腕温日均</td><td class="num">${ws.wristTempMean7d != null ? ws.wristTempMean7d.toFixed(2) + ' °C' : '—'}</td></tr>
            <tr><td>睡眠呼吸紊乱日均 / 最新</td><td class="num">${ws.breathingDisturbanceMean7d != null ? ws.breathingDisturbanceMean7d.toFixed(2) : '—'}${ws.breathingDisturbanceLatest != null ? ' / ' + ws.breathingDisturbanceLatest.toFixed(2) : ''}${ws.breathingDisturbanceDayCount ? '（' + ws.breathingDisturbanceDayCount + ' 天）' : ''}</td></tr>
            <tr><td>日照日均</td><td class="num">${ws.daylightMinMean7d != null ? ws.daylightMinMean7d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>站立小时日均</td><td class="num">${ws.standHoursMean7d != null ? ws.standHoursMean7d.toFixed(1) : '—'}</td></tr>
            <tr><td>有数据天数</td><td class="num">${ws.dayCount}（血氧 ${ws.spo2DayCount} · VO₂ ${ws.vo2DayCount}${ws.breathingDisturbanceDayCount ? ' · 呼吸紊乱 ' + ws.breathingDisturbanceDayCount : ''}）</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>日期</th><th>锻炼</th><th>kcal</th><th>SpO₂</th><th>最低</th><th>呼吸</th><th>夜HR</th><th>VO₂</th>${showBd ? '<th>呼吸紊乱</th>' : ''}</tr>
            ${rows}
          </table>
          <p class="hint" style="margin-top:8px;">血氧与 VO₂ 为 Watch 估算；睡眠呼吸紊乱为 Apple 睡眠扰动估算（越高扰动相对越多），非睡眠呼吸暂停诊断。低值/偏高需结合症状，勿单次定论。</p>
        </div>
      `);
    }

    // Workout 会话
    if (analysis.workoutStats && analysis.workoutStats.count > 0) {
      const wos = analysis.workoutStats;
      const typeRows = wos.byType.slice(0, 8).map((t) =>
        `<tr><td>${escapeHtml(t.activityLabel || t.activityType)}</td><td class="num">${t.count}</td><td class="num">${t.durationMin.toFixed(0)}</td><td class="num">${t.activeKcal ? t.activeKcal.toFixed(0) : '—'}</td></tr>`
      ).join('');
      const recent = wos.sessions.slice(-8).reverse().map((s) => {
        return `<tr><td>${escapeHtml(s.startDate.slice(0, 16))}</td><td>${escapeHtml(s.activityLabel || s.activityType)}</td><td class="num">${s.durationMin.toFixed(0)}</td><td class="num">${s.activeKcal != null ? s.activeKcal.toFixed(0) : '—'}</td><td class="num">${s.hrAvg != null ? s.hrAvg.toFixed(0) : '—'}</td><td class="num">${s.hrMax != null ? s.hrMax.toFixed(0) : '—'}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>🏋️ Workout 训练会话</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>总场次</td><td class="num">${wos.count}</td></tr>
            <tr><td>近 30 日</td><td class="num">${wos.count30d} 场 · ${wos.durationSum30d.toFixed(0)} min · ${wos.activeKcalSum30d.toFixed(0)} kcal</td></tr>
            <tr><td>近 7 日</td><td class="num">${wos.count7d} 场 · ${wos.durationSum7d.toFixed(0)} min</td></tr>
            <tr><td>近 30 日场均时长</td><td class="num">${wos.durationMean30d != null ? wos.durationMean30d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>近 30 日场均心率</td><td class="num">${wos.hrAvgMean30d != null ? wos.hrAvgMean30d.toFixed(0) + ' bpm' : '—'}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>类型</th><th>场次</th><th>总分钟</th><th>kcal</th></tr>
            ${typeRows}
          </table>
          <table class="summary-table">
            <tr><th>开始</th><th>类型</th><th>min</th><th>kcal</th><th>HR均</th><th>HR最大</th></tr>
            ${recent}
          </table>
        </div>
      `);
    }

    // 周恢复仪表
    if (analysis.recoveryWeek) {
      const rw = analysis.recoveryWeek;
      const row = (label, val) =>
        val == null || val === ''
          ? ''
          : `<tr><td>${label}</td><td class="num">${escapeHtml(String(val))}</td></tr>`;
      const weeks = analysis.recoveryWeeks || [];
      const mini = weeks.slice(-6);
      const miniRows = mini.length
        ? mini
            .map((p) => {
              const rec = p.recoveryScore != null ? String(p.recoveryScore) : '—';
              const load = p.loadScore != null ? String(p.loadScore) : '—';
              const hrv = p.hrvMean7d != null ? p.hrvMean7d.toFixed(0) : '—';
              const sleep = p.sleepMean7d != null ? p.sleepMean7d.toFixed(1) : '—';
              return `<tr><td>${escapeHtml(p.weekEnd)}</td><td class="num">${rec}</td><td class="num">${load}</td><td class="num">${hrv}</td><td class="num">${sleep}</td></tr>`;
            })
            .join('')
        : '';
      const miniTable = miniRows
        ? `
          <p class="hint" style="margin:12px 0 6px;">近 ${mini.length} 周趋势（最旧→最新）</p>
          <table class="summary-table">
            <tr><th>周末</th><th>恢复</th><th>负荷</th><th>HRV</th><th>睡眠h</th></tr>
            ${miniRows}
          </table>`
        : '';
      const w = recoveryWeights || loadRecoveryWeights();
      const weightSlider = (key, label, side) => {
        const val = w[key] != null ? Number(w[key]) : 1;
        return `
          <label class="rw-weight-row" data-side="${side}">
            <span class="rw-weight-label">${label}</span>
            <input type="range" id="rw-weight-${key}" min="0.1" max="5" step="0.1" value="${val}" aria-label="${label}权重">
            <span class="rw-weight-val" id="rw-weight-${key}-val">${val.toFixed(1)}</span>
          </label>`;
      };
      blocks.push(`
        <div class="section-block" id="recovery-panel">
          <h3>🧭 近 7 日负荷与恢复</h3>
          <p class="hint" style="margin:0 0 8px;">截止 ${escapeHtml(rw.weekEnd)} · ${escapeHtml(rw.statusLabel)}（启发式，非诊断）</p>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            ${row('恢复分', rw.recoveryScore != null ? rw.recoveryScore + ' / 100' : null)}
            ${row('负荷分', rw.loadScore != null ? rw.loadScore + ' / 100' : null)}
            ${row('HRV 日均', rw.hrvMean7d != null ? rw.hrvMean7d.toFixed(1) + ' ms' : null)}
            ${row('夜间心率', rw.nightHrMean7d != null ? rw.nightHrMean7d.toFixed(0) + ' bpm' : null)}
            ${row('静息心率', rw.restingHrMean7d != null ? rw.restingHrMean7d.toFixed(0) + ' bpm' : null)}
            ${row('锻炼日均', rw.exerciseMinMean7d != null ? rw.exerciseMinMean7d.toFixed(0) + ' min' : null)}
            ${row('Workout', rw.workoutCount7d + ' 场 · ' + rw.workoutDuration7d.toFixed(0) + ' min')}
            ${row('睡眠日均', rw.sleepMean7d != null ? rw.sleepMean7d.toFixed(2) + ' h' : null)}
            ${row('步数日均', rw.stepsMean7d != null ? Math.round(rw.stepsMean7d) + ' 步' : null)}
            ${row('站立小时日均', rw.standHoursMean7d != null ? rw.standHoursMean7d.toFixed(1) : null)}
            ${row('日照日均', rw.daylightMinMean7d != null ? rw.daylightMinMean7d.toFixed(0) + ' min' : null)}
            ${row('夜段血氧', rw.spo2NightMean7d != null ? rw.spo2NightMean7d.toFixed(1) + '%' : null)}
          </table>
          ${miniTable}
          <details class="rw-weights-panel" id="rw-weights-panel">
            <summary>${escapeHtml(t('rw.weights.summary') || '个人恢复评分权重')}</summary>
            <p class="hint" style="margin:8px 0;">${escapeHtml(t('rw.weights.hint') || '相对权重，仅影响本机评分；默认全 1.0 与历史等权一致。调后点「应用并重算恢复」。')}</p>
            <div class="rw-presets chart-range-chips" role="group" aria-label="${escapeHtml(t('rw.presets.aria') || '恢复权重预设')}">
              <button type="button" class="chip" data-rw-preset="recoveryFirst">${escapeHtml(t('rw.preset.recoveryFirst') || '恢复优先')}</button>
              <button type="button" class="chip" data-rw-preset="training">${escapeHtml(t('rw.preset.training') || '训练期')}</button>
              <button type="button" class="chip" data-rw-preset="weightLoss">${escapeHtml(t('rw.preset.weightLoss') || '减脂')}</button>
              <button type="button" class="chip" data-rw-preset="balanced">${escapeHtml(t('rw.preset.balanced') || '均衡')}</button>
            </div>
            <div class="rw-weights-grid">
              <div class="rw-weights-col">
                <div class="rw-weights-side">${escapeHtml(t('rw.weights.sideRecovery') || '恢复侧')}</div>
                ${weightSlider('hrv', 'HRV', 'recovery')}
                ${weightSlider('sleep', t('rw.weights.sleep') || '睡眠', 'recovery')}
                ${weightSlider('nightHr', t('rw.weights.nightHr') || '夜心率', 'recovery')}
                ${weightSlider('spo2Night', t('rw.weights.spo2Night') || '夜血氧', 'recovery')}
              </div>
              <div class="rw-weights-col">
                <div class="rw-weights-side">${escapeHtml(t('rw.weights.sideLoad') || '负荷侧')}</div>
                ${weightSlider('exercise', t('rw.weights.exercise') || '锻炼', 'load')}
                ${weightSlider('workout', 'Workout', 'load')}
                ${weightSlider('steps', t('rw.weights.steps') || '步数', 'load')}
              </div>
            </div>
            <div class="rw-weights-actions">
              <button type="button" class="btn-ghost btn-sm" id="btn-rw-weights-reset">${escapeHtml(t('rw.weights.reset') || '重置默认')}</button>
              <button type="button" class="btn-secondary btn-sm" id="btn-rw-weights-apply">${escapeHtml(t('rw.weights.apply') || '应用并重算恢复')}</button>
              <span class="copy-status" id="rw-weights-status" aria-live="polite"></span>
            </div>
          </details>
        </div>
      `);
    }

    // ECG 分类汇总
    if (analysis.ecgStats && analysis.ecgStats.count > 0) {
      const es = analysis.ecgStats;
      const classRows = es.byClassification.map((r) =>
        `<tr><td>${escapeHtml(r.classification)}</td><td class="num">${r.count}</td></tr>`
      ).join('');
      const recentList = data.ecg.slice(-8).reverse().map(e => {
        const dt = e.datetime ? escapeHtml(String(e.datetime).slice(0, 16)) : '—';
        const cls = escapeHtml(e.classification || 'unknown');
        return `<tr><td>${dt}</td><td>${cls}</td></tr>`;
      }).join('');
      const nearW = es.highHrNearWorkoutCount ?? 0;
      const restW = es.highHrRestingWindowCount ?? 0;
      const otherHr = Math.max(0, (es.highHrCount || 0) - nearW);
      const lowAct = es.highHrOnLowActivityCount;
      const highAct = es.highHrOnHighActivityCount;
      const showActCorr = lowAct != null || highAct != null;
      const topHourRows = (es.highHrByHour || [])
        .map((c, h) => ({ h, c }))
        .filter((x) => x.c > 0)
        .sort((a, b) => b.c - a.c || a.h - b.h)
        .slice(0, 5)
        .map((x) => `<tr><td>${String(x.h).padStart(2, '0')}:00</td><td class="num">${x.c}</td></tr>`)
        .join('');
      const corrRows =
        es.highHrCount > 0
          ? `<tr><td>高心率·训练±2h</td><td class="num">${nearW}</td></tr>
            <tr><td>高心率·非运动窗</td><td class="num">${restW}</td></tr>
            <tr><td>高心率·其他（非训练邻域粗算）</td><td class="num">${otherHr}</td></tr>` +
            (showActCorr
              ? `<tr><td>高心率·低活动日</td><td class="num">${lowAct ?? 0}</td></tr>
            <tr><td>高心率·高活动/训练邻域日</td><td class="num">${highAct ?? 0}</td></tr>`
              : '')
          : '';
      const topHoursBlock = topHourRows
        ? `<table class="summary-table" style="margin-top:8px;">
            <tr><th>高心率高发小时</th><th>份数</th></tr>
            ${topHourRows}
          </table>`
        : '';
      blocks.push(`
        <div class="section-block">
          <h3>📈 ECG 心电图</h3>
          <table class="summary-table">
            <tr><th>指标</th><th>值</th></tr>
            <tr><td>总份数</td><td class="num">${es.count}</td></tr>
            <tr><td>窦性 / 高心率 / 不佳</td><td class="num">${es.sinusCount} / ${es.highHrCount} / ${es.inconclusiveCount}</td></tr>
            ${corrRows}
            ${es.latest ? `<tr><td>最近</td><td class="num">${escapeHtml(String(es.latest.datetime).slice(0, 16))} · ${escapeHtml(es.latest.classification)}</td></tr>` : ''}
          </table>
          ${topHoursBlock}
          <table class="summary-table">
            <tr><th>分类</th><th>份数</th></tr>
            ${classRows}
          </table>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;color:var(--primary);font-size:13px;">最近记录</summary>
            <table class="summary-table" style="margin-top:8px;">
              <tr><th>时间</th><th>分类</th></tr>
              ${recentList}
            </table>
          </details>
          <p class="hint" style="margin-top:8px;">高心率「训练±2h」相对 Workout 开始时间；「非运动窗」= 22–08 或附近无训练；「低活动日」≈ 步数&lt;3000 且锻炼很少，「高活动」≈ 步数≥8000 / 锻炼≥20min / 训练邻域。请优先上传完整 ZIP 或含 electrocardiograms/ 的文件夹以收录 ECG。</p>
        </div>
      `);
    } else if (data.ecg && data.ecg.length > 0) {
      blocks.push(`
        <div class="section-block">
          <h3>📈 ECG 心电图</h3>
          <p class="hint">共 ${data.ecg.length} 份</p>
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
      const panel = panelKeyFromTitle(title);
      const body = html.replace(/<h3[^>]*>[\s\S]*?<\/h3>/, '');
      return `<details class="summary-acc" data-panel="${panel}"${open}><summary>${title}</summary><div class="summary-acc-body">${body}</div></details>`;
    }).join('')}</div>`;
  }

  // ============================================================
  // 提示词渲染
  // ============================================================

  function updatePromptTrust(text) {
    const badge = $('prompt-trust-badge');
    const meta = $('prompt-trust-meta');
    const tip = document.querySelector('#prompt-trust .trust-tip');
    const len = (text || '').length;
    const approx = len < 1000
      ? t('prompt.trust.charCount', { approx: len })
      : t('prompt.trust.kcharCount', { approx: (len / 1000).toFixed(1) });
    if (meta) meta.textContent = approx;
    if (currentPromptTab === 'full') {
      if (badge) badge.textContent = t('prompt.trust.fullSummary');
      if (tip) tip.textContent = t('prompt.tip');
    } else if (currentPromptTab === 'data') {
      if (badge) badge.textContent = t('prompt.trust.dataOnly');
      if (tip) tip.textContent = t('prompt.trust.noRole');
    } else {
      if (badge) badge.textContent = t('prompt.trust.shortSystem');
      if (tip) tip.textContent = t('prompt.trust.pasteSystem');
    }
  }

  function renderPrompt() {
    if (!currentAnalysis) return;
    const ctx = getUserContextFromForm();
    const loc = analysisLocaleOpts();
    let text = '';
    if (currentPromptTab === 'full') {
      text = window.HealthAnalyzer.generateLLMPrompt(currentAnalysis, ctx, loc);
    } else if (currentPromptTab === 'data') {
      text = window.HealthAnalyzer.generateDataOnly(currentAnalysis, ctx, loc);
    } else {
      const locCode = (loc && loc.locale) || 'zh-CN';
      text =
        locCode === 'en' && window.HealthAnalyzer.SHORT_SYSTEM_PROMPT_EN
          ? window.HealthAnalyzer.SHORT_SYSTEM_PROMPT_EN
          : window.HealthAnalyzer.SHORT_SYSTEM_PROMPT;
    }
    const ta = $('prompt-output');
    if (ta) ta.value = text;
    updatePromptTrust(text);
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPromptTab = btn.dataset.tab;
      renderPrompt();
    });
  });

  $('btn-prompt-expand')?.addEventListener('click', () => {
    const ta = $('prompt-output');
    const btn = $('btn-prompt-expand');
    if (!ta || !btn) return;
    const willExpand = ta.classList.contains('is-collapsed');
    ta.classList.toggle('is-collapsed', !willExpand);
    btn.textContent = willExpand ? '收起预览' : '展开全部预览';
    btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
  });

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      const status = $('copy-status');
      if (status) {
        status.textContent = '✓ 已复制';
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2000);
      }
      showToast(okMsg || '已复制到剪贴板', { ok: true });
      return true;
    } catch (err) {
      try {
        const ta = $('prompt-output');
        if (ta) {
          const prev = ta.value;
          ta.value = text;
          ta.select();
          document.execCommand('copy');
          ta.value = prev;
        }
        showToast(okMsg || '已尝试复制', { ms: 2200 });
        return true;
      } catch (e2) {
        showToast('复制失败，请长按文本手动复制', { ms: 2800 });
        return false;
      }
    }
  }

  // 提示词区：复制当前标签内容
  $('btn-copy')?.addEventListener('click', async () => {
    if (!currentAnalysis) return;
    renderPrompt();
    await copyText($('prompt-output').value, '已复制到剪贴板');
  });

  async function copyInsightsOnly() {
    if (!currentAnalysis) {
      showToast('请先完成分析');
      return;
    }
    if (typeof window.HealthAnalyzer.generateInsightsOnlyPrompt !== 'function') {
      showToast('摘要复制不可用');
      return;
    }
    const ctx = getUserContextFromForm();
    let prefix = '';
    if (window.HealthAnalyzer.formatUserContext) {
      prefix = window.HealthAnalyzer.formatUserContext(ctx) || '';
    }
    const text = window.HealthAnalyzer.generateInsightsOnlyPrompt(currentAnalysis, { prefix });
    await copyText(text, '已复制摘要短提示（适合短上下文模型）');
  }

  // 只复制自动监测摘要（短上下文）
  $('btn-copy-insights')?.addEventListener('click', () => { copyInsightsOnly(); });
  $('btn-copy-insights-sticky')?.addEventListener('click', () => { copyInsightsOnly(); });

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
  $('btn-export-weekly')?.addEventListener('click', exportWeeklyReport);
  $('btn-export-visit')?.addEventListener('click', exportVisitSummary);

  // 有结果时 ⌘/Ctrl+Shift+C 复制完整提示词
  window.addEventListener('keydown', (e) => {
    if (!currentAnalysis) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || !e.shiftKey) return;
    if (String(e.key).toLowerCase() !== 'c') return;
    // 避免在输入框里抢剪贴板
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    e.preventDefault();
    copyFullPrompt($('copy-status'));
  });
  $('btn-weekly-save')?.addEventListener('click', () => { saveWeeklyReportToHistory(); });
  $('btn-weekly-refresh')?.addEventListener('click', () => { refreshWeeklyReportList(); });
  $('weekly-report-list')?.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-wr-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-wr-act');
    const id = btn.getAttribute('data-id');
    handleWeeklyReportAction(act, id);
  });
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

  // 结果区内锚点平滑滚动（顶栏 + 桌面侧栏共用 .result-nav-link）
  document.querySelectorAll('.result-nav-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      const id = href.slice(1);
      if (id) setResultNavActive(id);
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
    const insights = $('insight-list');
    if (insights) insights.innerHTML = '';
    const banner = $('data-quality-banner');
    if (banner) {
      banner.innerHTML = '';
      banner.classList.add('hidden');
    }
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

  // 语言切换：静态 DOM + 已渲染的动态区块
  function refreshLocaleUi() {
    if (window.I18n && typeof window.I18n.applyDom === 'function') {
      window.I18n.applyDom();
    }
    // 同步侧栏折叠按钮文案（applyDom 可能覆盖为默认展开文案）
    applySideNavCollapsed(loadSideNavCollapsed());
    // 桌面上传区文案可略加强「拖放」提示
    const uploadText = $('upload-text');
    const drop = $('drop-zone');
    if (uploadText && drop && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      uploadText.textContent = t('upload.drop');
      drop.classList.add('is-desktop-hint');
    }
    if (!currentAnalysis) return;
    try {
      renderCharts(currentAnalysis);
      renderInsights(currentAnalysis);
      renderSignals(currentAnalysis);
      renderAvailability(currentAnalysis);
      renderKpis(currentAnalysis);
      renderPrompt();
    } catch (e) {
      console.warn('locale refresh partial', e);
    }
  }

  $('locale-select')?.addEventListener('change', (e) => {
    const raw = e.target.value;
    const next =
      raw === 'en' ? 'en' : raw === 'zh-TW' ? 'zh-TW' : 'zh-CN';
    if (window.I18n && typeof window.I18n.setLocale === 'function') {
      window.I18n.setLocale(next);
    }
    refreshLocaleUi();
  });

  window.addEventListener('health-analyzer-locale', () => {
    refreshLocaleUi();
  });

  // 初始：同步语言选择器 + 桌面拖放提示
  (function initLocaleChrome() {
    const sel = $('locale-select');
    if (sel && window.I18n) {
      sel.value = window.I18n.getLocale() || 'zh-CN';
    }
    refreshLocaleUi();
  })();

  // ============================================================
  // Service Worker 注册 + 版本更新横幅
  // ============================================================

  const UPDATE_DISMISS_KEY = 'health-analyzer-update-dismiss';

  function showAppUpdateBanner() {
    const banner = $('app-update-banner');
    if (!banner) return;
    try {
      if (sessionStorage.getItem(UPDATE_DISMISS_KEY) === '1') return;
    } catch (_) { /* ignore */ }
    banner.classList.remove('hidden');
  }

  function hideAppUpdateBanner() {
    const banner = $('app-update-banner');
    if (banner) banner.classList.add('hidden');
  }

  function wireAppUpdateBanner(reg) {
    const btnUpdate = $('btn-app-update');
    const btnDismiss = $('btn-app-update-dismiss');

    if (btnUpdate && !btnUpdate.dataset.wired) {
      btnUpdate.dataset.wired = '1';
      btnUpdate.addEventListener('click', () => {
        try {
          sessionStorage.removeItem(UPDATE_DISMISS_KEY);
        } catch (_) { /* ignore */ }
        // Prefer skipWaiting on waiting worker, then reload
        const waiting = reg && reg.waiting;
        if (waiting) {
          try {
            waiting.postMessage({ type: 'SKIP_WAITING' });
          } catch (_) { /* ignore */ }
        }
        window.location.reload();
      });
    }

    if (btnDismiss && !btnDismiss.dataset.wired) {
      btnDismiss.dataset.wired = '1';
      btnDismiss.addEventListener('click', () => {
        try {
          sessionStorage.setItem(UPDATE_DISMISS_KEY, '1');
        } catch (_) { /* ignore */ }
        hideAppUpdateBanner();
      });
    }

    if (!reg) return;

    const onInstalledWorker = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // New SW installed while page already controlled → offer refresh
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showAppUpdateBanner();
        }
      });
    };

    reg.addEventListener('updatefound', () => {
      onInstalledWorker(reg.installing);
    });

    // Already waiting from a previous update cycle
    if (reg.waiting && navigator.serviceWorker.controller) {
      showAppUpdateBanner();
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          wireAppUpdateBanner(reg);
          // Periodic check when tab is visible (lightweight)
          try {
            reg.update();
          } catch (_) { /* ignore */ }
        })
        .catch((err) => {
          console.log('SW 注册失败（可忽略）:', err);
        });

      // controllerchange after an *update* (not first install) → offer refresh
      let hadControllerAtLoad = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadControllerAtLoad) {
          hadControllerAtLoad = true;
          return;
        }
        showAppUpdateBanner();
      });
    });
  }

})();
