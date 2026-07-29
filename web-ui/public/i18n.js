/**
 * Lightweight UI i18n for health-analyzer PWA
 * Usage: I18n.t('key') | I18n.t('key', { n: 3 })
 * HTML: data-i18n="key" | data-i18n-placeholder | data-i18n-aria | data-i18n-title
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'health-analyzer-locale';

  var messages = {
    'zh-CN': {
      'app.title': '苹果健康数据分析',
      'app.subtitle': '本地隐私优先 · 计算在您的设备完成',
      'app.metaDescription': '本地隐私优先的苹果健康数据分析与大模型提示词工具',
      'theme.toggle': '外观',
      'theme.aria': '切换浅色或深色外观',
      'lang.label': '语言',
      'lang.zh': '中文',
      'lang.en': 'English',
      'install.title': '建议添加到主屏幕',
      'install.body': '安装后可像普通 App 一样离线打开（数据仍只在本机处理）。',
      'install.action': '查看添加方法',
      'install.dismiss': '关闭提示',
      'step1.title': '上传健康数据',
      'step1.lead': '推荐使用 iPhone「健康」App 导出的 <strong>ZIP</strong>。解析与统计均在本机完成。',
      'source.zip.title': '苹果健康导出 ZIP',
      'source.zip.desc': '健康 App → 头像 → 导出健康数据',
      'source.advanced': '其他导入方式（XML / 文件夹）',
      'source.xml.title': '单独的 XML 文件',
      'source.xml.desc': 'export.xml 或 导出.xml',
      'source.folder.title': '已解压的文件夹',
      'source.folder.desc': '适合电脑端 Chrome / Edge；手机支持有限',
      'upload.text': '点击选择文件',
      'upload.hint': '支持 .zip / .xml',
      'upload.drop': '拖放文件到此处，或点击选择',
      'upload.aria': '选择健康数据文件上传',
      'csv.summary': '可选：合并体脂秤 / 血压计 CSV',
      'csv.hint': '支持欧姆龙类中文表头。与苹果健康数据按时间合并，不覆盖已有记录。',
      'csv.weight': '体重 / 体脂 CSV',
      'csv.bp': '血压 CSV',
      'csv.apply': '应用到当前分析（需已解析）',
      'date.summary': '可选：限制分析日期范围',
      'date.hint': '不填则使用导出中的全部记录。',
      'date.start': '开始日期',
      'date.end': '结束日期',
      'ctx.summary': '可选：个人背景（写入提示词，仅本机保存）',
      'ctx.hint': '用药、目标体重与关注点会注入提示词；保存在本机 localStorage，不上传。',
      'ctx.age': '年龄',
      'ctx.sex': '性别',
      'ctx.height': '身高 (cm)',
      'ctx.targetWeight': '目标体重 (kg)',
      'ctx.medications': '当前用药',
      'ctx.conditions': '已知情况',
      'ctx.focus': '本次关注点',
      'ctx.notes': '补充说明',
      'ctx.save': '保存到本机',
      'ctx.clear': '清空',
      'privacy.noticeTitle': '隐私：健康明细默认不离开本机',
      'privacy.li1': 'ZIP/XML 不会上传到本站服务器；解析在浏览器内完成。',
      'privacy.li2': '完整分析结果默认只在当前页面内存；刷新后需重新上传。',
      'privacy.li3': '可选：个人背景写入 localStorage；摘要快照可写入 IndexedDB 供环比。',
      'help.export': '如何从 iPhone 导出？',
      'help.export.1': '打开 <strong>健康</strong> App → 右上角头像',
      'help.export.2': '<strong>导出健康数据</strong> → <strong>导出</strong>',
      'help.export.3': '存储到「文件」App，再在本页选择该 ZIP',
      'help.export.4': '体积很大时（数百 MB），建议在电脑浏览器打开本页再上传',
      'step2.title': '正在分析',
      'step2.lead': '数据只在本机处理，不会上传。大文件可能需要几十秒，请保持页面打开。',
      'progress.prepare': '准备中…',
      'progress.reading': '正在读取文件…',
      'stage.read': '读取文件',
      'stage.parse': '解析记录',
      'stage.stats': '生成统计',
      'stage.done': '完成',
      'nav.overview': '概览',
      'nav.summary': '明细',
      'nav.signals': '提示',
      'nav.charts': '图表',
      'nav.export': '导出',
      'nav.prompt': '提示词',
      'nav.aria': '结果分区',
      'overview.eyebrow': '分析完成',
      'overview.title': '监测概览',
      'overview.reset': '重新上传',
      'overview.privacy': '完整明细仅在本页；可复制提示词给大模型，或保存摘要到本机历史。',
      'insight.subhead': '先看这些',
      'insight.lead': '点条目看明细，点「看曲线」跳到对应趋势图（非诊断）。',
      'hero.copy': '复制完整提示词',
      'hero.openPrompt': '打开提示词区',
      'availability.summary': '数据可用性',
      'summary.title': '统计明细',
      'summary.hint': '各维度可展开。体重为晨起趋势；CGM 优先看稳定期；血压含晨晚分层。',
      'signals.title': '跨维度提示',
      'signals.hint': '规则线索，非诊断；已写入完整提示词。',
      'charts.title': '趋势图',
      'charts.hint': '本地绘制。在图上滑动可读数；体重为晨起趋势。',
      'charts.range7': '近 7 天',
      'charts.range30': '近 30 天',
      'charts.range90': '近 90 天',
      'charts.rangeAll': '全部',
      'export.title': '导出与历史',
      'export.hint': '均在本机。历史只存摘要指标（最多 30 条）。',
      'export.json': '导出 JSON',
      'export.csv': '导出 CSV 包',
      'export.snapshot': '导出摘要快照',
      'export.weekly': '导出本周报告',
      'weekly.title': '本周报告历史',
      'weekly.hint': '下载后可选保存 Markdown 到本机 IndexedDB（最多 20 条，不上传）。',
      'weekly.label': '周报备注（可选）',
      'weekly.save': '保存到本机历史',
      'weekly.refresh': '刷新',
      'history.title': '摘要快照历史',
      'history.label': '摘要名称（可选）',
      'history.save': '保存到本机历史',
      'history.refresh': '刷新列表',
      'history.clear': '清空历史',
      'history.compare': '与历史快照对比（当前分析）',
      'history.empty': '（暂无历史）',
      'prompt.title': '大模型提示词',
      'prompt.hint': '一键复制到豆包 / ChatGPT / Claude / Gemini。无数据维度会跳过。',
      'prompt.badge': '已含自动摘要',
      'prompt.tip': '含：监测摘要 · 稳定期 CGM · 晨重 · 晨晚血压 · 跨维度提示',
      'prompt.tab.full': '完整提示词',
      'prompt.tab.data': '仅数据摘要',
      'prompt.tab.system': '简短系统提示',
      'prompt.expand': '展开全部预览',
      'prompt.copy': '复制到剪贴板',
      'prompt.copyInsights': '只复制摘要',
      'prompt.download': '下载 .md',
      'prompt.help': '使用建议',
      'prompt.help.1': '国产模型对中文医学语境通常更贴切',
      'prompt.help.2': '粘贴后可补充「请额外关注 XX」',
      'prompt.help.3': '报告需与原始数据交叉核对，尤其是边界值',
      'privacy.fold': '隐私声明（本地优先，点开查看）',
      'privacy.f1': '解析与统计在<strong>您的浏览器</strong>内完成，无后端上传健康明细',
      'privacy.f2': '完整分析默认只在当前页内存；刷新后需重新上传 ZIP/XML',
      'privacy.f3': '可选：个人背景 → localStorage；摘要快照 → IndexedDB（可清空）',
      'privacy.f4': 'PWA 缓存仅保存网页程序，不自动保存完整健康导出',
      'privacy.f5': '复制提示词后，是否发给第三方大模型由您决定',
      'footer': '开源 · 本地优先 · v1.18',
      'sticky.next': '下一步',
      'sticky.copyInsights': '复制摘要',
      'sticky.copyFull': '复制完整提示词',
      'sticky.top': '回到概览',
      'sticky.aria': '快捷操作',
      'action.detail': '明细',
      'action.chart': '看曲线',
      'tone.alert': '需关注',
      'tone.watch': '观察',
      'tone.positive': '积极',
      'tone.neutral': '提示',
      'av.noData': '无数据',
      'layout.desktop': '宽屏布局',
      'layout.mobile': '移动布局',
      'note.analysisLang': '分析摘要与医学提示词内容目前以中文为主；界面可切换语言。',
    },
    en: {
      'app.title': 'Apple Health Analyzer',
      'app.subtitle': 'Local-first · All compute stays on your device',
      'app.metaDescription': 'Local-first Apple Health analysis and LLM prompt builder',
      'theme.toggle': 'Theme',
      'theme.aria': 'Toggle light or dark appearance',
      'lang.label': 'Language',
      'lang.zh': '中文',
      'lang.en': 'English',
      'install.title': 'Add to Home Screen',
      'install.body': 'Install for app-like offline access. Data still stays on this device.',
      'install.action': 'How to install',
      'install.dismiss': 'Dismiss',
      'step1.title': 'Upload health data',
      'step1.lead': 'Prefer the <strong>ZIP</strong> from the iPhone Health app. Parsing stays on-device.',
      'source.zip.title': 'Apple Health export ZIP',
      'source.zip.desc': 'Health app → profile → Export All Health Data',
      'source.advanced': 'Other imports (XML / folder)',
      'source.xml.title': 'Standalone XML',
      'source.xml.desc': 'export.xml',
      'source.folder.title': 'Unzipped folder',
      'source.folder.desc': 'Best on desktop Chrome / Edge; limited on phones',
      'upload.text': 'Tap to choose a file',
      'upload.hint': 'Accepts .zip / .xml',
      'upload.drop': 'Drop a file here, or click to browse',
      'upload.aria': 'Choose health data file to upload',
      'csv.summary': 'Optional: merge scale / BP CSV',
      'csv.hint': 'Omron-style Chinese headers supported. Merges by time without overwriting existing points.',
      'csv.weight': 'Weight / body fat CSV',
      'csv.bp': 'Blood pressure CSV',
      'csv.apply': 'Apply to current analysis (after parse)',
      'date.summary': 'Optional: date range filter',
      'date.hint': 'Leave empty to use all records in the export.',
      'date.start': 'Start date',
      'date.end': 'End date',
      'ctx.summary': 'Optional: personal context (prompt only, local)',
      'ctx.hint': 'Meds, goals, and focus go into the LLM prompt; saved in localStorage only.',
      'ctx.age': 'Age',
      'ctx.sex': 'Sex',
      'ctx.height': 'Height (cm)',
      'ctx.targetWeight': 'Target weight (kg)',
      'ctx.medications': 'Medications',
      'ctx.conditions': 'Known conditions',
      'ctx.focus': 'Focus for this review',
      'ctx.notes': 'Notes',
      'ctx.save': 'Save on device',
      'ctx.clear': 'Clear',
      'privacy.noticeTitle': 'Privacy: health details stay on-device by default',
      'privacy.li1': 'ZIP/XML is not uploaded to this site; parsing runs in the browser.',
      'privacy.li2': 'Full analysis stays in page memory; re-upload after refresh.',
      'privacy.li3': 'Optional: context in localStorage; snapshot metrics in IndexedDB for compare.',
      'help.export': 'How to export from iPhone?',
      'help.export.1': 'Open the <strong>Health</strong> app → profile photo',
      'help.export.2': '<strong>Export All Health Data</strong> → <strong>Export</strong>',
      'help.export.3': 'Save to Files, then pick the ZIP here',
      'help.export.4': 'For multi-hundred-MB exports, prefer a desktop browser',
      'step2.title': 'Analyzing',
      'step2.lead': 'On-device only. Large files may take tens of seconds—keep this tab open.',
      'progress.prepare': 'Preparing…',
      'progress.reading': 'Reading file…',
      'stage.read': 'Read file',
      'stage.parse': 'Parse records',
      'stage.stats': 'Compute stats',
      'stage.done': 'Done',
      'nav.overview': 'Overview',
      'nav.summary': 'Details',
      'nav.signals': 'Signals',
      'nav.charts': 'Charts',
      'nav.export': 'Export',
      'nav.prompt': 'Prompt',
      'nav.aria': 'Result sections',
      'overview.eyebrow': 'Analysis ready',
      'overview.title': 'Monitoring overview',
      'overview.reset': 'Upload again',
      'overview.privacy': 'Full details stay on this page. Copy the prompt or save a local snapshot.',
      'insight.subhead': 'Start here',
      'insight.lead': 'Tap for details, or “Chart” for the matching trend (not a diagnosis).',
      'hero.copy': 'Copy full prompt',
      'hero.openPrompt': 'Open prompt section',
      'availability.summary': 'Data availability',
      'summary.title': 'Statistics detail',
      'summary.hint': 'Expand each domain. Morning weight trend; prefer CGM stable period; BP morning/evening split.',
      'signals.title': 'Cross-domain signals',
      'signals.hint': 'Heuristic cues only—not a diagnosis. Included in the full prompt.',
      'charts.title': 'Trend charts',
      'charts.hint': 'Drawn locally. Drag on a chart to read values; weight uses morning trend.',
      'charts.range7': '7 days',
      'charts.range30': '30 days',
      'charts.range90': '90 days',
      'charts.rangeAll': 'All',
      'export.title': 'Export & history',
      'export.hint': 'All local. History stores summary metrics only (max 30).',
      'export.json': 'Export JSON',
      'export.csv': 'Export CSV pack',
      'export.snapshot': 'Export snapshot',
      'export.weekly': 'Export weekly report',
      'weekly.title': 'Weekly report history',
      'weekly.hint': 'Optionally save Markdown to IndexedDB (max 20, no upload).',
      'weekly.label': 'Note (optional)',
      'weekly.save': 'Save to local history',
      'weekly.refresh': 'Refresh',
      'history.title': 'Snapshot history',
      'history.label': 'Name (optional)',
      'history.save': 'Save to local history',
      'history.refresh': 'Refresh list',
      'history.clear': 'Clear history',
      'history.compare': 'Compare with snapshot (current analysis)',
      'history.empty': '(No history yet)',
      'prompt.title': 'LLM prompt',
      'prompt.hint': 'Copy into Doubao / ChatGPT / Claude / Gemini. Empty domains are skipped.',
      'prompt.badge': 'Includes auto summary',
      'prompt.tip': 'Includes: monitoring summary · stable CGM · morning weight · AM/PM BP · cross signals',
      'prompt.tab.full': 'Full prompt',
      'prompt.tab.data': 'Data summary only',
      'prompt.tab.system': 'Short system prompt',
      'prompt.expand': 'Expand full preview',
      'prompt.copy': 'Copy to clipboard',
      'prompt.copyInsights': 'Copy summary only',
      'prompt.download': 'Download .md',
      'prompt.help': 'Tips',
      'prompt.help.1': 'Chinese models often handle medical Chinese context well',
      'prompt.help.2': 'You can add “please focus on XX” after pasting',
      'prompt.help.3': 'Cross-check the report with raw data, especially edge values',
      'privacy.fold': 'Privacy notice (local-first—expand)',
      'privacy.f1': 'Parse & stats run in <strong>your browser</strong>; no backend upload of health details',
      'privacy.f2': 'Full analysis stays in page memory; re-upload ZIP/XML after refresh',
      'privacy.f3': 'Optional: context → localStorage; snapshots → IndexedDB (clearable)',
      'privacy.f4': 'PWA cache stores the app shell only, not full health exports',
      'privacy.f5': 'Whether you send the prompt to a third-party model is your choice',
      'footer': 'Open source · local-first · v1.18',
      'sticky.next': 'Next',
      'sticky.copyInsights': 'Copy summary',
      'sticky.copyFull': 'Copy full prompt',
      'sticky.top': 'Back to overview',
      'sticky.aria': 'Quick actions',
      'action.detail': 'Details',
      'action.chart': 'Chart',
      'tone.alert': 'Alert',
      'tone.watch': 'Watch',
      'tone.positive': 'Good',
      'tone.neutral': 'Note',
      'av.noData': 'No data',
      'layout.desktop': 'Desktop layout',
      'layout.mobile': 'Mobile layout',
      'note.analysisLang': 'Analysis bullets and medical prompt text are still primarily Chinese; UI language can change.',
    },
  };

  var locale = 'zh-CN';

  function detectLocale() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'zh-CN') return saved;
    } catch (e) { /* ignore */ }
    var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || 'zh-CN';
    if (/^en/i.test(nav)) return 'en';
    return 'zh-CN';
  }

  function t(key, vars) {
    var pack = messages[locale] || messages['zh-CN'];
    var s = pack[key];
    if (s == null) {
      s = (messages['zh-CN'] && messages['zh-CN'][key]) || key;
    }
    if (vars && typeof s === 'string') {
      s = s.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : '';
      });
    }
    return s;
  }

  function setLocale(next) {
    if (next !== 'en' && next !== 'zh-CN') next = 'zh-CN';
    locale = next;
    try {
      global.localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) { /* ignore */ }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
      global.document.documentElement.setAttribute('data-locale', locale);
    }
    applyDom();
    try {
      global.dispatchEvent(new CustomEvent('health-analyzer-locale', { detail: { locale: locale } }));
    } catch (e) { /* ignore */ }
    return locale;
  }

  function getLocale() {
    return locale;
  }

  function applyDom(root) {
    var doc = global.document;
    if (!doc) return;
    var scope = root || doc;

    if (!root) {
      doc.title = t('app.title');
      var meta = doc.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', t('app.metaDescription'));
    }

    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;
      var html = el.getAttribute('data-i18n-html') === '1';
      if (html) el.innerHTML = t(key);
      else el.textContent = t(key);
    }

    var ph = scope.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      ph[j].setAttribute('placeholder', t(ph[j].getAttribute('data-i18n-placeholder')));
    }

    var ar = scope.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < ar.length; k++) {
      ar[k].setAttribute('aria-label', t(ar[k].getAttribute('data-i18n-aria')));
    }

    var ti = scope.querySelectorAll('[data-i18n-title]');
    for (var m = 0; m < ti.length; m++) {
      ti[m].setAttribute('title', t(ti[m].getAttribute('data-i18n-title')));
    }

    // sync language control if present
    var sel = doc.getElementById('locale-select');
    if (sel && sel.value !== locale) sel.value = locale;
  }

  function init() {
    locale = detectLocale();
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
      global.document.documentElement.setAttribute('data-locale', locale);
    }
    if (global.document && global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () {
        applyDom();
      });
    } else {
      applyDom();
    }
  }

  global.I18n = {
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    applyDom: applyDom,
    init: init,
    messages: messages,
    STORAGE_KEY: STORAGE_KEY,
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
