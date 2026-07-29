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

# 4. 部署：推送 main 后 GitHub Actions 先跑测试再部署 Pages
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
- ✅ **桌面结果侧栏导航**（≥1100px 固定左侧分区轨；窄屏仍用顶栏 pills）  
- ✅ **界面与文档 i18n**（中英双语文档 `docs/` / `docs/en/`；UI：`web-ui/public/i18n.js`）  
- ✅ **分析内容双语**（监测摘要 / 跨维度信号 / 周报 / **LLM 数据与角色提示词** 随 `locale` 中英输出）  
- ✅ **桌面左侧结果导航**（≥1100px 固定侧栏 + 滚动高亮）  


## 项目结构

```
health-analyzer/
├── lib/                 # TypeScript 唯一源码（解析 / 统计 / 提示词 / 导出）
│   ├── src/
│   ├── scripts/build-browser.mjs
│   └── test/
├── web-ui/public/       # 可直接部署的 PWA 静态资源
│   ├── index.html
│   ├── i18n.js          # 界面中英文本
│   ├── app.js / styles.css / charts.js / history-db.js
│   ├── lib.js           # 由 lib 构建生成，勿手改
│   └── parse-worker.js
├── docs/                # 中文说明、部署、提示词设计
│   └── en/              # English docs
└── .github/workflows/   # CI + GitHub Pages
```

详见 [docs/README.md](docs/README.md) · [docs/en/README.md](docs/en/README.md)

## 部署到 GitHub Pages

推送到 `main` 即可：CI 会先 `npm test` + `npm run build`，再部署 `web-ui/public/`。

```bash
cd health-analyzer
git push origin main
```

仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。  
访问：`https://<USER>.github.io/health-analyzer/`

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
| v1.20 | 桌面左侧结果分区固定导航轨（≥1100px + 有结果）；顶栏导航留给窄屏；滚动 spy 高亮；SW v22 |
| v1.20 | LLM 数据/角色提示词双语、桌面左侧结果导航、提示词随语言切换 |
| v1.19 | 分析内容双语（insights / signals / weekly）、周报 EN、宽屏结果导航与 reduced-motion 打磨 |
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
