# 真实设备手测清单（Manual QA）

**版本：** v1.92+ legacy；**v2.2-dual** 双轨 React 预览（见文末专节与 `docs/DUAL_TRACK_UI.md`）  
（年分片 keep-N、双域一键裁剪、保存后可选自动裁剪、睡眠/步数年分片、HRV/静息/步行心率年分片、Workout/ECG/Watch 日汇总年分片、仓面板分片组折叠、thin core / 迁移 / 分片清单 / 全域 keep-all 年、导入批次联动 lastImportBatchId / 仓内批次摘要 / 配额预测 UI、批次→分片反向索引 / 点批次看分片 / 离线连通横幅、客户端分片过滤 / 来源时间线、**今日仓状态 chip / 趋势仓提示**）  
**目的：** 补充自动化（视口 / 任务流 / 缩放 / 键盘 / 数据仓 / 连通）无法覆盖的真机与系统层体验。  
**原则：** 本地优先 · 不上传健康明细 · 非诊断。

---

## 1. 测试前准备

| 项 | 说明 |
|----|------|
| 构建 | 打开最新 `web-ui/public`（或部署后的 PWA） |
| 样例 | 自有 Apple Health ZIP（小/中）或仓库 `e2e/fixtures/minimal-export.xml`；含多月 CGM / 跨年血压体重更佳 |
| 浏览器 | iOS Safari、Android Chrome、桌面 Chrome/Safari 各至少一种 |
| 无障碍 | 可选：系统「更大文字」、VoiceOver / TalkBack 抽检 |

**通过标准：** 下列 P0 全过；P1 可记问题但不阻塞发布。

---

## 2. P0 — 必测任务（约 15–20 分钟）

### 2.1 导入 → 找重点

- [ ] 上传 ZIP 或 XML，进度阶段可读，完成后进入「今日」
- [ ] **优先关注**卡片有标题与语气徽章，非空白
- [ ] 点「看明细」可跳到对应明细/工作区
- [ ] 点「看曲线」（若有）进入趋势并定位相关图

### 2.2 趋势

- [ ] 切换主指标不白屏
- [ ] 选对比指标后同图叠加（异单位时有右轴）
- [ ] 基线 / 事件开关有效
- [ ] 保存视图预设 → 切换指标 → 再选预设可恢复

### 2.3 报告与导出

- [ ] 报告页可复制提示词
- [ ] 导出门诊一页纸 / 周报可下载
- [ ] 就诊复盘 HTML 可打开并打印预览（可选）

### 2.4 数据管理与隐私（摘要）

- [ ] 默认**未**授权原始仓；开启后有确认
- [ ] 授权后刷新可自动恢复分析
- [ ] 明文备份可导出/导入
- [ ] （可选）口令备份：正确口令可恢复，错误口令失败提示
- [ ] 「清除所有本机健康数据」后结果消失、**仓一并清空**（含分片与授权）

### 2.5 本机原始数据仓（分片 · v1.79–v1.92）

路径：**更多 → 数据管理 → 本机原始数据仓**。文案须保持非诊断语气；**不上传、非云同步**。

**授权与清空**

- [ ] 默认授权关闭；未授权时无仓明细落盘、无「自动保存」
- [ ] 开启授权需确认；关闭授权后仓明细按产品约定清空
- [ ] **仅清空仓内明细**：明细删除后**授权仍保持开启**，下次分析可再保存
- [ ] **清除所有本机健康数据**：摘要 / 事件 / 批次 / 仓分片 / 授权一并 wipe

**CGM 月分片**

- [ ] 有 CGM 时展示月列表（`cgm|YYYY-MM` 粒度，UI 按月）
- [ ] 可多选月份 →「删除所选」；删除后列表与占用更新
- [ ] 「保留月数」可选 **3 / 6 / 12 / 24**，点「仅保留近 N 个月」只保留最新 N 个月、更早月份删除（有确认）
- [ ] 删除/保留操作后趋势或今日若仍展示旧月数据，应与仓一致或经刷新对齐（不静默「假数据」）

**血压年分片**

- [ ] 有血压时展示年列表（`bloodPressure|YYYY`）
- [ ] 可多选年份 →「删除所选年」
- [ ] 「保留年数」可选 **1 / 2 / 3 / 5**，点「仅保留近 N 年」只保留最新 N 个有数据年份（有确认）

**体重年分片（体脂随体重年）**

