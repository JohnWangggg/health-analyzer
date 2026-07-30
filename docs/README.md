# 苹果健康数据分析 PWA

**语言 / Language：** **中文** | [English](./en/README.md)

> 本地隐私优先 · 跨平台 · 零服务器

一款把 iPhone 苹果健康 App 导出的数据包（ZIP / XML）解析、统计、并生成可粘贴到豆包 / ChatGPT / Claude / Gemini 等大模型平台的标准化提示词的纯前端 PWA 应用。

英文文档：

- [English README](./en/README.md) — features, limits, roadmap  
- [DEPLOY (EN)](./en/DEPLOY.md) — hosting & customization  
- [PROMPT_DESIGN (EN)](./en/PROMPT_DESIGN.md) — prompt engineering  

## 核心特性

- ✅ **100% 本地计算**：所有 XML 解析、统计、提示词生成均在您的浏览器内完成，零上传
- ✅ **零依赖部署**：单个 `web-ui/public/` 目录即可托管在任意静态服务器
- ✅ **跨平台**：电脑（Windows / Mac / Linux）和手机（iOS Safari / Android Chrome）浏览器都能用
- ✅ **可安装 PWA**：可添加到主屏幕，像原生 App 一样离线运行
- ✅ **智能数据检测**：根据用户实际有 CGM / 血压 / 体重 / Watch 等数据与否，动态决定生成的章节
- ✅ **Apple Watch 日汇总**：活动能量、锻炼分钟、血氧（夜/日分段）、呼吸频率、VO₂ max、睡眠腕温、夜间心率（解析期聚合，不存全量逐条心率）
- ✅ **Workout 会话**：解析 `<Workout>` 块（类型中文、时长、kcal、距离、均/最大心率），导出 CSV 与恢复相关信号
- ✅ **周恢复仪表**：近 7 日 HRV / 夜 HR / 锻炼 / Workout / 睡眠 / 站立 / 日照启发式评分
- ✅ **多周恢复/负荷趋势**：默认 12 周序列、图表与提示词表
- ✅ **ECG 分类统计**：ZIP 或文件夹内 `electrocardiograms/*.csv`；高心率与训练±2h / 非运动窗关联
- ✅ **睡眠呼吸紊乱**：日序列、近 7 日均值、相对抬升启发式提示
- ✅ **联合信号**：呼吸紊乱×夜段血氧；高心率 ECG×同日步数/锻炼
- ✅ **本周 Markdown 报告**一键下载；恢复分 vs 近几周中位基线
- ✅ **可调恢复权重**（重算恢复/负荷）与周报本机历史列表
- ✅ **CGM×睡眠/活动**联合启发式（短睡+低值、高糖读数+低步数等）
- ✅ **三档提示词**：完整版（含引导）/ 仅数据 / 简短系统提示词
- ✅ **多格式输出**：复制剪贴板、下载 `.md`、导出 JSON / CSV
- ✅ **个人背景**：用药/目标体重/关注点写入提示词（localStorage）
- ✅ **跨维度提示 + 趋势图 + 历史环比**（IndexedDB 摘要）
- ✅ **结果概览 KPI** 与吸底「复制完整提示词」
- ✅ **深色模式**：跟随系统或手动切换（浅色 / 深色 / 自动）
- ✅ **响应式自适应 UI**：移动端优先、安全区、吸底 CTA、窄屏图表与 KPI 布局
- ✅ **界面与文档 i18n**：中英双语文档（`docs/` / `docs/en/`）；UI 语言资源目录 `web-ui/public/i18n/`
- ✅ **Health Auto Export 增量导入**：JSON/CSV 多文件或文件夹本机合并、去重统计、未知指标清单（完整 ZIP 仍可用）

## 目录结构

```
health-analyzer/
├── lib/                          # TypeScript 核心解析库
│   ├── src/
│   │   ├── types.ts             # 数据类型定义
│   │   ├── parser.ts            # Apple Health XML 流式解析器
│   │   ├── stats.ts             # 统计与指标计算
│   │   ├── prompts/
│   │   │   └── llm-prompt.ts   # 大模型提示词模板与生成
│   │   └── index.ts             # 统一导出
│   ├── package.json
│   └── tsconfig.json
├── web-ui/                       # PWA 前端
│   └── public/
│       ├── index.html            # 主页面
│       ├── styles.css            # 样式
│       ├── lib.js                # 浏览器版核心库（由 lib/src 构建，勿手改）
│       ├── app.js                # 应用逻辑
│       ├── sw.js                 # Service Worker（离线缓存）
│       ├── manifest.json         # PWA 配置
│       └── icons/
│           ├── icon-192.svg
│           └── icon-512.svg
└── docs/
    ├── README.md                 # 本文档（中文）
    ├── DEPLOY.md                 # 部署指南
    ├── PROMPT_DESIGN.md          # 提示词设计说明
    └── en/                       # English docs
        ├── README.md
        ├── DEPLOY.md
        └── PROMPT_DESIGN.md
```

