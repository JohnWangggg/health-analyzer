# v1.68 本地个人健康数据中心（Local Personal Health Data Center）

**状态：** 设计 + **已实现**（v1.68 MVP → **v1.75** `core|full` + `cgm|YYYY-MM` → **v1.79–v1.81** `bloodPressure|YYYY` / `weight|YYYY` 年分片、面板删片、保留近 N 月/年 → **v1.82** 双域一键 keep-N 年 → **v1.83** 保存后可选自动 keep-N 裁剪 → **v1.85** `sleep|YYYY` / `steps|YYYY` 年分片 → **v1.86** `hrv|YYYY` / `restingHr|YYYY` / `walkingHr|YYYY` 年分片 → **v1.87** `workouts|YYYY` / `ecg|YYYY` / `watchDaily|YYYY` 年分片（与其它年分片**域独立**删片）→ **v1.88** **thin core** 全量分片后、`migrateLegacyCoreToShards`、分片清单导出 `exportShardInventory`、**全域 keep-all 年** → **v1.89** 仓与导入批次联动 `lastImportBatchId`、仓面板导入批次摘要、**配额预测 UI**（客户端按分片 `approxBytes` 估算）；兼容 legacy `healthData|full`）  
**范围：** 浏览器本机 IndexedDB 持久化「解析后的 typed 健康仓」+ 授权、配额、备份/清除、分片淘汰与手动/可选自动裁剪  
**语言 / Language：** 中文（关键术语中英对照）  
**对照实现基线：** `web-ui/public/legacy/history-db.js`（`DB_VERSION = 5`，`WAREHOUSE_POLICY_VERSION` 随产品迭代，如 `data-center-v1.89.0`+）、`lib/src/types.ts`（`HealthData`）、`lib/src/provenance.ts`（`ImportBatchRecord`）、v1.66 工作区（今日 / 趋势 / 报告 / **更多**）；UI 偏好与自动裁剪见 `web-ui/public/legacy/app.js`

> 本地隐私优先 · 零服务器 · 非诊断 · 默认不上传  
> 产品默认：自动 hydrate、关授权即删仓、软/硬字节配额、备份默认明文（可选口令 AES-GCM）、恢复整库替换。分片与口令加密**已落地**（见 §4.2 / §6 / §8）。

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
  /** 分片键：CGM 月 'YYYY-MM'；BP/体重/睡眠/步数/HRV/静息·步行心率年 'YYYY'；core 为 'full'；legacy 可读 'full' 单片 */
  shardKey: string; // 实现字段名亦作 `shard`
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

### 4.2 按域分片策略（推荐 / 已实现基线）

**当前写入布局（`layout: 'sharded-v1'`，`history-db.js`）：**

| Chunk id | 域 | 分片键 | payload |
|----------|-----|--------|---------|
| `core\|full` | core | `full` | **Thin core（v1.88）**：除 CGM / 血压 / 体重 / 体脂 / **睡眠 / 步数**（v1.85+）/ **HRV / 静息·步行心率**（v1.86+）/ **Workout / ECG / Watch 日汇总**（v1.87+）年分片后外的 `HealthData` 字段；**不得**再嵌套上述域的数组/日 map |
| `cgm\|YYYY-MM` | `cgm` | 自然月 | `CgmPoint[]` |
| `bloodPressure\|YYYY` | `bloodPressure` | 自然年 | `BloodPressureRecord[]` |
| `weight\|YYYY` | `weight` | 自然年 | `{ weight, bodyFat }`（**体脂并入体重年片**，无独立 `bodyFat|…` 片） |
| `sleep\|YYYY` | `sleep` | 自然年 | **日 map 切片**（见下；v1.85+） |
| `steps\|YYYY` | `steps` | 自然年 | **日 map 切片**（见下；v1.85+） |
| `hrv\|YYYY` | `hrv` | 自然年 | `{ hrv, hrvOvernight }`（**过夜 HRV 并入 HRV 年片**；v1.86+） |
| `restingHr\|YYYY` | `restingHr` | 自然年 | **日 map 切片** `Record<YYYY-MM-DD, number>`（v1.86+） |
| `walkingHr\|YYYY` | `walkingHr` | 自然年 | **日 map 切片** `Record<YYYY-MM-DD, number>`（v1.86+） |
| `workouts\|YYYY` | `workouts` | 自然年 | **`WorkoutSession[]` 数组**（按 `startDate` 年桶；v1.87+） |
| `ecg\|YYYY` | `ecg` | 自然年 | **`ERecordSummary[]` 数组**（按 `date` / `datetime` 年桶；**不存**波形 CSV；v1.87+） |
| `watchDaily\|YYYY` | `watchDaily` | 自然年 | **日 map 切片** `Record<YYYY-MM-DD, WatchDaySummary>`（v1.87+） |

兼容：仍可读 legacy 单片 `healthData|full`；无 BP/体重年片时回退 core 内嵌数组（v1.75 仅 CGM 分片时代数据）；**无 sleep/steps 年片时**回退 core 内 `sleep` / `steps` 全日 map（v1.84 及更早）；**无 hrv/restingHr/walkingHr 年片时**回退 core 内对应全日 map（v1.85 及更早）；**无 workouts/ecg/watchDaily 年片时**回退 core 内对应数组/map（v1.86 及更早）。

