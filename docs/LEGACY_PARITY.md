# React ↔ Legacy 能力对照与移除条件

> 更新日期：2026-08-03 · 对照 React v2.4.x vs `web-ui/public/legacy/`  
> 目标：判断 **React 默认路径**是否可完整替代 legacy，以及何时可删除 `/legacy/`。

## 1. 结论（先看）

| 问题 | 答案 |
|------|------|
| **日常使用能否只靠 React？** | **可以**（导入 → 分析 → 提示词/报告 → 仓/备份/导出） |
| **能否现在删掉 `public/legacy/`？** | **否** — 仍有功能缺口 + 测试/工程依赖 |
| **能否开始「弃用」legacy？** | **可以** — 软弃用（标注回滚、不再扩功能、迁移 e2e） |

**一句话：** React 已是生产主路径；legacy 仍是**回滚 + 对照 + 大仓回归测试载体**，不是第二产品。

---

## 2. 能力矩阵

图例：✅ 完整 · 🟡 有 MVP/部分 · ❌ 未做 · ➖ 有意不做

### 2.1 导入与会话

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| 演示夹具 | ✅ | ✅ | |
| XML / ZIP | ✅ | ✅ | Worker + 回退 |
| HAE 合并 | ✅ | ✅ | 多文件 |
| HAE 取消中途 | ✅ | ❌ | e2e `hae-cancel` 仅 legacy |
| 文件夹选择（webkitdirectory） | ✅ | ❌ | |
| 日期过滤再分析 | ✅ | ❌ | `#filter-start/end-date` |
| 外部体重/血压 CSV | ✅ | ✅ | Overview `CsvMergePanel` |
| 会话清除 | ✅ | ✅ | 不写仓 |
| 一键清除本机健康数据（隐私） | ✅ | ❌ | 多 store + localStorage 白名单 |

### 2.2 总览 / 洞察

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| KPI / 状态带 / 优先关注 | ✅ | ✅ | |
| 信号列表 | ✅ | 🟡 | 无 signal prefs 细筛、无邻近事件挂条 |
| 今日快照 / 新鲜度 | ✅ | ✅ | |
| 个人背景 + 敏感开关 | ✅ | ✅ | 共用 localStorage 键 |
| 提示词三档复制 | ✅ | ✅ | |
| 提示词附带本机事件 | ✅ | ❌ | `ctx-include-events` 默认关 |
| 恢复权重预设 | ✅ | ✅ | 共用键；无滑条细调 |
| 事件时间线 CRUD | ✅ | 🟡 | 有增删；无 HAE meds 导入、无复盘挂图 |
| 数据质量横幅 | ✅ | ❌ | |
| 健康大屏 TV | ✅ | 🟡 | MVP：时钟/焦点/Esc；非全屏栅格 |

### 2.3 趋势

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| 多域日序列 | ✅ | ✅ | 6 域 + ECharts lazy |
| 空域切换 / 有数据标记 | ✅ | ✅ | |
| 时间范围 chips（7/30/90/全部） | ✅ | ❌ | |
| 主/对比双指标 | ✅ | ❌ | |
| 图表预设保存 | ✅ | ❌ | |
| 图上叠加事件 | ✅ | ❌ | |

### 2.4 报告 / 导出

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| 门诊 / 周报 / 临床 MD | ✅ | ✅ | |
| 临床 HTML | ✅ | ✅ | |
| 报告注入个人背景 | ✅ | ✅ | |
| 临床敏感开关 | ✅ | ✅ | |
| 报告 includeEvents | ✅ | ❌ | 固定 false |
| JSON / CSV ZIP / 快照 | ✅ | ✅ | |
| FHIR **local-archive** | ✅ | ✅ | |
| FHIR **external-exchange**（匿名/转交、Patient ID、门禁） | ✅ | ❌ | 医院交换档 |
| FHIR AGP SVG / clinical doc 附件 | ✅ | ❌ | |
| 周报存历史 / 环比 | ✅ | 🟡 | 有快照列表；无 compare UI |

