# 真实设备 / 桌面大 ZIP 导入与性能基线

**版本：** v1.92 起有性能基线脚本；**v2.5.21** 起生产路径支持「超过 JS 字符串上限」的完整 Apple 导出。  
**目的：** 用**自有** Apple Health 导出测解析与本机仓读写耗时；说明大包导入的正确方式与故障现象。  
**原则：** 数据留在本机 · **不上传** · **不提交**个人导出到仓库 · 非诊断。

---

## 0. 用户必读：大导出 ZIP 怎么导（v2.5.21）

### 现象（修复前）

部分用户完整导出后，页面上**好像只有「心电」一类数据**，步数 / 体重 / CGM / 睡眠等都不出现。

### 根因

| 项 | 典型值 |
|----|--------|
| 压缩包 | `导出.zip` / `export.zip`，常约 20–40MB |
| 包内主文件 | `apple_health_export/导出.xml` 或 `export.xml` |
| 未压缩体积 | 常 **400–600MB+**（一例实测约 **558MB**） |
| 浏览器/引擎限制 | JS 字符串最大长度约 **512MB**（`0x1fffffe8`） |
| 旧逻辑 | 整文件 `TextDecoder.decode` → 超限抛错 |
| 仍可能成功的部分 | 包内 `electrocardiograms/*.csv` 很小，可单独解析 → 界面只剩心电 |

真实 XML 内通常仍有完整域（步数、体重、血压、血糖、睡眠等）；不是「导出坏了」，而是**整串解码失败**。

### 正确导入方式（生产 React `/`）

1. iPhone「健康」→ 头像 → **导出所有健康数据** → 得到 ZIP。  
2. **不要**先解压再只点选巨型 `导出.xml`（裸 XML ≥ 约 80MB 虽已走字节流，但 ZIP 更省事、还能带上 ECG CSV）。  
3. 总览 → **导入 ZIP**（推荐）。  
4. 等待进度（文案示例）：  
   - `解压 ZIP（跳过 CDA/轨迹以省内存）…`  
   - `流式解析 export.xml xx%…`  
   - `合并心电 CSV…`  
   - `统计分析…`  
5. 成功后总览应出现**多类**数据（域芯片 / KPI / 趋势），而不是只有心电。

### 实现要点（开发者）

| 路径 | 行为 |
|------|------|
| `web-ui/react-app/src/core/zipImport.ts` | `unzipSync` **filter**：保留 export/导出 XML + ECG CSV；**跳过** `export_cda.xml`、`workout-routes` |
| 同上 | XML 以 **`Uint8Array`** 交给 `parseHealthXmlAsync`（4MB 块 + 按行），**禁止**对 >~512MB 文件整串 decode |
| `xmlImport.ts` | 裸大 XML（≥80MB）同样字节流 |
| `useHealthStore.loadZipFile` | 进度回调；字符串超限时友好错误文案 |
| 内核 | `lib/src/parser.ts` → `parseHealthXmlAsync` / `forEachXmlLine` |

小夹具仍可用同步 `analyzeHealthZipBytes`（测试）；生产 ZIP 一律 `analyzeHealthZipBytesAsync` / `analyzeHealthZipFile`。

### 可选：本机验证真实大包（勿提交文件）

```bash
cd health-analyzer/web-ui/react-app
# 将路径换成你的个人 ZIP（仓库外）
RUN_LARGE_ZIP=1 NODE_OPTIONS='--max-old-space-size=8192' \
  npx vitest run src/core/largeZip.manual.test.ts
```

- 默认 **skip**（无 `RUN_LARGE_ZIP` 或不存在文件）。  
- 断言：非心电域 ≥3 且 `stepsDays` 等合理；**不**把个人 ZIP 放进仓库。

### 仍失败时

| 情况 | 建议 |
|------|------|
| 进度卡住 / 标签崩溃 | 关闭其它标签；桌面 Chrome/Safari 比低内存手机更稳；可先在电脑导入再「本机仓」持久化 |
| 明确报字符串上限 | 确认已部署 **v2.5.21+**；强制刷新 / 接受 PWA 更新 |
| 只有心电 | 多半是旧版构建或导入失败后的残留观感；清会话后用 ZIP 重导 |
| OOM | 内存不足；勿同时解压 CDA（现已跳过）；可考虑系统导出时间范围更短的包（若 Apple 提供） |

---

## 1. 准备（性能基线）

| 项 | 说明 |
|----|------|
| 仓库 | 本机 clone 的 `health-analyzer`；已 `npm install`（根目录 + 如需 `lib`） |
| 浏览器 bundle | `npm run build:lib`（确保 `lib/dist/browser.iife.js` 最新；React 经 adapter 用内核） |
| Playwright | 仓基线需要：`npm run test:e2e:install`（或已装 Chromium） |
| 个人导出 | iPhone **健康 → 个人资料 → 导出所有健康数据** 得到 ZIP |
| 存放位置 | 放在**仓库外**目录，例如 `~/HealthExports/导出.zip` |

