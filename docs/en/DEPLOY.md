# Deployment guide

**Language:** [中文](../DEPLOY.md) | **English**

Host **`web-ui/public/`** (React at site root) on any static server.

## Production shape (v2.5+)

```bash
cd health-analyzer
npm run react:install
npm run react:export-cutover   # → public/index.html + assets + 404.html
# GitHub Pages deploy sets GITHUB_PAGES_DEPLOY=true → base=/<repo>/
```

| URL | Content |
|-----|---------|
| `/` (or `/<repo>/` on project Pages) | **Production default** React |
| `.../legacy/` | **Not** a runnable legacy app — redirects to React root |

**App version rollback:** redeploy a previous successful Git commit / Pages artifact, or restore a backed-up `web-ui/public/` tree.  
**Do not** rely on `/legacy/` for product rollback.  
**Local health data recovery:** see **[DATA_RECOVERY.md](../DATA_RECOVERY.md)** (backup import, re-import Health ZIP, site-data clear impact).

Historical dual-track notes: **[DUAL_TRACK_UI.md](../DUAL_TRACK_UI.md)** (archive).

## Local preview

```bash
npm run react:export-cutover
cd web-ui/public && python3 -m http.server 8000
# http://localhost:8000/ → React only
```

## GitHub Pages

This repo’s Actions workflow runs `export-cutover` and publishes `web-ui/public`.

```bash
npm run test:release
npm run react:privacy
```

## Lib build

```bash
cd lib && npm test && npm run build
# → dist/ + dist/browser.iife.js (used by FHIR scripts / smoke)
```

## Bundle size

Production may warn about main JS &gt; 500KB (~200KB+ gzip). Acceptable for now; route-level code-splitting is a follow-up.

## Related

- Data recovery: `docs/DATA_RECOVERY.md`  
- Migration status: `docs/LEGACY_PARITY.md`  
