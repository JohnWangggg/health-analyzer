# Apple Health Data Analyzer PWA

> Local · privacy-first · cross-platform · zero server

Parses iPhone Apple Health exports (ZIP / XML) in the browser, computes summaries, and builds paste-ready LLM prompts. Pure front-end PWA — no backend.

**Language:** [中文](../README.md) | **English**

Live demo (GitHub Pages after deploy):  
`https://<USER>.github.io/health-analyzer/`

---

## Product entry (v2.5+ · React only)

| URL | Role |
|-----|------|
| **`/`** | **Production default** React shell (Overview · Trends · Reports · Data) |
| **`/legacy/`** | **Not a rollback app** — redirect stub back to `/` (old UI removed) |

Publish: `npm run react:export-cutover` → React at `web-ui/public/` root.  
**App version rollback:** re-deploy a previous Git/Pages success, or restore a prior static `web-ui/public/` tree — **do not** rely on `/legacy/`.  
**Local data recovery:** backup export/import, re-import Health ZIP — see [`DATA_RECOVERY.md`](../DATA_RECOVERY.md).  
GitHub **project** Pages uses `base=/<repo>/` on deploy (`GITHUB_PAGES_DEPLOY=true`). SPA deep links use `404.html`.

### Production capabilities

- ✅ Import: fixture · XML · ZIP · folder · HAE (cancellable)
- ✅ Overview: status · today snapshot · KPI visibility/order · data-quality banner · LLM prompt · personal context · events · CSV · recovery weights · TV mode
- ✅ Trends: multi-domain · dual-metric compare · chart presets · lazy ECharts
- ✅ Reports / export / FHIR local archive + exchange
- ✅ Warehouse: sharded-v1 full replace · keep-N · multi-select shard delete · backup/restore
- ✅ Engineering: cutover layout · **e2e-react** · privacy scan · FHIR HL7
- ℹ️ Schema authority: `web-ui/idb-schema/history-db.reference.js`
- ℹ️ Migration archive: [`DUAL_TRACK_UI.md`](../DUAL_TRACK_UI.md) · recovery: [`DATA_RECOVERY.md`](../DATA_RECOVERY.md)

Docs: [`DEPLOY.md`](./DEPLOY.md) · Chinese hub [`../README.md`](../README.md)

---

## Core features

- ✅ **100% on-device**: parse, stats, prompts — nothing uploaded  
- ✅ **Static deploy**: host `web-ui/public/` (React at root)  
- ✅ **Cross-platform** desktop & mobile browsers  
- ✅ **PWA**: installable; SW with user-confirm update; chart chunks not pre-cached  
- ✅ Adaptive metrics (CGM, BP, weight, Watch, …)  
- ✅ Apple Watch daily rollups, workouts, ECG, sleep disturbance  
- ✅ 7-day recovery / multi-week load trends (heuristic, not diagnosis)  
- ✅ Weekly / visit / clinical Markdown reports  
- ✅ Three LLM prompt modes (full / data-only / short system)  
- ✅ Clipboard · `.md` download · JSON/CSV export  
- ✅ Personal context (localStorage) · IndexedDB warehouse + snapshots  
- ✅ Dark mode · i18n (zh-CN / zh-TW / en on React shell)  
- ✅ Health Auto Export (HAE) incremental merge  

---

## Project layout

```
health-analyzer/
├── lib/                      # TypeScript kernel
├── web-ui/
│   ├── public/               # ★ Deploy root (Pages / wrangler)
│   │   ├── index.html …      # React (export-cutover; gitignored)
│   │   ├── 404.html          # SPA fallback for GitHub Pages
│   │   └── legacy/           # Redirect stub only (not a runnable app)
│   ├── idb-schema/           # IndexedDB contract reference
│   └── react-app/            # ★ React source (production shell)
├── e2e/                      # Historical Playwright (old /legacy/ target; not default CI)
├── e2e-react/                # ★ Primary gate: root React Playwright
├── e2e-dual/                 # Retired dual-track warehouse E2E (script removed)
└── docs/ · docs/en/
```

---

## Quick start

### End user

1. iPhone Health → profile → **Export All Health Data** → ZIP  
2. Open the deployed app (`/` is React)  
3. Import ZIP / XML / HAE · review Overview KPIs  
4. **Copy LLM prompt** or open Reports · Trends  
5. Optional: save warehouse · backup · keep-N · shard cleanup on **Data**  
6. App rollback: previous deploy / Git — **not** `/legacy/`  
7. Data recovery: see [`DATA_RECOVERY.md`](../DATA_RECOVERY.md)

### Developer

```bash
cd health-analyzer/lib && npm install && npm test && npm run build
cd .. && npm install && npm run react:install
npm run react:export-cutover          # base=/ for local
# GitHub Pages deploy sets GITHUB_PAGES_DEPLOY=true → base=/<repo>/

npx serve web-ui/public -l 8080
# http://localhost:8080/          → React
# http://localhost:8080/legacy/   → redirect stub only

npm run react:test
npm run smoke && npm run test:cutover-layout
npm run test:e2e:react                # = npm run test:e2e
# Do not use test:e2e:dual (removed; see DATA_RECOVERY.md)
```