## 快速开始

### 用户使用流程

1. **iPhone 导出数据**
   - 打开"健康" App → 点击右上角头像 → "导出健康数据" → "导出"
   - 选择"存储到文件"或"邮件"，得到 `apple_health_export.zip`

2. **打开 PWA**
   - 在浏览器中打开部署好的应用（也可添加到主屏幕）
   - 默认选择苹果健康导出 ZIP（XML/文件夹在「其他导入方式」）

3. **上传并解析**
   - 手机点选 / 电脑可拖拽上传
   - 等待解析完成（大文件走 Web Worker，约数秒至数十秒）

4. **查看分析概览**
   - KPI 卡片与数据可用性
   - 可展开明细、跨维度提示、趋势图（滑动读数）
   - 可选导出 JSON/CSV、保存摘要历史环比

5. **生成提示词**
   - 完整 / 仅数据 / 简短系统提示；可含个人背景与跨维度提示

6. **复制到大模型平台**
   - 概览或吸底栏「复制完整提示词」
   - 粘贴到豆包 / Kimi / ChatGPT / Claude / Gemini
   - 报告需与原始数据交叉核对

### 本机事件时间线（v1.41）

可在上传区下方展开 **「本机事件时间线」**，手动记录用药变更、生病、饮酒、旅行、熬夜、经期、训练变化、症状与疲劳等（也可选导入 HAE 用药 JSON）。事件保存在 **本机 IndexedDB**，不上传云端；导出就诊复盘报告时可附带事件，**仅作时间对照，不作因果推断或用药建议**。

### Health Auto Export（HAE）增量导入（v1.40）

适合不想每次都导出完整苹果健康 ZIP、而是用第三方 **Health Auto Export** 定期落盘 JSON/CSV 的场景：

1. **优先**在 iPhone 上配置 HAE 自动导出到 **iCloud 云盘**（JSON 或 CSV；可按指标拆分多文件）。
2. 在本应用上传区下方展开 **「Health Auto Export 增量导入」**，选择文件或文件夹 → **合并 HAE 数据**。
3. 合并后显示 **新增 / 更新 / 跳过** 条数；未映射指标会列入 **未知指标清单**（便于知晓覆盖范围；勾选仅记录意图，v1.40 仍不落库未知序列）。
4. 仍 **100% 本地**处理，不上传健康明细；完整苹果健康 ZIP / XML / 文件夹导入 **继续支持**，可与 HAE 互补（首次可用 ZIP 打底，之后用 HAE 增量）。
5. **不替代临床诊疗**：统计与提示词仅供个人复盘与就诊准备，不能作为诊断或用药依据。

## 设计亮点

### 1. 数据可用性自适应

根据 `dataAvailability` 中各字段是否为 true，自动决定生成哪些章节：

```ts
hasCgm: boolean;            // → 生成 CGM 章节
hasBloodPressure: boolean;  // → 生成血压章节
hasWeight: boolean;         // → 生成体重章节
hasHrv: boolean;            // → 生成 HRV 章节
hasHeartRate: boolean;      // → 生成心率章节
hasSteps: boolean;          // → 生成步数章节
hasSleep: boolean;          // → 生成睡眠章节
hasEcg: boolean;            // → 生成 ECG 章节
```

普通用户通常只有 `hasSteps / hasSleep / hasHrv / hasHeartRate / hasWeight`，会自动跳过 CGM / 血压 / ECG 章节。

### 2. 本地优先架构

```
┌─────────────────────────────────────────┐
│ 浏览器（用户设备）                       │
│ ┌──────────────────────────────────┐   │
│ │ 文件选择 / 拖拽                  │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ FileReader API → ArrayBuffer     │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ fflate (CDN) → unzip             │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ 自研 XML 解析器（流式）           │   │
│ │ → 按行扫描，识别 <Record>         │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ 统计计算（均值 / SD / CV / TIR） │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ 提示词模板填充                   │   │
│ └──────────────┬───────────────────┘   │
│ ┌──────────────▼───────────────────┐   │
│ │ 渲染 / 复制 / 下载               │   │
│ └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
            │ （无网络通信）
            ▼
    （用户自行粘贴到大模型平台）
```

### 3. 流式解析与进度反馈

XML 文件可能很大（数万条记录）。解析器按行扫描，每 1% 上报一次进度，避免主线程卡死。

### 4. PWA 离线优先

Service Worker 缓存所有静态资源，断网也能用。安装后像原生 App 一样从主屏幕启动。