**不要：**

- 把个人 `export.xml` / ZIP 拷进 `e2e/fixtures/` 或任意会提交的路径  
- 把含真实姓名、设备序列、完整时序的文件 `git add`  
- 把性能日志里的个人路径/摘要发到公开 issue（可只贴 **ms / MB / 条数**）

仓库默认夹具 `e2e/fixtures/minimal-export.xml` 很小，只适合冒烟；真实基线请用 `--file=` 或上方 `RUN_LARGE_ZIP`。

**说明：** CLI `perf:parse` 若传入已解压的巨型 XML，仍可能受 Node 字符串上限影响；优先对**压缩前体积**有心理预期，或使用 React 的字节流路径 / 分块脚本。生产 UI 不依赖整串 XML。

---

## 2. 解析基线：`npm run perf:parse`

在仓库根目录：

```bash
# 默认：最小夹具（冒烟）
npm run perf:parse

# 真实 export（推荐路径在仓库外；注意超大 XML 可能触达字符串上限）
npm run perf:parse -- --file=/path/to/export.xml

# 多轮取中位数/观察抖动
npm run perf:parse -- --file=/path/to/export.xml --repeat=3

# 机器可读一行 JSON（进度在 stderr）
npm run perf:parse -- --file=/path/to/export.xml --json

# 或环境变量
PERF_XML_PATH=/path/to/export.xml npm run perf:parse -- --repeat=3
```

**输出关注点（本地笔记即可）：**

- `parseHealthXml` / `analyzeAll` 墙钟 ms  
- 各域记录条数、进程 `memoryUsage` 增量  
- 失败时 exit ≠ 0：检查路径、是否仍为 ZIP（需先解压出 XML）、磁盘权限、是否超过字符串上限  

脚本只读本地文件，**无网络上传**。实现：`scripts/perf-parse-baseline.mjs`。

---

## 3. 仓读写基线：`npm run perf:warehouse`

```bash
npm run perf:warehouse
# 或
npm run perf:warehouse -- --years=5 --json
```

- 用 Playwright 打开本机 static `web-ui/public`，**合成**多年 BP/体重/睡眠等测 `persist` / `load` / `getWarehouseStatus`  
- **不**读取个人 `export.xml`；适合对比 IDB 分片写入成本  
- 可选：先在真机/桌面 PWA 授权仓并导入自有 ZIP，再手测 refresh hydrate；自动化仍用合成数据  

实现：`scripts/perf-warehouse-baseline.mjs`。

---

## 4. 真机 / 桌面 PWA 手测（大 ZIP）

与 `docs/MANUAL_QA.md`「大 ZIP / v2.5.21」对齐：

1. 用系统浏览器或已安装 PWA 打开构建页（`web-ui/public` 或部署域名；**需 v2.5.21+**）。  
2. **上传 ZIP**（不要只选解压后的 500MB+ XML，除非已确认走流式路径）。  
3. 确认进度阶段可读：解压 → 流式解析 % → ECG → 分析。  
4. 完成后核对：**多域** KPI / 趋势 / 域芯片；**不是**仅「心电」。  
5. **数据页 → 本机原始数据仓** 授权（有确认）→ 刷新应可 hydrate。  
6. 测完后可用「清除所有本机健康数据」wipe；导出的备份文件同样**不要提交**。

---

## 5. 隐私与 git 卫生

| 做 | 不做 |
|----|------|
| 个人 XML/ZIP 放仓库外或本机忽略目录 | 提交 `export.xml`、健康 ZIP、含真实数据的 backup JSON |
| 笔记只记耗时、内存、条数、设备型号 | 把完整路径+文件名发到公开渠道（若路径含姓名） |
| `.gitignore` 已忽略常见大文件/工具缓存时保持原样 | 为「方便」强制 `git add -f` 个人导出 |
| 分享基线用合成数据或匿名统计 | 上传健康明细到第三方测速服务 |

E2E 与 CI **只**使用仓库内最小/合成夹具；真实大包仅本机可选。

---

## 6. 相关

| 资源 | 说明 |
|------|------|
| `docs/MANUAL_QA.md` | 真机手测清单（含大 ZIP / 仅心电回归） |
| `docs/DATA_RECOVERY.md` | 备份与重导 ZIP |
| `docs/DATA_CENTER_v1.68.md` | 本机仓架构与分片约定 |
| `web-ui/react-app/src/core/zipImport.ts` | 生产 ZIP 解压 + 流式解析 |
| `web-ui/react-app/src/core/largeZip.manual.test.ts` | 可选真实 ZIP 门禁（`RUN_LARGE_ZIP=1`） |
| `package.json` | `perf:parse` / `perf:warehouse` 脚本入口 |

---

*本地优先 · 非诊断 · 个人导出永不进版本库。*