### 2.5 数据仓

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| sharded-v1 读写 | ✅ | ✅ | 互通 dual e2e |
| 软配额写入驱逐 | ✅ | ✅ | |
| keep-N（全局预设） | ✅ | ✅ | 共用 prefs |
| 分片多选删除 | ✅ | ✅ | |
| 加密/明文备份 | ✅ | ✅ | |
| 导入批次 / 来源时间线 UI | ✅ | ❌ | backup 可选带 batches |
| 分片 inventory 导出 | ✅ | ❌ | |
| 按域独立 keep-N UI | ✅ | 🟡 | 全局 N 覆盖多数场景 |

### 2.6 壳层 / 工程

| 能力 | Legacy | React | 说明 |
|------|--------|-------|------|
| 中/英 UI | ✅ | ✅ | legacy 另有 zh-TW |
| 主题 | ✅ | ✅ | |
| PWA 更新提示 | ✅ | ✅ | |
| 安装引导 | ✅ | ❌ | |
| 离线横幅 | ✅ | ❌ | |
| e2e 深度 | 大（warehouse 等） | 窄（shell 7 测） | **删 legacy 前须迁移** |
| IDB schema 权威 | history-db.js | 镜像 + 契约测试 | 不可无替代删除 |

---

## 3. 删除 legacy 的硬门槛

必须全部满足后再执行 **物理删除** `web-ui/public/legacy/`：

1. **P0 产品缺口关闭**（或书面标为 Won't fix）  
   - 分析日期过滤  
   - 提示词/报告 **includeEvents** 开关  
   - 一键清除本机健康数据  
   - FHIR exchange 至少一条产品路径（或明确「仅 local-archive」）  
2. **测试门禁**  
   - `e2e/*` 关键路径迁到 `e2e-react` 或 API/unit 等价覆盖（尤其 warehouse 分片矩阵）  
   - `test:e2e:dual` 取消或改为「React 自洽往返」  
   - `scripts/fhir-*.mjs` 改为读 `lib` 构建产物而非 `legacy/lib.js`  
3. **schema 归属**  
   - `history-db.js` 逻辑并入 React 文档化模块，或 `idbContract` 成为唯一权威并补齐写路径审计  
4. **发布**  
   - 至少一个 minor 版本仅软弃用（站点仍可 `/legacy/`）  
   - CHANGELOG / README 明确移除日  

---

## 4. 分阶段计划

### Phase A — 软弃用（当前可做）✅ 建议立即

- 文档：本文件 + README 写明「不扩 legacy」  
- UI：legacy 入口标注「仅回滚」；About 弱化跳转  
- 工程：新功能只进 React；legacy 仅修阻断 bug  
- 可选：`legacy/index.html` 顶栏弃用条  

### Phase B — 补齐 P0 缺口

按 §3.1 逐项合入 React，并加 e2e-react 硬路径。

### Phase C — 测试迁移

- 仓矩阵、隐私、risk 白屏等迁出 `e2e/`  
- dual 改为 optional 或删除  
- CI `test:release` 不再依赖 legacy Playwright  

### Phase D — 移除部署树

- `export-cutover` 不再要求 `public/legacy/`  
- 删除 `app.js` / `index.html` / 旧 SW；**保留或迁走** schema 文档  
- `lib` 浏览器 bundle 输出改路径（若仍需）  

---

## 5. 推荐决策

| 用户目标 | 建议 |
|----------|------|
| 自己日常只用新版 | **已可**；不要点 `/legacy/` |
| 删掉 legacy 减维护 | 先 **Phase A + B**，再 C/D；预计仍需若干 PR |
| 立刻 `rm -rf legacy` | **反对** — 会断 CI、e2e、schema 对照与回滚 |

---

## 6. 相关

- Strategy A：`docs/DUAL_TRACK_UI.md`  
- 仓：`docs/DATA_CENTER_v1.68.md`  
- 部署：`docs/DEPLOY.md`  
