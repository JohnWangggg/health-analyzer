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
      'lang.zh': '简体中文',
      'lang.zhTW': '繁體中文',
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
      'nav.collapse': '收起',
      'nav.expand': '展开',
      'nav.toggle.aria': '收起或展开左侧结果导航',
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
      'signals.empty': '当前规则未触发明显组合信号。数据仍建议人工复核关键边界值。',
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
      'empty.signals': "当前规则未触发明显组合信号。数据仍建议人工复核关键边界值。",
      'empty.insights.detail': "请确认导出包含体重、血压、CGM 或心率等记录。",
      'empty.insights.title': "暂无足够数据生成摘要",
      'export.err.needAnalysis': "请先完成分析",
      'export.shortcutHint': "有结果时可用 ⌘/Ctrl+Shift+C 复制完整提示词。",
      'export.ok.visit': "✓ 门诊一页纸已下载",
      'export.visit': "导出门诊一页纸",
      'export.ok.json': '✓ JSON 已下载',
      'export.ok.csvZip': '✓ CSV ZIP 已下载',
      'export.ok.csvText': '✓ CSV 文本已下载',
      'export.ok.snapshot': '✓ 摘要快照已下载',
      'export.ok.weekly': '✓ 本周报告已下载',
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
      'prompt.trust.fullSummary': '已含自动摘要',
      'prompt.trust.dataOnly': '数据 + 摘要',
      'prompt.trust.shortSystem': '短系统提示',
      'prompt.trust.noRole': '无角色指令；适合自定义 system prompt',
      'prompt.trust.pasteSystem': '粘贴到 system 字段，再附数据摘要',
      'prompt.trust.charCount': '{approx} 字',
      'prompt.trust.kcharCount': '约 {approx} 千字',
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
      'footer': '开源 · 本地优先 · v1.22',
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
      'note.analysisLang': '监测摘要、跨维度信号与周报可随界面语言切换；完整医学提示词仍以中文为主。',
    },
    'zh-TW': {
      'app.title': '蘋果健康數據分析',
      'app.subtitle': '本地隱私優先 · 計算在您的裝置完成',
      'app.metaDescription': '本地隱私優先的蘋果健康數據分析與大模型提示詞工具',
      'theme.toggle': '外觀',
      'theme.aria': '切換淺色或深色外觀',
      'lang.label': '語言',
      'lang.zh': '簡體中文',
      'lang.zhTW': '繁體中文',
      'lang.en': 'English',
      'install.title': '建議加入主畫面',
      'install.body': '安裝後可像一般 App 一樣離線開啟（資料仍只在本機處理）。',
      'install.action': '查看加入方法',
      'install.dismiss': '關閉提示',
      'step1.title': '上傳健康資料',
      'step1.lead': '建議使用 iPhone「健康」App 匯出的 <strong>ZIP</strong>。解析與統計均在本機完成。',
      'source.zip.title': '蘋果健康匯出 ZIP',
      'source.zip.desc': '健康 App → 大頭貼 → 匯出健康資料',
      'source.advanced': '其他匯入方式（XML / 資料夾）',
      'source.xml.title': '單獨的 XML 檔案',
      'source.xml.desc': 'export.xml 或 匯出.xml',
      'source.folder.title': '已解壓的資料夾',
      'source.folder.desc': '適合電腦端 Chrome / Edge；手機支援有限',
      'upload.text': '點選選擇檔案',
      'upload.hint': '支援 .zip / .xml',
      'upload.drop': '拖放檔案到此處，或點選選擇',
      'upload.aria': '選擇健康資料檔案上傳',
      'csv.summary': '可選：合併體脂秤 / 血壓計 CSV',
      'csv.hint': '支援歐姆龍類中文表頭。與蘋果健康資料按時間合併，不覆蓋既有記錄。',
      'csv.weight': '體重 / 體脂 CSV',
      'csv.bp': '血壓 CSV',
      'csv.apply': '套用到目前分析（需已解析）',
      'date.summary': '可選：限制分析日期範圍',
      'date.hint': '不填則使用匯出中的全部記錄。',
      'date.start': '開始日期',
      'date.end': '結束日期',
      'ctx.summary': '可選：個人背景（寫入提示詞，僅本機儲存）',
      'ctx.hint': '用藥、目標體重與關注點會注入提示詞；保存在本機 localStorage，不上傳。',
      'ctx.age': '年齡',
      'ctx.sex': '性別',
      'ctx.height': '身高 (cm)',
      'ctx.targetWeight': '目標體重 (kg)',
      'ctx.medications': '目前用藥',
      'ctx.conditions': '已知狀況',
      'ctx.focus': '本次關注點',
      'ctx.notes': '補充說明',
      'ctx.save': '儲存到本機',
      'ctx.clear': '清空',
      'privacy.noticeTitle': '隱私：健康明細預設不離開本機',
      'privacy.li1': 'ZIP/XML 不會上傳到本站伺服器；解析在瀏覽器內完成。',
      'privacy.li2': '完整分析結果預設只在目前頁面記憶體；重新整理後需重新上傳。',
      'privacy.li3': '可選：個人背景寫入 localStorage；摘要快照可寫入 IndexedDB 供環比。',
      'help.export': '如何從 iPhone 匯出？',
      'help.export.1': '開啟 <strong>健康</strong> App → 右上角大頭貼',
      'help.export.2': '<strong>匯出健康資料</strong> → <strong>匯出</strong>',
      'help.export.3': '儲存到「檔案」App，再在本頁選擇該 ZIP',
      'help.export.4': '體積很大時（數百 MB），建議在電腦瀏覽器開啟本頁再上傳',
      'step2.title': '正在分析',
      'step2.lead': '資料只在本機處理，不會上傳。大檔案可能需要數十秒，請保持頁面開啟。',
      'progress.prepare': '準備中…',
      'progress.reading': '正在讀取檔案…',
      'stage.read': '讀取檔案',
      'stage.parse': '解析記錄',
      'stage.stats': '產生統計',
      'stage.done': '完成',
      'nav.overview': '概覽',
      'nav.summary': '明細',
      'nav.signals': '提示',
      'nav.charts': '圖表',
      'nav.export': '匯出',
      'nav.prompt': '提示詞',
      'nav.aria': '結果分區',
      'nav.collapse': '收起',
      'nav.expand': '展開',
      'nav.toggle.aria': '收起或展開左側結果導航',
      'overview.eyebrow': '分析完成',
      'overview.title': '監測概覽',
      'overview.reset': '重新上傳',
      'overview.privacy': '完整明細僅在本頁；可複製提示詞給大模型，或儲存摘要到本機歷史。',
      'insight.subhead': '先看這些',
      'insight.lead': '點條目看明細，點「看曲線」跳到對應趨勢圖（非診斷）。',
      'hero.copy': '複製完整提示詞',
      'hero.openPrompt': '開啟提示詞區',
      'availability.summary': '資料可用性',
      'summary.title': '統計明細',
      'summary.hint': '各維度可展開。體重為晨起趨勢；CGM 優先看穩定期；血壓含晨晚分層。',
      'signals.title': '跨維度提示',
      'signals.hint': '規則線索，非診斷；已寫入完整提示詞。',
      'signals.empty': '目前規則未觸發明顯組合訊號。資料仍建議人工複核關鍵邊界值。',
      'charts.title': '趨勢圖',
      'charts.hint': '本地繪製。在圖上滑動可讀數；體重為晨起趨勢。',
      'charts.range7': '近 7 天',
      'charts.range30': '近 30 天',
      'charts.range90': '近 90 天',
      'charts.rangeAll': '全部',
      'export.title': '匯出與歷史',
      'export.hint': '均在本機。歷史只存摘要指標（最多 30 條）。',
      'export.json': '匯出 JSON',
      'export.csv': '匯出 CSV 包',
      'export.snapshot': '匯出摘要快照',
      'export.weekly': '匯出本週報告',
      'empty.signals': "目前規則未觸發明顯組合訊號。資料仍建議人工覆核關鍵邊界值。",
      'empty.insights.detail': "請確認匯出包含體重、血壓、CGM 或心率等紀錄。",
      'empty.insights.title': "暫無足夠資料生成摘要",
      'export.err.needAnalysis': "請先完成分析",
      'export.shortcutHint': "有結果時可用 ⌘/Ctrl+Shift+C 複製完整提示詞。",
      'export.ok.visit': "✓ 門診一頁紙已下載",
      'export.visit': "匯出門診一頁紙",
      'export.ok.json': '✓ JSON 已下載',
      'export.ok.csvZip': '✓ CSV ZIP 已下載',
      'export.ok.csvText': '✓ CSV 文字已下載',
      'export.ok.snapshot': '✓ 摘要快照已下載',
      'export.ok.weekly': '✓ 本週報告已下載',
      'weekly.title': '本週報告歷史',
      'weekly.hint': '下載後可選儲存 Markdown 到本機 IndexedDB（最多 20 條，不上傳）。',
      'weekly.label': '週報備註（可選）',
      'weekly.save': '儲存到本機歷史',
      'weekly.refresh': '重新整理',
      'history.title': '摘要快照歷史',
      'history.label': '摘要名稱（可選）',
      'history.save': '儲存到本機歷史',
      'history.refresh': '重新整理列表',
      'history.clear': '清空歷史',
      'history.compare': '與歷史快照對比（目前分析）',
      'history.empty': '（暫無歷史）',
      'prompt.title': '大模型提示詞',
      'prompt.hint': '一鍵複製到豆包 / ChatGPT / Claude / Gemini。無資料維度會跳過。',
      'prompt.badge': '已含自動摘要',
      'prompt.tip': '含：監測摘要 · 穩定期 CGM · 晨重 · 晨晚血壓 · 跨維度提示',
      'prompt.trust.fullSummary': '已含自動摘要',
      'prompt.trust.dataOnly': '資料 + 摘要',
      'prompt.trust.shortSystem': '簡短系統提示',
      'prompt.trust.noRole': '無角色指令；適合自定義 system prompt',
      'prompt.trust.pasteSystem': '貼上到 system 欄位，再附資料摘要',
      'prompt.trust.charCount': '{approx} 字',
      'prompt.trust.kcharCount': '約 {approx} 千字',
      'prompt.tab.full': '完整提示詞',
      'prompt.tab.data': '僅資料摘要',
      'prompt.tab.system': '簡短系統提示',
      'prompt.expand': '展開全部預覽',
      'prompt.copy': '複製到剪貼簿',
      'prompt.copyInsights': '只複製摘要',
      'prompt.download': '下載 .md',
      'prompt.help': '使用建議',
      'prompt.help.1': '國產模型對中文醫學語境通常更貼切',
      'prompt.help.2': '貼上後可補充「請額外關注 XX」',
      'prompt.help.3': '報告需與原始資料交叉核對，尤其是邊界值',
      'privacy.fold': '隱私聲明（本地優先，點開查看）',
      'privacy.f1': '解析與統計在<strong>您的瀏覽器</strong>內完成，無後端上傳健康明細',
      'privacy.f2': '完整分析預設只在目前頁記憶體；重新整理後需重新上傳 ZIP/XML',
      'privacy.f3': '可選：個人背景 → localStorage；摘要快照 → IndexedDB（可清空）',
      'privacy.f4': 'PWA 快取僅保存網頁程式，不自動保存完整健康匯出',
      'privacy.f5': '複製提示詞後，是否發給第三方大模型由您決定',
      'footer': '開源 · 本地優先 · v1.22',
      'sticky.next': '下一步',
      'sticky.copyInsights': '複製摘要',
      'sticky.copyFull': '複製完整提示詞',
      'sticky.top': '回到概覽',
      'sticky.aria': '快捷操作',
      'action.detail': '明細',
      'action.chart': '看曲線',
      'tone.alert': '需關注',
      'tone.watch': '觀察',
      'tone.positive': '積極',
      'tone.neutral': '提示',
      'av.noData': '無資料',
      'layout.desktop': '寬螢幕佈局',
      'layout.mobile': '行動佈局',
      'note.analysisLang': '監測摘要、跨維度訊號與週報可隨介面語言切換；完整醫學提示詞仍以中文為主（繁體介面下分析文案暫與簡體共用）。',
    },
    en: {
      'app.title': 'Apple Health Analyzer',
      'app.subtitle': 'Local-first · All compute stays on your device',
      'app.metaDescription': 'Local-first Apple Health analysis and LLM prompt builder',
      'theme.toggle': 'Theme',
      'theme.aria': 'Toggle light or dark appearance',
      'lang.label': 'Language',
      'lang.zh': '简体中文',
      'lang.zhTW': '繁體中文',
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
      'nav.collapse': 'Collapse',
      'nav.expand': 'Expand',
      'nav.toggle.aria': 'Collapse or expand the left result navigation',
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
      'signals.empty': 'No clear combined signals from current rules. Still review key edge values manually.',
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
      'export.visit': 'Export clinic one-pager',
      'export.ok.visit': '✓ Clinic one-pager downloaded',
      'export.shortcutHint': 'With results: ⌘/Ctrl+Shift+C copies the full prompt.',
      'export.err.needAnalysis': 'Please finish analysis first',
      'empty.insights.title': 'Not enough data for a summary',
      'empty.insights.detail': 'Confirm the export includes weight, BP, CGM, or heart-rate records.',
      'empty.signals': 'No strong combo signals fired. Still review edge values manually.',
      'export.ok.json': '✓ JSON downloaded',
      'export.ok.csvZip': '✓ CSV ZIP downloaded',
      'export.ok.csvText': '✓ CSV text downloaded',
      'export.ok.snapshot': '✓ Snapshot downloaded',
      'export.ok.weekly': '✓ Weekly report downloaded',
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
      'prompt.trust.fullSummary': 'Includes auto summary',
      'prompt.trust.dataOnly': 'Data + summary',
      'prompt.trust.shortSystem': 'Short system prompt',
      'prompt.trust.noRole': 'No role instruction; good for custom system prompt',
      'prompt.trust.pasteSystem': 'Paste into system field, then attach data summary',
      'prompt.trust.charCount': '{approx} chars',
      'prompt.trust.kcharCount': '~{approx}k chars',
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
      'footer': 'Open source · local-first · v1.22',
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
      'note.analysisLang': 'Insights, cross-signals, and the weekly report follow the UI language; the full medical LLM prompt remains primarily Chinese.',
    },
  };

  var locale = 'zh-CN';

  /** Normalize navigator / storage / UI values → 'zh-CN' | 'zh-TW' | 'en' */
  function normalize(v) {
    if (v == null || v === '') return 'zh-CN';
    var s = String(v).trim();
    var lower = s.toLowerCase().replace(/_/g, '-');
    if (s === 'en' || lower === 'en' || /^en[-_]/.test(lower) || /^en$/i.test(s)) return 'en';
    if (
      lower === 'zh-tw' ||
      lower.indexOf('zh-tw') === 0 ||
      lower === 'zh-hk' ||
      lower.indexOf('zh-hk') === 0 ||
      lower.indexOf('hant') !== -1
    ) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  function detectLocale() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'zh-CN' || saved === 'zh-TW') return saved;
      if (saved) return normalize(saved);
    } catch (e) { /* ignore */ }
    var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || 'zh-CN';
    return normalize(nav);
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
    locale = normalize(next);
    try {
      global.localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) { /* ignore */ }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = locale;
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
      global.document.documentElement.lang = locale;
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
    normalize: normalize,
    applyDom: applyDom,
    init: init,
    messages: messages,
    STORAGE_KEY: STORAGE_KEY,
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
