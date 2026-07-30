# v1.68 本地个人健康数据中心（Local Personal Health Data Center）

**状态：** 设计草案（产品/架构授权文档，**未实现**）  
**范围：** 浏览器本机 IndexedDB 持久化「解析后的 typed 健康仓」+ 授权、配额、备份/清除  
**语言 / Language：** 中文（关键术语中英对照）  
**对照实现基线：** `web-ui/public/history-db.js`（`DB_VERSION = 4`）、`lib/src/types.ts`（`HealthData`）、`lib/src/provenance.ts`（`ImportBatchRecord`）、v1.66 工作区（今日 / 趋势 / 报告 / **更多**）

> 本地隐私优先 · 零服务器 · 非诊断 · 默认不上传  
> 本文只定义产品层授权与数据契约；**不实现代码、不改 `web-ui` 业务逻辑**。

---

## 目录

1. [目标与非目标](#1-目标与非目标)
2. [为什么现状不够](#2-为什么现状不够)
3. [数据模型](#3-数据模型)
4. [原始数据存什么](#4-原始数据存什么)
5. [增量导入与批次](#5-增量导入与批次)
6. [配额与淘汰](#6-配额与淘汰)
7. [备份 / 恢复 / 一键清除](#7-备份--恢复--一键清除)
8. [安全与隐私](#8-安全与隐私)
9. [API 草图：`HealthHistory` 扩展](#9-api-草图healthhistory-扩展)
10. [UI 归属](#10-ui-归属)
11. [分阶段落地与用户授权检查点](#11-分阶段落地与用户授权检查点)
12. [风险与回滚](#12-风险与回滚)
13. [验收标准](#13-验收标准)
14. [附录：草图与决策清单](#14-附录草图与决策清单)

---

## 1. 目标与非目标

### 1.1 目标（Goals）

| ID | 目标 | 说明 |
|----|------|------|
| G1 | **刷新后可恢复分析** | 用户明确授权后，解析后的 `HealthData`（含 CGM 等明细）可持久化到本机；刷新/重开 PWA 无需重传大 ZIP |
| G2 | **本地个人数据中心** | 在现有「摘要历史 / 周报 / 事件 / 导入批次」之上，增加 **raw warehouse（typed records 仓）** 与元数据、占用可见性 |
| G3 | **增量导入对齐** | HAE / ZIP / XML / CSV 合并后写入仓；与既有 `importBatches` + `sourceBatchIds` / `domainSourceBatches` 可追溯 |
| G4 | **产品层显式授权** | 默认 **不** 落盘原始明细；开启需用户确认（类比「一键清除」的反向契约） |
| G5 | **配额与可清除** | 容量估算、上限、淘汰策略、用户可见占用；与 `clearAllStores` / privacy wipe 统一 |
| G6 | **备份自托管** | 可选导出/导入本机备份文件（用户自行保存到文件 App / 电脑）；**不经过本产品服务器** |
| G7 | **非诊断边界不变** | 文案、导出页脚、提示词信任条继续声明：统计与提示词仅供个人复盘，不作诊断/用药依据 |

### 1.2 非目标（Non-goals）

| ID | 非目标 | 理由 |
|----|--------|------|
| N1 | **默认上传 / 账号云同步** | 产品承诺 100% 本地；v1.68 不引入账号体系 |
| N2 | **FHIR 云同步 / 医院 EHR 双向对接** | 已有试验性 FHIR **导出**；不是云同步仓，也不替代 EHR |
| N3 | **存未解析的完整 Apple ZIP / export.xml 原文** | 体积过大（可达数百 MB–GB）；收益低于 typed `HealthData`；ZIP 炸弹与隐私面更大 |
| N4 | **全量逐条心率 / 血氧时序（parser 当前刻意日汇总的维度）** | 与现有解析策略一致：Watch 活动/血氧等以 `watchDaily` 日汇总为主，不回退存「全量 HR 原始点」 |
| N5 | **多用户 / 家庭成员仓** | README 路线图仍为未来项；本版单主体、单 origin 浏览器仓 |
| N6 | **加密密钥托管、端到端云备份 SaaS** | 可选本地加密导出见 §8；不做密钥服务器 |
| N7 | **实时告警、闭环医疗器械声明** | 继续保持个人复盘工具定位 |
| N8 | **替换内存分析路径** | 会话内仍以 `currentAnalysis` 为工作集；仓是「可恢复源」，不是替代统计引擎 |

### 1.3 一句话产品定义

> **v1.68 = 在用户明确授权下，把「解析后的 `HealthData` 工作集」从「仅内存」升级为「本机 IndexedDB 数据仓」，并提供占用可见、备份恢复与一键清除；默认关闭，永不自动上传。**

---

## 2. 为什么现状不够

### 2.1 今日数据分层（As-is）

```
┌──────────────────────────────────────────────────────────────┐
│ 浏览器 Tab 会话                                              │
│  currentAnalysis: FullAnalysis  ──► data: HealthData        │
│  （含 cgm[] / bp[] / weight[] / hrv / sleep / watchDaily…）  │
│  刷新 / 关页 / 崩溃 → 全部丢失，需重新上传解析                │
└──────────────────────────────────────────────────────────────┘
                          │ analyzeAll / buildAnalysisSnapshot
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ IndexedDB: health-analyzer-history  (DB_VERSION = 4)         │
│  snapshots        ≤30  摘要 metrics（无 CGM 明细）           │
│  weeklyReports    ≤20  markdown 周报                         │
│  healthEvents     ≤500 手录事件                              │
│  importBatches    ≤50  导入来源摘要（文件名/字节/sha/stats）  │
│  ✗ 不存完整 CGM / 血压 / 体重等 typed 明细                   │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ localStorage：个人背景 / 恢复权重 / 主题 / 语言 等偏好        │
└──────────────────────────────────────────────────────────────┘
```

来源注释（`history-db.js` 文件头）：

> IndexedDB：本地保存分析摘要快照 + 周报历史 + 事件时间线 + 导入批次可追溯；**不上传；仅存压缩 metrics / markdown / 手录事件 / 导入摘要，不含完整 CGM 明细**。

### 2.2 痛点

| 痛点 | 用户感知 | 技术根因 |
|------|----------|----------|
| **重传成本高** | 完整 Apple Health ZIP 常 50–500+ MB，手机解析数分钟 | 工作集只在 `currentAnalysis` 内存 |
| **摘要 ≠ 复盘** | 历史环比只有 KPI 数字，无法重画 CGM 曲线、重算日期窗 | `AnalysisSnapshot.metrics` 刻意压缩 |
| **增量断档** | HAE 合并依赖当前内存 `HealthData`；刷新后「增量」变成「只能从空仓再并」 | 无持久化 base warehouse |
| **可追溯不完整** | `importBatches` 有 stats，但仓内无点级 `sourceBatchId` 关联（仅分析对象上有 batch 列表） | provenance 停在批次层 |
| **信任叙事不一致** | 产品说「本地优先」，但真正的健康明细却「比摘要更短命」 | 隐私默认正确，但缺少 **opt-in 持久化** 产品面 |

### 2.3 为何不能「悄悄」把明细写入 IndexedDB

1. **隐私契约**：文案多处写「完整明细仅在本页」；静默落盘会改变用户心理模型。  
2. **配额与设备风险**：CGM 一年可达数十万点；Safari/iOS 对源站存储更敏感。  
3. **合规叙事**：非诊断工具仍处理敏感健康数据；**显式授权**是产品层最低标准。  
4. **路线图要求**：用户明确要求 v1.68 需「**产品层授权**」才能存原始数据仓。

### 2.4 成功判据（产品）

- 关闭授权时：行为与 v1.66/1.67 **完全一致**（仅摘要历史）。  
- 开启授权后：刷新页面可在 ≤ 数秒内恢复可交互的分析（KPI + 图表 + 提示词），**无需重传 ZIP**。  
- 一键清除后：仓 + 摘要 + 事件 + 批次 + 相关 localStorage **一并消失**，且内存分析清空。

---

## 3. 数据模型

### 3.1 版本迁移建议

| 项 | 现状 | v1.68 建议 |
|----|------|------------|
| `DB_NAME` | `health-analyzer-history` | **保持不变**（同库迁移，避免双库残留） |
| `DB_VERSION` | **4** | **5**（或若落地拆分过大可 5→6，见阶段） |
| 迁移策略 | `onupgradeneeded` 内 `createObjectStore` if missing | 同模式；**不删除** v4 stores；新 store 可空 |
| 旧数据 | snapshots / reports / events / batches | 原样保留；与新仓独立 |

**建议：`DB_VERSION = 5` 一次加齐 MVP 所需 store**，避免用户多次升级弹窗感；若加密导出/压缩 codec 大改，预留 `schemaMeta.formatVersion` 字段做逻辑版本，而不必每次都涨 IndexedDB version。

### 3.2 Object stores 总览

| Store | 自版本 | keyPath | 索引 | 用途 |
|-------|--------|---------|------|------|
| `snapshots` | ≤4 | `id` | `savedAt` | 分析摘要环比（不变） |
| `weeklyReports` | ≤4 | `id` | `savedAt`, `weekEnd` | 周报 MD（不变） |
| `healthEvents` | ≤4 | `id` | `date`, `createdAt` | 手录事件（不变） |
| `importBatches` | 4 | `id` | `createdAt` | 导入批次摘要（扩展字段，见 §5） |
| **`warehouseMeta`** | **5** | `id`（固定 `'primary'`） | — | 授权状态、仓版本、占用、时间窗 |
| **`domainChunks`** | **5** | `id`（`${domain}|${shard}`） | `domain`, `dateStart`, `updatedAt`, `batchId` | **按域分片的 typed 记录** |
| **`settings`**（可选） | **5** | `key` | — | 数据中心偏好（保留天数、压缩开关）；也可放 localStorage |

> MVP 也可把授权 flag 仅放 localStorage；**推荐 `warehouseMeta` 与数据同库**，一键清除不漏、备份一体。

### 3.3 `warehouseMeta` 字段

```ts
/** 单例记录 id 固定为 'primary' */
interface WarehouseMeta {
  id: 'primary';
  /** 逻辑 schema，独立于 IndexedDB DB_VERSION */
  formatVersion: 1;
  /** 用户是否授权持久化原始明细仓 */
  consent: {
    granted: boolean;
    grantedAt: string | null;   // ISO
    revokedAt: string | null;
    /** 同意文案版本，便于条款迭代后重新确认 */
    policyVersion: string;      // e.g. 'data-center-v1.68.0'
  };
  /** 仓内覆盖的数据日历范围（由写入维护） */
  dateRange: { start: string; end: string } | null;
  /** 各域条数与估算字节 */
  domainStats: Record<string, {
    recordCount: number;
    approxBytes: number;
    chunkCount: number;
    minDate?: string;
    maxDate?: string;
  }>;
  totalApproxBytes: number;
  totalRecordCount: number;
  lastImportBatchId: string | null;
  lastWrittenAt: string | null;
  /** 淘汰策略快照（写入时生效的策略） */
  retention: {
    mode: 'unlimited_until_quota' | 'rolling_days';
    rollingDays: number | null;  // e.g. 400
    maxTotalBytes: number;       // soft cap
  };
  /** 写入编码 */
  codec: 'structured-clone' | 'json' | 'json+fflate';
  notes?: string[];
}
```

### 3.4 `domainChunks` 字段

```ts
type WarehouseDomain =
  | 'cgm'
  | 'bloodPressure'
  | 'weight'
  | 'bodyFat'
  | 'hrv'            // 日 map 序列化形态见 §4
  | 'hrvOvernight'
  | 'restingHr'
  | 'walkingHr'
  | 'steps'
  | 'sleep'
  | 'watchDaily'
  | 'workouts'
  | 'ecg'
  | 'availability'   // dataAvailability + dataQuality 小对象，可单 chunk
  ;

interface DomainChunk {
  id: string;              // `${domain}|${shardKey}`
  domain: WarehouseDomain;
  /** 分片键：按日 'YYYY-MM-DD' 或按月 'YYYY-MM' 或 'all' */
  shardKey: string;
  dateStart: string;       // 分片内最小日期
  dateEnd: string;
  recordCount: number;
  approxBytes: number;
  updatedAt: string;       // ISO
  /** 最近写入关联的 import batch（摘要级；点级可选） */
  lastBatchId?: string | null;
  /**
   * 载荷：structured clone 友好的 plain object / array
   * 不存 File / ArrayBuffer 原文 ZIP
   */
  payload: unknown;
  /** 可选：payload 为压缩时 */
  encoding?: 'plain' | 'fflate-utf8';
  /** 压缩前字节，便于 UI */
  rawBytes?: number;
}
```

### 3.5 既有 store 字段（保持兼容，摘要）

- **snapshots**：`AnalysisSnapshot`（`id`, `savedAt`, `generatedAt`, `dateRange`, `metrics`, `label?`）  
- **weeklyReports**：`id`, `savedAt`, `weekEnd`, `markdown`, `label?`, `recoveryScore?`, `loadScore?`  
- **healthEvents**：`id`, `kind`, `date`, `endDate?`, `title`, `note?`, `intensity?`, `source?`, `createdAt`  
- **importBatches**：见 §5（在 v4 字段上 **additive** 扩展，不破坏 `normalizeImportBatch`）

### 3.6 迁移伪代码

```text
onupgradeneeded (oldVersion → 5):
  ensure snapshots, weeklyReports, healthEvents, importBatches  // 同 v4
  if !warehouseMeta:
    createObjectStore('warehouseMeta', { keyPath: 'id' })
  if !domainChunks:
    store = createObjectStore('domainChunks', { keyPath: 'id' })
    store.createIndex('domain', 'domain')
    store.createIndex('dateStart', 'dateStart')
    store.createIndex('updatedAt', 'updatedAt')
    store.createIndex('lastBatchId', 'lastBatchId')  // optional
  // 不迁移、不删除旧数据
  // 写入默认 meta：consent.granted = false
```

升级后首次 `openDb`：若无 `primary` meta，**懒创建**默认未授权记录。

### 3.7 与 `FullAnalysis` 的关系

```
domainChunks  ──hydrate──►  HealthData  ──analyzeAll──►  FullAnalysis
                                  ▲
sessions: currentAnalysis ────────┘  （内存工作集，可随时重算）
```

- **仓内存 `HealthData` 级**（+ 可选缓存的 `dateRange` / 轻量 stats），**默认不存**完整 `FullAnalysis` 统计树（可再生成，避免双份膨胀与 schema 漂移）。  
- 可选后期「分析缓存 chunk」：仅当重算过慢再议（非 MVP）。

---

## 4. 原始数据存什么

### 4.1 决策：存 parse 后的 typed records，不存源文件

| 候选 | 结论 | 理由 |
|------|------|------|
| 完整 ZIP / XML 原文 | **否** | 体积、解压成本、隐私面；用户本可自持文件 App 备份 |
| `RawRecord[]`（type 字符串未规范化） | **否作主仓** | 与统计层重复；单位未规范 |
| **`HealthData` typed 结构** | **是（主仓）** | 与 `analyzeAll` / 图表 / 导出直接对齐 |
| 仅 metrics 摘要 | 已有 | 不够支撑 G1 |

### 4.2 按域分片策略（推荐）

| 域 | 形态（对齐 `types.ts`） | 分片粒度 | 说明 |
|----|-------------------------|----------|------|
| `cgm` | `CgmPoint[]` | **按月** `YYYY-MM` | 体量最大；月片利于淘汰与增量 |
| `bloodPressure` | `BloodPressureRecord[]` | 按月或按年 | 条数通常远小于 CGM |
| `weight` / `bodyFat` | 数组 | **`all` 单片** 或按年 | 低频 |
| `hrv` / `hrvOvernight` | `Record<date, number[]>` | 按月（把该月 key 子集放入 payload） | map 型 |
| `restingHr` / `walkingHr` | `Record<date, number>` | 按年或 `all` | 日粒度一行 |
| `steps` | `Record<date, {watch,iphone,max}>` | 按年或 `all` | |
| `sleep` | `Record<date, SleepDay>` | 按年或 `all` | |
| `watchDaily` | `Record<date, WatchDaySummary>` | 按年 | 已是日汇总，**禁止**再拆逐条 HR |
| `workouts` | `WorkoutSession[]` | 按年 | |
| `ecg` | `ERecordSummary[]` | `all` | 条数少；**不存 ECG 波形 CSV 全文** |
| `availability` | `{ dataAvailability, dataQuality }` | `all` | 小对象 |

**默认不入仓：**

- Apple Health 未映射的未知 HAE metric 时序（与 v1.40「不落库未知序列」一致，除非未来单独授权）  
- Workout GPS 轨迹 GPX  
- ECG 原始采样点 CSV  
- 用户上传的 ZIP 二进制

### 4.3 编码：JSON vs Structured Clone

| 方式 | 优点 | 缺点 | v1.68 建议 |
|------|------|------|-----------|
| **Structured Clone**（IndexedDB 默认） | 无 JSON 序列化损耗；Date 等友好（我们主要用 plain） | 备份导出仍要 JSON；调试略难 | **仓内默认 plain structured clone** |
| JSON 字符串字段 | 导出一致；可再压缩 | 体积与 CPU 双倍；大数组卡主线程 | 备份文件用 JSON |
| **json + fflate** 存 `Uint8Array` | CGM 月片可显著减小 | 读写异步解压；要版本化 codec | **可选**：当单 chunk `approxBytes > 512KiB` 自动压缩 |

**推荐策略（MVP → 完整）：**

1. **MVP**：`encoding: 'plain'`，payload 为 structured-clone 友好的 plain object/array。  
2. **完整**：CGM 月片超过阈值时 `fflate` 压缩 UTF-8 JSON → `Uint8Array`，`encoding: 'fflate-utf8'`。  
3. 读写 API 对外始终返回 **已解码** 的 typed 结构，压缩对 UI 透明。

### 4.4 点级 provenance（可选增强）

MVP：**chunk 级** `lastBatchId` + 分析级 `sourceBatchIds`（已有）即可。  

完整版可选：

```ts
// CgmPoint 扩展（additive，可选字段）
interface CgmPoint {
  // ...existing
  sourceBatchId?: string; // 写入仓时打标；导出 FHIR 时已有 domainSourceBatches
}
```

注意：为每个点加字符串会显著增加 CGM 体积；更省的做法是 **chunk 元数据 + 批次 stats.byDomain**，仅在「争议复核」场景再考虑点级。

### 4.5 Hydrate / Persist 语义

```text
persistHealthData(data, { batchId, mode: 'replace' | 'merge' }):
  若 !consent.granted → throw ConsentRequired
  按域分片 upsert domainChunks
  更新 warehouseMeta.domainStats / dateRange / totalApproxBytes
  可选：触发配额淘汰

hydrateHealthData(options?: { domains?, dateRange? }):
  若无仓或空 → null
  读取相关 chunks → 合并为 HealthData
  finalizeData 语义与 parser/hae 一致（或信任已 finalize 的仓）
  return HealthData
```

- **`replace`**：整域重写（适合完整 ZIP 重导入）。  
- **`merge`**：与 `mergeHaeIntoData` 后的结果对齐——**以合并后的内存 `HealthData` 为真相再分片写回**（实现简单，避免在 IDB 内重做复杂去重）。  
  - 实现提示：MVP 对大域可「读月片 → 内存 merge → 写回月片」，不必每次全量读写。

### 4.6 容量粗算（指导配额）

假设（保守个人用户）：

| 域 | 假设 | 粗算 |
|----|------|------|
| CGM | 5 min/点，2 年，≈ 210k 点；每点 ~80 B JSON | ~15–25 MB 未压缩 |
| 血压 | 2 年 × 2 次/日 | < 1 MB |
| 体重/体脂 | 2 年每日 | < 0.5 MB |
| 步数/睡眠/HRV 日汇总 | 2 年 | 2–8 MB |
| Watch 日汇总 + workouts | 2 年 | 1–5 MB |
| **合计典型** | | **约 20–40 MB** |
| 重度 CGM + 多源 | | **50–120 MB** 可能 |

→ Soft cap 建议默认 **150 MB** 估算占用；硬提示 **200 MB**；超过则拒绝写入并引导导出备份 / 缩短保留天数（见 §6）。Safari 单站配额因设备而异，UI 必须可读失败原因。

---

## 5. 增量导入与批次

### 5.1 与现有 `importBatches` 对齐

现有 `ImportBatchRecord`（`lib/src/provenance.ts`，`PROVENANCE_RULE_VERSION`）字段保持：

- `id`, `createdAt`, `source` (`hae` | `apple_zip` | `apple_xml` | `csv_merge` | `other`)  
- `files[]`（`name`, `bytes`, `sha256?`, `digestScope?`, `bytesHashed?`）  
- `totalBytes`, `stats`（`totalAdded/Updated/Skipped`, `byDomain`, `unknownMetricNames?`）  
- `ruleVersion`, `notes?`, `cancelled?`

**v1.68 additive 扩展（可选字段，normalize 时宽容）：**

```ts
interface ImportBatchRecordV168 extends ImportBatchRecord {
  /** 本次导入是否写入了原始数据仓 */
  warehouseWrite?: 'none' | 'merge' | 'replace' | 'skipped_no_consent' | 'failed';
  /** 写入后的仓 dateRange 快照 */
  warehouseDateRange?: { start: string; end: string } | null;
  /** 估算新增字节 */
  warehouseBytesDelta?: number | null;
}
```

### 5.2 导入流水线（授权开启时）

```
选文件 → 解析/合并到内存 HealthData
       → analyzeAll → currentAnalysis
       → saveImportBatch（必有，与今一致）
       → if consent: persistHealthData(data, { batchId, mode })
       → else: warehouseWrite = skipped_no_consent（可记在 batch）
```

授权关闭时：**零行为变化**（仅 batch + 可选 snapshot）。

### 5.3 与 `sourceBatchIds` / `domainSourceBatches`

- 分析对象上的 `sourceBatchIds` 继续表示「本分析关联批次」（报告附录过滤逻辑保持）。  
- 从仓 hydrate 后：  
  - MVP：恢复 `warehouseMeta` 中记录的 `lastN batch ids` 或完整列表的子集；  
  - 完整：维护 `meta.contributingBatchIds: string[]`（有上限，如 50，与 `MAX_IMPORT_BATCHES` 一致）。  
- **取消的 batch**（`cancelled: true`）不得进入附录——现有 e2e 约束继续有效。

### 5.4 HAE 增量典型路径

1. 用户首次 ZIP 打底 → `replace` 写入仓。  
2. 此后 HAE JSON 合并 → 内存 `mergeHaeIntoData` → `merge` 写回变更域的 chunks。  
3. 刷新 → hydrate → 再 HAE → 继续增量。  

**无仓时 HAE 仍可用**（现状：基于当次会话内存）；有仓时体验从「每次从零」变为「真正的增量健康仓」。

### 5.5 去重真相源

- **去重逻辑仍在 `lib` 合并层**（hae-import / csv-import / parser finalize），不在 IndexedDB 触发器里复制一套。  
- 仓是 **merged HealthData 的持久化投影**。

---

## 6. 配额与淘汰

### 6.1 上限建议（产品默认，可在「数据管理」调整）

| 参数 | 默认 | 说明 |
|------|------|------|
| `maxTotalBytes`（软） | 150 × 1024² | 估算值之和；超 90% 警告 |
| `maxTotalBytesHard` | 200 × 1024² | 拒绝新的 persist，提示清理 |
| `rollingDays` | `null`（不按天裁）或 **400** | 产品决策点；建议默认不裁，仅按配额 |
| `maxChunks` | 4000 | 防止异常分片爆炸 |
| CGM 月片最大 | 约 5–8 MB/片解码后 | 超则压缩或拆周片 |

既有摘要类上限保持：

- `MAX_SNAPSHOTS = 30`  
- `MAX_WEEKLY_REPORTS = 20`  
- `MAX_EVENTS = 500`  
- `MAX_IMPORT_BATCHES = 50`  

**原始仓淘汰独立**：不要用「删最旧 snapshot」的逻辑误删 CGM。

### 6.2 淘汰策略

**策略 A（推荐默认）：配额驱动 FIFO by month**

1. 当 `totalApproxBytes > maxTotalBytes`：  
2. 按 `dateStart` 升序删除最旧的 **CGM 月片**，其次其它域旧年片；  
3. 更新 meta；写 UI 提示「已自动淘汰 YYYY-MM 的 CGM 明细以控制占用」。  
4. **不自动删** `healthEvents` / 用户周报（用户心智上更「手写资产」）。

**策略 B：滚动天数**

- 删除 `dateEnd < today - rollingDays` 的 chunks。  
- 适合明确「只留近 13 个月」的用户。

### 6.3 用户可见占用

在 **更多 → 数据管理** 展示：

| UI 元素 | 内容 |
|---------|------|
| 授权状态 | 已开启 / 未开启 + 授权时间 |
| 总占用（估算） | e.g. `32 MB · 18.4 万条` |
| 分域条形或列表 | CGM 24 MB · 血压 0.4 MB … |
| 日历覆盖 | 2024-03-01 → 2026-07-28 |
| 操作 | 关闭授权并清空仓 / 仅清空仓保留摘要 / 导出备份 / 调整保留 |

**估算方法：** `approxBytes = sum(chunk.approxBytes)`；写入时用 `JSON.stringify(payload).length` 或 uncompressed length 缓存，避免每次 `getAll` 全表扫描（可维护在 meta）。

**Storage API（可选增强）：** `navigator.storage.estimate()` 展示源站配额使用率；失败则仅显示内部估算。

### 6.4 写入失败 UX

- `QuotaExceededError`：友好文案 + 引导删除旧月 / 导出备份 / 关闭仓。  
- 不静默截断 CGM 导致「看起来像数据丢了却无提示」。

---

## 7. 备份 / 恢复 / 一键清除

### 7.1 备份格式建议

**主推：单文件 JSON（可再包 zip）**

```text
health-analyzer-backup-YYYYMMDD-HHmmss.hae-backup.json
```

或压缩：

```text
health-analyzer-backup-YYYYMMDD-HHmmss.hae-backup.zip
  └─ backup.json
```

**顶层 envelope：**

```ts
interface HaeBackupFile {
  magic: 'health-analyzer-backup';
  formatVersion: 1;
  exportedAt: string;          // ISO
  app: { name: 'health-analyzer'; dataCenter: 'v1.68' };
  /** 明文 | 口令加密（见 §8） */
  encryption: 'none' | 'passphrase-aes-gcm';
  /** encryption==none 时直接有 payload；加密时为密文结构 */
  payload?: HaeBackupPayload;
  cipher?: {
    saltB64: string;
    ivB64: string;
    iterations: number;
    ciphertextB64: string;
  };
}

interface HaeBackupPayload {
  warehouseMeta: WarehouseMeta;
  domainChunks: DomainChunk[];   // encoding 保持与仓内一致或统一 decode 后 plain
  snapshots?: AnalysisSnapshot[];
  weeklyReports?: WeeklyReportRecord[];
  healthEvents?: HealthEventRecord[];
  importBatches?: ImportBatchRecord[];
  /** 可选：不含密码的偏好子集 */
  prefs?: {
    recoveryWeights?: unknown;
    signalPrefs?: unknown;
    // 不含或脱敏个人背景：默认「可选勾选」
    userContext?: unknown;
  };
}
```

**命名 `.hae-backup.json`：** 强调是 Health Analyzer Export/Backup，避免用户与临床 FHIR Bundle 混淆；MIME `application/json`。

### 7.2 恢复

1. 用户在数据管理选择备份文件。  
2. 校验 `magic` + `formatVersion`。  
3. 若加密 → 口令解密。  
4. **二次确认**：恢复将 **合并或替换**？  
   - MVP 仅支持 **替换数据中心相关 stores**（危险操作，双确认）。  
5. 写入 IDB；设置 `consent.granted` 与备份一致或强制要求用户重新勾选授权（**推荐恢复后仍展示授权摘要，policyVersion 不一致则要求重确认**）。  
6. hydrate → analyzeAll → 进入今日工作区。

### 7.3 与 privacy wipe 统一

现有一键清除（`btn-clear-all-local`）路径：

1. 删 `HEALTH_LOCAL_STORAGE_KEYS`  
2. `HealthHistory.clearAllStores()` → snapshots + weeklyReports + healthEvents + importBatches  
3. `resetResultsUi()` 清内存  

**v1.68 必须扩展：**

```text
clearAllStores():
  clear 上述 v4 stores
  clear domainChunks
  clear / reset warehouseMeta（consent.granted=false）
  clear settings store（若有）

// 可选细分 API
clearWarehouseOnly():  // 关仓数据但保留摘要/事件
revokeConsentAndClearWarehouse():
```

文案更新：

- wipeHint 增加：「若曾开启原始数据仓，将同时删除本机 CGM 等明细。」  
- 关闭授权开关时：默认 **立即清空 domainChunks**（避免「关授权但数据仍在磁盘」的虚假安全感）；摘要历史是否保留由用户勾选（默认保留）。

### 7.4 备份与 wipe 的关系

| 操作 | 仓 | 摘要/事件/批次 | 内存分析 |
|------|----|----------------|----------|
| 导出备份 | 读 | 可选纳入 | 不变 |
| 恢复备份（替换） | 覆写 | 按选项 | 重 hydrate |
| 一键清除 | 清空 | 清空 | 清空 |
| 仅关授权 | 清空仓 | 默认保留 | 可保留至刷新 |

---

## 8. 安全与隐私

### 8.1 默认：明文本地

| 层 | 策略 |
|----|------|
| IndexedDB | **默认明文** structured clone / plain JSON（与现摘要历史一致） |
| 传输 | **无服务器上传**；静态托管只下发代码 |
| 导出备份 | 默认明文 JSON；**可选**口令加密 |
| 剪贴板/LLM | 既有「首次复制提示词隐私确认」不变 |

**理由：**  
- 浏览器 IDB 受同源策略保护；威胁模型主要是「同一设备的其它人或恶意扩展」与「备份文件泄露」。  
- WebCrypto 口令加密对 IDB 全库加密成本高（密钥存哪？口令每次解锁？），MVP 不做「库级加密」。  

### 8.2 可选：备份口令加密

- 算法建议：PBKDF2 / Argon2 不可用时用 **PBKDF2-SHA-256**（WebCrypto）+ **AES-GCM**。  
- 口令不落盘；错误口令无法恢复。  
- UI：导出时可选「使用口令加密备份」；弱口令警告。  
- **非目标：** 忘记口令找回。

### 8.3 产品层授权（Consent）文案要点

必须用户可见且可追溯 `policyVersion`：

1. 明细（含血糖曲线点等）将保存在 **本机浏览器存储**，不是云端。  
2. 清除站点数据 / 换浏览器 / 卸载 PWA 可能导致丢失——请自行导出备份。  
3. 本工具 **不做诊断**；数据仍属敏感健康信息。  
4. 可随时在「数据管理」关闭授权并删除仓。  
5. 一键清除会删除仓与摘要等本机健康数据。

**交互：** 主开关 + 确认模态（勾选「我了解明细将保存在本机」）→ 才 `consent.granted=true`。  
**禁止：** 首次导入时静默开启。

### 8.4 与匿名 FHIR / 分享

- 仓的存在 **不改变** 匿名分享净化规则（`sourceName`、batch id 重映射等）。  
- 从仓 hydrate 的数据走同一导出管线。

### 8.5 威胁模型摘要

| 威胁 | 缓解 |
|------|------|
| 本站服务器窃取 | 无健康明细上传路径 |
| XSS 读 IDB | 持续依赖静态资源完整性、少依赖第三方脚本；SW 与 CSP 按现部署加固 |
| 备份文件转发泄露 | 可选加密；导出前警告 |
| 共享电脑 | 引导用完一键清除；可选「离开时提醒」后期项 |
| 配额耗尽导致半写 | 事务写入 + 失败回滚 meta；避免半更新无提示 |

---

## 9. API 草图：`HealthHistory` 扩展

> 仍挂在 `window.HealthHistory`（`history-db.js`），保持现有方法兼容。  
> 下列为设计草图，非最终实现签名。

### 9.1 常量

```js
HealthHistory.DB_VERSION;           // 5
HealthHistory.WAREHOUSE_POLICY_VERSION; // 'data-center-v1.68.0'
HealthHistory.MAX_WAREHOUSE_BYTES;  // soft cap
HealthHistory.MAX_SNAPSHOTS;        // 既有
// ...
```

### 9.2 授权与元数据

```ts
getWarehouseMeta(): Promise<WarehouseMeta>
isWarehouseConsentGranted(): Promise<boolean>

/**
 * 展示政策文案后由 UI 调用；requireAcknowledge=true 时必须带 ack token
 */
grantWarehouseConsent(opts: {
  policyVersion: string;
  retention?: Partial<WarehouseMeta['retention']>;
}): Promise<WarehouseMeta>

revokeWarehouseConsent(opts?: {
  clearData?: boolean; // default true
}): Promise<void>
```

### 9.3 读写仓

```ts
/** 将内存 HealthData 投影写入 domainChunks */
persistHealthData(
  data: HealthData,
  opts?: {
    batchId?: string | null;
    mode?: 'merge' | 'replace';
    domains?: WarehouseDomain[]; // 默认全域
  }
): Promise<{ meta: WarehouseMeta; bytesDelta: number }>

/** 组装 HealthData；无数据返回 null */
hydrateHealthData(opts?: {
  dateRange?: { start?: string; end?: string };
  domains?: WarehouseDomain[];
}): Promise<HealthData | null>

getDomainChunkStats(): Promise<WarehouseMeta['domainStats']>

deleteDomainChunks(filter: {
  domain?: WarehouseDomain;
  beforeDate?: string; // exclusive end
}): Promise<{ deletedChunks: number; freedBytes: number }>

clearWarehouse(): Promise<void>  // 保留 consent 或按 opts
```

### 9.4 配额

```ts
estimateWarehouseUsage(): Promise<{
  totalApproxBytes: number;
  byDomain: WarehouseMeta['domainStats'];
  storageEstimate?: { usage?: number; quota?: number } | null;
}>

enforceWarehouseQuota(): Promise<{ evicted: string[] }> // chunk ids
```

### 9.5 备份

```ts
exportBackup(opts?: {
  includeSnapshots?: boolean;    // default true
  includeEvents?: boolean;       // default true
  includeBatches?: boolean;      // default true
  includeReports?: boolean;      // default true
  includeUserContext?: boolean;  // default false
  passphrase?: string | null;    // null = 明文
}): Promise<Blob>  // application/json or zip

importBackup(
  file: Blob | ArrayBuffer | string,
  opts: {
    passphrase?: string;
    mode: 'replace'; // MVP
  }
): Promise<{ meta: WarehouseMeta }>
```

### 9.6 清除（扩展）

```ts
// 既有
clearAll(): Promise<void>           // 仅 snapshots
clearAllStores(): Promise<void>     // v4 全部 → v1.68 含 warehouse

// 新增
clearAllStores(): Promise<void>     // 扩展实现，文档化破坏性变更（仍叫同名）
```

### 9.7 会话编排（`app.js` 侧，非 HealthHistory 内）

```ts
// 伪 API 供实现阶段参考
async function tryRestoreSessionFromWarehouse(): Promise<boolean>
async function afterSuccessfulAnalysisPersistIfConsented(data, batchId): Promise<void>
```

---

## 10. UI 归属

### 10.1 信息架构（v1.66 工作区）

```
导航
├── 今日 (today)
├── 趋势 (trends)
├── 报告 (reports)
└── 更多 (more)
    └── step-export「数据管理」          ← v1.68 主入口
        ├── 导出 JSON / CSV / 就诊相关入口（既有）
        ├── 试验性 FHIR（折叠，既有）
        ├── 【新】本机原始数据仓
        │     ├── 授权开关 + 政策摘要
        │     ├── 占用与分域统计
        │     ├── 保留策略
        │     ├── 导出 / 导入备份
        │     └── 清空仓
        ├── 隐私与本机数据（一键清除，扩展文案）
        └── 摘要快照历史（既有）
```

对应 DOM：`#step-export` 已有标题「数据管理」（`export.title`）；在其内 **新增卡片/区块**，不要新开顶级工作区。

### 10.2 次要入口（可选）

| 入口 | 行为 |
|------|------|
| 上传成功后 toast | 未授权时：「可开启本机数据仓，刷新无需重传」（可关闭） |
| 今日空态 | 若仓有数据：主按钮「恢复上次数据」 |
| 隐私 wipe 确认框 | 列出将删除的类别（含原始仓） |

### 10.3 文案原则

- 用「本机数据仓 / 原始明细（解析后）」；避免「云盘」「同步」。  
- 与「摘要快照历史」用词区分：摘要 = KPI 环比；仓 = 可恢复明细。  
- 非诊断声明保持一票否决式可见。

### 10.4 草图（线框）

```
┌─────────────────────────────────────────┐
│ 数据管理                                │
│ 均在本机。摘要历史与原始数据仓相互独立。  │
├─────────────────────────────────────────┤
│ ┌ 本机原始数据仓 ─────────────────────┐ │
│ │ [○ 关闭 / ● 已开启]  2026-07-30 授权 │ │
│ │ 占用 32 MB（估算）· 184,210 条        │ │
│ │ CGM ████████░░ 24 MB                 │ │
│ │ 其它 █░░░░░░░░  8 MB                 │ │
│ │ 覆盖 2024-05-01 → 2026-07-28         │ │
│ │ [导出备份] [导入备份] [清空仓…]       │ │
│ └─────────────────────────────────────┘ │
│ ┌ 隐私与本机数据 ─────────────────────┐ │
│ │ 清除个人背景、摘要、事件、批次与原始仓│ │
│ │ [清除所有本机健康数据]               │ │
│ └─────────────────────────────────────┘ │
│ ┌ 摘要快照历史 ───────────────────────┐ │
│ │ （既有 ≤30 条）                      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 11. 分阶段落地与用户授权检查点

### 11.1 阶段划分

| 阶段 | 名称 | 范围 | 授权 |
|------|------|------|------|
| **P0** | 契约与开关 | `DB_VERSION=5`、`warehouseMeta`、consent API、UI 开关与文案、wipe 扩展（清空仓） | **检查点 A** |
| **P1** | MVP 可恢复 | `domainChunks` plain 读写、`persist` after analyze、`hydrate` on load、今日「恢复」空态 | 依赖 A 已授权 |
| **P2** | 增量与占用 | HAE 路径写回、占用 UI、软配额与淘汰、batch 扩展字段 | 检查点 B（可选保留策略） |
| **P3** | 备份完整 | `.hae-backup.json` 导出/导入、可选 zip、可选口令加密 | **检查点 C**（加密是否默认关） |
| **P4** | 硬化 | fflate 大 chunk、Storage estimate、E2E、i18n 全量、性能（Worker 写仓） | — |

### 11.2 需要用户明确授权的检查点

| 检查点 | 时机 | 用户动作 | 未通过时 |
|--------|------|----------|----------|
| **A. 开启数据仓** | 首次打开开关 | 读政策 → 勾选确认 → 开启 | 不写 domainChunks |
| **B. 调整保留/提高上限** | 改 rollingDays 或提高 cap | 确认可能保留更多敏感明细 | 维持旧值 |
| **C. 导出明文备份** | 导出时 | 警告备份含健康明细；可选改加密 | 可取消 |
| **D. 导入替换** | 恢复备份 | 双确认「将覆盖本机数据中心」 | 中止 |
| **E. 关闭授权** | 关开关 | 确认将删除仓内明细 | 保持开启 |
| **F. 一键清除** | 既有 wipe | 既有 confirm；文案含仓 | 中止 |

**产品层硬规则：** 任何 `persistHealthData` 在 `consent.granted!==true` 时必须 no-op 或 throw，并不得「先写后补授权」。

### 11.3 MVP 最小交付切片（建议实现顺序）

1. Meta + consent + wipe 扩展 + UI 开关（无真实大 payload）  
2. 全量 `replace` 持久化 / hydrate（可不做精妙月片合并，先按域 `all` 或月片朴素实现）  
3. 启动恢复  
4. 占用显示  
5. 备份明文导出/导入  
6. 配额淘汰  

### 11.4 明确不在 v1.68 实现期做的事

- 云同步、账号、家庭成员  
- FHIR 作为同步协议  
- 存 ZIP 原文  
- 默认开启授权  

---

## 12. 风险与回滚

### 12.1 风险登记

| 风险 | 等级 | 缓解 |
|------|------|------|
| iOS Safari 配额不足 / 被系统清除 | 高 | 占用可见；引导备份；失败文案；勿承诺「永久」 |
| 大 CGM 写入阻塞主线程 | 中高 | 分片事务；可选 Worker；压缩 |
| 静默改变隐私预期 | 高 | 默认关；政策版本；验收含文案检查 |
| schema 升级失败导致 IDB 打不开 | 中 | 迁移只增不删；feature detect；坏库时提示清除站点数据 |
| hydrate 与新版 `analyzeAll` 不兼容 | 中 | 存 HealthData 非 FullAnalysis；`formatVersion`；失败则提示重新导入 |
| 备份文件被误当 FHIR/临床交换 | 低 | 独立 magic 与扩展名；文档声明非临床交换格式 |
| `clearAllStores` 行为变强（多清仓） | 中 | 版本说明；e2e 覆盖 wipe |
| 双份真相（内存 vs 仓）不一致 | 中 | 单一写路径：分析成功后再 persist；恢复后以 hydrate 结果重算 |

### 12.2 回滚策略

| 层级 | 做法 |
|------|------|
| **功能开关** | 远程无需；用代码 flag `DATA_CENTER_ENABLED` 或检测 consent UI 未发布时不调用 persist |
| **DB 回滚** | IndexedDB version **不能降**；回滚版本必须仍能 open v5 并忽略新 store，或文档要求用户清除站点数据 |
| **产品回滚** | 隐藏 UI 开关；`persist` 成 no-op；wipe 仍清 v5 stores（兼容） |
| **数据回滚** | 用户用备份恢复；或 wipe 后重传 |

**发布纪律：** v5 迁移一旦进入 main/Pages，后续所有发布必须识别 v5 stores（即使功能隐藏）。

### 12.3 监控

无服务端指标；依赖：

- E2E：consent off 不写仓；on 可恢复；wipe 后 hydrate=null  
- 手工：真机 Safari 大 ZIP + 授权 + 杀进程重启  

---

## 13. 验收标准

### 13.1 功能

| # | 标准 | 类型 |
|---|------|------|
| A1 | 默认 `consent.granted === false`，完整导入后 IDB `domainChunks` 为空 | 自动 + 手动 |
| A2 | 授权流程需确认；取消则仍不落盘 | E2E |
| A3 | 授权后导入 → 刷新 → 无需选文件即可恢复 KPI/图表/提示词生成 | E2E/手动 |
| A4 | HAE 增量在 hydrate 基线上可继续 merge 并写回 | 手动/单测 |
| A5 | `clearAllStores` / 一键清除后：仓、摘要、事件、批次皆空，consent 复位 | E2E（扩展现 privacy 用例） |
| A6 | 关闭授权默认清空仓；摘要历史默认可保留 | E2E |
| A7 | 占用 UI 显示估算字节与分域 | 手动 |
| A8 | 超 soft cap 有警告；硬限制拒绝写入并提示 | 单测/手动 |
| A9 | 备份导出 magic/formatVersion 正确；导入 replace 后可 hydrate | E2E |
| A10 | 未授权时产品行为与 v1.66/1.67 无回归（smoke + e2e 全绿） | CI |

### 13.2 隐私与文案

| # | 标准 |
|---|------|
| P1 | 无网络请求携带健康明细（既有本地原则） |
| P2 | 数据管理与 wipe 文案明确包含「原始数据仓」 |
| P3 | 非诊断声明未弱化 |
| P4 | 备份导出前有敏感数据警告 |

### 13.3 性能（指导性）

| # | 标准 |
|---|------|
| S1 | 典型 30 MB 仓 hydrate + analyze 在桌面 Chrome ≤ 5 s（指导） |
| S2 | 写入不导致 > 3 s 无进度的主线程冻结（需进度或分片） |

### 13.4 非目标验收（反例）

| # | 不应出现 |
|---|----------|
| X1 | 默认开启仓 |
| X2 | 上传明细到项目后端 |
| X3 | 把 FHIR Bundle 当作仓同步协议 |
| X4 | 持久化完整 export.zip 二进制 |

---

## 14. 附录：草图与决策清单

### 14.1 架构总图

```
                    ┌─────────────────┐
                    │  用户文件        │
                    │ ZIP/XML/HAE/CSV │
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │  parser / hae   │
                    │  → HealthData   │
                    └────────┬────────┘
                             ▼
              ┌──────────────────────────┐
              │ analyzeAll → FullAnalysis│
              │ currentAnalysis (内存)   │
              └────────────┬─────────────┘
                           │
            consent? ──────┼────────────────────────┐
               no          yes                      │
               ▼           ▼                        │
        仅 importBatches  persistHealthData         │
        + 可选 snapshot   domainChunks + meta       │
                           │                        │
                           ▼                        │
                    刷新 / 重开 PWA                   │
                           │                        │
                           ▼                        │
                    hydrateHealthData ──────────────┘
```

### 14.2 与现有模块边界

| 模块 | 职责变化 |
|------|----------|
| `history-db.js` | DB v5、仓 API、wipe 扩展 |
| `app.js` | 授权 UI、启动恢复、分析后 persist、备份入口 |
| `lib/src/types.ts` | 可选点级字段；备份类型可放 lib 或仅 UI |
| `lib/src/provenance.ts` | batch additive 字段 normalize |
| `lib/src/hae-import.ts` | 去重逻辑不搬迁；只消费/产出 HealthData |
| FHIR / clinical-report | 无必须变更；输入仍是 FullAnalysis |

### 14.3 待产品拍板（决策清单）

见完成报告「需要用户拍板的 3–5 个产品决策」；正文内嵌默认建议如下：

1. **默认保留策略：** 不按天滚动，仅配额淘汰最旧 CGM 月片。  
2. **关授权即删仓：** 是。  
3. **备份默认明文：** 是；加密为高级选项。  
4. **恢复策略 MVP：** 仅 replace，不做三方 merge。  
5. **启动行为：** 有仓且已授权时自动 hydrate（可设置改为手动「恢复」）。

### 14.4 文档修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 草案 v1 | 2026-07-30 | 首版设计，对齐 history-db v4 与 v1.66 IA |

---

## 相关文件（实现时只读对照）

| 路径 | 说明 |
|------|------|
| `web-ui/public/history-db.js` | 当前 IDB v4 与 `HealthHistory` |
| `web-ui/public/app.js` | `currentAnalysis`、wipe、importBatches 接线 |
| `web-ui/public/index.html` | `#step-export` 数据管理 / 隐私 |
| `lib/src/types.ts` | `HealthData` / `FullAnalysis` |
| `lib/src/snapshot.ts` | 摘要快照（非明细） |
| `lib/src/provenance.ts` | `ImportBatchRecord` |
| `lib/src/hae-import.ts` | 增量合并与去重 |
| `docs/README.md` | 产品叙事与版本史 |

---

*本文为 v1.68 产品/架构设计文档，不构成医疗建议；实现须保持「本地优先、非诊断、可一键清除」。*
