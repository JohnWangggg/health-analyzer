# React ↔ Legacy 能力对照与移除状态

> 更新日期：2026-08-03 · **v2.5：完整 legacy UI 已删除**

## 1. 结论

| 问题 | 答案 |
|------|------|
| **日常使用能否只靠 React？** | **是** |
| **是否已删除 legacy 应用？** | **是** — `public/legacy/` 仅保留 **跳转页** |
| **schema 权威在哪？** | `web-ui/idb-schema/history-db.reference.js` |
| **浏览器 lib IIFE？** | `lib/dist/browser.iife.js`（FHIR 脚本 / smoke） |

**一句话：** 生产只有 React；`/legacy/` 书签会跳回新版。

---

## 2. 已迁入 React（删除前门槛）

| 能力 | 状态 |
|------|------|
| 导入 XML/ZIP/HAE · 仓 sharded-v1 · 备份 | ✅ |
| 提示词 + 个人背景 + 敏感开关 + **includeEvents** | ✅ |
| **分析日期范围** + 重算 | ✅ |
| 事件时间线 · CSV 合并 · 恢复权重 · 大屏 MVP | ✅ |
| 报告 MD/HTML · 临床敏感 · 事件 | ✅ |
| 导出 JSON/CSV/快照 · FHIR archive + **exchange 匿名** | ✅ |
| **一键清除本机健康数据** | ✅ |
| 趋势 **时间范围 chips** | ✅ |
| e2e-react 门禁 · smoke 不依赖旧 app.js | ✅ |

| 趋势 **双指标对比**（双轴） | ✅ v2.5.1 |
| **文件夹导入** export.xml | ✅ v2.5.1 |
| **HAE 中途取消** | ✅ v2.5.1 |
| **快照环比** | ✅ v2.5.1 |

| 趋势 **图表预设** | ✅ v2.5.2 |
| **HAE 用药 JSON → 事件** | ✅ v2.5.2 |
| **离线连通横幅** | ✅ v2.5.2 |

| **zh-TW UI** + 分析語言 | ✅ v2.5.3 |
| 大屏全屏 + 焦點手動 | ✅ v2.5.3 |

| **数据质量横幅** | ✅ v2.5.4 |
| **KPI 排序记忆** | ✅ v2.5.4 |
| **PWA 安装提示** | ✅ v2.5.4 |

仍可增强：可编辑大屏栅格（自由拖拽）。



---

## 3. 仓库布局（移除后）

```text
web-ui/public/           # React cutover 根
web-ui/public/legacy/    # 仅 index.html 重定向
web-ui/idb-schema/       # history-db.reference.js
lib/dist/browser.iife.js # 浏览器 IIFE
e2e-react/               # 主 e2e
e2e/                     # 归档（旧版 UI 用例，默认 CI 不跑）
```

---

## 4. 相关

- **本机数据恢复 / 应用回退（非 `/legacy/`）**：`docs/DATA_RECOVERY.md`
- Strategy A 历史档案：`docs/DUAL_TRACK_UI.md`（`test:e2e:dual` 已删除）
- 仓：`docs/DATA_CENTER_v1.68.md` · schema：`web-ui/idb-schema/history-db.reference.js`
- 部署：`docs/DEPLOY.md`