| 域 | 形态（对齐 `types.ts`） | 分片粒度 | 说明 |
|----|-------------------------|----------|------|
| `cgm` | `CgmPoint[]` | **按月** `YYYY-MM` | 体量最大；月片利于淘汰、多选删除、保留近 N 月 |
| `bloodPressure` | `BloodPressureRecord[]` | **按年** `YYYY`（v1.79+） | 条数通常远小于 CGM；面板可单年/多选删、保留近 N 年 |
| `weight` / `bodyFat` | 数组 | **按年** `weight\|YYYY`（v1.79+） | 体脂 rides with 体重年片；删年则两者同删 |
| `sleep` | `Record<YYYY-MM-DD, { total, deep, rem, core, awake }>` | **按年** `sleep\|YYYY`（v1.85+） | 按日期键前缀 `YYYY` 分桶；payload 为**该年日 map**（非整数组） |
| `steps` | `Record<YYYY-MM-DD, { watch, iphone, max }>` | **按年** `steps\|YYYY`（v1.85+） | 同上；与 sleep **域独立**（删 sleep 年不影响 steps 同年） |
| `hrv` / `hrvOvernight` | `Record<YYYY-MM-DD, number[]>` | **按年** `hrv\|YYYY`（v1.86+） | 过夜 HRV **rides with** HRV 年片：`payload = { hrv, hrvOvernight }`；删年则两者同删 |
| `restingHr` | `Record<YYYY-MM-DD, number>` | **按年** `restingHr\|YYYY`（v1.86+） | 日 map 切片；与 hrv / walkingHr **域独立** |
| `walkingHr` | `Record<YYYY-MM-DD, number>` | **按年** `walkingHr\|YYYY`（v1.86+） | 日 map 切片；与 hrv / restingHr **域独立** |
| `workouts` | `WorkoutSession[]` | **按年** `workouts\|YYYY`（v1.87+） | **数组** payload；年键优先 `startDate`（回退 `date` / `start` / `datetime`）；与 ecg / watchDaily **域独立** |
| `ecg` | `ERecordSummary[]` | **按年** `ecg\|YYYY`（v1.87+） | **数组** payload；年键 `date` / `startDate` / `datetime` / `recordedAt`；**仅摘要**（分类/设备等），**禁止**波形采样 CSV |
| `watchDaily` | `Record<YYYY-MM-DD, WatchDaySummary>` | **按年** `watchDaily\|YYYY`（v1.87+） | **日 map** payload（与 sleep 同类）；Watch 已是日汇总，**禁止**再拆逐条 HR |
| `availability` | `{ dataAvailability, dataQuality }` | 写入 core | 小对象 |

#### 4.2.1 睡眠 / 步数年分片（v1.85）

**为何独立于 core：** 多年日 map 随导入变大；按自然年拆片后可按年删除、与 BP/体重一致的 keep-N 扩展，并避免删某一域误伤另一域。

**payload 形态（map，非点数组）：**

```ts
// sleep|2025  — keys 均为该自然年内的 YYYY-MM-DD
{
  '2025-03-10': { total: 7.2, deep: 1.1, rem: 1.5, core: 4.2, awake: 0.4 },
  '2025-08-12': { total: 6.8, deep: 1.0, rem: 1.4, core: 4.0, awake: 0.4 }
}

// steps|2025
{
  '2025-02-01': { watch: 8000, iphone: 2000, max: 8000 },
  '2025-11-01': { watch: 9500, iphone: 1000, max: 9500 }
}
```

- **Hydrate：** 合并各 `sleep|YYYY` / `steps|YYYY` 的 map 键值到 `HealthData.sleep` / `.steps`；若无年片则沿用 core 内 map。  
- **Persist：** 从全日 map 按日期键 `slice(0,4)` 分年写片；写入后 **core 内 `sleep` / `steps` 应为空 map**（与 BP 从 core 剥离一致）。  
- **域独立删除：** `deleteDomainYearShards('sleep', ['2025'])`（或 `deleteSleepYearShards`）只删 `sleep|2025`，**同年** `steps|2025` / `bloodPressure|2025` / `weight|2025` **保留**。  
- **状态字段：** `getWarehouseStatus()` 暴露 `sleepYears` / `stepsYears`（`string[]`，有数据的自然年），及可选 `yearDetails.sleep` / `.steps`。

#### 4.2.2 HRV / 静息心率 / 步行心率年分片（v1.86）

**为何独立于 core：** 与 sleep/steps 相同——多年日 map（尤其 HRV 数组）随导入膨胀；按年拆片后可分域删年，且 HRV 与静息/步行心率互不误伤。

**payload 形态：**

```ts
// hrv|2025  — overnight rides with daytime HRV（无独立 hrvOvernight|… 片）
{
  hrv: {
    '2025-03-10': [42.5, 45.1],   // date -> number[]
    '2025-08-12': [40.0, 41.2]
  },
  hrvOvernight: {
    '2025-03-10': [38.0],         // date -> number[]（通常 [00:00, 09:00)）
    '2025-08-12': [37.5]
  }
}

// restingHr|2025
{
  '2025-02-01': 58,               // date -> number (bpm)
  '2025-11-01': 56
}

// walkingHr|2025
{
  '2025-02-01': 98,
  '2025-11-01': 102
}
```

- **Hydrate：** 合并各 `hrv|YYYY` 的 `payload.hrv` / `payload.hrvOvernight` 到 `HealthData.hrv` / `.hrvOvernight`；合并 `restingHr|YYYY` / `walkingHr|YYYY` 日 map；若无年片则沿用 core 内 map。  
- **Persist：** 从全日 map 按日期键 `slice(0,4)` 分年写片；**hrv 与 hrvOvernight 同年写入同一 `hrv|YYYY` 片**；写入后 **core 内 `hrv` / `hrvOvernight` / `restingHr` / `walkingHr` 应为空 map**。  
- **域独立删除：**  
  - `deleteDomainYearShards('hrv', ['2025'])`（或 `deleteHrvYearShards`）只删 `hrv|2025`（含过夜），**同年** `restingHr|2025` / `walkingHr|2025` / sleep/steps/BP/weight **保留**。  
  - `deleteDomainYearShards('restingHr', ['2025'])`（或 `deleteRestingHrYearShards`）只删静息年片，**不影响** walkingHr / hrv 同年。  
  - 同理 `walkingHr`。  
- **状态字段：** `getWarehouseStatus()` 暴露 `hrvYears` / `restingHrYears` / `walkingHrYears`（`string[]`），及可选 `yearDetails.hrv` / `.restingHr` / `.walkingHr`。

