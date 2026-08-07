# 本机数据恢复与回退说明（v2.5+）

> 生产入口仅为 **React `/`**。`/legacy/` **不是**可运行旧版应用，仅自动跳回首页。  
> 产品/工程「回滚」≠ 打开 `/legacy/`。

## 1. 应用版本回退（代码 / 静态站点）

| 方式 | 说明 |
|------|------|
| **Git 部署回退** | 将 Pages/CI 指向上一成功 commit（或 `git revert` 后重部署） |
| **保留上一静态产物** | 发版前备份 `web-ui/public/` 或 CI artifact；故障时改回托管该目录 |
| **`/legacy/` URL** | **不可用** 旧 UI；浏览器会跳到 React 根路径 |

本机 IndexedDB **不会**因打开 `/legacy/` 而恢复到「旧版应用逻辑」——旧壳已删除。

## 2. 健康数据恢复（本机仓 / 会话）

数据默认在浏览器 **IndexedDB**（`health-analyzer-history` v5，`sharded-v1`）与部分 **localStorage** 偏好中。

### 2.1 推荐：加密/明文仓库备份

1. 打开 **数据** 工作区 → **仓库备份**  
2. **导出备份**（可选口令 → AES-GCM `.hae-backup.json`；留空则明文）  
3. 恢复时 **导入备份**（加密文件须同一口令）  

兼容说明：备份格式与历史 `.hae-backup.json` 兼容；导入会写回分片仓（及可选快照/事件等勾选项）。

### 2.2 重新导入 Apple Health

1. iPhone「健康」→ 导出健康数据 → **ZIP**（推荐保留压缩包，勿只传解压后的巨型 XML）  
2. 总览 → **导入 ZIP**（首选）  
3. 需要时 **写入数据仓** 持久化  

**大导出注意（v2.5.21+）：**

| 要点 | 说明 |
|------|------|
| 体积 | 包内 `导出.xml` / `export.xml` 常 **400–600MB+**，超过浏览器字符串上限（约 512MB） |
| 正确路径 | 页面 **ZIP 导入** 使用**字节流式解析**，并跳过 `export_cda.xml` / 运动轨迹以省内存 |
| 错误现象 | 旧版可能只剩 **心电**（ECG CSV 小文件仍可读，主 XML 整串 decode 失败） |
| 部署 | 须 **v2.5.21+** 构建；PWA 有更新时先确认刷新 |
| 详文 | **[REAL_DEVICE_ZIP.md](./REAL_DEVICE_ZIP.md)** §0 |

若仓内已有数据：当前 React 写入为 **sharded-v1 整仓替换**（事务内清旧分片再写入），不是与旧碎片静默合并。重要数据请先备份。

### 2.3 清除站点数据的影响

| 操作 | 影响 |
|------|------|
| 总览 **清除** 会话 | 仅清当前内存分析，**不**自动清 IDB 仓 |
| 数据页 **一键清除本机健康数据** | 清 IDB 仓/快照/事件/批次 + 健康相关 localStorage；**保留**主题/界面语言等 UI 偏好 |
| 浏览器「清除此站点数据」 | 可能清掉 **全部** 仓与偏好；需依赖备份或重新导入 ZIP |

## 3. 发布门禁（当前）

```bash
npm run test:lib
npm run build:lib
npm run react:export-cutover
npm run smoke                 # cutover 形态 + schema 引用 + browser IIFE
npm run test:fhir:ci          # 结构 + 交换 + HL7（CI）
npm run test:e2e:react        # 主 E2E（根 React）
npm run react:test
npm run react:privacy         # hits=0
```

**已移除（勿再引用为通过门禁）：**

- `test:e2e:dual` — 旧双轨仓互通 E2E；随 legacy UI 删除，**脚本已删除**  
- 以 `/legacy/` 为入口的 `e2e/*` 套件 — 归档在仓库中，**默认 CI 不跑**，且目标 UI 已不存在  

## 4. 相关

- 迁移状态：`docs/LEGACY_PARITY.md`  
- 仓设计：`docs/DATA_CENTER_v1.68.md`（schema 权威文件：`web-ui/idb-schema/history-db.reference.js`）  
- 大 ZIP / 流式导入：`docs/REAL_DEVICE_ZIP.md`  
- 部署：`docs/DEPLOY.md`  