## 与其他方案的对比

| 方案 | 本工具 | Python 脚本 | 在线 SaaS |
|---|---|---|---|
| 隐私 | ✅ 完全本地 | ⚠️ 需运行命令 | ❌ 数据上传 |
| 手机端 | ✅ 浏览器 | ❌ 需 Termux | ✅ 但需登录 |
| 跨平台 | ✅ 任意浏览器 | ⚠️ 需 Python | ✅ 浏览器 |
| 部署难度 | ✅ 静态托管 | ✅ 单文件 | ✅ 即开即用 |
| 大模型集成 | ✅ 提示词生成 | ❌ 需自己写 | ✅ 通常含 |
| 离线可用 | ✅ PWA | ✅ | ❌ |

## 技术栈

- **核心解析**：TypeScript 唯一源码（`lib/src`），esbuild 打包为浏览器 IIFE
- **ZIP 解压**：本地 `fflate.min.js`（无 CDN）
- **PWA**：Service Worker（network-first + 离线回退）+ manifest + SVG 图标
- **UI**：原生 CSS（响应式自适应 + 深色模式）；结果概览 / 吸底 CTA
- **i18n**：`docs/en/*` 英文文档；`web-ui/public/i18n/` UI 语言资源
- **存储**：完整明细默认仅内存；可选 localStorage（背景）/ IndexedDB（摘要历史、周报）

## 开发构建

```bash
cd lib
npm install
npm test          # 单元测试
npm run build     # tsc + 生成 web-ui/public/lib.js
```

根目录可跑 `npm run perf:parse`（`scripts/perf-parse-baseline.mjs`）测 `parseHealthXml` / `analyzeAll` 本地耗时与内存；默认 `e2e/fixtures/minimal-export.xml` 很小，大 export 用 `PERF_XML_PATH` 或 `--file=` 自备且**不要提交**个人数据。

修改解析/统计/提示词请只改 `lib/src/**`，再执行 `npm run build`。不要手改 `web-ui/public/lib.js`。

## 局限与边界

1. **CGM 数据解读需要医生参与**：本应用只做统计和提示词生成，不替代医生判断
2. **血压数据可能来自欧姆龙/鱼跃等外部设备**：不同设备的算法差异未做特殊处理
3. **数据量过大时建议分批**：单次分析超过 10 万条记录时，可用页面「限制分析日期范围」过滤
4. **大模型输出仍需复核**：生成的报告是基于提示词的 LLM 输出，需要您对原始数据交叉核对
5. **iOS Safari 限制**：部分 File API 在 iOS Safari 上有版本要求，建议 iOS 16+
6. **未来日期**：解析时默认丢弃起始日期晚于本地「今天」的 Record（常见于误录未来体重）；会统计跳过条数并提示，请仍到健康 App 中删除错误条目

## 未来扩展

- [x] 统一 TS 源码构建浏览器 bundle
- [x] 摘要补齐心率 / 步数 / 睡眠 / ECG
- [x] 可选日期范围过滤
- [x] SW 网络优先，降低缓存陈旧
- [x] CI 测试门禁
- [x] 可选个人上下文（用药/目标体重/关注点）注入提示词，localStorage 本机保存
- [x] 轻量 Canvas 趋势图（CGM / 体重 / HRV / 血压）
- [x] Web Worker 解析 XML（失败自动回退主线程）
- [x] 跨维度启发式提示（HRV/心率/睡眠/步数/CGM/血压等）
- [x] 导出 JSON / CSV（ZIP）/ 摘要快照
- [x] IndexedDB 历史摘要保存与环比（最多 30 条）
- [x] 结果概览 KPI + 吸底复制 + 移动端主路径简化
- [x] 深色模式（系统 / 手动）
- [x] 图表图例、读数与空状态
- [x] 默认排除未来日期记录 + 数据质量提示
- [x] 晨起体重趋势（同日去重）+ 体脂
- [x] CGM 首日 / 稳定期分桶
- [x] 血压晨间 / 晚间分层
- [x] 自动监测摘要 + 结果区体验打磨（导航/吸底/KPI 色）
- [x] 摘要点击跳转明细、提示词信任条、解析分阶段进度
- [x] 摘要「看曲线」、复制 toast、首次使用引导
- [x] 只复制摘要短提示、图表时间范围、失败重试保留设置
- [x] 吸底复制摘要、图表范围记忆、体脂秤/血压 CSV 合并
- [x] Watch 日汇总、Workout、恢复仪表与多周趋势、周报 MD
- [x] 可调恢复权重、周报 IndexedDB、联合信号（含 CGM×睡眠/活动）
- [x] 响应式自适应 UI 打磨 + 中英双语文档 / i18n 资源目录
- [x] Health Auto Export JSON/CSV 增量导入、去重与未知指标清单
- [x] FHIR 试验性导出分层：项目自检 / 交换门禁 / 可选官方 HL7 validator_cli（合成 fixture，`-tx n/a`）
- [ ] 自定义提示词模板
- [ ] 多用户/家庭成员数据支持
- [ ] 与豆包 / ChatGPT API 直接对接（需用户自备 API key）