#### 4.2.3 Workout / ECG / Watch 日汇总年分片（v1.87）

**为何独立于 core：** 多年 Workout 会话与 ECG 摘要数组、以及 `watchDaily` 日 map 随导入膨胀；按自然年拆片后可分域删年，且 **workouts / ecg / watchDaily 三域互不连带**（删 workouts 某年不影响同年 ECG / Watch）。

**两种 payload 形态（数组 vs 日 map）：**

```ts
// workouts|2025  — 数组（与 BP 同类）
[
  {
    startDate: '2025-06-01T10:00:00',
    date: '2025-06-01',
    activityType: 'Walking',
    activityLabel: '步行',
    durationMin: 30,
    activeKcal: 120
  }
]

// ecg|2025  — 数组；仅 ERecordSummary，无波形点
[
  { datetime: '2025-03-01T09:00:00', classification: '窦性心律' }
]

// watchDaily|2025  — 日 map（与 sleep 同类；非数组）
{
  '2025-07-01': {
    activeKcal: 400,
    exerciseMin: 40,
    standMin: 12,
    // …WatchDaySummary 其余能量/血氧汇总字段
  }
}
```

| Chunk id | payload 类型 | 年桶字段 |
|----------|--------------|----------|
| `workouts\|YYYY` | **数组** `WorkoutSession[]` | `startDate` → 否则 `date` / `start` / `datetime` |
| `ecg\|YYYY` | **数组** `ERecordSummary[]` | `date` → 否则 `startDate` / `datetime` / `recordedAt` |
| `watchDaily\|YYYY` | **日 map** `Record<YYYY-MM-DD, WatchDaySummary>` | 日期键前缀 `YYYY`（`yearKeyFromDateMapKey`） |

- **Hydrate：** 合并各年 `workouts|YYYY` 数组成 `HealthData.workouts`；合并 `ecg|YYYY` 成 `ecg`；合并 `watchDaily|YYYY` map 键值到 `watchDaily`；若无年片则沿用 core 内嵌数组/map。  
- **Persist：** 按年桶写片后，**core 内 `workouts` / `ecg` 应为空数组、`watchDaily` 应为空 map**（与 BP / sleep 从 core 剥离一致）。  
- **域独立删除：**  
  - `deleteDomainYearShards('workouts', ['2025'])`（或 `deleteWorkoutsYearShards`）只删 `workouts|2025`，**同年** `ecg|2025` / `watchDaily|2025` / sleep/steps/hrv/BP/weight **保留**。  
  - 同理 `ecg` / `watchDaily`（`deleteEcgYearShards` / `deleteWatchDailyYearShards` 薄封装可选）。  
- **状态字段：** `getWarehouseStatus()` 暴露 `workoutsYears` / `ecgYears` / `watchDailyYears`（`string[]`），及可选 `workoutsYearDetails` / `ecgYearDetails` / `watchDailyYearDetails`。  
- **UI 折叠（collapse UX）：** 仓面板年分片列表随域增多，建议用 `<details class="warehouse-shard-group">`（或等价）按域折叠；默认折叠次要域、展开有数据域；**非诊断**文案；删年确认仍走 dialog。手测见 `docs/MANUAL_QA.md`。

#### 4.2.4 Thin core · 迁移 · 分片清单 · 全域 keep-all 年（v1.88）

**Thin core after full sharding**

- 全量写入（`persistHealthDataWarehouse` → `splitHealthDataShards`）后，`core|full` **只**保留未年/月分片的小字段（`dataAvailability` / `dataQuality` 等）。
- 下列域必须落在独立 chunk，**core 内对应字段为空数组或空 map**：
  - 月：`cgm|YYYY-MM`
  - 年：`bloodPressure` / `weight`（含 bodyFat）/ `sleep` / `steps` / `hrv`（含 overnight）/ `restingHr` / `walkingHr` / `workouts` / `ecg` / `watchDaily`
- Hydrate 时 `reassembleFromChunks` 合并各片 → 完整 `HealthData`；分析路径不变。

**`migrateLegacyCoreToShards()`**

| 项 | 说明 |
|----|------|
| 用途 | 将 **legacy** `healthData\|full` 或「胖 core」（core 内仍嵌套多年 BP/睡眠等）**一次性**投影为 `sharded-v1` + thin core |
| 返回 | `{ ok, upgraded, layout?, meta? }`：`upgraded: true` 表示发生了重写；**已是 thin sharded 时 `upgraded: false` 且 `ok: true` 合法** |
| 前置 | 须 `consent.granted`；走 `warehouseWriteChain` 串行 |
| 幂等 | 重复调用安全；不丢未分片域数据 |

**`exportShardInventory()`（或 `exportWarehouseInventory`）**

- 导出**仅元数据**的分片清单 JSON（可下载 / 复制）：chunk `id`、domain、shard 键、`recordCount`、`approxBytes`、可选 date 范围。
- **禁止**包含：`payload`、血压 `systolic`/`diastolic`、体重/CGM 数值、睡眠日明细、HRV 数组等原始时序。
- 用途：占用审计、支持工单「有哪些分片」而不泄露健康明细；与「复制仓状态摘要」互补（清单更偏 chunk 级 id 列表）。
- UI 可选按钮：`#btn-warehouse-export-inventory`（若上线）。

**全域 keep-all 年（global keep-all years）**

- 在「双域 BP+体重 keep-N」（v1.82）之上，**一次**对**所有年分片域**执行 keep-N（至少 BP / weight / sleep；实现可扩展到 steps/hrv/resting/walking/workouts/ecg/watchDaily）。
- API 候选名（实现择一暴露即可）：`keepAllDomainYearShardsRecent(N)` / `keepRecentYearShardsAll(N)` / `keepAllYearShardsRecent(N)`。
- UI（已接线）：`#btn-warehouse-years-keep-all-domains` + 共用年数 select（`health-analyzer-year-keep-years`）；确认对话框后分域串行删旧年；**非诊断**文案。
- 迁移 / 清单 UI：`#btn-warehouse-migrate-shards`、`#btn-warehouse-export-inventory`。
- 与分域 keep-N、auto-trim（v1.83）并存：全域按钮是手动批量入口；不替代软/硬配额。

