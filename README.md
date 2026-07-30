# 苹果健康数据分析 PWA

**语言 / Language：** **[中文文档](docs/README.md)** · **[English docs](docs/en/README.md)**

本地隐私优先 · 跨平台 · 零服务器

把 iPhone「健康」App 导出的数据包（ZIP / XML）在浏览器内解析、统计，并生成可粘贴到豆包 / ChatGPT / Claude 等大模型的标准化提示词。纯前端 PWA，无后端。

> **English:** Privacy-first Apple Health export analyzer (ZIP/XML) that runs entirely in the browser, builds stats and recovery insights, and generates paste-ready LLM prompts. Full documentation: [docs/en/README.md](docs/en/README.md) · deploy [docs/en/DEPLOY.md](docs/en/DEPLOY.md) · prompts [docs/en/PROMPT_DESIGN.md](docs/en/PROMPT_DESIGN.md).

在线演示（GitHub Pages）：部署成功后见仓库 Actions / Pages 地址，形如  
`https://<USER>.github.io/health-analyzer/`

## 5 分钟上手

### 用户端

1. iPhone「健康」App → 头像 → **导出健康数据** → 得到 ZIP  
2. 浏览器打开本应用 → 选择 ZIP 上传（手机点选即可）  
3. 在 **分析概览** 查看 KPI；可选填写个人背景（用药/关注点，仅本机）  
4. 点 **复制完整提示词**（概览按钮或底部吸底栏）  
5. 粘贴到豆包 / Kimi / ChatGPT 等 → 得到结构化分析报告  

可选：

- 限制分析日期范围  
- 查看跨维度提示、趋势图（可滑动读数）  
- 导出 JSON / CSV、保存摘要到本机历史做环比  
- 切换浅色 / 深色 / 跟随系统外观  
- 顶栏切换 **中文 / English** 界面语言  


### 开发者端

```bash
# 1. 构建核心库（修改 lib/src 后必须执行）
cd health-analyzer/lib
npm install
npm test
npm run build   # 生成 web-ui/public/lib.js

# 2. 启动本地预览
cd ../web-ui/public
python3 -m http.server 8000

# 3. 浏览器打开 http://localhost:8000

# 4. 仓库根目录：静态 smoke + Playwright E2E
cd ../..
npm install
npx playwright install chromium   # 首次
npm run smoke                     # i18n / 静态资源 / lib.js 语言
npm run test:e2e                  # 页面加载、语言切换、最小 XML 解析

# 5. 部署：推送 main 后 GitHub Actions 先跑测试再部署 Pages
```

## 核心特性

- ✅ **100% 本地计算**，健康明细不上传服务器  
- ✅ 跨平台：Windows / Mac / Linux / iOS / Android 浏览器  
- ✅ PWA 可安装、离线可用（SW network-first）  
- ✅ 自动识别：CGM / 血压 / 体重 / HRV / 心率 / 步数 / 睡眠 / ECG / Watch 活动·血氧·VO₂·腕温  

- ✅ 三档提示词：完整 / 仅数据 / 简短系统提示  
- ✅ 个人背景注入提示词（localStorage）  
- ✅ 跨维度启发式提示 + Canvas 趋势图  
- ✅ JSON / CSV（ZIP）导出；IndexedDB 历史摘要环比  
- ✅ Web Worker 解析大 XML（失败回退主线程）  
- ✅ 深色模式（跟随系统或手动切换）  
- ✅ 结果概览 KPI + 吸底「复制完整提示词」  
- ✅ **自动排除未来日期记录**（如误录的远期体重），并在概览/提示词中提示  
- ✅ **晨起体重趋势**（同日去重）、**体脂**解析与图表  
- ✅ **CGM 首日 / 稳定期**分桶；**血压晨间 / 晚间**分层  
- ✅ **自动监测摘要**（可点进明细）+ KPI 状态色 + 结果顶栏导航  
- ✅ 提示词信任条（已含摘要 / 字数）+ **只复制摘要**短提示  
- ✅ 图表时间范围 chips（7/30/90/全部）  
- ✅ 解析失败可 **重试并保留设置**  
- ✅ 吸底 **复制摘要**；图表范围本地记忆  
- ✅ 可选合并 **体脂秤 / 血压计 CSV**（欧姆龙类中文表头）  
- ✅ **Apple Watch 日汇总**：活动能量 / 锻炼 / 站立 / 血氧（夜/日分段） / 呼吸 / VO₂ max / 腕温 / 夜间心率  
- ✅ **Workout 会话**：类型（中文）/ 时长 / 能量 / 距离 / 心率，与 HRV 恢复信号联动  
- ✅ **近 7 日负荷/恢复仪表**、**多周恢复/负荷趋势**、**站立小时 / 日照**  
- ✅ **ECG 分类统计**（ZIP/文件夹）+ 高心率与训练/时段关联  
- ✅ **睡眠呼吸紊乱**日序列与趋势提示  
- ✅ **联合信号**：呼吸紊乱×夜段血氧、高心率 ECG×低/高活动日  
- ✅ **一键导出本周 Markdown 报告**；恢复分对比近几周中位基线  
- ✅ **可调恢复评分权重**（localStorage）+ **周报本机历史**（IndexedDB）  
- ✅ **CGM×睡眠/活动**联合信号（短睡+低值、高读数+低步数等）  
- ✅ **响应式自适应 UI**（移动端优先、安全区、吸底 CTA、窄屏布局）  
- ✅ **桌面结果侧栏导航**（≥1100px 固定左侧轨、可折叠、键盘上下切换、滚动高亮；窄屏顶栏 pills）  
- ✅ **界面与文档 i18n**（`docs/` / `docs/en/`；UI 支持 **简体 / 繁體 / English**）  
- ✅ **分析内容双语**（摘要 / 信号 / 周报 / LLM 提示词随语言；繁體 UI 下分析文案暂与简体共用）  
- ✅ **门诊一页纸**导出（极简 Markdown，便于门诊沟通）  
- ✅ **快捷键** ⌘/Ctrl+Shift+C 复制完整提示词（有分析结果时）  
- ✅ **视觉系统**（teal/slate、柔光背景、精致卡片/KPI、毛玻璃导航与暗色校准）  





