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

  // ============================================================
  // 上传处理
  // ============================================================

  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  const uploadHint = $('upload-hint');

  // 根据数据源选项切换上传模式
  document.querySelectorAll('input[name="source"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const val = radio.value;
      if (val === 'folder') {
        fileInput.hidden = true;
        folderInput.hidden = false;
        uploadHint.textContent = '选择文件夹（包含 export.xml 和 electrocardiograms/）';
      } else if (val === 'xml_only') {
        fileInput.hidden = false;
        folderInput.hidden = true;
        fileInput.accept = '.xml';
        uploadHint.textContent = '选择 export.xml 或 导出.xml';
      } else {
        fileInput.hidden = false;
        folderInput.hidden = true;
        fileInput.accept = '.zip,.xml';
        uploadHint.textContent = '支持 .zip / .xml';
      }
    });
  });

  dropZone.addEventListener('click', () => {
    const folderRadio = document.querySelector('input[name="source"][value="folder"]');
    if (folderRadio.checked) {
      folderInput.click();
    } else {
      fileInput.click();
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
        // 收集 ECG 文件
        const ecgDir = files.filter(f => f.webkitRelativePath && f.webkitRelativePath.includes('electrocardiograms'));
        ecgFiles = files.filter(f => f.name.endsWith('.csv') && (f.name.includes('ecg') || (f.webkitRelativePath || '').includes('electrocardiograms')));
      }

      setProgress(0.05, '解析 XML 中...');

      // 根据数据源选择解析方式
      let data;
      if (xmlBytes) {
        // 流式解析大文件（ZIP 内）
        data = await window.HealthAnalyzer.parseHealthXmlAsync(xmlBytes, {
          onProgress: (p) => setProgress(0.05 + p * 0.7, `解析中... ${Math.round(p * 100)}%`),
        });
      } else {
        // 字符串解析（小文件）
        data = window.HealthAnalyzer.parseHealthXml(xmlText, {
          onProgress: (p) => setProgress(0.05 + p * 0.7, `解析中... ${Math.round(p * 100)}%`),
        });
      }

      // 解析 ECG
      if (ecgFiles.length > 0) {
        for (const f of ecgFiles) {
          try {
            // 如果是从 ZIP 解出来的，已经有 _text
            const text = f._text || await readFileAsText(f);
            const summary = window.HealthAnalyzer.parseEcgCsv(text);
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

  function setProgress(ratio, text) {
    $('progress-fill').style.width = (ratio * 100) + '%';
    $('progress-text').textContent = text;
  }

  function showError(msg) {
    const card = $('step-progress');
    card.innerHTML = `
      <h2><span class="step-num">✗</span> 解析失败</h2>
      <div style="background:#fdf2f0;border:1px solid #e6b0aa;border-radius:8px;padding:16px;margin:12px 0;color:#922b21;">
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
        </ul>
      </details>
      <button id="btn-retry" class="btn-primary" style="margin-top:16px;">↺ 重新选择文件</button>
    `;
    show('step-progress');
    $('btn-retry').addEventListener('click', () => {
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

  function renderResults(analysis) {
    show('step-overview');
    show('step-summary');
    show('step-prompt');

    renderAvailability(analysis);
    renderSummary(analysis);
    renderPrompt();

    $('step-overview').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function renderSummary(analysis) {
    const container = $('summary-content');
    const blocks = [];

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

    if (analysis.data.weight.length > 0) {
      const w = analysis.data.weight;
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
      const rows = recent.map(d => {
        const h = analysis.hrvByDate[d];
        return `<tr><td>${d}</td><td class="num">${h.allMean.toFixed(1)} ms</td></tr>`;
      }).join('');
      blocks.push(`
        <div class="section-block">
          <h3>📊 HRV 心率变异性（最近 7 天）</h3>
          <table class="summary-table">
            <tr><th>日期</th><th>全天均值</th></tr>
            ${rows}
          </table>
        </div>
      `);
    }

    container.innerHTML = blocks.length > 0
      ? blocks.join('')
      : '<p class="hint">未发现可识别的健康数据维度。请确认导出的 ZIP 包来源。</p>';
  }

  // ============================================================
  // 提示词渲染
  // ============================================================

  function renderPrompt() {
    if (!currentAnalysis) return;
    let text = '';
    if (currentPromptTab === 'full') {
      text = window.HealthAnalyzer.generateLLMPrompt(currentAnalysis);
    } else if (currentPromptTab === 'data') {
      text = window.HealthAnalyzer.generateDataOnly(currentAnalysis);
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

  $('btn-copy').addEventListener('click', async () => {
    const text = $('prompt-output').value;
    try {
      await navigator.clipboard.writeText(text);
      const status = $('copy-status');
      status.textContent = '✓ 已复制';
      status.classList.add('show');
      setTimeout(() => status.classList.remove('show'), 2000);
    } catch (e) {
      // 回退：选中文本
      $('prompt-output').select();
      document.execCommand('copy');
      alert('已复制到剪贴板');
    }
  });

  $('btn-download').addEventListener('click', () => {
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

  $('btn-reset').addEventListener('click', () => {
    currentAnalysis = null;
    hide('step-overview');
    hide('step-summary');
    hide('step-prompt');
    show('step-source');
    fileInput.value = '';
    folderInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