#### 4.2.5 导入批次联动 · 配额预测（v1.89）

**批次联动（batch linkage · `lastImportBatchId`）**

| 项 | 说明 |
|----|------|
| 写入 | `persistHealthDataWarehouse(data, { batchId })` 将 `warehouseMeta.lastImportBatchId = batchId`（缺省则保留上次） |
| 分片 | 各 `domainChunks` 行可带同一次写入的 `batchId`（摘要级；非点级 provenance） |
| 读取 | `getWarehouseStatus().meta.lastImportBatchId` / `loadHealthDataWarehouse().meta.lastImportBatchId` |
| 批次 store | 既有 `importBatches`（≤50）：`saveImportBatch` / `listImportBatches` / `getImportBatch`；与仓 **同库**、可独立 wipe |
| Hydrate | 恢复分析时可把 `lastImportBatchId` 并入会话 `sourceBatchIds`，供报告 provenance 过滤 |
| UI | 可选 `#warehouse-import-batches`：展示最近导入批次摘要（id 短码 / 来源 / 文件数 / 时间）；**无** raw 时序；非诊断 |

流水线（授权开启时，与 §5.2 一致）：

```text
解析/合并 → saveImportBatch(record)
         → persistHealthDataWarehouse(data, { batchId: record.id })
         → meta.lastImportBatchId + chunk.batchId
```

**配额预测 UI（quota forecast · client-side）**

| 项 | 说明 |
|----|------|
| 输入 | `getWarehouseStatus()`：`approxBytes`、`softBytes`（默认 150 MB）、`hardBytes`（200 MB）、各域/分片 `*Details[].approxBytes` |
| 计算 | **纯前端**：`pct = approxBytes / softBytes`；可选按域汇总「若再导入一年 CGM / 多一年血压…」的粗估（用现有分片均值 × 预期片数） |
| 展示阈值 | 建议占用 **≥ ~70% 软配额** 时展开 `#warehouse-quota-forecast` 提示；低于阈值可 **hidden**（元素仍可在 DOM） |
| 文案 | 引导备份 / keep-N / 删旧分片；**非诊断**；不声称云端或系统真实剩余磁盘 |
| 与配额条关系 | 既有 `#warehouse-quota-bar` 显示当前占比；forecast 为**前瞻**文案/估算，不替代软/硬拒绝逻辑（§6） |

E2E：`e2e/warehouse.spec.js` → `v1.89 import batches…`（硬 API：`saveImportBatch` + `listImportBatches` + `persist` `batchId` + `lastImportBatchId`）/ `v1.89 quota forecast soft…`（软：元素存在或明确 skip；小样例通常 &lt;70% 软配额）。

#### 4.2.6 批次 → 分片反向索引（v1.90）

**动机：** v1.89 已在每次 `persistHealthDataWarehouse(data, { batchId })` 时把同一 `batchId` 写入当次的 `domainChunks` 行与 `warehouseMeta.lastImportBatchId`。用户与报告侧需要 **从批次反查「写了哪些分片」**（摘要级），而无需扫全仓或加载 raw 时序。

| 项 | 说明 |
|----|------|
| 写入（已有） | 各 `domainChunks` 行字段 `batchId?: string \| null`（与 `persist(..., { batchId })` 一致）；`meta.lastImportBatchId` |
| 索引 | 设计表 `domainChunks` 含 `batchId` 索引（见 §3.2）；实现可用 IDB index 或全表扫 + 过滤（数据量受软/硬配额约束） |
| 单批反查 | **`listWarehouseChunksByBatchId(batchId)`** → `{ ok, batchId, chunks, chunkCount, totalApproxBytes }`；`chunks[]` 为 **meta 行** |
| 全量反向索引 | **`getImportBatchShardIndex({ limit? })`** → `{ ok, batches: [{ batchId, chunkCount, totalApproxBytes, domains, shards }] }`（按批汇总，可选 limit） |
| 行形状（meta only） | 至少：`id`（如 `core\|full`、`bloodPressure\|YYYY`、`cgm\|YYYY-MM`）、`domain`、`shard`；可选 `approxBytes` / `recordCount` / `updatedAt` |
| **禁止** | 返回体 **不得** 含 `payload`、血压点数组、CGM 点值、睡眠日 map 等 raw；与 `exportShardInventory` 同级隐私 |
| 空结果 | 未知 / 已清空批次 → `{ ok: true, chunks: [] }` 或 `batches: []`（不抛） |
| UI | `#warehouse-import-batches` 点击批次 → `#warehouse-batch-shards` 展示该批分片 id（无 raw）；全局 **`#connectivity-banner`**：`navigator.onLine` + `offline`/`online`，恢复可 toast |

流水线（相对 v1.89 只增「反查」）：

```text
saveImportBatch(record)
  → persistHealthDataWarehouse(data, { batchId: record.id })
  → meta.lastImportBatchId + chunk.batchId
  → listWarehouseChunksByBatchId(record.id)  // 或 getImportBatchShardIndex
       → [ { id: 'core|full', … }, { id: 'bloodPressure|2026', … }, … ]  // 无 payload
```

E2E：`e2e/warehouse.spec.js` → `v1.90 batch→shard index…`（**硬** API：缺 `listWarehouseChunksByBatchId` / `getImportBatchShardIndex` 即失败；assert chunk ids 含 `core|full` 或域年/月、**无** payload / 临床字段）；`e2e/connectivity.spec.js` → offline banner（**软**：`#connectivity-banner` 不存在则 skip）。

#### 4.2.7 客户端分片过滤 · 来源时间线合成（v1.91）