## 项目结构

```
health-analyzer/
├── lib/                 # TypeScript 唯一源码（解析 / 统计 / 提示词 / 导出）
│   ├── src/
│   ├── scripts/build-browser.mjs
│   └── test/
├── web-ui/public/       # 可直接部署的 PWA 静态资源
│   ├── index.html
│   ├── i18n.js          # 界面文案（zh-CN / zh-TW / en）
│   ├── app.js / styles.css / charts.js / history-db.js
│   ├── lib.js           # 由 lib 构建生成，勿手改
│   └── parse-worker.js
├── docs/                # 中文说明、部署、提示词设计
│   └── en/              # English docs
└── .github/workflows/   # CI + GitHub Pages
```

详见 [docs/README.md](docs/README.md) · [docs/en/README.md](docs/en/README.md)

## 部署到 GitHub Pages

推送到 `main` 即可：CI 会先 `lib` 单测与构建、静态 smoke、Playwright E2E，再部署 `web-ui/public/`。

```bash
cd health-analyzer
git push origin main
```

仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。  
访问：`https://<USER>.github.io/health-analyzer/`

## 部署到 Cloudflare

纯静态 PWA，可用 **Cloudflare Workers 静态资源**（`wrangler`）或 **Cloudflare Pages**。与 GitHub Pages 可并存（同一 `web-ui/public` 产物）。

### wrangler（Workers 静态资源）

根目录 [`wrangler.toml`](wrangler.toml) 已将 `assets.directory` 指向 `./web-ui/public`。

```bash
# 先构建浏览器包（修改 lib/ 后必做）
cd lib && npm ci && npm test && npm run build && cd ..

# 本地预览 / 部署
npx wrangler dev
npx wrangler deploy
```

可选：在 `wrangler.toml` 中取消注释 `not_found_handling = "single-page-application"`，使未知路径回退到 `index.html`（本应用以相对路径为主，默认可不启用）。

### Cloudflare Pages

- **Build command:** `cd lib && npm ci && npm test && npm run build`
- **Build output directory:** `web-ui/public`
- Root directory 保持仓库根（或按 Pages 项目设置指向 `health-analyzer` 子目录时，路径相应调整）

也可只上传已构建的 `web-ui/public`（build 留空）。详见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 文档

中文：

- [docs/README.md](docs/README.md) — 功能、局限、扩展路线  
- [docs/DEPLOY.md](docs/DEPLOY.md) — 部署与自定义  
- [docs/PROMPT_DESIGN.md](docs/PROMPT_DESIGN.md) — 提示词工程  

English:

- [docs/en/README.md](docs/en/README.md) — features, limits, roadmap  
- [docs/en/DEPLOY.md](docs/en/DEPLOY.md) — deploy & customization  
- [docs/en/PROMPT_DESIGN.md](docs/en/PROMPT_DESIGN.md) — prompt design  

## 版本要点（近期）