- [ ] 有体重时展示年列表（`weight|YYYY`）；**体脂与体重同年片**，删体重年则该年体脂一并去掉
- [ ] 可多选删除；「仅保留近 N 年」与血压类似（1/2/3/5）
- [ ] **v1.82**「双域仅保留近 N 年」一键同时裁血压与体重（两域共用同一 N / 同一偏好键；有确认）
- [ ] **v1.83**（可选）勾选「保存后自动按保留窗口裁剪」：再保存 / 刷新后自动恢复再写回时，CGM 与年分片落在 keep-N 内；**默认关闭**；**无二次确认**（与手动 keep 不同）；关闭后不再自动裁

**睡眠 / 步数年分片（v1.85 · UI 若已上线）**

- [ ] 有睡眠日数据时展示年列表（`sleep|YYYY`）；有步数时展示 `steps|YYYY`
- [ ] 可多选年份 →「删除所选年」；删除后列表与占用更新
- [ ] **域独立：** 删除某年 **睡眠** 后，同年 **步数** 年列表与数据仍在（反之亦然）；也不误删血压/体重同年片
- [ ] 刷新 / 从仓恢复后：被删年的睡眠日 map 不再出现；保留年的睡眠与全部步数仍可分析
- [ ] （若 UI 有 keep-N）「仅保留近 N 年」对 sleep / steps 分域裁剪，确认文案非诊断语气

**HRV / 静息心率 / 步行心率年分片（v1.86 · UI 若已上线）**

- [ ] 有 HRV 日数据时展示年列表（`hrv|YYYY`；过夜 HRV 并入同一年片，无独立 `hrvOvernight|…`）；有静息心率时展示 `restingHr|YYYY`；有步行心率时展示 `walkingHr|YYYY`
- [ ] 可多选年份 →「删除所选年」；删除后列表与占用更新
- [ ] **域独立：** 删除某年 **HRV** 后，同年 **静息 / 步行心率** 年列表与数据仍在；再删 **静息** 某年后，**步行心率** 同年仍在（三域互不连带）；也不误删 sleep/steps/BP/weight 同年片
- [ ] 刷新 / 从仓恢复后：被删年的 HRV（含过夜）/ 静息日 map 不再出现；保留年与未删域仍可分析
- [ ] （若 UI 有 keep-N）「仅保留近 N 年」对 hrv / restingHr / walkingHr 分域裁剪，确认文案非诊断语气

**Workout / ECG / Watch 日汇总年分片（v1.87 · UI 若已上线）**

- [ ] 有 Workout 会话时展示年列表（`workouts|YYYY`，**数组**载荷）；有 ECG 摘要时展示 `ecg|YYYY`（**数组**，仅分类等摘要、无波形）；有 Watch 日汇总时展示 `watchDaily|YYYY`（**日 map**）
- [ ] 可多选年份 →「删除所选年」；删除后列表与占用更新
- [ ] **域独立：** 删除某年 **Workout** 后，同年 **ECG / Watch** 年列表与数据仍在（三域互不连带）；也不误删 sleep/steps/hrv/BP/weight 同年片
- [ ] 刷新 / 从仓恢复后：被删年的 Workout 会话不再出现；保留年与未删域（ECG 摘要 / Watch 日）仍可分析
- [ ] （若 UI 有 keep-N）「仅保留近 N 年」对 workouts / ecg / watchDaily 分域裁剪，确认文案非诊断语气

**分片组折叠（v1.87 collapse UX · 手测）**

- [ ] 仓面板多域年/月列表使用可折叠分组（如 `<details class="warehouse-shard-group">` 或等价）；长列表不一次性撑爆视口
- [ ] 点 summary 可展开/收起；键盘可聚焦 summary（桌面 Tab）
- [ ] 有数据的域组可见；空域不误导展示（或明确「无分片」）
- [ ] 折叠状态不阻断「删除所选 / keep-N / 复制仓状态」等操作（展开后仍可操作）
- [ ] 文案保持非诊断；不暗示云同步

**Thin core · 迁移 · 分片清单 · 全域 keep-all 年（v1.88 · UI/API 若已上线）**

- [ ] 授权后完整保存多域跨年数据：仓布局为 `sharded-v1`；`core|full` **不**再嵌套 BP/体重/睡眠/CGM 等分片域明细（thin core）
- [ ] （若暴露迁移）触发 `migrateLegacyCoreToShards` 或等价 UI：已是 thin 分片时提示成功/无需升级；旧 legacy 单片或胖 core 可升级为分片且刷新后分析完整
- [ ] **导出分片清单**（`exportShardInventory` 或按钮）：JSON 含 chunk id / 域 / 年或月 / 条数或占用；**不含** systolic、血糖点值、睡眠日明细等 raw
- [ ] **全域仅保留近 N 年**（`#btn-warehouse-years-keep-all-domains`）：跨 BP + 体重 + 睡眠等年分片域一次裁剪；有确认；裁后列表与刷新一致
- [ ] 迁移按钮「升级旧版单片为分片」与「导出分片清单」可见、可点（授权开启且有仓时）
- [ ] 全域 keep 与分域 keep / 双域 keep 并存时：文案区分清楚；不会静默裁 CGM 月（年 keep 只动年片）

