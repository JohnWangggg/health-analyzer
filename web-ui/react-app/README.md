# React preview shell (dual-track)

Parallel **Vite + React + TypeScript** app for the health-analyzer dual-track migration.

| Track | Path | Role |
|-------|------|------|
| **Legacy (default production)** | `../public/` | Ship this directory as today |
| **React preview** | `./` (this package) | Engineering shell, privacy packaging, HealthCore adapter |

**Do not cut over `/` to React in this phase.** IndexedDB warehouse schema stays owned by legacy `history-db.js`.

## Scripts

From **repo root** (`health-analyzer/`):

```bash
npm run react:install
npm run react:dev
npm run react:build
npm run react:preview
npm run react:privacy
npm run react:parity
```

From this package:

```bash
npm install
npm run dev
npm run build
npm run preview
npm run privacy
npm run test        # vitest parity
```

## Architecture

- **Routes:** `/` 总览 · `/trends` 趋势 · `/reports` 报告 · `/data` 数据
- **Theme:** light / dark / system (CSS variables, system fonts only)
- **HealthCoreAdapter:** calls `@health-analyzer/lib` `parseHealthXml` + `analyzeAll` (Vite alias → `lib/src`)
- **PWA:** `vite-plugin-pwa` Workbox **self-only** precache; no runtime CDN caching
- **Privacy:** `scripts/privacy-scan.mjs` greps `dist/` for forbidden third-party hosts

## Privacy model

Health raw data stays in the browser, Workers, and IndexedDB only. No CDN for app assets, no analytics, no cloud health API.