| 版本 | 内容 |
|------|------|
| v1.51 | FHIR 腕温 Observation + Bundle 结构自检（非官方校验器） |
| v1.50 | FHIR 增加 VO₂/呼吸紊乱；可选 AGP SVG DocumentReference |
| v1.49 | FHIR 导出扩展 SpO2/睡眠 + 可选就诊文档 DocumentReference |
| v1.48 | 试验性本机 FHIR Observation+Provenance Bundle 导出 |
| v1.47 | 本报告来源预览；HAE 取消导入 E2E |
| v1.46.1 | 报告附录仅关联本分析 sourceBatchIds；哈希标明 full/前1MiB |
| v1.46 | HAE 分批/总量上限/可取消；本机导入批次可追溯；HAE UI E2E |
| v1.45 | 周报/提示词可选事件时间线（默认脱敏） |
| v1.44 | 结果页事件时间对照；就诊 HTML 可打印 AGP SVG |
| v1.43 | HAE 合并 Worker + 结果页 AGP 14 日分位带状图 |
| v1.42 | AGP 小时分位、HAE 索引去重、临床/事件 E2E 回归 |
| v1.41.1 | 验收 P1：临床报告默认不附带事件；家庭血压须短间隔双测才算规范流程 |
| v1.41 | 本机事件时间线（手动记录 + 可选用药导入）；复盘仅时间对照非因果 |
| v1.40 | Health Auto Export JSON/CSV 增量导入、去重统计、未知指标清单 |
| v1.39 | 规范化就诊复盘报告：CGM 14 天质量门槛、家庭血压流程、信号证据、可打印 HTML |
| v1.38 | 摘要明细与体重洞察近 7 自然日 |
| v1.37 | 信号自然日窗口、SW 预缓存 unzip-worker、清除后 E2E |
| v1.36 | 单位不可靠暂停阈值解读、KPI 自然日窗、清除重置结果、ZIP Worker |
| v1.35 | 大型 ZIP 内存保护（选择性解压/体积与条目上限）与导入诊断；隐私一键清除与提示词复制确认 |
| v1.34 | CGM 单位 mmol/L 规范化、时间加权 TIR 与覆盖降级 |
| v1.33 | Playwright E2E 冒烟（页面/语言/最小 XML 解析） |
| v1.32 | 扩展繁体词库覆盖洞察/门诊残缺短语、smoke 抽检 |
| v1.31 | zh-TW 分析文案繁体化（createL 词库）、CI smoke |
| v1.30 | 上传区/CSV 合并说明/洞察引导 i18n |
| v1.29 | 解析进度/安装/历史对比/周报 i18n、信号严重度筛选 |
| v1.28 | KPI 状态截断/质量横幅 i18n、信号空态筛选条、语言切换补全 |
| v1.27 | 恢复 statusLabel 随界面语言、跨维度信号分类开关 |
| v1.26 | 恢复分维度子分条、无 ECG 导入提示 |
| v1.25 | 弹窗/KPI/明细 i18n、恢复构成面板、图表质感、CF 文档、CI 复用 |
| v1.24 | 结果首屏层级、恢复预设、图表 i18n、版本提示、指标说明、繁中标题 |
| v1.23 | 视觉系统升级（teal/slate、光斑背景、KPI/卡片/暗色质感） |
| v1.22 | 门诊一页纸导出、复制提示词快捷键、空状态文案 i18n |
| v1.21 | 侧栏可折叠/键盘导航、信任条 i18n、简繁英 UI、AGENTS 协作分工 |
| v1.20 | LLM 提示词双语、桌面左侧结果导航轨、滚动高亮 |
| v1.19 | 分析内容双语（insights / signals / weekly）、周报 EN、reduced-motion |
| v1.18 | 响应式自适应 UI、界面/文档 i18n 与中英双语文档（`docs/en/*`） |
| v1.17 | 可调恢复权重、周报 IndexedDB 历史、CGM×睡眠/活动联合信号 |
| v1.16 | 周报 MD 导出、恢复基线、BD×夜血氧、ECG×活动日关联 |
| v1.15 | 多周恢复趋势、ECG×训练时段关联、睡眠呼吸紊乱序列 |
| v1.14 | 周恢复仪表、站立/日照、ECG 统计、Workout 中文类型 |
| v1.13 | Workout 会话、血氧夜/日分段、活动×HRV×夜 HR 恢复信号 |
| v1.12 | Watch 日汇总（活动/血氧/呼吸/VO₂/腕温/夜 HR）、KPI·图表·提示词·导出 |
| v1.11 | 吸底复制摘要、图表范围记忆、外部 CSV 合并 |
| v1.10 | 只复制摘要、图表时间 chips、失败重试保留设置 |
| v1.9 | 摘要→明细/曲线、复制 toast、首次引导 |
| v1.8 | 摘要可跳转、提示词信任条、解析阶段进度、暗色徽章对比 |
| v1.7 | 自动监测摘要、KPI 状态色、结果导航与上传区收起、体验打磨 |
| v1.6 | 晨起体重趋势、体脂、CGM 首日/稳定期、血压晨晚分层 |
| v1.5.1 | 默认排除未来日期记录（防误录体重等），质量提示写入 UI/提示词 |
| v1.5 | 深色模式、图表图例/读数、安装步骤引导、文档同步 |
| v1.4 | 结果概览 KPI、吸底复制、移动端主路径、明细折叠 |
| v1.3 | 跨维度信号、JSON/CSV 导出、IndexedDB 历史环比 |
| v1.2 | 个人背景、Canvas 图、Worker 解析 |
| v1.1 | TS 单源构建、CI 门禁、摘要补齐 |

## 许可

MIT License