**动机：** 多域年/月分片列表变长后，用户需要 **本机客户端过滤** 快速定位某年/月，而无需删片或重载。另将 **导入批次 + 仓写入** 合成为可读的 **provenance 时间线**（摘要级，非点级、非诊断），便于「这次导入写了什么」的回顾。

**客户端分片过滤（client shard filter）**

| 项 | 说明 |
|----|------|
| 控件 | **`#warehouse-shard-filter`**（文本输入；占位如「过滤年/月…」） |
| 作用域 | 仅 **UI 显示层**：年分片行（`#warehouse-*-year-list li`，`data-year`）与 CGM 月行（`#warehouse-cgm-month-list li`，`data-cgm-month`） |
| 匹配 | 子串匹配 shard 键 / 年 / 月标签（如输入 `2025` 保留含 2025 的年片与 `2025-MM` 月片；不区分大小写可选） |
| 行为 | 不匹配行 `hidden` / `is-filtered-out` / `display:none` 等；控件或面板可加 **`filter-active` / `is-filtering` / `has-shard-filter`** 类 |
| 清空 | 清空输入 → 恢复全部行、去掉 active 类；**不**改 IDB、不删分片、不触发 persist |
| 非目标 | 非服务端查询、非云同步、非诊断筛选；不替代 keep-N / 删年 / 配额淘汰 |

**来源时间线合成（provenance timeline composition）**

| 项 | 说明 |
|----|------|
| 容器 | **`#warehouse-provenance-timeline`**（列表区域；`ul`/`ol` 或等价 item 容器） |
| 输入 | `listImportBatches()`（≤50）+ 仓 `meta.lastImportBatchId` + 可选 `getImportBatchShardIndex` / chunk 行 `batchId`（v1.89–v1.90） |
| 项内容（meta only） | 时间、短 batch id、来源（hae/xml/…）、文件数或字节摘要、可选贡献分片计数；**禁止** systolic/CGM 点值/睡眠日 map 等 raw |
| 合成规则 | 按 `createdAt` 降序；最近写入批次与 `lastImportBatchId` 可高亮；空仓或无批次 → 空列表或简短「暂无导入批次」 |
| 与既有 UI | 与 `#warehouse-import-batches` / `#warehouse-batch-shards` **互补**（时间线偏时间序回顾；批次面板偏点选反查分片） |

流水线（相对 v1.90 只增「展示合成」）：

```text
saveImportBatch(record)
  → persistHealthDataWarehouse(data, { batchId: record.id })
  → meta.lastImportBatchId + chunk.batchId
  → UI: #warehouse-provenance-timeline  ← listImportBatches + lastImportBatchId (+ optional reverse index)
  → UI: #warehouse-shard-filter        ← 仅过滤年/月列表 DOM（客户端）
```

E2E（**serial** `e2e/warehouse.spec.js`）：

- `v1.91 shard filter soft/hard…`：grant + 多年 BP/sleep + 多月 CGM → reload hydrate → more 仓面板；**若** `#warehouse-shard-filter` 存在则输入 `2025` 断言部分年/月行隐藏或 filter-active 类，清空后恢复；**缺失则 soft log**。
- `v1.91 provenance timeline soft/hard…`：`saveImportBatch` + `persist(..., { batchId })` 硬断言 `lastImportBatchId`；**若** `#warehouse-provenance-timeline` 存在则至少一条 `li`/item；**缺失则 soft log**。

#### 4.2.8 今日仓状态 chip · 趋势仓提示（v1.92）

**动机：** 用户在 **今日 / 趋势** 工作区也应感知「本机仓已启用且已恢复」，而不必每次进入 **更多 → 数据仓**。展示仅为 **meta 状态 chrome**（授权 / 占用摘要 / 分片概况），**禁止** 临床点值。

| 项 | 说明 |
|----|------|
| 今日 chip | **`#warehouse-today-chip`**：hydrate 且有仓后，在今日工作区可见；文案 meta only（如「本机仓已恢复」/ 占用短摘要）；未授权或 wipe 后隐藏或降级 |
| 趋势 hint | **`#warehouse-trends-hint`**：趋势工作区提示当前序列可来自本机仓恢复 / 可去数据管理管理分片；**不**遮挡主指标控件 |
| 非目标 | 非云同步状态、非诊断、非 raw 时序预览 |

E2E（**serial** `e2e/warehouse.spec.js`）：

- `v1.92 today chip soft/hard…`：grant + persist → reload hydrate → today；**若** `#warehouse-today-chip` 存在则可见且无临床点值；**缺失则 soft log**。
- `v1.92 trends hint soft…`：同上 seed → trends；**若** `#warehouse-trends-hint` 存在则 attached / 优选可见；**缺失则 soft log**。

真机大 ZIP / 本机解析与仓耗时基线（**不提交个人导出**）：见 `docs/REAL_DEVICE_ZIP.md`。

**默认不入仓：**

- Apple Health 未映射的未知 HAE metric 时序（与 v1.40「不落库未知序列」一致，除非未来单独授权）  
- Workout GPS 轨迹 GPX  
- ECG 原始采样点 CSV（**仅** `ERecordSummary` 摘要可入 `ecg|YYYY`）  
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

**策略 A（已实现默认）：配额驱动 FIFO by 分片**

