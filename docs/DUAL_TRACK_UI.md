# Dual-track UI: legacy PWA + React preview

**Baseline tip (migration start):** `cb1685d` (feat: v2.1 本地 ECharts、更多五页、趋势 Sheet 与健康大屏)

## Default production path (unchanged)

| Path | Role |
|------|------|
| `web-ui/public/` | **Default shippable PWA** — deploy this directory as today |
| Root scripts | `npm run smoke`, `npm run test:e2e`, `npm run test:lib`, `npm run test:fhir*` stay the regression gate |

Do **not** replace `/` with React until a later cutover phase. IndexedDB warehouse schema, keys, and backup formats must remain readable by both shells.

## React preview track

| Path | Role |
|------|------|
| `web-ui/react-app/` | Vite + React + TypeScript source (preview shell) |
| `web-ui/react-app/dist/` | Local build output for preview only (not mixed into legacy CSS) |

### Scripts (from repo root)

```bash
npm run react:install   # npm install in web-ui/react-app
npm run react:dev       # Vite dev server
npm run react:build     # production build → web-ui/react-app/dist
npm run react:preview   # vite preview of dist (127.0.0.1:4173)
npm run react:privacy   # scan dist for forbidden third-party hosts
npm run react:parity    # adapter vs lib fixture parity (vitest)
npm run react:test      # all react-app vitest suites
```

Or from the package:

```bash
cd web-ui/react-app && npm install && npm run dev
```

### Shell surface (phases 0–2)

- **Routes:** `/` 总览 · `/trends` 趋势 · `/reports` 报告 · `/data` 数据
- **Theme:** light / dark / system (CSS variables, system fonts only — no CDN fonts)
- **HealthCoreAdapter:** `src/core/HealthCoreAdapter.ts` calls `@health-analyzer/lib` `parseHealthXml` + `analyzeAll` (Vite alias → `lib/src`; no stats reimplementation in React)
- **Fixture load:** Overview「加载演示夹具」embeds `e2e/fixtures/minimal-export.xml` via `?raw`
- **PWA:** `vite-plugin-pwa` Workbox self-only precache + NavigationRoute to `/index.html`
- **Privacy:** `scripts/privacy-scan.mjs` greps runtime dist assets for CDN/analytics hosts

### IndexedDB contract (shared)

React must open the **same** database as legacy `history-db.js` without force-migration:

| Constant | Value |
|----------|--------|
| `DB_NAME` | `health-analyzer-history` |
| `DB_VERSION` | `5` |
| Stores | `snapshots`, `weeklyReports`, `healthEvents`, `importBatches`, `warehouseMeta`, `domainChunks` |

Source of truth for schema evolution remains `web-ui/public/history-db.js`. React helper: `web-ui/react-app/src/core/idbContract.ts` (probe only; compatible empty create if DB missing).

### Privacy model (both tracks)

- Health raw data stays in the browser, Workers, and IndexedDB only.
- No CDN for app JS/CSS/fonts/charts, no analytics, no cloud health API.
- React build embeds its own assets; PWA precache is same-origin only.

### Local UI preference (later)

Optional local flag `ui-shell=legacy|react` may switch preview; until cutover, production deployments continue to serve `web-ui/public`.

## What is out of scope for this dual-track baseline

Full Overview/Trends/Reports/Warehouse product migration, ECharts-as-only-engine cutover, warehouse virtualization, and making React the default `/` entry are **later phases**. This track freezes: engineering shell, privacy packaging, core adapter parity, and preview PWA config.