**导入批次联动 · 配额预测（v1.89 · UI 若已上线）**

- [ ] 授权开启后完成一次 HAE/ZIP 导入并写入仓：`getWarehouseStatus().meta.lastImportBatchId`（或状态文案）与最近 `importBatches` 记录对应
- [ ] **仓面板导入批次摘要**（`#warehouse-import-batches`）：可见最近批次短 id / 来源 / 时间或文件摘要；**不含** CGM 点值、血压数值等 raw
- [ ] 刷新 / 从仓恢复后：批次联动仍合理（hydrate 可将 `lastImportBatchId` 用于 provenance；报告附录过滤仍正确）
- [ ] **配额条**（`#warehouse-quota-bar`）与占用估算一致；小数据量时占比远低于软配额（150 MB）
- [ ] **配额预测**（`#warehouse-quota-forecast`）：小仓占用通常 **&lt;~70% 软配额** 时可 hidden；接近/超过阈值时出现可读提示（备份 / 删旧分片 / keep-N），**非诊断、非云同步**
- [ ] 预测文案仅为客户端按分片 `approxBytes` 估算，不声称系统真实磁盘剩余；与软配额警告 / 硬配额拒绝并存且不矛盾

**批次 → 分片反向索引 · 离线横幅（v1.90 · UI/API 若已上线）**

- [ ] 授权后带 `batchId` 写入仓：`listWarehouseChunksByBatchId(batchId)` 或 `getImportBatchShardIndex(batchId)` 返回该批相关 chunk **id 列表**（如 `core|full`、`bloodPressure|YYYY`、`weight|YYYY`…）
- [ ] 反查结果为 **meta only**：**无** `payload`、无 systolic/血糖点/睡眠日明细等 raw（与分片清单同级）
- [ ] **点批次看分片**（若 UI 已接线）：在 `#warehouse-import-batches` 点击/展开某批次，可见该批贡献的分片 id 或计数；**不含** 临床点值
- [ ] 未知批次或清空后反查为空列表 / 明确「无分片」，不白屏、不抛未捕获错误
- [ ] **离线横幅**（`#connectivity-banner`，若已上线）：断网或 DevTools Offline 后出现可读提示（壳仍可用 / 本机数据不受影响）；恢复在线后横幅消失或降级
- [ ] 离线时已授权仓仍可恢复分析（与 P1「离线打开已安装 PWA」一致）；横幅文案 **非诊断、非云同步**
- [ ] **更新横幅**（`#app-update-banner`，既有）：有新 SW 版本时提示刷新；与离线横幅并存时层级/互不遮挡关键操作

**客户端分片过滤 · 来源时间线（v1.91 · UI 若已上线）**

- [ ] 授权后写入跨年 BP/睡眠 + 多月 CGM：年/月列表有多条；刷新 / 从仓恢复后列表仍完整
- [ ] **分片过滤**（`#warehouse-shard-filter`）：输入 `2025` 后，不含 2025 的年/月行隐藏或面板/控件出现 filter-active 类；匹配的 2025 年片与 `2025-MM` 月片仍可见
- [ ] **清空过滤**：删除输入内容后全部年/月行恢复；不触发删除分片、不改占用/配额条
- [ ] 过滤仅影响显示：keep-N / 删除所选 / 复制仓状态仍对**全部**分片生效（或文案明确「仅显示过滤结果」且操作前有确认）— 优先「仅显示层、操作仍可对全量」
- [ ] **来源时间线**（`#warehouse-provenance-timeline`）：至少一次 `saveImportBatch` + `persist(..., { batchId })` 后出现 ≥1 条时间线条目（时间 / 短 batch id / 来源摘要）
- [ ] 时间线为 **meta only**：**无** 血压数值、CGM 点值、睡眠日明细；与 `#warehouse-import-batches` 可并存且不重复刷屏
- [ ] 无批次或清空导入批次后时间线为空列表 / 明确「暂无」；文案 **非诊断、非云同步**

**今日仓状态 chip · 趋势仓提示（v1.92 · UI 若已上线）**