1. 当估算占用超过 **软配额**（`WAREHOUSE_SOFT_BYTES` = 150 MB）：  
2. **先**按月淘汰最旧 **CGM 月片**（尽量至少保留最新一个月；单月仍超则点级裁剪兜底）；  
3. **再**淘汰最旧 **血压 / 体重 / 睡眠 / 步数 / HRV / 静息·步行心率 / Workout / ECG / Watch 日汇总年片**（跨域按最旧自然年推进；尽量至少保留一个有数据年；v1.85 起含 `sleep|YYYY` / `steps|YYYY`；v1.86 起含 `hrv|YYYY` / `restingHr|YYYY` / `walkingHr|YYYY`；v1.87 起含 `workouts|YYYY` / `ecg|YYYY` / `watchDaily|YYYY`）；  
4. 更新 `warehouseMeta`（`cgmMonths` / `bpYears` / `weightYears` / `sleepYears` / `stepsYears` / `hrvYears` / `restingHrYears` / `walkingHrYears` / `workoutsYears` / `ecgYears` / `watchDailyYears`、`notes` 如 `cgm_months_evicted_for_quota`）；写 UI toast 提示。  
5. **硬配额**（200 MB）：拒绝 persist（`reason: 'quota_hard'`），不半写。  
6. **不自动删** `healthEvents` / 用户周报 / 摘要 snapshots。

**策略 B：用户手动「仅保留近 N」**（v1.78–v1.82 UI，不替代软/硬配额）

| 域 | 保留选项 | 行为 |
|----|----------|------|
| CGM | 近 **3 / 6 / 12 / 24** 个月 | 删除早于「最新 N 个月」的 `cgm|YYYY-MM` |
| 血压 | 近 **1 / 2 / 3 / 5** 年 | 删除早于「最新 N 个有数据年」的 `bloodPressure|YYYY` |
| 体重（含体脂） | 近 **1 / 2 / 3 / 5** 年 | 同上，`weight|YYYY` |
| 睡眠（v1.85+） | 近 **1 / 2 / 3 / 5** 年（若 UI 暴露） | 删除更旧 `sleep|YYYY`；**不**删 steps/BP/weight 同年片 |
| 步数（v1.85+） | 同上 | 删除更旧 `steps|YYYY`；与 sleep **域独立** |
| HRV（v1.86+） | 近 **1 / 2 / 3 / 5** 年（若 UI 暴露） | 删除更旧 `hrv|YYYY`（含过夜）；**不**删 resting/walking 同年片 |
| 静息心率（v1.86+） | 同上 | 删除更旧 `restingHr|YYYY`；与 hrv / walking **域独立** |
| 步行心率（v1.86+） | 同上 | 删除更旧 `walkingHr|YYYY`；与 hrv / resting **域独立** |
| Workout（v1.87+） | 近 **1 / 2 / 3 / 5** 年（若 UI 暴露） | 删除更旧 `workouts|YYYY`；**不**删 ecg / watchDaily 同年片 |
| ECG（v1.87+） | 同上 | 删除更旧 `ecg|YYYY`；与 workouts / watchDaily **域独立** |
| Watch 日汇总（v1.87+） | 同上 | 删除更旧 `watchDaily|YYYY`；与 workouts / ecg **域独立** |
| **双域一键（v1.82）** | 同上 N | 「双域仅保留近 N 年」**一次**对血压 + 体重各裁 keep-N（两域共用同一 N / 同一偏好键） |
| **全域 keep-all 年（v1.88）** | 同上 N | 「所有年分片仅保留近 N 年」**一次**裁剪全部（或主要）年分片域；确认后执行；API 见 §4.2.4 |

- 偏好记在 **localStorage**（**非云、不上传**）。键示例：
  - `health-analyzer-cgm-keep-months`（CGM 保留月数）
  - `health-analyzer-year-keep-years`（血压 / 体重共用保留年数；面板上 BP / 体重各有 select，值同步）
- 手动 keep-N（含双域 / **全域**按钮）有确认对话框；删除不可撤销（可先备份）。
- 另支持：**多选删除** CGM 月 / BP 年 / weight 年 / **sleep 年 / steps 年 / hrv 年 / restingHr 年 / walkingHr 年 / workouts 年 / ecg 年 / watchDaily 年**（`deleteCgmMonthShards` / `deleteDomainYearShards(domain, years)`；v1.85 域含 `'sleep' | 'steps'`；v1.86 域含 `'hrv' | 'restingHr' | 'walkingHr'`；v1.87 域含 `'workouts' | 'ecg' | 'watchDaily'`；亦可有 `deleteWorkoutsYearShards` / `deleteEcgYearShards` / `deleteWatchDailyYearShards` 等薄封装）。

**策略 C：滚动天数（设计可选）**

- 删除 `dateEnd < today - rollingDays` 的 chunks。  
- 当前产品默认**不**按天自动滚动；保留窗口依赖配额淘汰 + 手动 keep-N + **可选**自动 keep-N（策略 D）。

**策略 D：保存后可选自动 keep-N 裁剪（v1.83）**

- **Opt-in**，默认**关闭**。偏好键：`health-analyzer-warehouse-auto-trim`（localStorage；勾选「保存后自动按保留窗口裁剪」时写入，**非云**）。
- 在 **`persistHealthDataWarehouse` 成功之后**（`maybePersistWarehouse` 路径）执行：按当前 CGM keep-months 与 year keep-years，静默删除更旧的 `cgm|YYYY-MM`、`bloodPressure|YYYY`、`weight|YYYY`（体脂随体重年）。
- **无二次确认**（与手动 keep-N 不同）；开启即表示接受「每次成功写入后按窗口裁掉更旧分片」。可先备份再开。
- 成功裁剪后可 toast 汇总删了多少月/年；失败才报错 toast。不写诊断文案。
- 裁剪仍走 `HealthHistory` 删片 API → **`warehouseWriteChain` 串行**（与 §6.2.1 相同，避免并发写回）。
- 防重入：自动裁剪过程中不再嵌套触发第二次 auto-trim；内存工作集与仓对齐后再写回一次（`skipAutoTrim`）。
- 不替代软/硬配额（策略 A）；只是 keep 窗口的自动化。

### 6.2.1 写入串行（write serialization）

`history-db.js` 用 `warehouseWriteChain` / `enqueueWarehouseWrite` **串行化** persist / 分片删除 / clear / 备份导入等仓写操作，避免并发 IDB 写入把刚删的分片「写回去」。分片删除采用两阶段：先 commit 删除 chunk id，再读 remaining 重算 meta（降低同事务 `getAll` 竞态）。**v1.83 自动 keep-N 裁剪**的删片与再 persist 也走同一写队列。