## FHIR 校验层次（v1.58–v1.60）

本项目**不上传**用户健康数据到在线校验服务。FHIR 相关检查分三层：

| 命令 | 作用 | 是否官方 HL7 |
|------|------|----------------|
| `npm run test:fhir:structure` | 项目结构自检（夹具 + `validateFhirExportBundle`） | 否 |
| `npm run test:fhir:exchange` | 独立 R4 交换门禁（`validateFhirR4ExchangeGate`） | 否（自定义规则） |
| `npm run test:fhir:hl7` | 官方 `validator_cli.jar` 校验合成 fixture（`-tx n/a`） | **是** |
| `npm run test:fhir:hl7:export` | 从样例 XML 生成交换 Bundle → `stripPrivateFhirExtensions` → 官方校验 | **是** |
| `npm run test:fhir:ci` | structure + exchange + **强制** HL7 fixture + 强制 HL7 export | **是** |
| `npm run test:release` | 完整发布门禁（lib + build + smoke + `test:fhir:ci` + e2e） | **是** |

- `npm run test:fhir`：structure + exchange + HL7 夹具；**无 Java 时 HL7 软跳过**（exit 0），适合本机日常开发。
- **CI / 发布**使用 `test:fhir:ci`（`FHIR_HL7_REQUIRED=1`）：Java/jar 缺失或校验失败则 **失败**。GitHub Actions 已安装 Temurin 21 并缓存 jar。
- 夹具：`lib/test/fixtures/fhir-hl7-r4-minimal.json`（合成数据，无个人身份）。
- Jar 下载到 `tools/validator_cli.jar`（gitignore，不提交）。
- 本机强制校验：`brew install openjdk@21` 后执行 `npm run test:fhir:ci`（脚本会探测 Homebrew OpenJDK 路径）。
- v1.61：解析保留逐条 `sourceName`；Device 仅在 Watch/iPhone 高置信度时接线。
- v1.62：**匿名分享**会净化 raw `sourceName` / 导入文件名；门禁拦截泄漏后的 Bundle。
- v1.63：**个人转交**伪名 ID 须 UUID/`pid_…`；本机生成·复制·轮换（localStorage）；拒绝弱 ID。
- v1.64：CI/release **强制**官方 HL7 校验。
- v1.65：匿名分享将 import-batch id 重映射为 `batch_anon_*`；门禁拦截姓名型 batch id；`validator_cli` **固定 6.9.12 + SHA-256**。
- v1.67：趋势工作台 MVP——主/对比指标选择、个人基线（窗口中位数）、事件标记、图表结论摘要（描述性非诊断）；偏好本机记忆。
- v1.66：结果页改为「今日 / 趋势 / 报告 / 更多」工作区；桌面侧栏 + 手机底部导航；就诊/周报进报告，FHIR/历史/隐私进更多。
- v1.67：趋势工作台（主/对比指标、个人基线、事件标记、图表结论）。
- v1.68：本机原始数据仓（默认关闭；授权后 IndexedDB 持久化解析明细、刷新自动恢复、备份/清除）。详见 `docs/DATA_CENTER_v1.68.md`。
- v1.69：数据仓加固（分域占用、配额条、仅清仓明细、恢复标记与备份往返测试）。
- v1.70：趋势对比同图叠加（双 Y）；仓软配额下自动裁最旧 CGM 点。
- v1.71：趋势视图预设；备份可选口令 AES-GCM（PBKDF2 210k）。
- v1.72：今日优先关注单结论；390 / 834 / 1440 视口验收。
- v1.73：导入→重点→趋势→导出任务流 E2E；200% 文本缩放可读性加固。
- v1.74：键盘跳过链接与键盘 E2E；真机手测清单见 `docs/MANUAL_QA.md`。
- v1.75：原始仓 CGM 按月分片；超配额淘汰最旧月份；兼容旧 `healthData|full`。
- v1.76：数据管理页展示分片布局与 CGM 月列表。
- v1.77：可手动删除单个 CGM 月分片；删除后更新仓元数据与当前分析。
- v1.78：CGM 月分片多选批量删除；「仅保留近 6 个月」。
- v1.79：血压/体重按年分片；CGM 保留近 N 个月可配置；`npm run perf:parse` 解析性能基线。

## 许可

MIT License