- [ ] 授权后写入仓并刷新：自动 hydrate 进入结果；切到 **今日** 工作区可见 **`#warehouse-today-chip`**（仓已启用 / 占用或分片摘要等 **meta**，**非** 临床点值）
- [ ] Chip 文案可读、非诊断；点 chip（若可交互）可跳到 **更多 → 数据仓** 或仅展示状态，不误导「云同步」
- [ ] 未授权或已 wipe 后：chip 隐藏或明确「未启用本机仓」；不残留旧占用数字
- [ ] 切到 **趋势** 工作区：可见 **`#warehouse-trends-hint`**（提示当前曲线来自本机仓恢复 / 可回数据管理管理分片等）；**无** systolic/CGM 点值
- [ ] 趋势 hint 与图表工作台并存时不遮挡主指标选择；关闭授权或清空仓后 hint 消失或降级
- [ ] 小屏（约 390）今日 chip 与优先关注卡片不重叠到不可读；横屏仍可操作

**备份**

- [ ] 备份口令**可选**：留空 → 明文 `.json` / `.hae-backup.json`；填口令 → 加密导出，导入时需正确口令
- [ ] 错误口令导入失败有提示，不破坏现有仓

**元信息 / 复制仓状态（v1.84+）**

- [ ] **复制仓状态摘要**：复制内容仅为 meta（占用、分片月份/年份列表含 sleep/steps/hrv/resting/walking/**workouts/ecg/watchDaily** 年若有、授权与保留偏好等），**不含** CGM/血压/体重/睡眠日值/步数/HRV 数组/静息·步行心率/Workout 明细/ECG 分类明细/Watch 日能量等原始时序

---

## 3. P0 — 响应式与导航

| 设备形态 | 检查 |
|----------|------|
| 手机竖屏（约 390） | 底部四栏：今日/趋势/报告/更多；无 7 项横滑顶栏 |
| 平板（约 834） | 底栏或横向导航可用；卡片不严重重叠 |
| 桌面（≥1100） | 左侧工作区侧栏；可折叠 |
| 横屏手机 | 主内容可滚动，底栏不挡关键按钮 |

---

## 4. P1 — 无障碍与系统

- [ ] **系统字体放大到最大**：优先关注标题可换行，底栏标签可读
- [ ] **200% 页面缩放**（浏览器）：导入与今日仍可操作
- [ ] **键盘 only（桌面）**：Tab 见「跳到主内容」；侧栏方向键可切换工作区
- [ ] **减少动态效果**开启：无突兀大幅动画
- [ ] **深色模式**：对比度可接受，图表可读
- [ ] VoiceOver / TalkBack：优先关注标题、主导航可朗读（抽检）

---

## 5. P1 — 性能与边界

- [ ] 中等 ZIP（50–200MB）可完成（允许数分钟，进度有反馈）
- [ ] 超大包被限制时有明确错误，不白屏
- [ ] 离线打开已安装 PWA：壳可用；已授权仓可恢复；若有 `#connectivity-banner` 应提示离线且可恢复在线
- [ ] 切换语言后导航与优先关注标签正确
- [ ] （可选）仓接近软配额时有提示；硬配额拒绝写入并有可读错误（不静默丢数）
- [ ] （可选）连续删除多个分片 / 导入备份时界面不卡死、状态一致（写入串行）

### 5.1 （可选）真实大 ZIP / 本机性能基线

个人 Apple Health 导出往往很大，**切勿提交** `export.xml` / ZIP 到仓库。在**自有设备或桌面本机**测解析与仓读写：

| 命令 | 用途 |
|------|------|
| `npm run perf:parse -- --file=/path/to/export.xml` | 本地 `parseHealthXml` / `analyzeAll` 耗时与内存（可用 `PERF_XML_PATH`） |
| `npm run perf:warehouse` | Playwright 合成多年数据测仓 `persist` / `load` / `status`（**不**读个人文件） |

详细步骤、隐私注意与不要提交清单见 **`docs/REAL_DEVICE_ZIP.md`**。手测大包时仍以本节「中等 ZIP / 超大包」勾选项为准。

---

## 5b. 双轨 React 预览（v2.2-dual · 非生产默认）

**文档：** `docs/DUAL_TRACK_UI.md` · **自动化：** `npm run test:e2e:react`（端口 4174）  
**入口：** `npm run react:dev` 或 `react:export-next` 后访问 legacy 顶栏「试用新版」→ `/next/`

### P0（约 10 分钟）

- [ ] 总览：加载演示夹具 → KPI / 新鲜度 / 优先事项非空
- [ ] 导入本机 **export.xml** 或小 **ZIP** 成功；徽章显示 Worker / ZIP
- [ ] （可选）导入 `e2e/fixtures/hae-mini.json` → HAE 徽章与 CGM
- [ ] 趋势：有序列表；主图加载后无整页白屏；数据表可滚动
- [ ] 报告：切换门诊一页纸 / 周报 / 临床复盘有 Markdown；**复制 / 下载 .md** 可用
- [ ] 数据：探测 IDB 契约匹配；保存快照后列表可见
- [ ] 写入数据仓：状态含 **sharded-v1** / 分片数；再清除会话 → 加载数据仓 KPI 一致
- [ ] （重要）React 写仓为**整仓替换** domainChunks；若需保留 legacy 手调 keep-N 结果，先备份
- [ ] 主题 浅色/深色/系统；桌面见侧栏、手机宽见底栏
- [ ] 关于 Sheet 可开可关；无第三方网络请求（可开 DevTools Network 抽检）
- [ ] （可选）SW 有更新时出现提示条，非自动整页抢占
### P1

- [ ] `npm run react:export-next` 后 legacy 与 `/next/` 可切换；`ha-ui-shell=react` 仅在 next 存在时跳转
- [ ] 断网后 React preview 壳层仍可打开（self-only SW）
- [ ] 与 legacy 共用同一浏览器时，快照/仓 meta 可读（不强制写分片）

**注意：** React 仓写入 **不是** 全量 year/month 分片 keep-N；大规模仓仍用 legacy「更多 → 数据管理」。

---

## 6. 记录模板

```text
日期：
设备 / OS / 浏览器：
构建版本（footer）：
P0 结果：通过 / 失败
问题：
1. [严重度] 描述 · 复现步骤 · 截图
```

---

## 7. 与自动化对照

| 自动化 | 文件 / 用例要点 |
|--------|----------------|
| 390 / 834 / 1440 | `e2e/viewport.spec.js` |
| 四任务流 | `e2e/task-flow.spec.js` |
| 200% zoom | `e2e/text-zoom.spec.js` |
| 键盘 | `e2e/keyboard.spec.js` |
| 数据仓 / 年分片 / 双域 keep / 加密备份 | `e2e/warehouse.spec.js`（含 BP·体重·sleep·steps·**hrv·resting·walking**·workouts/ecg/watch 年分片与域独立删） |
| 保存后 auto-trim（CGM keep 月） | `e2e/warehouse.spec.js` → `auto-trim after save: keep 3 CGM months…` |
| v1.88 migrate / inventory / global keep-all | `e2e/warehouse.spec.js` → `v1.88 migrateLegacyCoreToShards…` / `exportShardInventory…` / `global keep-all years…` |
| v1.89 batch linkage + quota forecast | `e2e/warehouse.spec.js` → `v1.89 import batches in warehouse…`（硬 API）/ `v1.89 quota forecast soft…`（软 UI） |
| v1.90 batch→shard reverse index | `e2e/warehouse.spec.js` → `v1.90 batch→shard index…`（硬：`listWarehouseChunksByBatchId` / `getImportBatchShardIndex`；meta only） |
| v1.90 offline connectivity banner | `e2e/connectivity.spec.js` → offline soft（`#connectivity-banner`；缺省 skip） |
| v1.91 shard filter + provenance timeline | `e2e/warehouse.spec.js` → `v1.91 shard filter soft/hard…` / `v1.91 provenance timeline soft/hard…`（UI 缺失 soft log） |
| v1.92 today chip + trends warehouse hint | `e2e/warehouse.spec.js` → `v1.92 today chip soft/hard…` / `v1.92 trends hint soft…`（`#warehouse-today-chip` / `#warehouse-trends-hint`；UI 缺失 soft log） |
| （可选）仓读写耗时基线 | `npm run perf:warehouse` → `scripts/perf-warehouse-baseline.mjs` |
| （可选）真实 export 解析基线 | `npm run perf:parse -- --file=/path/to/export.xml`；指南 `docs/REAL_DEVICE_ZIP.md` |
| （可选）年分片 auto-trim | 手测优先：勾选 auto-trim + year keep-N 后跨年 BP/体重再保存；E2E 已有 year auto-trim 用例 |

| React 双轨壳 / 导入 / 仓 / 快照 | `e2e-react/shell.spec.js` · `npm run test:e2e:react` |
| React 单元（adapter/IDB/ZIP/HAE/仓） | `npm run react:test` |
| React dist 隐私扫描 | `npm run react:privacy` |

本地：`npm run test:e2e` · 双轨：`npm run test:e2e:react`  
手测本清单后，再发版更稳妥。生产发版以 **legacy** `web-ui/public` 为主门禁。