### 6.3 用户可见占用

在 **更多 → 数据管理 → 本机原始数据仓** 展示：

| UI 元素 | 内容 |
|---------|------|
| 授权状态 | 已开启 / 未开启 + 授权时间 |
| 总占用（估算） | e.g. `32 MB · 18.4 万条` + 配额条 |
| 分域列表 | CGM / 血压 / 体重… |
| 布局行 | `sharded-v1` 等 |
| **CGM 月列表** | 多选删除、保留近 N 月 |
| **血压 / 体重年列表** | 多选删除、分域保留近 N 年；体重提示含体脂 |
| **睡眠 / 步数年列表（v1.85）** | 有数据时展示 `sleepYears` / `stepsYears`；多选删年；**两域互不连带** |
| **HRV / 静息 / 步行心率年列表（v1.86）** | 有数据时展示 `hrvYears` / `restingHrYears` / `walkingHrYears`；多选删年；**三域互不连带**（HRV 年含过夜） |
| **Workout / ECG / Watch 年列表（v1.87）** | 有数据时展示 `workoutsYears` / `ecgYears` / `watchDailyYears`；多选删年；**三域互不连带**；数组域 vs map 域见 §4.2.3 |
| **分片组折叠（v1.87 UX）** | 多域年列表用 collapsible 分组（如 `details.warehouse-shard-group`），避免面板过长；有数据域优先可见 |
| **双域 keep（v1.82）** | 「双域仅保留近 N 年」一键裁血压 + 体重 |
| **全域 keep-all 年（v1.88）** | 「所有年分片仅保留近 N 年」；与分域 keep 共用 N 偏好时可同步 select |
| **分片清单导出（v1.88）** | `exportShardInventory`：chunk id / 占用元数据，**无**原始时序 |
| **迁移到 thin 分片（v1.88）** | `migrateLegacyCoreToShards`（可隐藏为启动/设置动作；已 sharded 则 no-op 成功） |
| **导入批次摘要（v1.89）** | `#warehouse-import-batches`：最近 `importBatches` + 仓 `lastImportBatchId` 联动；**无** raw 时序 |
| **配额预测（v1.89）** | `#warehouse-quota-forecast`：客户端按分片 `approxBytes` / 软硬 cap 估算；常见实现 **≥~70% 软配额** 才展开，否则可 hidden |
| **自动裁剪（v1.83）** | 勾选「保存后自动按保留窗口裁剪」（默认关；localStorage） |
| 日历覆盖 | 2024-03-01 → 2026-07-28 |
| 操作 | 立即保存 / 从仓恢复 / 导出·导入备份（口令可选）/ **仅清空仓内明细（保留授权）** / 关授权清空 |

**估算方法：** `approxBytes = sum(chunk.approxBytes)`；写入时用 `JSON.stringify` 长度缓存于 chunk / meta。

**Storage API（可选增强）：** `navigator.storage.estimate()` 展示源站配额使用率；失败则仅显示内部估算。v1.89 配额预测**优先**用仓内 `approxBytes`（与 soft/hard 一致），Storage API 仅作补充说明。

### 6.4 写入失败 UX

- `QuotaExceededError` / 硬配额：友好文案 + 引导删除旧月/年 / 导出备份 / 关闭仓。  
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

