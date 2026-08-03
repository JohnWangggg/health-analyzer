# 真实设备 / 桌面大 ZIP 性能基线（v1.92）

**目的：** 用**自有** Apple Health 导出测解析与本机仓读写耗时，建立可对比的本机基线。  
**原则：** 数据留在本机 · **不上传** · **不提交**个人导出到仓库 · 非诊断。

---

## 1. 准备

| 项 | 说明 |
|----|------|
| 仓库 | 本机 clone 的 `health-analyzer`；已 `npm install`（根目录 + 如需 `lib`） |
| 浏览器 bundle | `npm run build:lib`（确保 `lib/dist/browser.iife.js` 最新；React 经 adapter 用内核） |
| Playwright | 仓基线需要：`npm run test:e2e:install`（或已装 Chromium） |
| 个人导出 | iPhone **健康 → 个人资料 → 导出所有健康数据** 得到 ZIP；解压后取 `export.xml`（或 Apple 导出的路径） |
| 存放位置 | 放在**仓库外**目录，例如 `~/HealthExports/export.xml` 或 `/Volumes/…/export.xml` |

**不要：**

- 把个人 `export.xml` / ZIP 拷进 `e2e/fixtures/` 或任意会提交的路径  
- 把含真实姓名、设备序列、完整时序的文件 `git add`  
- 把性能日志里的个人路径/摘要发到公开 issue（可只贴 **ms / MB / 条数**）

仓库默认夹具 `e2e/fixtures/minimal-export.xml` 很小，只适合冒烟；真实基线请用 `--file=`。

---

## 2. 解析基线：`npm run perf:parse`

在仓库根目录：

```bash
# 默认：最小夹具（冒烟）
npm run perf:parse

# 真实 export（推荐路径在仓库外）
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
- 失败时 exit ≠ 0：检查路径、是否仍为 ZIP（需先解压出 XML）、磁盘权限  

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

与 `docs/MANUAL_QA.md` §5 对齐，大包时额外注意：

1. 用系统浏览器或已安装 PWA 打开构建页（`web-ui/public` 或部署域名）。  
2. 上传 ZIP（或高级来源 XML）；允许数分钟，确认进度阶段可读。  
3. 完成后：**更多 → 本机原始数据仓** 授权（有确认）→ 刷新应自动 hydrate。  
4. **今日**：若 UI 已上线，可见 `#warehouse-today-chip`（仓 meta，非点值）。  
5. **趋势**：若 UI 已上线，可见 `#warehouse-trends-hint`。  
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
| `docs/MANUAL_QA.md` | 真机手测清单（含 v1.92 chip/hint、§5.1） |
| `docs/DATA_CENTER_v1.68.md` | 本机仓架构与分片约定 |
| `e2e/warehouse.spec.js` | 仓 E2E（含 v1.92 soft UI） |
| `package.json` | `perf:parse` / `perf:warehouse` 脚本入口 |

---

*本地优先 · 非诊断 · 个人导出永不进版本库。*
