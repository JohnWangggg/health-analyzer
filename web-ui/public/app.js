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
  /** 最近一次导入诊断（本机展示/复制，不上传） */
  let lastImportDiagnostics = null;
  const CTX_STORAGE_KEY = 'health-analyzer-user-context-v1';
  const RECOVERY_WEIGHTS_KEY = 'health-analyzer-recovery-weights';
  const SIGNAL_PREFS_KEY = 'health-analyzer-signal-prefs-v1';
  const THEME_KEY = 'health-analyzer-theme'; // system | light | dark
  /** 首次复制完整/摘要提示词时的隐私确认（发往第三方大模型） */
  const LLM_COPY_ACK_KEY = 'health-analyzer-llm-copy-ack';
  /** 是否在提示词中包含用药/病史等敏感自述 */
  const INCLUDE_SENSITIVE_KEY = 'health-analyzer-include-sensitive-ctx';
  /**
   * 健康相关 localStorage 键（一键清除会删这些）。
   * 刻意保留：THEME_KEY、health-analyzer-locale、侧栏折叠、安装/更新提示等 UI 偏好。
   */
  const HEALTH_LOCAL_STORAGE_KEYS = [
    CTX_STORAGE_KEY,
    RECOVERY_WEIGHTS_KEY,
    SIGNAL_PREFS_KEY,
    CHART_RANGE_KEY,
    LLM_COPY_ACK_KEY,
    INCLUDE_SENSITIVE_KEY,
    'health-analyzer-insight-coach',
  ];

  /**
   * ZIP 内存保护阈值（可调）。
   * 解压前按压缩包大小拒绝过大文件；解压时只提取 export.xml / ECG CSV，
   * 并限制条目数与展开体积，降低 zip bomb / 无关资源占满内存的风险。
   */
  const ZIP_LIMITS = {
    WARN_BYTES: 600 * 1024 * 1024, // 600MB：进度区额外提示
    REJECT_BYTES: 800 * 1024 * 1024, // 800MB：拒绝整包
    MAX_CENTRAL_ENTRIES: 80000,
    MAX_ECG_FILES: 400,
    MAX_SELECTED_INFLATED: 1400 * 1024 * 1024, // 选中文件 originalSize 合计
    MAX_XML_INFLATED: 1200 * 1024 * 1024,
    MAX_SINGLE_ECG_INFLATED: 15 * 1024 * 1024,
    BOMB_RATIO: 80,
    BOMB_MIN_ORIGINAL: 50 * 1024 * 1024,
  };

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v >= 1024 * 1024 * 1024) return (v / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (v >= 1024 * 1024) return Math.round(v / (1024 * 1024)) + ' MB';
    if (v >= 1024) return Math.round(v / 1024) + ' KB';
    return v + ' B';
  }

  function createEmptyImportDiagnostics() {
    return {
      source: '',
      zipName: '',
      zipBytes: 0,
      xmlFileName: '',
      xmlBytes: 0,
      zipEntryCount: 0,
      zipExtractedCount: 0,
      selectedInflatedEstimate: 0,
      ecgTruncated: false,
      ecgCap: ZIP_LIMITS.MAX_ECG_FILES,
      ecg: {
        candidates: 0,
        parsed: 0,
        skippedDate: 0,
        skippedFuture: 0,
        skippedInvalid: 0,
        errors: [], // { file, reason }
      },
      domains: {},
      notes: [],
    };
  }

  const DEFAULT_RECOVERY_WEIGHTS = {
    hrv: 1,
    sleep: 1,
    nightHr: 1,
    spo2Night: 1,
    exercise: 1,
    workout: 1,
    steps: 1,
  };

  /** 跨维度信号分类（用于用户开关；维度文案中英均可匹配） */
  const SIGNAL_CATEGORY_IDS = [
    'cgm', 'bp', 'sleep', 'hrv', 'hr', 'steps', 'weight',
    'spo2', 'workout', 'ecg', 'watch', 'daylight', 'other',
  ];
  const SIGNAL_SEV_IDS = ['alert', 'watch', 'info'];

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

  function defaultSignalPrefs() {
    const o = {};
    for (const id of SIGNAL_CATEGORY_IDS) o[id] = true;
    for (const sev of SIGNAL_SEV_IDS) o['sev.' + sev] = true;
    return o;
  }

  function loadSignalPrefs() {
    const base = defaultSignalPrefs();
    try {
      const raw = window.localStorage.getItem(SIGNAL_PREFS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      for (const id of Object.keys(base)) {
        if (typeof parsed[id] === 'boolean') base[id] = parsed[id];
      }
      return base;
    } catch (e) {
      return base;
    }
  }

  function saveSignalPrefs(prefs) {
    const next = { ...defaultSignalPrefs(), ...(prefs || {}) };
    try {
      window.localStorage.setItem(SIGNAL_PREFS_KEY, JSON.stringify(next));
    } catch (e) { /* ignore quota */ }
    return next;
  }

  let signalPrefs = loadSignalPrefs();

  /** 将 signal.dimensions 条目映射到分类 id（兼容简繁英） */
  function signalDimCategory(dim) {
    const s = String(dim || '').trim();
    const lower = s.toLowerCase();
    if (lower === 'cgm' || /血糖|glucose/.test(s)) return 'cgm';
    if (lower === 'hrv') return 'hrv';
    if (lower === 'ecg' || /心电|心電/.test(s)) return 'ecg';
    if (lower === 'workout' || /训练|訓練|workout/.test(lower)) return 'workout';
    if (/spo|血氧/.test(s)) return 'spo2';
    if (/blood\s*pressure|血压|血壓/.test(s)) return 'bp';
    if (/breathing|呼吸紊乱|呼吸紊亂|睡眠呼吸/.test(s)) return 'sleep';
    if (/sleep|睡眠/.test(s)) return 'sleep';
    if (/step|步数|步數/.test(s)) return 'steps';
    if (/weight|体重|體重|体脂|體脂/.test(s)) return 'weight';
    if (/daylight|日照/.test(s)) return 'daylight';
    if (/night\s*hr|resting|walking\s*hr|静息|靜息|夜间心率|夜間心率|步行心率/.test(s)) return 'hr';
    if (/watch|stand|站立|活动|活動/.test(s)) return 'watch';
    return 'other';
  }

  function signalCategoriesOf(signal) {
    const dims = (signal && signal.dimensions) || [];
    const set = new Set();
    for (const d of dims) set.add(signalDimCategory(d));
    if (!set.size) set.add('other');
    return [...set];
  }

  /** 任一关联分类被关闭则隐藏；严重度关闭时亦隐藏 */
  function isSignalEnabled(signal, prefs) {
    const p = prefs || signalPrefs;
    const sev = (signal && signal.severity) || 'info';
    if (p['sev.' + sev] === false) return false;
    const cats = signalCategoriesOf(signal);
    return cats.every((c) => p[c] !== false);
  }

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
      label.textContent =
        m === 'system' ? t('theme.auto') : m === 'dark' ? t('theme.dark') : t('theme.light');
    }
    const btn = $('theme-toggle');
    if (btn) {
      const modeLabel =
        m === 'system' ? t('theme.followSystem') : m === 'dark' ? t('theme.dark') : t('theme.light');
      btn.setAttribute('aria-label', t('theme.ariaCurrent', { mode: modeLabel }));
      btn.title = t('theme.titleCycle');
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
  function isInstallDismissed() {
    try { return window.localStorage.getItem('health-analyzer-install-dismissed') === '1'; } catch { return false; }
  }

  function fillInstallSteps() {
    if (!installSteps) return;
    const steps = isIos
      ? [t('install.ios.s1'), t('install.ios.s2'), t('install.ios.s3'), t('install.ios.s4')]
      : [t('install.other.s1'), t('install.other.s2'), t('install.other.s3')];
    installSteps.innerHTML = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  }

  /** @param opts.forceText 仅刷新文案，不强制重新展开已关闭的引导条 */
  function showInstallGuide(opts) {
    if (!installGuide || isStandalone || isInstallDismissed()) return;
    const forceText = !!(opts && opts.forceText);
    if (!forceText) installGuide.classList.remove('hidden');
    // 语言切换时：若条已隐藏则只更新文案结构，不重新弹出
    if (forceText && installGuide.classList.contains('hidden')) {
      fillInstallSteps();
      return;
    }
    installGuide.classList.remove('hidden');
    fillInstallSteps();
    if (isIos) {
      if (installGuideText) installGuideText.textContent = t('install.ios.body');
      if (installAction) installAction.textContent = t('install.ios.action');
    } else {
      if (installGuideText) installGuideText.textContent = t('install.generic.body');
      if (installAction) {
        installAction.textContent = deferredInstallPrompt ? t('install.pwa') : t('install.viewSteps');
      }
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallGuide();
    if (installAction) installAction.textContent = t('install.pwa');
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
          ? (isIos ? t('install.ios.action') : t('install.viewSteps'))
          : t('install.collapseSteps');
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

  function loadIncludeSensitiveCtx() {
    try {
      const v = window.localStorage.getItem(INCLUDE_SENSITIVE_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch (e) { /* ignore */ }
    return true; // 默认包含（与历史行为一致）
  }

  function saveIncludeSensitiveCtx(on) {
    try {
      window.localStorage.setItem(INCLUDE_SENSITIVE_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function syncIncludeSensitiveCheckbox() {
    const el = $('ctx-include-sensitive');
    if (el) el.checked = loadIncludeSensitiveCtx();
  }

  /**
   * 注入提示词用的上下文：可按勾选剥离用药/病史。
   * 年龄/身高/目标体重/关注点/备注仍保留（备注本身可被 lib 边界包裹）。
   */
  function getUserContextForPrompt() {
    const ctx = getUserContextFromForm();
    if (loadIncludeSensitiveCtx()) return ctx;
    return {
      ...ctx,
      medications: null,
      conditions: null,
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
        status.textContent = t('common.savedLocal');
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2000);
      }
    } catch (e) {
      alert(t('common.storageWriteFail', { msg: e && e.message ? e.message : e }));
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
      status.textContent = t('common.cleared');
      status.classList.add('show');
      setTimeout(() => status.classList.remove('show'), 2000);
    }
    if (currentAnalysis) renderPrompt();
  }

  loadUserContext();
  syncIncludeSensitiveCheckbox();
  $('btn-ctx-save')?.addEventListener('click', saveUserContext);
  $('btn-ctx-clear')?.addEventListener('click', clearUserContext);
  $('ctx-include-sensitive')?.addEventListener('change', (e) => {
    const on = !!(e.target && e.target.checked);
    saveIncludeSensitiveCtx(on);
    if (currentAnalysis) renderPrompt();
  });
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
        reject(new Error(t('parse.err.workerUnavailable')));
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
        reject(new Error(t('parse.err.workerTimeout')));
      }, 10 * 60 * 1000);

      worker.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'worker-error') {
          clearTimeout(timer);
          cleanup();
          reject(new Error(msg.error || t('parse.err.workerFailed')));
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
          reject(new Error(msg.error || t('parse.err.workerFailed')));
        }
      };
      worker.onerror = (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err.error || new Error(err.message || t('parse.err.workerFailed')));
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
    const desktopFine = (() => {
      try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      } catch {
        return !isTouchDevice;
      }
    })();
    if (val === 'folder') {
      fileInput.hidden = true;
      folderInput.hidden = false;
      if (uploadText) uploadText.textContent = t('upload.folder');
      if (uploadHint) uploadHint.textContent = t('upload.folderHint');
      if (dropZone) dropZone.classList.remove('is-desktop-hint');
    } else if (val === 'xml_only') {
      fileInput.hidden = false;
      folderInput.hidden = true;
      fileInput.accept = '.xml';
      if (uploadText) {
        uploadText.textContent = isTouchDevice ? t('upload.xmlTap') : t('upload.xmlDrag');
      }
      if (uploadHint) uploadHint.textContent = t('upload.xmlHint');
      if (dropZone) dropZone.classList.toggle('is-desktop-hint', desktopFine && !isTouchDevice);
    } else {
      fileInput.hidden = false;
      folderInput.hidden = true;
      fileInput.accept = '.zip,.xml';
      if (uploadText) {
        // 桌面精细指针时用更强的拖放提示
        if (desktopFine && !isTouchDevice) {
          uploadText.textContent = t('upload.drop');
        } else {
          uploadText.textContent = isTouchDevice ? t('upload.zipTap') : t('upload.zipDrag');
        }
      }
      if (uploadHint) {
        uploadHint.textContent = isTouchDevice ? t('upload.zipHintTouch') : t('upload.zipHint');
      }
      if (dropZone) dropZone.classList.toggle('is-desktop-hint', desktopFine && !isTouchDevice);
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
    setProgress(0.02, t('progress.prepare'), { stage: 'read', hint: t('progress.hintPrepare') });

    const importDiag = createEmptyImportDiagnostics();
    lastImportDiagnostics = null;

    try {
      let xmlText = '';
      let xmlBytes = null;  // 流式解析的字节流
      let ecgFiles = [];

      if (source === 'apple_health_export') {
        const zipFile = files.find(f => f.name.endsWith('.zip'));
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (zipFile) {
          importDiag.source = 'zip';
          importDiag.zipName = zipFile.name || '';
          importDiag.zipBytes = zipFile.size || 0;
          const largeHint =
            zipFile.size > ZIP_LIMITS.WARN_BYTES
              ? t('progress.unzipWarn', { size: formatBytes(zipFile.size) })
              : zipFile.size > 200 * 1024 * 1024
                ? t('progress.unzipLarge')
                : t('progress.unzipLocal');
          setProgress(0.04, t('progress.unzip'), {
            stage: 'read',
            hint: largeHint,
          });
          const result = await extractXmlFromZipBrowser(zipFile);
          xmlBytes = result.xmlBytes;  // 直接使用字节流，避免 512MB 字符串限制
          importDiag.xmlFileName = result.xmlFileName || '';
          importDiag.xmlBytes = (result.xmlBytes && result.xmlBytes.byteLength) || 0;
          if (result.meta) {
            importDiag.zipEntryCount = result.meta.entryCount || 0;
            importDiag.zipExtractedCount = result.meta.extractedCount || 0;
            importDiag.selectedInflatedEstimate = result.meta.selectedInflatedEstimate || 0;
            importDiag.ecgTruncated = !!result.meta.ecgTruncated;
            if (result.meta.ecgTruncated) {
              importDiag.notes.push(
                t('import.diag.ecgTruncated', { n: ZIP_LIMITS.MAX_ECG_FILES })
              );
            }
          }
          ecgFiles = result.ecgEntries.map(e => ({ name: e.filename, _text: e.text }));
        } else if (xmlFile) {
          importDiag.source = 'xml';
          importDiag.xmlFileName = xmlFile.name || '';
          importDiag.xmlBytes = xmlFile.size || 0;
          setProgress(0.04, t('progress.readXml'), { stage: 'read' });
          xmlText = await readFileAsText(xmlFile);
        } else {
          throw new Error(t('parse.err.needZipOrXml'));
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
        importDiag.source = 'xml';
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error(t('parse.err.needXml'));
        importDiag.xmlFileName = xmlFile.name || '';
        importDiag.xmlBytes = xmlFile.size || 0;
        setProgress(0.04, t('progress.readXml'), { stage: 'read' });
        xmlText = await readFileAsText(xmlFile);
        // 同批多选的 CSV 一并尝试作为 ECG（内容校验在 ingest）
        ecgFiles = files.filter((f) => f.name.endsWith('.csv'));
      } else if (source === 'folder') {
        importDiag.source = 'folder';
        const xmlFile = files.find(f => /export|导出/i.test(f.name) && f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error(t('parse.err.folderNoXml'));
        importDiag.xmlFileName = xmlFile.name || xmlFile.webkitRelativePath || '';
        importDiag.xmlBytes = xmlFile.size || 0;
        setProgress(0.04, t('progress.readFolder'), { stage: 'read' });
        xmlText = await readFileAsText(xmlFile);
        // 收集 ECG 文件（electrocardiograms 目录或文件名含 ecg）
        ecgFiles = files.filter(f => f.name.endsWith('.csv') && (f.name.includes('ecg') || (f.webkitRelativePath || '').includes('electrocardiograms')));
      }

      setProgress(0.08, t('progress.parseHealth'), {
        stage: 'parse',
        hint: t('progress.parseWorkerHint'),
      });

      // 可选日期范围（YYYY-MM-DD）；留空则不过滤
      const parseOptions = getDateFilterOptions();
      parseOptions.onProgress = (p) =>
        setProgress(0.08 + p * 0.72, t('progress.parsePct', { pct: Math.round(p * 100) }), {
          stage: 'parse',
          hint: p < 0.5 ? t('progress.scanRecords') : t('progress.scanLate'),
        });

      // Worker 优先；失败自动回退主线程
      let data;
      if (xmlBytes) {
        data = await parseHealthData(xmlBytes, parseOptions);
      } else {
        data = await parseHealthData(xmlText, parseOptions);
      }

      // 解析 ECG：失败/跳过计入诊断，不再完全静默
      const ingestEcg = (summary, fileLabel) => {
        if (!summary) {
          importDiag.ecg.skippedInvalid += 1;
          importDiag.ecg.errors.push({
            file: fileLabel,
            reason: 'invalid',
          });
          return;
        }
        if (!summary.datetime && summary.classification === 'unknown') {
          importDiag.ecg.skippedInvalid += 1;
          importDiag.ecg.errors.push({
            file: fileLabel,
            reason: 'invalid',
          });
          return;
        }
        if (!ecgWithinDateFilter(summary, parseOptions)) {
          const raw = summary && summary.datetime ? String(summary.datetime).slice(0, 10) : '';
          const ref =
            parseOptions.referenceDate ||
            (window.HealthAnalyzer.getLocalToday && window.HealthAnalyzer.getLocalToday());
          if (ref && raw > ref) {
            noteEcgSkippedFuture(data, summary);
            importDiag.ecg.skippedFuture += 1;
          } else {
            importDiag.ecg.skippedDate += 1;
          }
          return;
        }
        data.ecg.push(summary);
        data.dataAvailability.hasEcg = true;
        importDiag.ecg.parsed += 1;
      };

      if (ecgFiles.length > 0) {
        importDiag.ecg.candidates = ecgFiles.length;
        for (const f of ecgFiles) {
          const label = f.name || f.filename || 'ecg.csv';
          try {
            const text = f._text || await readFileAsText(f);
            ingestEcg(window.HealthAnalyzer.parseEcgCsv(text), label);
          } catch (e) {
            importDiag.ecg.errors.push({
              file: label,
              reason: (e && e.message) ? String(e.message) : 'error',
            });
          }
        }
      } else {
        const allCsv = files.filter(f => f.name.endsWith('.csv'));
        importDiag.ecg.candidates = allCsv.length;
        for (const f of allCsv) {
          const label = f.name || 'ecg.csv';
          try {
            const text = await readFileAsText(f);
            if (
              (text.includes('分类') && text.includes('记录日期')) ||
              (/Classification/i.test(text) && /Record Date/i.test(text))
            ) {
              ingestEcg(window.HealthAnalyzer.parseEcgCsv(text), label);
            }
          } catch (e) {
            importDiag.ecg.errors.push({
              file: label,
              reason: (e && e.message) ? String(e.message) : 'error',
            });
          }
        }
      }

      // 可选：合并外部 CSV（上传区已选文件）
      setProgress(0.86, t('progress.mergeCsv'), { stage: 'stats', hint: t('progress.mergeCsvHint') });
      lastCsvMergeNote = '';
      try {
        const mergeNote = await applySelectedCsvToData(data);
        if (mergeNote) lastCsvMergeNote = mergeNote;
      } catch (e) {
        console.warn('CSV 合并跳过', e);
      }

      setProgress(0.92, t('progress.stats'), { stage: 'stats', hint: t('progress.statsHint') });
      recoveryWeights = loadRecoveryWeights();
      currentAnalysis = window.HealthAnalyzer.analyzeAll(data, {
        recoveryWeights,
        locale: getAnalysisLocale(),
      });

      importDiag.domains = summarizeDomainCounts(data);
      lastImportDiagnostics = importDiag;

      setProgress(1, t('progress.doneText'), { stage: 'done', hint: t('progress.doneHint') });
      setTimeout(() => {
        hide('step-progress');
        renderResults(currentAnalysis);
      }, 220);

    } catch (err) {
      console.error(err);
      // showError rewrites #step-progress and shows it; do not hide afterward
      showError(err.message || String(err));
    }
  }

  function summarizeDomainCounts(data) {
    if (!data) return {};
    const watchDays = data.watchDaily ? Object.keys(data.watchDaily).length : 0;
    return {
      cgm: (data.cgm && data.cgm.length) || 0,
      bloodPressure: (data.bloodPressure && data.bloodPressure.length) || 0,
      weight: (data.weight && data.weight.length) || 0,
      bodyFat: (data.bodyFat && data.bodyFat.length) || 0,
      hrvDays: data.hrv ? Object.keys(data.hrv).length : 0,
      restingHrDays: data.restingHr ? Object.keys(data.restingHr).length : 0,
      stepsDays: data.steps ? Object.keys(data.steps).length : 0,
      sleepDays: data.sleep ? Object.keys(data.sleep).length : 0,
      workouts: (data.workouts && data.workouts.length) || 0,
      ecg: (data.ecg && data.ecg.length) || 0,
      watchDays,
    };
  }

  function buildProgressCardHtml() {
    return `
      <h2><span class="step-num">2</span> ${escapeHtml(t('step2.title'))}</h2>
      <p class="progress-lead">${escapeHtml(t('step2.lead'))}</p>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <p id="progress-text" class="progress-text">${escapeHtml(t('progress.prepare'))}</p>
      <p id="progress-hint" class="progress-hint">${escapeHtml(t('progress.reading'))}</p>
      <ol class="progress-stages" id="progress-stages">
        <li data-stage="read">${escapeHtml(t('stage.read'))}</li>
        <li data-stage="parse">${escapeHtml(t('stage.parse'))}</li>
        <li data-stage="stats">${escapeHtml(t('stage.stats'))}</li>
        <li data-stage="done">${escapeHtml(t('stage.done'))}</li>
      </ol>
    `;
  }

  function ensureProgressCard() {
    const card = $('step-progress');
    if (!card) return;
    if (!$('progress-fill') || !$('progress-text')) {
      card.innerHTML = buildProgressCardHtml();
    } else {
      // 语言切换后同步阶段标签
      const stages = card.querySelectorAll('#progress-stages [data-stage]');
      stages.forEach((el) => {
        const key = el.getAttribute('data-stage');
        if (key) el.textContent = t('stage.' + key);
      });
      const h2 = card.querySelector('h2');
      if (h2 && h2.querySelector('.step-num') && !h2.querySelector('.step-num').textContent.includes('✗')) {
        h2.innerHTML = `<span class="step-num">2</span> ${escapeHtml(t('step2.title'))}`;
      }
      const lead = card.querySelector('.progress-lead');
      if (lead) lead.textContent = t('step2.lead');
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
      else if (ratio < 0.05) hint.textContent = t('progress.hintRead');
      else if (ratio < 0.75) hint.textContent = t('progress.hintParse');
      else if (ratio < 1) hint.textContent = t('progress.hintStats');
      else hint.textContent = t('progress.hintDone');
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
      <h2><span class="step-num">✗</span> ${escapeHtml(t('parse.fail.title'))}</h2>
      <div class="error-box" role="alert">
        <strong>${escapeHtml(t('parse.fail.label'))}</strong> ${escapeHtml(msg)}
      </div>
      <p class="progress-hint" style="text-align:left;margin-top:10px;">
        ${escapeHtml(t('parse.fail.keepSettings'))}
      </p>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;color:var(--primary);">${escapeHtml(t('parse.fail.solutions'))}</summary>
        <ul style="padding-left:24px;margin-top:8px;font-size:14px;line-height:1.8;">
          <li>${escapeHtml(t('parse.fail.tip1'))}</li>
          <li>${escapeHtml(t('parse.fail.tip2'))}</li>
          <li>${escapeHtml(t('parse.fail.tip3'))}</li>
          <li>${escapeHtml(t('parse.fail.tip4'))}</li>
          <li>${escapeHtml(t('parse.fail.tip5'))}</li>
        </ul>
      </details>
      <div class="error-actions">
        ${canRetrySame ? `<button id="btn-retry-same" class="btn-primary" type="button">${escapeHtml(t('parse.fail.retrySame'))}</button>` : ''}
        <button id="btn-retry" class="btn-secondary" type="button">${escapeHtml(t('parse.fail.retryPick'))}</button>
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

  /** 修复 macOS ZIP 文件名 UTF-8 编码问题 */
  function decodeZipEntryName(name) {
    const key = String(name || '');
    const bytes = new Uint8Array(key.length);
    for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
    let decoded;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      decoded = key;
    }
    if (decoded.includes('\ufffd')) decoded = key;
    return decoded;
  }

  function isHealthExportXmlName(name) {
    const base = (String(name).split('/').pop() || String(name)).trim();
    if (/export_cda\.xml$/i.test(base)) return false;
    if (/^export\.xml$/i.test(base)) return true;
    // 简中 / 繁中导出名
    if (/导出\.xml$/i.test(base) || /匯出\.xml$/i.test(base)) return true;
    return false;
  }

  function isEcgCsvPath(name) {
    return /electrocardiograms/i.test(name) && /\.csv$/i.test(name);
  }

  /**
   * 浏览器内解压 ZIP（本地 fflate）。
   * 内存保护：体积上限、只提取 export.xml / ECG CSV、条目与展开体积限制、异常压缩比中止。
   */
  async function extractXmlFromZipBrowser(zipFile) {
    if (!window.fflate) {
      throw new Error(t('parse.err.fflateMissing'));
    }

    const zipBytes = zipFile.size || 0;
    if (zipBytes > ZIP_LIMITS.REJECT_BYTES) {
      throw new Error(
        t('parse.err.zipTooLarge', {
          size: formatBytes(zipBytes),
          limit: formatBytes(ZIP_LIMITS.REJECT_BYTES),
        })
      );
    }

    let u8 = new Uint8Array(await zipFile.arrayBuffer());

    let entryCount = 0;
    let selectedInflated = 0;
    let ecgAccepted = 0;
    let ecgSeen = 0;
    let ecgTruncated = false;
    const nameSamples = [];

    const filter = (file) => {
      entryCount += 1;
      if (entryCount > ZIP_LIMITS.MAX_CENTRAL_ENTRIES) {
        throw new Error('ZIP_TOO_MANY_ENTRIES');
      }

      const rawName = file && file.name != null ? String(file.name) : '';
      const name = decodeZipEntryName(rawName);
      if (nameSamples.length < 12) nameSamples.push(name);

      const originalSize = (file && file.originalSize) || 0;
      const compressedSize = (file && file.size) || 0;

      // 异常压缩比（简单 zip bomb 防护）
      if (
        originalSize >= ZIP_LIMITS.BOMB_MIN_ORIGINAL &&
        compressedSize > 0 &&
        originalSize / compressedSize >= ZIP_LIMITS.BOMB_RATIO
      ) {
        throw new Error('ZIP_BOMB');
      }

      if (isHealthExportXmlName(name)) {
        if (originalSize > ZIP_LIMITS.MAX_XML_INFLATED) {
          throw new Error('ZIP_XML_TOO_LARGE');
        }
        if (selectedInflated + originalSize > ZIP_LIMITS.MAX_SELECTED_INFLATED) {
          throw new Error('ZIP_INFLATED_TOO_LARGE');
        }
        selectedInflated += originalSize;
        return true;
      }

      if (isEcgCsvPath(name)) {
        ecgSeen += 1;
        if (ecgAccepted >= ZIP_LIMITS.MAX_ECG_FILES) {
          ecgTruncated = true;
          return false;
        }
        if (originalSize > ZIP_LIMITS.MAX_SINGLE_ECG_INFLATED) {
          return false;
        }
        if (selectedInflated + originalSize > ZIP_LIMITS.MAX_SELECTED_INFLATED) {
          throw new Error('ZIP_INFLATED_TOO_LARGE');
        }
        selectedInflated += originalSize;
        ecgAccepted += 1;
        return true;
      }

      // 不解压 workout-routes / 相册 / export_cda 等无关条目
      return false;
    };

    let unzipped;
    try {
      unzipped = window.fflate.unzipSync(u8, { filter });
    } catch (e) {
      const code = e && e.message ? String(e.message) : String(e);
      if (code === 'ZIP_TOO_MANY_ENTRIES') {
        throw new Error(
          t('parse.err.zipTooManyEntries', { n: ZIP_LIMITS.MAX_CENTRAL_ENTRIES })
        );
      }
      if (code === 'ZIP_BOMB') {
        throw new Error(t('parse.err.zipBomb'));
      }
      if (code === 'ZIP_XML_TOO_LARGE') {
        throw new Error(
          t('parse.err.zipXmlTooLarge', {
            limit: formatBytes(ZIP_LIMITS.MAX_XML_INFLATED),
          })
        );
      }
      if (code === 'ZIP_INFLATED_TOO_LARGE') {
        throw new Error(
          t('parse.err.zipInflatedTooLarge', {
            limit: formatBytes(ZIP_LIMITS.MAX_SELECTED_INFLATED),
          })
        );
      }
      throw new Error(t('parse.err.zipCorrupt', { msg: code }));
    } finally {
      // 尽早丢弃压缩包缓冲引用，便于 GC（unzipped 仅含目标文件）
      u8 = null;
    }

    // 解码已提取条目的文件名
    const decodedEntries = {};
    for (const key of Object.keys(unzipped)) {
      decodedEntries[decodeZipEntryName(key)] = unzipped[key];
    }
    // 释放 raw-key map
    unzipped = null;

    const xmlKeys = Object.keys(decodedEntries).filter((k) => /\.xml$/i.test(k));
    const xmlFile =
      xmlKeys.find((k) => isHealthExportXmlName(k) && /export\.xml$/i.test(k.split('/').pop() || k)) ||
      xmlKeys.find((k) => isHealthExportXmlName(k)) ||
      xmlKeys
        .filter((k) => !/export_cda\.xml$/i.test(k))
        .sort(
          (a, b) =>
            (decodedEntries[b].byteLength || 0) - (decodedEntries[a].byteLength || 0)
        )[0];

    if (!xmlFile) {
      const fileList = (nameSamples.length ? nameSamples : Object.keys(decodedEntries))
        .slice(0, 10)
        .join(', ');
      throw new Error(t('parse.err.zipNoXml', { files: fileList || '—' }));
    }

    const xmlBytes = decodedEntries[xmlFile];
    const ecgEntries = Object.keys(decodedEntries)
      .filter((k) => isEcgCsvPath(k))
      .map((k) => {
        const bytes = decodedEntries[k];
        let text = '';
        try {
          text = new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
          text = '';
        }
        // 尽快释放单文件 Uint8Array 引用（文本已独立）
        decodedEntries[k] = null;
        return { filename: k, text };
      });

    const extractedCount =
      (xmlBytes ? 1 : 0) + ecgEntries.length;

    return {
      xmlBytes,
      xmlFileName: xmlFile,
      ecgEntries,
      meta: {
        zipBytes,
        entryCount,
        extractedCount,
        selectedInflatedEstimate: selectedInflated,
        ecgSeen,
        ecgAccepted: ecgEntries.length,
        ecgTruncated,
      },
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

  function maybeShowImportHints(analysis) {
    const host = $('import-hints');
    if (!host) return;
    const tips = [];
    const av = analysis && analysis.data && analysis.data.dataAvailability;
    if (av && !av.hasEcg) {
      tips.push(t('import.hint.ecgZip'));
    }
    if (!tips.length) {
      host.innerHTML = '';
      host.classList.add('hidden');
      return;
    }
    host.classList.remove('hidden');
    host.innerHTML = tips
      .map((msg) => `<div class="import-hint-banner" role="note">${escapeHtml(msg)}</div>`)
      .join('');
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
    maybeShowImportHints(analysis);
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
      <span>${escapeHtml(t('insight.coach'))}</span>
      <button type="button" class="btn-ghost insight-coach-dismiss" aria-label="${escapeHtml(t('insight.coach.dismiss'))}">${escapeHtml(t('insight.coach.dismiss'))}</button>
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
    const s = String(title || '');
    // Match zh-CN / zh-TW / en titles from summary.*.h3
    if (/CGM|血糖|glucose/i.test(s)) return 'cgm';
    if (/血压|血壓|Blood pressure|\bBP\b/i.test(s)) return 'bp';
    if (/体重|體重|体脂|體脂|Weight|body fat/i.test(s)) return 'weight';
    if (/HRV|心率变异|心率變異/i.test(s)) return 'hrv';
    if (/负荷|負荷|恢复|恢復|load\s*&\s*recovery|recovery/i.test(s)) return 'recovery';
    if (/Workout|训练会话|訓練會話|训练|訓練|sessions/i.test(s)) return 'workout';
    if (/Watch|血氧|SpO|VO₂|VO2|腕温|腕溫|锻炼|鍛鍊|活动|活動|呼吸紊乱|呼吸紊亂|睡眠呼吸|Breathing|wrist temp|activity/i.test(s)) return 'watch';
    if (/静息|靜息|步行心率|Resting|walking\s*HR|Heart rate|\bHR\b/i.test(s)) return 'hr';
    if (/步数|步數|Steps/i.test(s)) return 'steps';
    if (/睡眠|Sleep/i.test(s)) return 'sleep';
    if (/ECG|心电|心電/i.test(s)) return 'ecg';
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

  /**
   * KPI 副文案用：截断恢复状态句。
   * 英文取破折号前主句；中文/长句按字符上限并加省略号。
   */
  function shortRecoveryStatus(label) {
    const s = String(label || '').trim();
    if (!s) return '';
    // 先去掉基线附加段（括号 / 英文 ~N pts）
    let main = s
      .replace(/（[^）]*中位[^）]*）/g, '')
      .replace(/\s*\(~?\d+\s*pts?\s+(above|below)[^)]*\)/i, '')
      .trim();
    // 英文主句通常在 em/en dash 前
    const dash = main.search(/\s[—–-]\s/);
    if (dash > 8 && /[A-Za-z]/.test(main)) {
      main = main.slice(0, dash).trim();
    }
    const max = /[A-Za-z]/.test(main) ? 36 : 16;
    if (main.length <= max) return main;
    return main.slice(0, max - 1) + '…';
  }

  function renderInsights(analysis) {
    const list = $('insight-list');
    if (!list) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.buildInsightBullets !== 'function') {
      list.innerHTML = `<li class="insight-item tone-neutral"><div class="insight-title">${escapeHtml(t('insights.moduleMissing'))}</div></li>`;
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
      const label = analysis.cgmStats.stable ? t('kpi.cgmStable') : t('kpi.cgmMean');
      const unitOk = analysis.cgmStats.unitReliable !== false;
      const cov = analysis.cgmStats.coverage;
      let tone = 'neutral';
      if (!unitOk) tone = 'alert';
      else if (o.pctBelow30 > 0) tone = 'alert';
      else if (o.pctBelow39 >= 5) tone = 'watch';
      else if (o.pctInRange >= 90) tone = 'good';
      const tirTag =
        o.tirMethod === 'sample_share'
          ? t('kpi.cgmTirSample')
          : t('kpi.cgmTirTime');
      let sub =
        `TIR ${o.pctInRange.toFixed(0)}% (${tirTag}) · n=${o.count}` +
        (analysis.cgmStats.firstDayDate ? ` · ${t('kpi.excludedFirstDay')}` : '');
      if (cov && cov.coveragePct != null) {
        sub += ` · ${t('kpi.cgmCoverage', { pct: cov.coveragePct.toFixed(0) })}`;
      }
      if (!unitOk) sub = t('kpi.cgmUnitUnreliable') + ' · ' + sub;
      items.push({
        label,
        value: o.mean.toFixed(2),
        unit: 'mmol/L',
        sub,
        tone,
      });
    }
    if (analysis.bpStats && analysis.bpStats.mean7d) {
      const m = analysis.bpStats.mean7d;
      const morn = analysis.bpStats.morning7d;
      const eve = analysis.bpStats.evening7d;
      let sub = t('kpi.nRecords', { n: m.count }) + (m.lowCount ? ` · ${t('kpi.nLow', { n: m.lowCount })}` : '');
      if (morn && eve) {
        sub = t('kpi.mornEveSys', {
          morn: morn.systolic.toFixed(0),
          eve: eve.systolic.toFixed(0),
        });
      }
      let tone = 'neutral';
      if (m.lowCount >= 3 || m.systolic < 95) tone = 'watch';
      else if (m.systolic >= 100 && m.systolic < 125 && m.lowCount === 0) tone = 'good';
      items.push({
        label: t('kpi.bp7d'),
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
      const fat = lt.bodyFat != null ? ` · ${t('kpi.bodyFatPct', { pct: lt.bodyFat.toFixed(1) })}` : '';
      items.push({
        label: t('kpi.morningWeight'),
        value: lt.weight.toFixed(1),
        unit: 'kg',
        sub: `${lt.date.slice(5)} · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg${fat}`,
        tone: delta <= -10 ? 'watch' : 'neutral',
      });
    } else if (data.weight && data.weight.length) {
      const latest = data.weight[data.weight.length - 1];
      items.push({
        label: t('kpi.latestWeight'),
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
        label: t('kpi.hrv7d'),
        value: avg != null ? avg.toFixed(1) : '—',
        unit: 'ms',
        sub: t('kpi.daysWithData', { n: hrvDates.length }),
        tone: avg != null && avg < 25 ? 'watch' : avg != null && avg >= 40 ? 'good' : 'neutral',
      });
    }
    const wstats = analysis.watchStats;
    if (wstats && wstats.dayCount > 0) {
      if (wstats.exerciseMinMean7d != null || wstats.activeKcalMean7d != null) {
        const ex = wstats.exerciseMinMean7d;
        items.push({
          label: t('kpi.exercise7d'),
          value: ex != null ? String(Math.round(ex)) : '—',
          unit: t('kpi.minPerDay'),
          sub:
            (wstats.activeKcalMean7d != null
              ? t('kpi.activeKcal', { n: Math.round(wstats.activeKcalMean7d) })
              : t('kpi.watchActivity')) + ` · ${t('kpi.nDays', { n: wstats.dayCount })}`,
          tone: ex != null && ex >= 20 ? 'good' : ex != null && ex < 5 ? 'watch' : 'neutral',
        });
      }
      if (wstats.spo2Mean7d != null) {
        let tone = 'good';
        if (wstats.spo2Min7d != null && wstats.spo2Min7d < 92) tone = 'watch';
        else if (wstats.spo2Mean7d < 95) tone = 'watch';
        items.push({
          label: t('kpi.spo27d'),
          value: wstats.spo2Mean7d.toFixed(1),
          unit: '%',
          sub:
            (wstats.spo2Min7d != null ? `${t('kpi.minPct', { pct: wstats.spo2Min7d.toFixed(1) })} · ` : '') +
            t('kpi.nDays', { n: wstats.spo2DayCount }),
          tone,
        });
      }
      if (wstats.vo2Latest != null) {
        const d = wstats.vo2Delta;
        items.push({
          label: t('kpi.vo2max'),
          value: wstats.vo2Latest.toFixed(1),
          unit: 'mL/kg/min',
          sub:
            d != null
              ? `Δ ${d >= 0 ? '+' : ''}${d.toFixed(1)} · ${t('kpi.nDays', { n: wstats.vo2DayCount })}`
              : t('kpi.vo2DaysEst', { n: wstats.vo2DayCount }),
          tone: d != null && d <= -2 ? 'watch' : 'neutral',
        });
      }
    }
    const wos = analysis.workoutStats;
    if (wos && wos.count > 0) {
      items.push({
        label: t('kpi.workout30d'),
        value: String(wos.count30d),
        unit: t('kpi.sessionsUnit'),
        sub:
          `${Math.round(wos.durationSum30d)} min` +
          (wos.hrAvgMean30d != null ? ` · ${t('kpi.avgHr', { n: wos.hrAvgMean30d.toFixed(0) })}` : '') +
          ` · ${t('kpi.totalSessions', { n: wos.count })}`,
        tone: wos.count30d >= 8 ? 'good' : wos.count30d === 0 ? 'watch' : 'neutral',
      });
    }
    const rw = analysis.recoveryWeek;
    if (rw && (rw.recoveryScore != null || rw.loadScore != null)) {
      items.push({
        label: t('kpi.recoveryWeek'),
        value: rw.recoveryScore != null ? String(rw.recoveryScore) : '—',
        unit: t('kpi.scoreUnit'),
        sub:
          (rw.loadScore != null ? t('kpi.loadScore', { n: rw.loadScore }) : '') +
          (rw.statusLabel ? ` · ${shortRecoveryStatus(rw.statusLabel)}` : ''),
        tone:
          rw.statusTone === 'positive' ? 'good' :
          rw.statusTone === 'watch' || rw.statusTone === 'alert' ? 'watch' : 'neutral',
      });
    }
    if (analysis.ecgStats && analysis.ecgStats.count > 0) {
      const es = analysis.ecgStats;
      items.push({
        label: t('kpi.ecg'),
        value: String(es.count),
        unit: t('kpi.copiesUnit'),
        sub:
          (es.highHrCount ? `${t('kpi.highHr', { n: es.highHrCount })} · ` : '') +
          (es.latest ? es.latest.classification : t('kpi.hasRecord')),
        tone: es.highHrCount >= 2 ? 'watch' : 'neutral',
      });
    }
    if (!items.length) {
      items.push({
        label: t('kpi.dataDims'),
        value: String(
          Object.values(data.dataAvailability || {}).filter(Boolean).length
        ),
        unit: t('kpi.typesUnit'),
        sub: t('kpi.expandAvailability'),
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

  /**
   * 首次复制提示词（完整或摘要）时弹出隐私提醒：
   * 数据将由用户粘贴到第三方大模型；本站不上传。
   * 确认后写入 localStorage，之后不再打扰。
   */
  function ensureLlmCopyAck() {
    try {
      if (window.localStorage.getItem(LLM_COPY_ACK_KEY) === '1') return true;
    } catch (e) { /* ignore */ }
    const ok = window.confirm(t('privacy.llmCopyAck'));
    if (!ok) return false;
    try {
      window.localStorage.setItem(LLM_COPY_ACK_KEY, '1');
    } catch (e) { /* ignore */ }
    return true;
  }

  async function copyFullPrompt(statusEl) {
    if (!currentAnalysis) {
      alert(t('common.needAnalysis'));
      return;
    }
    if (!ensureLlmCopyAck()) return;
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
        status.textContent = t('copy.ok.fullStatus');
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2200);
      });
      showToast(t('copy.ok.full'), { ok: true, ms: 2400 });
      const sticky = $('btn-copy-sticky');
      if (sticky) {
        const prev = sticky.textContent;
        sticky.textContent = t('common.copied');
        setTimeout(() => { sticky.textContent = prev; }, 1600);
      }
      const hero = $('btn-copy-hero');
      if (hero) {
        const prev = hero.textContent;
        hero.textContent = t('common.copied');
        setTimeout(() => { hero.textContent = prev; }, 1600);
      }
    } catch (e) {
      if ($('prompt-output')) {
        $('prompt-output').select();
        document.execCommand('copy');
      }
      showToast(t('copy.fallback'), { ms: 2800 });
    }
  }

  function severityLabel(sev) {
    if (sev === 'alert') return t('tone.alert');
    if (sev === 'watch') return t('tone.watch');
    return t('tone.neutral');
  }

  function signalCategoryLabel(id) {
    return t('signals.cat.' + id) || id;
  }

  function renderSignalPrefsBar(allSignals, visibleCount) {
    const total = allSignals.length;
    // 无信号时不展示筛选条，避免空态重复
    if (!total) return '';
    const prefs = signalPrefs;
    const present = new Set();
    const presentSev = new Set();
    for (const s of allSignals) {
      for (const c of signalCategoriesOf(s)) present.add(c);
      presentSev.add((s && s.severity) || 'info');
    }
    // 展示出现过的分类；以及用户已关闭但仍需可重新打开的分类
    const ids = SIGNAL_CATEGORY_IDS.filter((id) => present.has(id) || prefs[id] === false);
    const chips = ids.map((id) => {
      const on = prefs[id] !== false;
      return `<button type="button" class="chip signal-pref-chip${on ? ' is-active' : ''}" data-signal-cat="${escapeHtml(id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(signalCategoryLabel(id))}</button>`;
    }).join('');
    const sevIds = SIGNAL_SEV_IDS.filter((id) => presentSev.has(id) || prefs['sev.' + id] === false);
    const sevChips = sevIds.map((id) => {
      const on = prefs['sev.' + id] !== false;
      return `<button type="button" class="chip signal-pref-chip signal-sev-chip${on ? ' is-active' : ''}" data-signal-sev="${escapeHtml(id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(t('signals.sev.' + id))}</button>`;
    }).join('');
    const countLine = `<span class="signal-pref-count">${escapeHtml(t('signals.filterCount', { shown: visibleCount, total }))}</span>`;
    return `<div class="signal-prefs" role="group" aria-label="${escapeHtml(t('signals.filterAria'))}">
      <div class="signal-prefs-head">
        <span class="signal-prefs-label">${escapeHtml(t('signals.filterLabel'))}</span>
        ${countLine}
        <button type="button" class="signal-prefs-reset" id="signal-prefs-reset">${escapeHtml(t('signals.filterReset'))}</button>
      </div>
      <div class="signal-prefs-chips">${chips}</div>
      ${sevChips ? `<div class="signal-prefs-sev"><span class="signal-prefs-label">${escapeHtml(t('signals.sevLabel'))}</span> ${sevChips}</div>` : ''}
    </div>`;
  }

  function bindSignalPrefsUi(container) {
    if (!container) return;
    container.querySelectorAll('[data-signal-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-signal-cat');
        if (!id || !SIGNAL_CATEGORY_IDS.includes(id)) return;
        signalPrefs = saveSignalPrefs({
          ...signalPrefs,
          [id]: signalPrefs[id] === false,
        });
        if (currentAnalysis) renderSignals(currentAnalysis);
      });
    });
    container.querySelectorAll('[data-signal-sev]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-signal-sev');
        if (!id || !SIGNAL_SEV_IDS.includes(id)) return;
        const key = 'sev.' + id;
        signalPrefs = saveSignalPrefs({
          ...signalPrefs,
          [key]: signalPrefs[key] === false,
        });
        if (currentAnalysis) renderSignals(currentAnalysis);
      });
    });
    const reset = container.querySelector('#signal-prefs-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        signalPrefs = saveSignalPrefs(defaultSignalPrefs());
        if (currentAnalysis) renderSignals(currentAnalysis);
      });
    }
  }

  function renderSignals(analysis) {
    const container = $('signals-content');
    if (!container) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.detectCrossSignals !== 'function') {
      container.innerHTML = `<p class="hint">${escapeHtml(t('signals.moduleMissing'))}</p>`;
      return;
    }
    const signals = window.HealthAnalyzer.detectCrossSignals(analysis, analysisLocaleOpts());
    if (!signals.length) {
      container.innerHTML =
        renderSignalPrefsBar([], 0) +
        `<p class="hint">${t('signals.empty')}</p>`;
      bindSignalPrefsUi(container);
      return;
    }
    const visible = signals.filter((s) => isSignalEnabled(s, signalPrefs));
    const listHtml = visible.length
      ? `<div class="signals-list">${visible.map((s) => `
      <article class="signal-card severity-${escapeHtml(s.severity)}">
        <div class="signal-meta">
          <span class="signal-badge">${severityLabel(s.severity)}</span>
          ${s.date ? `<span>${escapeHtml(s.date)}</span>` : ''}
          <span>${escapeHtml((s.dimensions || []).join(' · '))}</span>
        </div>
        <h3 class="signal-title">${escapeHtml(s.title)}</h3>
        <p class="signal-detail">${escapeHtml(s.detail)}</p>
      </article>
    `).join('')}</div>`
      : `<p class="hint">${escapeHtml(t('signals.allFiltered'))}</p>`;
    container.innerHTML = renderSignalPrefsBar(signals, visible.length) + listHtml;
    bindSignalPrefsUi(container);
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
    if (!currentAnalysis) throw new Error(t('common.needAnalysis'));
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
    if (!currentAnalysis) throw new Error(t('common.needAnalysis'));
    if (
      !window.HealthAnalyzer ||
      typeof window.HealthAnalyzer.generateWeeklyReportMarkdown !== 'function'
    ) {
      throw new Error(t('export.err.weeklyNotLoaded'));
    }
    const ctx = typeof getUserContextForPrompt === 'function' ? getUserContextForPrompt() : null;
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
    const ctx = typeof getUserContextForPrompt === 'function' ? getUserContextForPrompt() : null;
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
      alert(t('common.needAnalysis'));
      return;
    }
    if (!window.HealthHistory || typeof window.HealthHistory.saveWeeklyReport !== 'function') {
      alert(t('weekly.err.moduleUnavailable'));
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
      showExportStatus(t('weekly.ok.saved'));
      await refreshWeeklyReportList();
    } catch (e) {
      alert(t('weekly.err.saveFail', { msg: e.message || e }));
    }
  }

  async function refreshWeeklyReportList() {
    const list = $('weekly-report-list');
    if (!list) return;
    if (!window.HealthHistory || typeof window.HealthHistory.listWeeklyReports !== 'function') {
      list.innerHTML = `<p class="hint">${escapeHtml(t('weekly.err.moduleUnavailable'))}</p>`;
      return;
    }
    let rows = [];
    try {
      rows = await window.HealthHistory.listWeeklyReports();
    } catch (e) {
      list.innerHTML = `<p class="hint">${escapeHtml(t('weekly.err.idb'))}</p>`;
      return;
    }
    if (!rows.length) {
      list.innerHTML = `<p class="hint">${escapeHtml(t('weekly.empty'))}</p>`;
      return;
    }
    list.innerHTML = rows
      .map((r) => {
        const when = (r.savedAt || '').slice(0, 16).replace('T', ' ');
        const week = r.weekEnd || '—';
        const label = r.label ? escapeHtml(r.label) : '';
        const scoreParts = [];
        if (r.recoveryScore != null) scoreParts.push(t('weekly.scoreRecovery', { n: r.recoveryScore }));
        if (r.loadScore != null) scoreParts.push(t('weekly.scoreLoad', { n: r.loadScore }));
        const scores = scoreParts.join(' · ');
        return `
          <div class="weekly-report-item" data-id="${escapeHtml(r.id)}">
            <div class="weekly-report-meta">
              <strong>${escapeHtml(week)}</strong>
              <span class="muted">${escapeHtml(when)}</span>
              ${label ? `<span class="weekly-report-label-tag">${label}</span>` : ''}
              ${scores ? `<span class="muted">${escapeHtml(scores)}</span>` : ''}
            </div>
            <div class="weekly-report-actions">
              <button type="button" class="btn-ghost btn-sm" data-wr-act="copy" data-id="${escapeHtml(r.id)}">${escapeHtml(t('weekly.act.copy'))}</button>
              <button type="button" class="btn-ghost btn-sm" data-wr-act="download" data-id="${escapeHtml(r.id)}">${escapeHtml(t('weekly.act.download'))}</button>
              <button type="button" class="btn-danger-text btn-sm" data-wr-act="delete" data-id="${escapeHtml(r.id)}">${escapeHtml(t('weekly.act.delete'))}</button>
            </div>
          </div>`;
      })
      .join('');
  }

  async function handleWeeklyReportAction(act, id) {
    if (!window.HealthHistory || !id) return;
    try {
      if (act === 'delete') {
        if (!window.confirm(t('weekly.confirmDelete'))) return;
        await window.HealthHistory.deleteWeeklyReport(id);
        await refreshWeeklyReportList();
        showExportStatus(t('weekly.ok.deleted'));
        return;
      }
      const row = await window.HealthHistory.getWeeklyReport(id);
      if (!row || !row.markdown) {
        alert(t('weekly.err.notFound'));
        return;
      }
      if (act === 'copy') {
        await navigator.clipboard.writeText(row.markdown);
        showExportStatus(t('weekly.ok.copied'));
        showToast(t('weekly.ok.copiedToast'), { ok: true, ms: 2000 });
      } else if (act === 'download') {
        const end = row.weekEnd || new Date().toISOString().slice(0, 10);
        downloadText(`weekly-report-${end}.md`, row.markdown, 'text/markdown');
        showExportStatus(t('weekly.ok.downloaded'));
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  /**
   * 仅用当前权重重算恢复分并刷新 KPI / 摘要 / 图表 / 提示词
   * @param weights 权重对象
   * @param opts.quiet 语言切换等场景：不强制展开权重面板、不弹状态条
   */
  function recomputeRecoveryWithWeights(weights, opts) {
    if (!currentAnalysis) return false;
    const quiet = !!(opts && opts.quiet);
    const w = normalizeRecoveryWeightsLocal(weights);
    // quiet（如语言切换）：只重算文案，不回写 localStorage
    recoveryWeights = quiet ? w : saveRecoveryWeights(w);
    const partial = {
      dateRange: currentAnalysis.dateRange,
      hrvByDate: currentAnalysis.hrvByDate,
      restingHrByDate: currentAnalysis.restingHrByDate,
      stepsByDate: currentAnalysis.stepsByDate,
      sleepByDate: currentAnalysis.sleepByDate,
      watchStats: currentAnalysis.watchStats,
      workoutStats: currentAnalysis.workoutStats,
    };
    const locale = getAnalysisLocale();
    let result;
    if (
      window.HealthAnalyzer &&
      typeof window.HealthAnalyzer.recomputeRecovery === 'function'
    ) {
      result = window.HealthAnalyzer.recomputeRecovery(partial, {
        weeks: 12,
        recoveryWeights: recoveryWeights,
        locale,
      });
    } else {
      const recoveryWeeks = window.HealthAnalyzer.calcRecoveryWeeks(partial, {
        weeks: 12,
        recoveryWeights: recoveryWeights,
        locale,
      });
      const recoveryWeek = window.HealthAnalyzer.calcRecoveryWeek(partial, {
        recoveryWeeks,
        recoveryWeights: recoveryWeights,
        locale,
      });
      result = { recoveryWeek, recoveryWeeks };
    }
    currentAnalysis.recoveryWeek = result.recoveryWeek;
    currentAnalysis.recoveryWeeks = result.recoveryWeeks;
    // 局部刷新（摘要含权重面板，需重新绑定）
    renderKpis(currentAnalysis);
    renderSummary(currentAnalysis);
    bindRecoveryWeightsUi();
    if (!quiet) {
      const panel = $('rw-weights-panel');
      if (panel) panel.open = true;
      const st = $('rw-weights-status');
      if (st) {
        st.textContent = t('rw.weights.applied') || '✓ 已按新权重重算';
        st.classList.add('show');
        setTimeout(() => st.classList.remove('show'), 2200);
      }
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

  function snapMetricLabel(key, fallback) {
    if (!key) return fallback || '';
    const v = t('snap.' + key);
    return v === 'snap.' + key ? (fallback || key) : v;
  }

  function snapUnitLabel(unit) {
    if (unit === '步' || unit === 'steps') return t('snap.unit.steps');
    if (unit === '场' || unit === 'sessions') return t('snap.unit.sessions');
    if (unit === '份' || unit === 'records') return t('snap.unit.copies');
    return unit || '';
  }

  async function refreshHistorySelect() {
    const select = $('history-select');
    if (!select || !window.HealthHistory) return;
    let rows = [];
    try {
      rows = await window.HealthHistory.listSnapshots();
    } catch (e) {
      select.innerHTML = `<option value="">${escapeHtml(t('history.err.idb'))}</option>`;
      return;
    }
    if (!rows.length) {
      select.innerHTML = `<option value="">${escapeHtml(t('history.empty'))}</option>`;
      const cmp = $('history-compare');
      if (cmp) cmp.innerHTML = '';
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
      alert(t('common.needAnalysis'));
      return;
    }
    if (!window.HealthHistory || !window.HealthAnalyzer.buildAnalysisSnapshot) {
      alert(t('history.err.moduleUnavailable'));
      return;
    }
    try {
      const labelEl = $('history-label');
      const label = labelEl && labelEl.value.trim() ? labelEl.value.trim() : undefined;
      const snap = window.HealthAnalyzer.buildAnalysisSnapshot(currentAnalysis, { label });
      await window.HealthHistory.saveSnapshot(snap);
      showExportStatus(t('history.ok.saved'));
      await refreshHistorySelect();
    } catch (e) {
      alert(t('history.err.saveFail', { msg: e.message || e }));
    }
  }

  async function renderHistoryCompare(historyId) {
    const box = $('history-compare');
    if (!box) return;
    if (!historyId || !currentAnalysis) {
      box.innerHTML = `<p class="hint">${escapeHtml(t('history.compare.hint'))}</p>`;
      return;
    }
    try {
      const prev = await window.HealthHistory.getSnapshot(historyId);
      if (!prev) {
        box.innerHTML = `<p class="hint">${escapeHtml(t('history.compare.notFound'))}</p>`;
        return;
      }
      const curr = window.HealthAnalyzer.buildAnalysisSnapshot(currentAnalysis);
      const diffs = window.HealthAnalyzer.compareSnapshots(prev, curr);
      if (!diffs.length) {
        box.innerHTML = `<p class="hint">${escapeHtml(t('history.compare.noOverlap'))}</p>`;
        return;
      }
      const fmt = (v, unit) => {
        if (v == null || !Number.isFinite(v)) return '—';
        const d =
          unit === '步' || unit === 'steps' || unit === t('snap.unit.steps')
            ? 0
            : unit === '%' || unit === 'ms' || unit === 'bpm' || unit === 'mmHg'
              ? 1
              : 2;
        return v.toFixed(d);
      };
      const deltaClass = (d) => {
        if (d == null || !Number.isFinite(d)) return 'delta-zero';
        if (Math.abs(d) < 1e-9) return 'delta-zero';
        return d > 0 ? 'delta-up' : 'delta-down';
      };
      const when = (prev.savedAt || '').slice(0, 16).replace('T', ' ');
      box.innerHTML = `
        <p class="hint">${escapeHtml(t('history.compare.head', {
          when,
          start: prev.dateRange?.start || '',
          end: prev.dateRange?.end || '',
        }))}</p>
        <table>
          <thead><tr>
            <th>${escapeHtml(t('history.compare.thMetric'))}</th>
            <th class="num">${escapeHtml(t('history.compare.thPrev'))}</th>
            <th class="num">${escapeHtml(t('history.compare.thCurr'))}</th>
            <th class="num">${escapeHtml(t('history.compare.thDelta'))}</th>
          </tr></thead>
          <tbody>
            ${diffs.map((r) => {
              const unit = snapUnitLabel(r.unit);
              const label = snapMetricLabel(r.key, r.label);
              return `
              <tr>
                <td>${escapeHtml(label)}</td>
                <td class="num">${fmt(r.previous, r.unit)} ${escapeHtml(unit)}</td>
                <td class="num">${fmt(r.current, r.unit)} ${escapeHtml(unit)}</td>
                <td class="num ${deltaClass(r.delta)}">${r.delta == null ? '—' : ((r.delta > 0 ? '+' : '') + fmt(r.delta, r.unit))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      box.innerHTML = `<p class="hint">${escapeHtml(t('history.compare.fail', { msg: e.message || String(e) }))}</p>`;
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

  function sourceLabel(source) {
    if (source === 'zip') return t('import.diag.source.zip');
    if (source === 'folder') return t('import.diag.source.folder');
    if (source === 'xml') return t('import.diag.source.xml');
    return source || '—';
  }

  function ecgSkipTotal(diag) {
    if (!diag || !diag.ecg) return 0;
    return (
      (diag.ecg.skippedDate || 0) +
      (diag.ecg.skippedFuture || 0) +
      (diag.ecg.skippedInvalid || 0)
    );
  }

  function formatDomainSummaryLine(domains) {
    if (!domains) return '';
    const sep = getAnalysisLocale() === 'en' ? ', ' : '、';
    const pairs = [
      ['CGM', domains.cgm],
      ['BP', domains.bloodPressure],
      ['Weight', domains.weight],
      ['BodyFat', domains.bodyFat],
      ['HRV', domains.hrvDays],
      ['RHR', domains.restingHrDays],
      ['Steps', domains.stepsDays],
      ['Sleep', domains.sleepDays],
      ['Workout', domains.workouts],
      ['ECG', domains.ecg],
      ['Watch', domains.watchDays],
    ]
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`);
    return pairs.length ? pairs.join(sep) : '—';
  }

  function buildImportDiagSummaryText(diag) {
    if (!diag) return '';
    const ecgSkip = ecgSkipTotal(diag);
    const ecgErr = (diag.ecg && diag.ecg.errors && diag.ecg.errors.length) || 0;
    return t('import.diag.summary', {
      source: sourceLabel(diag.source),
      xml: diag.xmlFileName || t('import.diag.noXmlName'),
      ecgCand: diag.ecg ? diag.ecg.candidates : 0,
      ecgOk: diag.ecg ? diag.ecg.parsed : 0,
      ecgSkip,
      ecgErr,
    });
  }

  function buildImportDiagIssuesText(diag) {
    if (!diag || !diag.ecg) return '';
    const bits = [];
    if (diag.ecg.skippedInvalid) {
      bits.push(`${t('import.diag.ecgSkipInvalid')} ×${diag.ecg.skippedInvalid}`);
    }
    if (diag.ecg.skippedDate) {
      bits.push(`${t('import.diag.ecgSkipDate')} ×${diag.ecg.skippedDate}`);
    }
    if (diag.ecg.skippedFuture) {
      bits.push(`${t('import.diag.ecgSkipFuture')} ×${diag.ecg.skippedFuture}`);
    }
    const errFiles = (diag.ecg.errors || [])
      .filter((e) => e.reason !== 'invalid')
      .slice(0, 5)
      .map((e) => {
        const base = (e.file || '').split('/').pop() || e.file || '?';
        return `${base}: ${e.reason === 'invalid' ? t('import.diag.ecgSkipInvalid') : (e.reason || t('import.diag.ecgError'))}`;
      });
    if (errFiles.length) {
      bits.push(errFiles.join(getAnalysisLocale() === 'en' ? '; ' : '；'));
    }
    if (diag.notes && diag.notes.length) {
      bits.push(diag.notes.join(getAnalysisLocale() === 'en' ? '; ' : '；'));
    }
    if (!bits.length) return '';
    return t('import.diag.ecgErrors', { detail: bits.join(getAnalysisLocale() === 'en' ? ' · ' : ' · ') });
  }

  function buildImportDiagnosticReport(diag, analysis) {
    const lines = [];
    lines.push(t('import.diag.reportHeader'));
    lines.push(new Date().toISOString());
    lines.push('');
    lines.push(buildImportDiagSummaryText(diag));
    if (diag.source === 'zip') {
      lines.push(
        t('import.diag.zipMeta', {
          size: formatBytes(diag.zipBytes || 0),
          entries: diag.zipEntryCount || 0,
          extracted: diag.zipExtractedCount || 0,
        })
      );
      if (diag.zipName) lines.push(`ZIP: ${diag.zipName}`);
    }
    if (diag.xmlFileName) {
      lines.push(`XML: ${diag.xmlFileName} (${formatBytes(diag.xmlBytes || 0)})`);
    }
    const issues = buildImportDiagIssuesText(diag);
    if (issues) lines.push(issues);
    const domainLine = formatDomainSummaryLine(diag.domains);
    lines.push(t('import.diag.domains', { list: domainLine }));
    if (analysis && analysis.dateRange) {
      lines.push(
        t('av.dateRange', {
          start: analysis.dateRange.start || '—',
          end: analysis.dateRange.end || '—',
        })
      );
    }
    if (diag.ecg && diag.ecg.errors && diag.ecg.errors.length) {
      lines.push('');
      lines.push('ECG detail:');
      for (const e of diag.ecg.errors.slice(0, 40)) {
        lines.push(`- ${e.file || '?'}: ${e.reason || 'error'}`);
      }
    }
    lines.push('');
    lines.push(t('import.diag.reportFooter'));
    return lines.join('\n');
  }

  function renderDataQualityBanner(analysis) {
    const host = $('data-quality-banner');
    if (!host) return;
    const dq = analysis && analysis.data && analysis.data.dataQuality;
    const parts = [];
    if (dq && dq.skippedFutureCount) {
      const sep = getAnalysisLocale() === 'en' ? ', ' : '、';
      const samples =
        (dq.futureSampleDates || []).slice(0, 5).join(sep) || t('quality.noSample');
      parts.push(`
        <div class="quality-banner" role="status">
          <strong>${escapeHtml(t('quality.futureTitle'))}</strong>
          <p>
            ${escapeHtml(t('quality.futureBody', {
              date: dq.referenceDate || '—',
              n: dq.skippedFutureCount,
              samples,
            }))}
          </p>
        </div>
      `);
    }
    if (lastCsvMergeNote) {
      parts.push(`
        <div class="quality-banner quality-banner-info" role="status">
          <strong>${escapeHtml(t('quality.csvTitle'))}</strong>
          <p>${escapeHtml(lastCsvMergeNote)}</p>
        </div>
      `);
    }
    const cgmUnit = dq && dq.cgmUnit;
    const cgmStats = analysis && analysis.cgmStats;
    if (cgmUnit && (analysis.data && analysis.data.cgm && analysis.data.cgm.length)) {
      const units = (cgmUnit.rawUnits || []).join(getAnalysisLocale() === 'en' ? ', ' : '、') || t('quality.noSample');
      const reliable = cgmUnit.reliable !== false && (!cgmStats || cgmStats.unitReliable !== false);
      parts.push(`
        <div class="quality-banner ${reliable ? 'quality-banner-info' : ''}" role="status">
          <strong>${escapeHtml(reliable ? t('quality.cgmUnitTitle') : t('quality.cgmUnitUnreliableTitle'))}</strong>
          <p>
            ${escapeHtml(t('quality.cgmUnitBody', {
              units,
              mmol: cgmUnit.mmolCount || 0,
              mgdl: cgmUnit.convertedMgDlCount || 0,
              unknown: cgmUnit.unknownUnitCount || 0,
              inferred: cgmUnit.inferredFromValues ? t('quality.cgmInferredYes') : t('quality.cgmInferredNo'),
            }))}
            ${
              cgmStats && cgmStats.coverage
                ? ' ' +
                  escapeHtml(
                    t('quality.cgmCoverageBody', {
                      method:
                        cgmStats.coverage.tirMethod === 'time_weighted'
                          ? t('kpi.cgmTirTime')
                          : t('kpi.cgmTirSample'),
                      wear: String(cgmStats.coverage.wearHours),
                      span: String(cgmStats.coverage.spanHours),
                      cov:
                        cgmStats.coverage.coveragePct != null
                          ? String(cgmStats.coverage.coveragePct)
                          : '—',
                    })
                  )
                : ''
            }
          </p>
        </div>
      `);
    }

    // 导入诊断：识别文件、ECG 跳过/失败、各维度记录数
    if (lastImportDiagnostics) {
      const diag = lastImportDiagnostics;
      const issues = buildImportDiagIssuesText(diag);
      const domainLine = formatDomainSummaryLine(diag.domains);
      const zipLine =
        diag.source === 'zip'
          ? t('import.diag.zipMeta', {
              size: formatBytes(diag.zipBytes || 0),
              entries: diag.zipEntryCount || 0,
              extracted: diag.zipExtractedCount || 0,
            })
          : '';
      parts.push(`
        <div class="quality-banner quality-banner-info import-diag-banner" role="status">
          <strong>${escapeHtml(t('import.diag.title'))}</strong>
          <p>${escapeHtml(buildImportDiagSummaryText(diag))}</p>
          ${zipLine ? `<p class="import-diag-meta">${escapeHtml(zipLine)}</p>` : ''}
          <p class="import-diag-meta">${escapeHtml(t('import.diag.domains', { list: domainLine }))}</p>
          ${issues ? `<p class="import-diag-issues">${escapeHtml(issues)}</p>` : ''}
          <p class="import-diag-actions">
            <button type="button" id="btn-copy-import-diag" class="btn-secondary">
              ${escapeHtml(t('import.diag.copy'))}
            </button>
          </p>
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

    const copyBtn = $('btn-copy-import-diag');
    if (copyBtn && lastImportDiagnostics) {
      copyBtn.addEventListener('click', async () => {
        const report = buildImportDiagnosticReport(lastImportDiagnostics, analysis);
        await copyText(report, t('import.diag.copied'));
      });
    }
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
    if (result.weightAdded) bits.push(t('csv.bit.weightAdded', { n: result.weightAdded }));
    if (result.weightUpdated) bits.push(t('csv.bit.weightUpdated', { n: result.weightUpdated }));
    if (result.bodyFatFilled) bits.push(t('csv.bit.bodyFatFilled', { n: result.bodyFatFilled }));
    if (result.bpAdded) bits.push(t('csv.bit.bpAdded', { n: result.bpAdded }));
    if (result.skipped) bits.push(t('csv.bit.skipped', { n: result.skipped }));
    if (result.notes && result.notes.length) {
      bits.push(result.notes.map(translateCsvNote).join(getAnalysisLocale() === 'en' ? '; ' : '；'));
    }
    return bits.length ? bits.join(' · ') : t('csv.bit.none');
  }

  function translateCsvNote(note) {
    const s = String(note || '');
    // 库侧固定中文 note → 当前 UI 语言
    if (s.indexOf('体重 CSV') !== -1 || /No valid weight CSV/i.test(s)) {
      return t('csv.note.weightEmpty');
    }
    if (s.indexOf('血压 CSV') !== -1 || /No valid BP CSV/i.test(s)) {
      return t('csv.note.bpEmpty');
    }
    return s;
  }

  async function reapplyCsvAndRefresh() {
    if (!currentAnalysis || !currentAnalysis.data) {
      showToast(t('csv.err.needParse'));
      return;
    }
    try {
      const note = await applySelectedCsvToData(currentAnalysis.data);
      lastCsvMergeNote = note || t('csv.bit.done');
      recoveryWeights = loadRecoveryWeights();
      currentAnalysis = window.HealthAnalyzer.analyzeAll(currentAnalysis.data, {
        recoveryWeights,
        locale: getAnalysisLocale(),
      });
      renderResults(currentAnalysis);
      const st = $('csv-merge-status');
      if (st) {
        st.textContent = '✓ ' + lastCsvMergeNote;
        st.classList.add('show');
        setTimeout(() => st.classList.remove('show'), 3000);
      }
      showToast(t('csv.ok.merged'), { ok: true });
    } catch (e) {
      showToast(t('csv.err.mergeFail', { msg: e.message || e }), { ms: 2800 });
    }
  }

  function renderAvailability(analysis) {
    renderDataQualityBanner(analysis);
    const av = analysis.data.dataAvailability;
    const grid = $('availability-grid');
    const items = [
      { key: 'hasCgm', icon: '🩸', name: t('av.cgm'), count: t('av.nRecords', { n: analysis.data.cgm.length }) },
      { key: 'hasBloodPressure', icon: '❤️', name: t('av.bp'), count: t('av.nRecords', { n: analysis.data.bloodPressure.length }) },
      {
        key: 'hasWeight',
        icon: '⚖️',
        name: t('av.weight'),
        count: analysis.weightStats
          ? t('av.trendDaysRecords', { days: analysis.weightStats.dayCount, n: analysis.data.weight.length })
          : t('av.nRecords', { n: analysis.data.weight.length }),
      },
      {
        key: 'hasBodyFat',
        icon: '📉',
        name: t('av.bodyFat'),
        count: t('av.nPoints', { n: analysis.weightStats?.bodyFatDayCount || analysis.data.bodyFat?.length || 0 }),
      },
      { key: 'hasHrv', icon: '📊', name: t('av.hrv'), count: t('av.nDays', { n: Object.keys(analysis.hrvByDate).length }) },
      { key: 'hasHeartRate', icon: '💗', name: t('av.hr'), count: t('av.nDays', { n: Object.keys(analysis.data.restingHr).length }) },
      { key: 'hasSteps', icon: '👟', name: t('av.steps'), count: t('av.nDays', { n: Object.keys(analysis.data.steps).length }) },
      { key: 'hasSleep', icon: '😴', name: t('av.sleep'), count: t('av.nDays', { n: Object.keys(analysis.data.sleep).length }) },
      {
        key: 'hasWatchActivity',
        icon: '⌚',
        name: t('av.watch'),
        count: t('av.nDays', {
          n: analysis.watchStats?.dayCount || Object.keys(analysis.data.watchDaily || {}).length,
        }),
      },
      {
        key: 'hasSpO2',
        icon: '🫁',
        name: t('av.spo2'),
        count: t('av.nDays', { n: analysis.watchStats?.spo2DayCount || 0 }),
      },
      {
        key: 'hasRespiratoryRate',
        icon: '🌬️',
        name: t('av.rr'),
        count: analysis.watchStats?.rrMean7d != null
          ? t('av.rr7d', { n: analysis.watchStats.rrMean7d.toFixed(1) })
          : t('av.hasData'),
      },
      {
        key: 'hasVo2Max',
        icon: '🏃',
        name: t('av.vo2'),
        count:
          analysis.watchStats?.vo2Latest != null
            ? t('av.vo2WithDays', {
                v: analysis.watchStats.vo2Latest.toFixed(1),
                n: analysis.watchStats.vo2DayCount || 0,
              })
            : t('av.nDays', { n: analysis.watchStats?.vo2DayCount || 0 }),
      },
      {
        key: 'hasWristTemp',
        icon: '🌡️',
        name: t('av.wristTemp'),
        count: analysis.watchStats?.wristTempMean7d != null
          ? analysis.watchStats.wristTempMean7d.toFixed(2) + ' °C'
          : t('av.hasData'),
      },
      {
        key: 'hasBreathingDisturbance',
        icon: '😮‍💨',
        name: t('av.breathing'),
        count:
          analysis.watchStats?.breathingDisturbanceDayCount > 0
            ? (analysis.watchStats.breathingDisturbanceMean7d != null
                ? t('av.bdMeanPrefix', { n: analysis.watchStats.breathingDisturbanceMean7d.toFixed(2) })
                : '') +
              t('av.nDays', { n: analysis.watchStats.breathingDisturbanceDayCount })
            : t('av.hasData'),
      },
      {
        key: 'hasWorkouts',
        icon: '🏋️',
        name: t('av.workouts'),
        count: analysis.workoutStats
          ? t('av.workoutsDetail', {
              n: analysis.workoutStats.count,
              n30: analysis.workoutStats.count30d,
            })
          : t('av.nSessions', { n: analysis.data.workouts?.length || 0 }),
      },
      { key: 'hasEcg', icon: '📈', name: t('av.ecg'), count: t('av.nCopies', { n: analysis.data.ecg.length }) },
    ];

    grid.innerHTML = items.map(it => `
      <div class="availability-item ${av[it.key] ? 'has-data' : 'no-data'}">
        <div class="av-icon">${it.icon}</div>
        <div class="av-info">
          <div class="av-name">${escapeHtml(it.name)}</div>
          <div class="av-count">${av[it.key] ? escapeHtml(it.count) : escapeHtml(t('av.noData'))}</div>
        </div>
      </div>
    `).join('');

    $('date-range-info').textContent = t('av.dateRange', {
      start: analysis.dateRange.start,
      end: analysis.dateRange.end,
    });
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
      throw new Error(t('parse.err.dateRange'));
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
          <h3>${escapeHtml(t('summary.cgm.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.segment'))}</th><th>${escapeHtml(t('summary.th.mean'))}</th><th>${escapeHtml(t('summary.th.tir'))}</th><th>${escapeHtml(t('summary.th.below39'))}</th><th>${escapeHtml(t('summary.th.count'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.cgm.overall'))}</td><td class="num">${o.mean.toFixed(2)}</td><td class="num">${o.pctInRange.toFixed(1)}%</td><td class="num">${o.pctBelow39.toFixed(1)}%</td><td class="num">${o.count}</td></tr>
            ${fd ? `<tr><td>${escapeHtml(t('summary.cgm.firstDay', { date: analysis.cgmStats.firstDayDate || '' }))}</td><td class="num">${fd.mean.toFixed(2)}</td><td class="num">${fd.pctInRange.toFixed(1)}%</td><td class="num">${fd.pctBelow39.toFixed(1)}%</td><td class="num">${fd.count}</td></tr>` : ''}
            ${st ? `<tr><td><strong>${escapeHtml(t('summary.cgm.stable'))}</strong></td><td class="num">${st.mean.toFixed(2)}</td><td class="num">${st.pctInRange.toFixed(1)}%</td><td class="num">${st.pctBelow39.toFixed(1)}%</td><td class="num">${st.count}</td></tr>` : ''}
            <tr><td colspan="5" class="hint" style="background:transparent;padding:8px 0 0;margin:0;">${escapeHtml(t('summary.cgm.minMax', { min: o.min.toFixed(1), max: o.max.toFixed(1) }))}</td></tr>
            ${
              analysis.cgmStats.coverage
                ? `<tr><td colspan="5" class="hint" style="background:transparent;padding:4px 0 0;margin:0;">${escapeHtml(
                    t('summary.cgm.tirNote', {
                      method:
                        o.tirMethod === 'time_weighted'
                          ? t('kpi.cgmTirTime')
                          : t('kpi.cgmTirSample'),
                      sample:
                        o.samplePctInRange != null
                          ? o.samplePctInRange.toFixed(1)
                          : o.pctInRange.toFixed(1),
                    })
                  )}</td></tr>`
                : ''
            }
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
        ? `<tr><td>${escapeHtml(t('summary.bp.withCount', { label, n: m.count }))}</td><td class="num">${m.systolic.toFixed(1)}/${m.diastolic.toFixed(1)}${m.lowCount ? escapeHtml(t('summary.bp.lowSuffix', { n: m.lowCount })) : ''}</td></tr>`
        : '';
      blocks.push(`
        <div class="section-block">
          <h3>${escapeHtml(t('summary.bp.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.period'))}</th><th>${escapeHtml(t('summary.th.mean'))}</th></tr>
            ${row(t('summary.bp.7dAll'), bp.mean7d)}
            ${row(t('summary.bp.7dMorn'), bp.morning7d)}
            ${row(t('summary.bp.7dEve'), bp.evening7d)}
            ${row(t('summary.bp.14dAll'), bp.mean14d)}
            ${row(t('summary.bp.14dMorn'), bp.morning14d)}
            ${row(t('summary.bp.14dEve'), bp.evening14d)}
            ${bp.lowest ? `<tr><td>${escapeHtml(t('summary.bp.lowest'))}</td><td class="num">${bp.lowest.systolic}/${bp.lowest.diastolic} (${bp.lowest.datetime.slice(5, 16)})</td></tr>` : ''}
            ${bp.highest ? `<tr><td>${escapeHtml(t('summary.bp.highest'))}</td><td class="num">${bp.highest.systolic}/${bp.highest.diastolic} (${bp.highest.datetime.slice(5, 16)})</td></tr>` : ''}
          </table>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;color:var(--primary);font-size:13px;">${escapeHtml(t('summary.bp.recent5'))}</summary>
            <table class="summary-table" style="margin-top:8px;">
              <tr><th>${escapeHtml(t('summary.th.time'))}</th><th>${escapeHtml(t('summary.th.bp'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.weightFat.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.weight.latestTrend'))}</td><td class="num">${lt ? lt.weight.toFixed(1) + ' kg (' + lt.date + ')' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.earliestTrend'))}</td><td class="num">${et ? et.weight.toFixed(1) + ' kg (' + et.date + ')' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.trendDelta'))}</td><td class="num">${lt && et ? (lt.weight - et.weight).toFixed(1) + ' kg' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.latestFat'))}</td><td class="num">${ws.bodyFatLatest != null ? ws.bodyFatLatest.toFixed(1) + '%' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.fatDelta'))}</td><td class="num">${ws.bodyFatDelta != null ? ws.bodyFatDelta.toFixed(1) + ' ' + t('summary.weight.pctPoints') : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.rawTrendDays'))}</td><td class="num">${ws.rawCount} / ${ws.dayCount}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.trend'))}</th><th>${escapeHtml(t('summary.th.morn'))}</th><th>${escapeHtml(t('summary.th.eve'))}</th><th>${escapeHtml(t('summary.th.bodyFat'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.weight.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.weight.latest'))}</td><td class="num">${latest.value.toFixed(1)} kg (${latest.datetime.slice(0, 10)})</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.earliest'))}</td><td class="num">${earliest.value.toFixed(1)} kg (${earliest.datetime.slice(0, 10)})</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.change'))}</td><td class="num">${(latest.value - earliest.value).toFixed(1)} kg</td></tr>
            <tr><td>${escapeHtml(t('summary.weight.records'))}</td><td class="num">${w.length}</td></tr>
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
          <h3>${escapeHtml(t('summary.hrv.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.hrv.meanN', { n: recent.length }))}</td><td class="num">${formatMean(avg7, 1)} ms</td></tr>
            <tr><td>${escapeHtml(t('summary.common.dataDays'))}</td><td class="num">${dates.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.allDayMean'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.hr.h3', { n: recent.length }))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.hr.restMean', { n: restVals.length }))}</td><td class="num">${formatMean(meanOf(restVals), 1)} bpm</td></tr>
            <tr><td>${escapeHtml(t('summary.hr.walkMean', { n: walkVals.length }))}</td><td class="num">${formatMean(meanOf(walkVals), 1)} bpm</td></tr>
            <tr><td>${escapeHtml(t('summary.common.dataDays'))}</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.resting'))}</th><th>${escapeHtml(t('summary.th.walking'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.steps.h3', { n: recent.length }))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.steps.dailyMean', { n: vals.length }))}</td><td class="num">${vals.length ? Math.round(meanOf(vals)) : '—'} ${escapeHtml(t('summary.steps.unit'))}</td></tr>
            <tr><td>${escapeHtml(t('summary.common.dataDays'))}</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.steps'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.sleep.h3', { n: recent.length }))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.sleep.totalMean'))}</td><td class="num">${formatMean(meanOf(totals), 2)} h</td></tr>
            <tr><td>${escapeHtml(t('summary.sleep.deepMean'))}</td><td class="num">${formatMean(meanOf(deeps), 2)} h</td></tr>
            <tr><td>${escapeHtml(t('summary.sleep.remMean'))}</td><td class="num">${formatMean(meanOf(rems), 2)} h</td></tr>
            <tr><td>${escapeHtml(t('summary.common.dataDays'))}</td><td class="num">${sorted.length}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.sleepTotal'))}</th><th>${escapeHtml(t('summary.th.sleepDeep'))}</th><th>${escapeHtml(t('summary.th.sleepRem'))}</th></tr>
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
          <h3>${escapeHtml(t('summary.watch.h3', { n: recent.length }))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.watch.exerciseMean'))}</td><td class="num">${ws.exerciseMinMean7d != null ? ws.exerciseMinMean7d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.activeKcal'))}</td><td class="num">${ws.activeKcalMean7d != null ? ws.activeKcalMean7d.toFixed(0) + ' kcal' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.spo2'))}</td><td class="num">${ws.spo2Mean7d != null ? ws.spo2Mean7d.toFixed(1) + '%' : '—'}${ws.spo2Min7d != null ? ' / ' + ws.spo2Min7d.toFixed(1) + '%' : ''}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.spo2Night'))}</td><td class="num">${ws.spo2NightMean7d != null ? ws.spo2NightMean7d.toFixed(1) + '%' : '—'}${ws.spo2NightMin7d != null ? escapeHtml(t('summary.watch.minSuffix', { n: ws.spo2NightMin7d.toFixed(1) })) : ''}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.spo2Day'))}</td><td class="num">${ws.spo2DayMean7d != null ? ws.spo2DayMean7d.toFixed(1) + '%' : '—'}${ws.spo2DayMin7d != null ? escapeHtml(t('summary.watch.minSuffix', { n: ws.spo2DayMin7d.toFixed(1) })) : ''}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.rr'))}</td><td class="num">${ws.rrMean7d != null ? ws.rrMean7d.toFixed(1) + escapeHtml(t('summary.watch.rrUnit')) : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.nightHr'))}</td><td class="num">${ws.nightHrMean7d != null ? ws.nightHrMean7d.toFixed(0) + ' bpm' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.vo2'))}</td><td class="num">${ws.vo2Latest != null ? ws.vo2Latest.toFixed(1) : '—'} / ${vo2Delta}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.wristTemp'))}</td><td class="num">${ws.wristTempMean7d != null ? ws.wristTempMean7d.toFixed(2) + ' °C' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.bd'))}</td><td class="num">${ws.breathingDisturbanceMean7d != null ? ws.breathingDisturbanceMean7d.toFixed(2) : '—'}${ws.breathingDisturbanceLatest != null ? ' / ' + ws.breathingDisturbanceLatest.toFixed(2) : ''}${ws.breathingDisturbanceDayCount ? escapeHtml(t('summary.watch.bdDays', { n: ws.breathingDisturbanceDayCount })) : ''}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.daylight'))}</td><td class="num">${ws.daylightMinMean7d != null ? ws.daylightMinMean7d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.stand'))}</td><td class="num">${ws.standHoursMean7d != null ? ws.standHoursMean7d.toFixed(1) : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.watch.dataDays'))}</td><td class="num">${escapeHtml(t('summary.watch.dataDaysVal', {
              n: ws.dayCount,
              spo2: ws.spo2DayCount,
              vo2: ws.vo2DayCount,
              bd: ws.breathingDisturbanceDayCount ? t('summary.watch.bdPart', { n: ws.breathingDisturbanceDayCount }) : '',
            }))}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.date'))}</th><th>${escapeHtml(t('summary.th.exercise'))}</th><th>${escapeHtml(t('summary.th.kcal'))}</th><th>${escapeHtml(t('summary.th.spo2'))}</th><th>${escapeHtml(t('summary.th.min'))}</th><th>${escapeHtml(t('summary.th.rr'))}</th><th>${escapeHtml(t('summary.th.nightHr'))}</th><th>${escapeHtml(t('summary.th.vo2'))}</th>${showBd ? `<th>${escapeHtml(t('summary.th.bd'))}</th>` : ''}</tr>
            ${rows}
          </table>
          <p class="hint" style="margin-top:8px;">${escapeHtml(t('summary.watch.hint'))}</p>
        </div>
      `);
    }

    // Workout 会话
    if (analysis.workoutStats && analysis.workoutStats.count > 0) {
      const wos = analysis.workoutStats;
      const typeRows = wos.byType.slice(0, 8).map((wt) =>
        `<tr><td>${escapeHtml(wt.activityLabel || wt.activityType)}</td><td class="num">${wt.count}</td><td class="num">${wt.durationMin.toFixed(0)}</td><td class="num">${wt.activeKcal ? wt.activeKcal.toFixed(0) : '—'}</td></tr>`
      ).join('');
      const recent = wos.sessions.slice(-8).reverse().map((s) => {
        return `<tr><td>${escapeHtml(s.startDate.slice(0, 16))}</td><td>${escapeHtml(s.activityLabel || s.activityType)}</td><td class="num">${s.durationMin.toFixed(0)}</td><td class="num">${s.activeKcal != null ? s.activeKcal.toFixed(0) : '—'}</td><td class="num">${s.hrAvg != null ? s.hrAvg.toFixed(0) : '—'}</td><td class="num">${s.hrMax != null ? s.hrMax.toFixed(0) : '—'}</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>${escapeHtml(t('summary.workout.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.workout.total'))}</td><td class="num">${wos.count}</td></tr>
            <tr><td>${escapeHtml(t('summary.workout.30d'))}</td><td class="num">${escapeHtml(t('summary.workout.30dVal', { n: wos.count30d, min: wos.durationSum30d.toFixed(0), kcal: wos.activeKcalSum30d.toFixed(0) }))}</td></tr>
            <tr><td>${escapeHtml(t('summary.workout.7d'))}</td><td class="num">${escapeHtml(t('summary.workout.7dVal', { n: wos.count7d, min: wos.durationSum7d.toFixed(0) }))}</td></tr>
            <tr><td>${escapeHtml(t('summary.workout.meanDur'))}</td><td class="num">${wos.durationMean30d != null ? wos.durationMean30d.toFixed(0) + ' min' : '—'}</td></tr>
            <tr><td>${escapeHtml(t('summary.workout.meanHr'))}</td><td class="num">${wos.hrAvgMean30d != null ? wos.hrAvgMean30d.toFixed(0) + ' bpm' : '—'}</td></tr>
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.type'))}</th><th>${escapeHtml(t('summary.th.sessions'))}</th><th>${escapeHtml(t('summary.th.totalMin'))}</th><th>${escapeHtml(t('summary.th.kcal'))}</th></tr>
            ${typeRows}
          </table>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.start'))}</th><th>${escapeHtml(t('summary.th.type'))}</th><th>min</th><th>${escapeHtml(t('summary.th.kcal'))}</th><th>${escapeHtml(t('summary.th.hrAvg'))}</th><th>${escapeHtml(t('summary.th.hrMax'))}</th></tr>
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
          : `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(String(val))}</td></tr>`;
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
          <p class="hint" style="margin:12px 0 6px;">${escapeHtml(t('summary.recovery.trend', { n: mini.length }))}</p>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.weekEnd'))}</th><th>${escapeHtml(t('summary.th.recovery'))}</th><th>${escapeHtml(t('summary.th.load'))}</th><th>${escapeHtml(t('summary.th.hrv'))}</th><th>${escapeHtml(t('summary.th.sleepH'))}</th></tr>
            ${miniRows}
          </table>`
        : '';
      const w = recoveryWeights || loadRecoveryWeights();
      const weightSlider = (key, label, side) => {
        const val = w[key] != null ? Number(w[key]) : 1;
        const aria = t('summary.recovery.weightAria', { label });
        return `
          <label class="rw-weight-row" data-side="${side}">
            <span class="rw-weight-label">${escapeHtml(label)}</span>
            <input type="range" id="rw-weight-${key}" min="0.1" max="5" step="0.1" value="${val}" aria-label="${escapeHtml(aria)}">
            <span class="rw-weight-val" id="rw-weight-${key}-val">${val.toFixed(1)}</span>
          </label>`;
      };
      // 评分拆解小面板：当前分、状态、基线差、生效权重
      const weightLabelMap = {
        hrv: t('recovery.breakdown.hrv') || 'HRV',
        sleep: t('rw.weights.sleep') || '睡眠',
        nightHr: t('rw.weights.nightHr') || '夜心率',
        spo2Night: t('rw.weights.spo2Night') || '夜血氧',
        exercise: t('rw.weights.exercise') || '锻炼',
        workout: t('recovery.breakdown.workout') || 'Workout',
        steps: t('rw.weights.steps') || '步数',
      };
      const weightKeys = ['hrv', 'sleep', 'nightHr', 'spo2Night', 'exercise', 'workout', 'steps'];
      const weightChips = weightKeys
        .map((k) => {
          const val = w[k] != null ? Number(w[k]) : 1;
          const label = weightLabelMap[k] || k;
          return `<span class="recovery-breakdown-chip"><span class="recovery-breakdown-chip-name">${escapeHtml(label)}</span><span class="recovery-breakdown-chip-val">${val.toFixed(1)}</span></span>`;
        })
        .join('');
      const recScoreTxt =
        rw.recoveryScore != null ? String(rw.recoveryScore) : '—';
      const loadScoreTxt = rw.loadScore != null ? String(rw.loadScore) : '—';
      let baselineHtml = '';
      if (rw.vsBaselineDelta != null && Number.isFinite(rw.vsBaselineDelta)) {
        const d = rw.vsBaselineDelta;
        const sign = d > 0 ? '+' : '';
        const baseTxt =
          rw.baselineRecoveryMedian != null
            ? String(rw.baselineRecoveryMedian)
            : '—';
        baselineHtml = `<p class="recovery-breakdown-baseline">${escapeHtml(
          t('recovery.breakdown.baseline') || '相对近几周中位'
        )}: <strong>${sign}${d.toFixed(0)}</strong> <span class="hint">(${escapeHtml(
          t('recovery.breakdown.baselineMedian') || '基线中位'
        )} ${escapeHtml(baseTxt)})</span></p>`;
      } else if (rw.baselineRecoveryMedian != null) {
        baselineHtml = `<p class="recovery-breakdown-baseline hint">${escapeHtml(
          t('recovery.breakdown.baselineMedian') || '基线中位'
        )}: ${escapeHtml(String(rw.baselineRecoveryMedian))}</p>`;
      }
      // 算法子分条（有 components 时）
      const comps = Array.isArray(rw.components) ? rw.components : [];
      const sideLabel = (side) =>
        side === 'recovery'
          ? t('recovery.breakdown.sideRecovery') || '恢复侧'
          : t('recovery.breakdown.sideLoad') || '负荷侧';
      const componentRows = comps
        .map((c) => {
          const name = weightLabelMap[c.key] || c.key;
          const pct = Math.max(0, Math.min(100, Number(c.score) || 0));
          const rawTxt =
            c.raw != null && Number.isFinite(c.raw)
              ? `${Number(c.raw).toFixed(c.rawUnit === 'steps' || c.rawUnit === 'bpm' ? 0 : 1)}${c.rawUnit === 'steps' ? '' : c.rawUnit === 'min' ? ' min' : c.rawUnit === 'h' ? ' h' : c.rawUnit === '%' ? '%' : c.rawUnit === 'ms' ? ' ms' : c.rawUnit === 'bpm' ? ' bpm' : ''}`
              : '—';
          return `<div class="recovery-comp-row" data-side="${escapeHtml(c.side)}">
            <div class="recovery-comp-meta">
              <span class="recovery-comp-name">${escapeHtml(name)}</span>
              <span class="recovery-comp-side">${escapeHtml(sideLabel(c.side))}</span>
              <span class="recovery-comp-raw hint">${escapeHtml(rawTxt)}</span>
              <span class="recovery-comp-score">${pct}</span>
            </div>
            <div class="recovery-comp-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <span class="recovery-comp-fill" style="width:${pct}%"></span>
            </div>
          </div>`;
        })
        .join('');
      const componentsHtml = comps.length
        ? `<div class="recovery-components">
            <span class="recovery-breakdown-weights-label">${escapeHtml(
              t('recovery.breakdown.components') || '维度子分（加权前）'
            )}</span>
            <p class="hint recovery-comp-hint">${escapeHtml(
              t('recovery.breakdown.componentsHint') ||
                '各维度映射到 0–100 后，再按权重合成恢复分/负荷分；启发式，非诊断。'
            )}</p>
            ${componentRows}
          </div>`
        : '';
      const breakdownPanel = `
          <div class="recovery-breakdown" id="recovery-breakdown" aria-label="${escapeHtml(
            t('recovery.breakdown.title') || '恢复评分拆解'
          )}">
            <div class="recovery-breakdown-head">
              <span class="recovery-breakdown-title">${escapeHtml(
                t('recovery.breakdown.title') || '评分拆解'
              )}</span>
              <span class="recovery-breakdown-scores">
                <span class="recovery-breakdown-score" data-kind="recovery">
                  <span class="recovery-breakdown-score-label">${escapeHtml(
                    t('recovery.breakdown.recoveryScore') || '恢复分'
                  )}</span>
                  <span class="recovery-breakdown-score-val">${escapeHtml(recScoreTxt)}</span>
                </span>
                <span class="recovery-breakdown-score" data-kind="load">
                  <span class="recovery-breakdown-score-label">${escapeHtml(
                    t('recovery.breakdown.loadScore') || '负荷分'
                  )}</span>
                  <span class="recovery-breakdown-score-val">${escapeHtml(loadScoreTxt)}</span>
                </span>
              </span>
            </div>
            <p class="recovery-breakdown-status">${escapeHtml(
              t('recovery.breakdown.status') || '状态'
            )}: ${escapeHtml(rw.statusLabel || '—')}</p>
            ${baselineHtml}
            ${componentsHtml}
            <div class="recovery-breakdown-weights">
              <span class="recovery-breakdown-weights-label">${escapeHtml(
                t('recovery.breakdown.weights') || '当前权重'
              )}</span>
              <div class="recovery-breakdown-chips">${weightChips}</div>
            </div>
          </div>`;
      blocks.push(`
        <div class="section-block" id="recovery-panel">
          <h3>${escapeHtml(t('summary.recovery.h3'))}</h3>
          <p class="hint" style="margin:0 0 8px;">${escapeHtml(t('summary.recovery.cutoff', { date: rw.weekEnd, status: rw.statusLabel || '' }))}</p>
          ${breakdownPanel}
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            ${row(t('summary.recovery.score'), rw.recoveryScore != null ? rw.recoveryScore + ' / 100' : null)}
            ${row(t('summary.recovery.load'), rw.loadScore != null ? rw.loadScore + ' / 100' : null)}
            ${row(t('summary.recovery.hrv'), rw.hrvMean7d != null ? rw.hrvMean7d.toFixed(1) + ' ms' : null)}
            ${row(t('summary.recovery.nightHr'), rw.nightHrMean7d != null ? rw.nightHrMean7d.toFixed(0) + ' bpm' : null)}
            ${row(t('summary.recovery.restingHr'), rw.restingHrMean7d != null ? rw.restingHrMean7d.toFixed(0) + ' bpm' : null)}
            ${row(t('summary.recovery.exercise'), rw.exerciseMinMean7d != null ? rw.exerciseMinMean7d.toFixed(0) + ' min' : null)}
            ${row(t('summary.recovery.workout'), t('summary.recovery.workoutVal', { n: rw.workoutCount7d, min: rw.workoutDuration7d.toFixed(0) }))}
            ${row(t('summary.recovery.sleep'), rw.sleepMean7d != null ? rw.sleepMean7d.toFixed(2) + ' h' : null)}
            ${row(t('summary.recovery.steps'), rw.stepsMean7d != null ? t('summary.recovery.stepsVal', { n: Math.round(rw.stepsMean7d) }) : null)}
            ${row(t('summary.recovery.stand'), rw.standHoursMean7d != null ? rw.standHoursMean7d.toFixed(1) : null)}
            ${row(t('summary.recovery.daylight'), rw.daylightMinMean7d != null ? rw.daylightMinMean7d.toFixed(0) + ' min' : null)}
            ${row(t('summary.recovery.spo2Night'), rw.spo2NightMean7d != null ? rw.spo2NightMean7d.toFixed(1) + '%' : null)}
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
          ? `<tr><td>${escapeHtml(t('summary.ecg.highNearWorkout'))}</td><td class="num">${nearW}</td></tr>
            <tr><td>${escapeHtml(t('summary.ecg.highResting'))}</td><td class="num">${restW}</td></tr>
            <tr><td>${escapeHtml(t('summary.ecg.highOther'))}</td><td class="num">${otherHr}</td></tr>` +
            (showActCorr
              ? `<tr><td>${escapeHtml(t('summary.ecg.highLowAct'))}</td><td class="num">${lowAct ?? 0}</td></tr>
            <tr><td>${escapeHtml(t('summary.ecg.highHighAct'))}</td><td class="num">${highAct ?? 0}</td></tr>`
              : '')
          : '';
      const topHoursBlock = topHourRows
        ? `<table class="summary-table" style="margin-top:8px;">
            <tr><th>${escapeHtml(t('summary.th.highHrHour'))}</th><th>${escapeHtml(t('summary.th.copies'))}</th></tr>
            ${topHourRows}
          </table>`
        : '';
      blocks.push(`
        <div class="section-block">
          <h3>${escapeHtml(t('summary.ecg.h3'))}</h3>
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.metric'))}</th><th>${escapeHtml(t('summary.th.value'))}</th></tr>
            <tr><td>${escapeHtml(t('summary.ecg.total'))}</td><td class="num">${es.count}</td></tr>
            <tr><td>${escapeHtml(t('summary.ecg.breakdown'))}</td><td class="num">${es.sinusCount} / ${es.highHrCount} / ${es.inconclusiveCount}</td></tr>
            ${corrRows}
            ${es.latest ? `<tr><td>${escapeHtml(t('summary.ecg.latest'))}</td><td class="num">${escapeHtml(String(es.latest.datetime).slice(0, 16))} · ${escapeHtml(es.latest.classification)}</td></tr>` : ''}
          </table>
          ${topHoursBlock}
          <table class="summary-table">
            <tr><th>${escapeHtml(t('summary.th.classification'))}</th><th>${escapeHtml(t('summary.th.copies'))}</th></tr>
            ${classRows}
          </table>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;color:var(--primary);font-size:13px;">${escapeHtml(t('summary.ecg.recent'))}</summary>
            <table class="summary-table" style="margin-top:8px;">
              <tr><th>${escapeHtml(t('summary.th.time'))}</th><th>${escapeHtml(t('summary.th.classification'))}</th></tr>
              ${recentList}
            </table>
          </details>
          <p class="hint" style="margin-top:8px;">${t('summary.ecg.hint')}</p>
        </div>
      `);
    } else if (data.ecg && data.ecg.length > 0) {
      blocks.push(`
        <div class="section-block">
          <h3>${escapeHtml(t('summary.ecg.h3'))}</h3>
          <p class="hint">${escapeHtml(t('summary.ecg.countOnly', { n: data.ecg.length }))}</p>
        </div>
      `);
    }

    if (blocks.length === 0) {
      container.innerHTML = `<p class="hint">${escapeHtml(t('summary.empty'))}</p>`;
      return;
    }
    // 各维度默认折叠，减轻长页滚动压力
    container.innerHTML = `<div class="summary-accordions">${blocks.map((html, idx) => {
      const open = idx === 0 ? ' open' : '';
      // 从块内 h3 抽标题
      const m = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const title = m ? m[1].replace(/<[^>]+>/g, '').trim() : t('summary.dimensionN', { n: idx + 1 });
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
    const ctx = getUserContextForPrompt();
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
    btn.textContent = willExpand ? t('prompt.collapse') : t('prompt.expand');
    btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
  });

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      const status = $('copy-status');
      if (status) {
        status.textContent = t('common.copied');
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 2000);
      }
      showToast(okMsg || t('copy.ok.clipboard'), { ok: true });
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
        showToast(okMsg || t('copy.tried'), { ms: 2200 });
        return true;
      } catch (e2) {
        showToast(t('copy.fail'), { ms: 2800 });
        return false;
      }
    }
  }

  // 提示词区：复制当前标签内容
  $('btn-copy')?.addEventListener('click', async () => {
    if (!currentAnalysis) return;
    if (!ensureLlmCopyAck()) return;
    renderPrompt();
    await copyText($('prompt-output').value, t('copy.ok.clipboard'));
  });

  async function copyInsightsOnly() {
    if (!currentAnalysis) {
      showToast(t('common.needAnalysis'));
      return;
    }
    if (!ensureLlmCopyAck()) return;
    if (typeof window.HealthAnalyzer.generateInsightsOnlyPrompt !== 'function') {
      showToast(t('copy.err.insightsUnavailable'));
      return;
    }
    const ctx = getUserContextForPrompt();
    let prefix = '';
    if (window.HealthAnalyzer.formatUserContext) {
      prefix = window.HealthAnalyzer.formatUserContext(ctx) || '';
    }
    const text = window.HealthAnalyzer.generateInsightsOnlyPrompt(currentAnalysis, { prefix });
    await copyText(text, t('copy.ok.insights'));
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
    if (!window.confirm(t('history.confirmClear'))) return;
    try {
      await window.HealthHistory.clearAll();
      await refreshHistorySelect();
      showExportStatus(t('history.ok.cleared'));
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  /**
   * 一键清除所有本机健康相关数据：
   * - localStorage：个人背景、恢复权重、信号偏好、图表范围、LLM 复制确认、敏感字段勾选、洞察 coach
   * - IndexedDB：摘要历史 + 周报历史
   * 保留：主题 (THEME_KEY)、语言 (health-analyzer-locale)、侧栏折叠、安装/更新提示等 UI 偏好
   */
  async function clearAllLocalHealthData() {
    if (!window.confirm(t('privacy.wipeConfirm'))) return;
    // localStorage 健康相关
    for (const key of HEALTH_LOCAL_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    }
    // 表单与内存状态
    clearUserContext();
    // 已 removeItem，不再回写默认到 storage；仅内存 / UI 重置
    recoveryWeights = getDefaultRecoveryWeights();
    signalPrefs = defaultSignalPrefs();
    chartRangeDays = 30;
    document.querySelectorAll('[data-days]').forEach((btn) => {
      const d = Number(btn.getAttribute('data-days'));
      btn.classList.toggle('is-active', d === chartRangeDays);
    });
    syncIncludeSensitiveCheckbox();
    // 恢复权重滑块 UI（若有）
    try {
      if (typeof fillRecoveryWeightsForm === 'function') {
        fillRecoveryWeightsForm(recoveryWeights);
      }
    } catch (e) { /* ignore */ }
    // IndexedDB
    try {
      if (window.HealthHistory) {
        if (typeof window.HealthHistory.clearAllStores === 'function') {
          await window.HealthHistory.clearAllStores();
        } else {
          if (typeof window.HealthHistory.clearAll === 'function') {
            await window.HealthHistory.clearAll();
          }
          if (typeof window.HealthHistory.clearWeeklyReports === 'function') {
            await window.HealthHistory.clearWeeklyReports();
          }
        }
      }
    } catch (e) {
      alert(t('privacy.wipeFail', { msg: e && e.message ? e.message : String(e) }));
      return;
    }
    const labelEl = $('history-label');
    if (labelEl) labelEl.value = '';
    const wrLabel = $('weekly-report-label');
    if (wrLabel) wrLabel.value = '';
    const cmp = $('history-compare');
    if (cmp) cmp.innerHTML = '';
    await refreshHistorySelect();
    await refreshWeeklyReportList();
    if (currentAnalysis) {
      // 信号筛选依赖 prefs；重置后重绘
      try {
        if (typeof renderSignals === 'function') renderSignals(currentAnalysis);
      } catch (e) { /* ignore */ }
      renderPrompt();
    }
    showExportStatus(t('privacy.wipeOk'));
    showToast(t('privacy.wipeOk'), { ok: true, ms: 2800 });
  }

  $('btn-clear-all-local')?.addEventListener('click', () => {
    clearAllLocalHealthData();
  });
  $('btn-clear-all-local-fold')?.addEventListener('click', () => {
    clearAllLocalHealthData();
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
    lastImportDiagnostics = null;
    lastCsvMergeNote = '';
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
    const hints = $('import-hints');
    if (hints) {
      hints.innerHTML = '';
      hints.classList.add('hidden');
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
    // 上传区 / 进度卡 / 安装引导 / 主题
    try {
      updateUploadLabels();
      ensureProgressCard();
      applyTheme(getStoredTheme());
      showInstallGuide({ forceText: true });
      // 提示词展开按钮随语言刷新
      const expBtn = $('btn-prompt-expand');
      const ta = $('prompt-output');
      if (expBtn && ta) {
        const collapsed = ta.classList.contains('is-collapsed');
        expBtn.textContent = collapsed ? t('prompt.expand') : t('prompt.collapse');
      }
    } catch (_) { /* ignore */ }
    if (!currentAnalysis) return;
    try {
      // 重算恢复 statusLabel 以匹配当前语言（不改权重、不弹状态）
      recomputeRecoveryWithWeights(recoveryWeights, { quiet: true });
      renderSignals(currentAnalysis);
      renderAvailability(currentAnalysis);
      maybeShowImportHints(currentAnalysis);
      refreshWeeklyReportList().catch(() => {});
      refreshHistorySelect().catch(() => {});
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