// 可选细分 API（已实现）
clearWarehouseOnly():                 // 清空仓数据；关授权路径使用
clearWarehousePayloadKeepConsent():   // 仅清 domainChunks / 占用，**保留 consent.granted**
revokeConsentAndClearWarehouse():
```

文案更新：

- wipeHint 增加：「若曾开启原始数据仓，将同时删除本机 CGM 等明细。」  
- 关闭授权开关时：默认 **立即清空 domainChunks**（避免「关授权但数据仍在磁盘」的虚假安全感）；摘要历史是否保留由用户勾选（默认保留）。  
- 「仅清空仓内明细」：清空分片但**不撤销授权**，下次分析可再自动 persist。

### 7.4 备份与 wipe 的关系

| 操作 | 仓 | 授权 consent | 摘要/事件/批次 | 内存分析 |
|------|----|--------------|----------------|----------|
| 导出备份 | 读 | 不变 | 可选纳入 | 不变 |
| 恢复备份（替换） | 覆写 | 随备份 / 可要求重确认 | 按选项 | 重 hydrate |
| 仅清空仓内明细 | 清空分片 | **保留** | 保留 | 可仍显示当前会话 |
| 一键清除 | 清空 | **重置关闭** | 清空 | 清空 |
| 仅关授权 | 清空仓 | 关闭 | 默认保留 | 可保留至刷新 |

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
        ├── 【已实现】本机原始数据仓
        │     ├── 授权开关 + 政策摘要（默认关）
        │     ├── 占用与分域统计 + 配额条
        │     ├── CGM 月分片列表（多选删 / 保留近 N 月）
        │     ├── 血压 / 体重年分片列表（多选删 / 保留近 N 年；体脂随体重）
        │     ├── 双域一键 keep-N 年（v1.82）
        │     ├── 保存后自动 keep-N 裁剪勾选（v1.83，默认关）
        │     ├── 导出 / 导入备份（口令可选）
        │     ├── 仅清空仓内明细（保留 consent）
        │     └── 关授权 / 一键清除 wipe 仓
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

1. **默认保留策略：** 不按天滚动；超软配额先淘汰最旧 CGM 月片，再淘汰 BP/体重年片；用户可手动「仅保留近 N 月/年」与双域一键年 keep；**可选**保存后自动 keep-N（默认关）。  
2. **关授权即删仓：** 是。  
3. **备份默认明文：** 是；加密为高级选项。  
4. **恢复策略 MVP：** 仅 replace，不做三方 merge。  
5. **启动行为：** 有仓且已授权时自动 hydrate（可设置改为手动「恢复」）。

### 14.4 文档修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 草案 v1 | 2026-07-30 | 首版设计，对齐 history-db v4 与 v1.66 IA |
| 实现对照 v1.75–v1.81 | 2026-07-30 | 对齐 `core\|full` + `cgm\|YYYY-MM` + `bloodPressure\|YYYY` / `weight\|YYYY`；软硬配额；写入串行；面板删片与 keep-N；clear payload 保留 consent |
| 实现对照 v1.82–v1.83 | 2026-07-30 | v1.82 双域一键 keep-N 年；v1.83 保存成功后 opt-in 自动 keep-N（localStorage，默认关，无确认，写队列串行）；非云、非诊断 |
| 实现对照 v1.85 | 2026-07-31 | `sleep\|YYYY` / `steps\|YYYY` 日 map 年分片；status `sleepYears`/`stepsYears`；`deleteDomainYearShards('sleep'\|'steps')` 域独立；E2E `e2e/warehouse.spec.js` |
| 实现对照 v1.86 | 2026-07-31 | `hrv\|YYYY`（payload `{ hrv, hrvOvernight }`）/ `restingHr\|YYYY` / `walkingHr\|YYYY`；status `hrvYears`/`restingHrYears`/`walkingHrYears`；三域独立删年；E2E `e2e/warehouse.spec.js` |
| 实现对照 v1.87 | 2026-07-31 | `workouts\|YYYY`（数组）/ `ecg\|YYYY`（数组）/ `watchDaily\|YYYY`（日 map）；status `workoutsYears`/`ecgYears`/`watchDailyYears`；三域独立删年；仓面板分片组折叠 UX；E2E `e2e/warehouse.spec.js` |
| 实现对照 v1.88 | 2026-07-31 | **Thin core** 全量分片后；`migrateLegacyCoreToShards`；`exportShardInventory`（chunk 元数据、无 raw）；**全域 keep-all 年**；E2E `e2e/warehouse.spec.js`；可选 `npm run perf:warehouse` |
| 实现对照 v1.89 | 2026-07-31 | 仓 **`lastImportBatchId`** 与 `persist(..., { batchId })` / `importBatches` 联动；仓面板导入批次摘要 `#warehouse-import-batches`；**配额预测** `#warehouse-quota-forecast`（客户端按分片详情估算，常 &lt;70% soft 时 hidden）；E2E 硬 API + 软 UI |
| 实现对照 v1.90 | 2026-07-31 | **批次→分片反向索引**：`listWarehouseChunksByBatchId` / `getImportBatchShardIndex`（meta only，无 payload）；chunk 行 `batchId`；可选点批次看分片列表；可选 `#connectivity-banner` 离线提示；E2E 硬 reverse-index + 软 offline banner |
| 实现对照 v1.91 | 2026-07-31 | **客户端分片过滤** `#warehouse-shard-filter`（年/月列表 DOM 过滤，不改 IDB）；**来源时间线** `#warehouse-provenance-timeline`（`listImportBatches` + `lastImportBatchId` 合成，meta only）；E2E soft/hard 过滤 + 时间线 |
| 实现对照 v1.92 | 2026-07-31 | **今日仓状态 chip** `#warehouse-today-chip` + **趋势仓提示** `#warehouse-trends-hint`（meta only，hydrate 后工作区可见）；E2E soft/hard；真机大 ZIP 指南 `docs/REAL_DEVICE_ZIP.md` |

---

## 相关文件（实现时只读对照）

| 路径 | 说明 |
|------|------|
| `web-ui/public/legacy/history-db.js` | IDB v5、`HealthHistory`、分片 persist / 删片 / 配额 / 备份 / 写串行 / **v1.88 migrate + inventory** / **v1.89 batchId → lastImportBatchId** / **v1.90 batch→shard reverse index** |
| `web-ui/public/legacy/app.js` | 授权 UI、hydrate、仓面板 keep-N / 双域·**全域** keep / 自动裁剪、多选删、wipe、**v1.89 批次面板 + 配额预测** / **v1.90 点批次→分片 + connectivity banner** / **v1.91 shard filter + provenance timeline** / **v1.92 today chip + trends hint** |
| `web-ui/public/index.html` | `#warehouse-panel`（CGM 月 / BP·体重年 / 双域·全域按钮 / auto-trim / **import-batches / quota-forecast**）/ 可选 `#connectivity-banner` / **v1.91 `#warehouse-shard-filter` · `#warehouse-provenance-timeline`** / **v1.92 `#warehouse-today-chip` · `#warehouse-trends-hint`** |
| `e2e/warehouse.spec.js` | 仓 / 年分片 / 双域 keep / auto-trim / **v1.88 migrate·inventory·global keep** / **v1.89 batch linkage + quota forecast** / **v1.90 batch→shard index** / **v1.91 shard filter + provenance timeline** / **v1.92 today chip + trends hint** / 备份自动化 |
| `e2e/connectivity.spec.js` | **v1.90** 离线横幅软断言（`#connectivity-banner`；缺省 skip） |
| `scripts/perf-warehouse-baseline.mjs` | 可选：Playwright 测 persist/load/status 耗时（`npm run perf:warehouse`） |
| `docs/REAL_DEVICE_ZIP.md` | **v1.92** 真机/桌面大 ZIP 与 `perf:parse` / `perf:warehouse` 隐私基线指南 |
| `lib/src/types.ts` | `HealthData` / `FullAnalysis` |
| `lib/src/snapshot.ts` | 摘要快照（非明细） |
| `lib/src/provenance.ts` | `ImportBatchRecord` |
| `lib/src/hae-import.ts` | 增量合并与去重 |
| `docs/README.md` | 产品叙事与版本史 |
| `docs/MANUAL_QA.md` | 真机手测（含仓分片） |

---

*本文为 v1.68 产品/架构设计文档，不构成医疗建议；实现须保持「本地优先、非诊断、可一键清除」。*
