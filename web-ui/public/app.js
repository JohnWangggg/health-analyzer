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
  const THEME_KEY = 'health-analyzer-theme'; // system | light | dark

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
      } else if (source === 'xml_only') {
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        if (!xmlFile) throw new Error('未选择 XML 文件');
        setProgress(0.04, '读取 XML…', { stage: 'read' });
        xmlText = await readFileAsText(xmlFile);
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

      setProgress(0.88, '生成统计与摘要…', { stage: 'stats', hint: '计算 KPI、晨重、CGM 稳定期与提示词…' });
      currentAnalysis = window.HealthAnalyzer.analyzeAll(data);

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
    const nav = $('result-sticky-nav');
    if (nav) nav.classList.toggle('hidden', !visible);
    // 有结果后收起上传区，降低干扰
    const source = $('step-source');
    if (source) {
      if (visible) source.classList.add('source-collapsed');
      else source.classList.remove('source-collapsed');
    }
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
    renderInsights(analysis);
    renderKpis(analysis);
    renderSummary(analysis);
    renderSignals(analysis);
    renderCharts(analysis);
    renderPrompt();
    refreshHistorySelect().catch(() => { /* ignore */ });

    $('step-overview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function navigateToInsight(anchor) {
    const map = {
      overview: { section: 'step-overview' },
      summary: { section: 'step-summary' },
      'summary-weight': { section: 'step-summary', panel: 'weight' },
      'summary-cgm': { section: 'step-summary', panel: 'cgm' },
      'summary-bp': { section: 'step-summary', panel: 'bp' },
      'summary-hrv': { section: 'step-summary', panel: 'hrv' },
      signals: { section: 'step-signals' },
      charts: { section: 'step-charts' },
      'charts-weight': { section: 'step-charts' },
      'charts-cgm': { section: 'step-charts' },
      prompt: { section: 'step-prompt' },
    };
    const target = map[anchor] || map.summary;
    const section = $(target.section);
    if (!section) return;
    section.classList.remove('hidden');
    if (target.panel) {
      const acc = section.querySelector(`.summary-acc[data-panel="${target.panel}"]`);
      if (acc) {
        acc.open = true;
        // 关闭同级其他折叠，减少干扰
        section.querySelectorAll('.summary-acc').forEach((el) => {
          if (el !== acc) el.open = false;
        });
      }
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 短暂高亮
    section.classList.add('section-flash');
    setTimeout(() => section.classList.remove('section-flash'), 1200);
  }

  function panelKeyFromTitle(title) {
    const t = String(title || '');
    if (/CGM|血糖/.test(t)) return 'cgm';
    if (/血压/.test(t)) return 'bp';
    if (/体重|体脂/.test(t)) return 'weight';
    if (/HRV|心率变异/.test(t)) return 'hrv';
    if (/静息|步行心率|心率/.test(t)) return 'hr';
    if (/步数/.test(t)) return 'steps';
    if (/睡眠/.test(t)) return 'sleep';
    if (/ECG|心电/.test(t)) return 'ecg';
    return 'other';
  }

  function renderInsights(analysis) {
    const list = $('insight-list');
    if (!list) return;
    if (!window.HealthAnalyzer || typeof window.HealthAnalyzer.buildInsightBullets !== 'function') {
      list.innerHTML = '<li class="insight-item tone-neutral"><div class="insight-title">摘要模块未加载</div></li>';
      return;
    }
    const bullets = window.HealthAnalyzer.buildInsightBullets(analysis) || [];
    if (!bullets.length) {
      list.innerHTML = '<li class="insight-item tone-neutral"><div class="insight-title">暂无足够数据生成摘要</div><p class="insight-detail">请确认导出包含体重、血压、CGM 或心率等记录。</p></li>';
      return;
    }
    const toneLabel = (t) => {
      if (t === 'alert') return '需关注';
      if (t === 'watch') return '观察';
      if (t === 'positive') return '积极';
      return '提示';
    };
    list.innerHTML = bullets.map((b, idx) => `
      <li class="insight-item tone-${escapeHtml(b.tone || 'neutral')} is-clickable" data-anchor="${escapeHtml(b.anchor || 'summary')}" data-idx="${idx}" role="button" tabindex="0">
        <div class="insight-meta">
          <span class="insight-badge">${toneLabel(b.tone)}</span>
          <span class="insight-goto">查看详情 →</span>
        </div>
        <div class="insight-title">${escapeHtml(b.title)}</div>
        <p class="insight-detail">${escapeHtml(b.detail)}</p>
      </li>
    `).join('');

    list.querySelectorAll('.insight-item[data-anchor]').forEach((el) => {
      const go = () => navigateToInsight(el.getAttribute('data-anchor'));
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
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

  function renderDataQualityBanner(analysis) {
    const host = $('data-quality-banner');
    if (!host) return;
    const dq = analysis && analysis.data && analysis.data.dataQuality;
    if (!dq || !dq.skippedFutureCount) {
      host.innerHTML = '';
      host.classList.add('hidden');
      return;
    }
    const samples = (dq.futureSampleDates || []).slice(0, 5).join('、') || '（未列出）';
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="quality-banner" role="status">
        <strong>已排除未来日期数据</strong>
        <p>
          参考日 <code>${escapeHtml(dq.referenceDate)}</code> 之后共跳过
          <strong>${dq.skippedFutureCount}</strong> 条记录
          （日期样本：${escapeHtml(samples)}）。
          常见原因是健康 App 中误录了未来体重等；请到手机「健康」中删除错误条目。
          统计、图表与提示词均<strong>不含</strong>这些未来记录。
        </p>
      </div>
    `;
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
    const approx = len < 1000 ? `${len} 字` : `约 ${(len / 1000).toFixed(1)} 千字`;
    if (meta) meta.textContent = approx;
    if (currentPromptTab === 'full') {
      if (badge) badge.textContent = '已含自动摘要';
      if (tip) tip.textContent = '含：监测摘要 · 稳定期 CGM · 晨重 · 晨晚血压 · 跨维度提示';
    } else if (currentPromptTab === 'data') {
      if (badge) badge.textContent = '数据 + 摘要';
      if (tip) tip.textContent = '无角色指令；适合自定义 system prompt';
    } else {
      if (badge) badge.textContent = '短系统提示';
      if (tip) tip.textContent = '粘贴到 system 字段，再附数据摘要';
    }
  }

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