---

## Deploy

### GitHub Pages (this repo)

On `main` push:

1. **test** job: lib + cutover (base `/`) + smoke + Playwright  
2. **deploy** job: cutover with `GITHUB_PAGES_DEPLOY=true` → `base=/health-analyzer/` + `404.html` → upload `web-ui/public/`

Settings → Pages → Source = **GitHub Actions**.  
App: `https://<USER>.github.io/health-analyzer/`  
`/legacy/` only redirects to the React root.

### Cloudflare / static host

```bash
npm run react:export-cutover   # usually VITE_BASE=/
npx wrangler deploy            # assets.directory = web-ui/public
```

See [DEPLOY.md](./DEPLOY.md).

---

## Version highlights (Strategy A · living changelog)

| Version / commit | Notes |
|------------------|--------|
| **v2.3-cutover** `b2178b6` | React default at `/`; migration-era legacy under `public/legacy/`; export-cutover; CI/e2e retarget |
| `3b08429` | Docs/package framing: new replaces old |
| `9bc090a` | React warehouse **backup/restore** (AES-GCM + plain) |
| `80d5b02` | React **multi-select shard cleanup** |
| `b2e7363` | Shard-delete e2e hard path; overview session UX |
| `2e99eec` | Plain + **encrypted backup e2e**; trends domain presence |
| `f58d6fc` | Reports empty CTA/meta; Keep-N one-tap presets |
| **v2.3.1** `bb9a6d4` | Pages **base=/\\<repo\\>/** + `404.html`; Overview **LLM prompt copy**; README zh/en living changelog |
| **v2.3.2** `9fd9f57` | React **personal context** + **today snapshot** strip; inject into LLM prompt |
| **v2.3.3** `68901ec` | React **include-sensitive toggle** (key `health-analyzer-include-sensitive-ctx`; default on) |
| **v2.4** `6229d49` | **Full product path on React**: events · CSV · recovery weights · TV · export · FHIR local archive |
| **v2.4.1** `39a4a08` | Pages **white-screen guard**: boot placeholder + recovery; auto clear SW on chunk miss |
| **v2.4.2** `349d7a3` | **Legacy soft-deprecation** (migration era) |
| **v2.5** `2fb7f01` | **Full legacy UI removed**: `/legacy/` redirect only; schema in `idb-schema/`; CI e2e-react only |
| **v2.5.1** `f58a184` | Trends **dual-metric compare** · **folder import** · **HAE cancel** · **snapshot compare** |
| **v2.5.2** `844528b` | Chart **presets** · HAE **meds→events** · **offline banner** |
| **v2.5.3** `de5c116` | **zh-TW UI** · analysis locale follows UI · TV fullscreen + focus controls |
| **v2.5.4** `6db3304` | **Data-quality banner** · **KPI order** · **PWA install prompt** |
| **v2.5.5** | **Release-promise hygiene**: `/legacy/` is redirect-only; remove fake `test:e2e:dual`; [`DATA_RECOVERY.md`](../DATA_RECOVERY.md); About/docs aligned |
| **v2.5.6** | **First-load code-split**: route-level `React.lazy` for four workspaces + `vendor-react` / `health-lib` chunks; entry ~19KB (~7KB gzip); no single &gt;500KB main-chunk warning |
| **v2.5.7** | **Overview secondary lazy**: date filter / personal context / events / CSV / recovery weights idle-deferred into separate chunk |
| **v2.5.8** | **UI foundation + dashboard P0**: fix 248px TV-mode grid collapse (1440 E2E); Motion / Lucide / AutoAnimate / Vaul; recovery ring, nav icons, demoted tools + mobile drawer |
| **v2.5.9** | **TV atmosphere + mobile Today**: aurora/grid backdrop, focus progress bar + soft stage lighting; phone first screen hides prompt/KPI config/domain chips, max 3 signals |
| **v2.5.10** | **Desktop command center**: overview 3 layers (status → 7/30d sparkline strip → KPI+signals); no ECharts on first paint |
| **v2.5.11** | **Trends/Reports/Data product copy**: restrained stagger enter; user-facing leads; report stage + trends controls visual alignment |

### Release checklist

```bash
npm run react:test
npm run react:export-cutover && npm run test:cutover-layout && npm run smoke
npm run test:fhir:ci
npm run test:e2e:react
npm run react:privacy   # hits=0
```

---

## Design notes

- Local-first; no CDN analytics in React privacy-scan  
- Kernel stays in `lib/`; React uses HealthCoreAdapter only  
- Warehouse: IndexedDB v5 `sharded-v1` full replace on write  
- App rollback = previous deploy / Git — not `/legacy/`  
- Not a medical device; no diagnosis  

## License

MIT
