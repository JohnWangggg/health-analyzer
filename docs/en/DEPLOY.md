# Deployment guide

Host **`web-ui/public/`** (React at site root + **`legacy/`** rollback) on any static server.

**Language:** [中文](../DEPLOY.md) | **English**

## Strategy A: React default + `/legacy/` rollback

```bash
cd health-analyzer
npm run react:install
npm run react:export-cutover   # → public/index.html + assets; keeps public/legacy/
# Optional: VITE_BASE=/custom/   # override base
# GitHub Pages deploy sets GITHUB_PAGES_DEPLOY=true → base=/<repo>/
```

| URL | Content |
|-----|---------|
| `/` (or `/<repo>/` on project Pages) | **Production default** React |
| `.../legacy/` | Legacy PWA rollback |

Also writes **`404.html`** (= `index.html`) for SPA routes on GitHub Pages.

## Option 1: Local Python / serve

```bash
npm run react:export-cutover
cd web-ui/public && python3 -m http.server 8000
# http://localhost:8000/          React
# http://localhost:8000/legacy/   rollback
```

```bash
npx serve health-analyzer/web-ui/public -l 8000
```

## Option 2: GitHub Pages (this repo)

### GitHub Actions

On push to `main`:

1. **test** job: lib tests + `export-cutover` (base `/` for e2e) + smoke + Playwright  
2. **deploy** job: `export-cutover` with `GITHUB_PAGES_DEPLOY=true` → base `/<repo>/` + `404.html` → upload `web-ui/public/`

1. **Settings → Pages → Source**: **GitHub Actions**
2. `git push origin main`
3. Open `https://<USER>.github.io/health-analyzer/`  
   Legacy: `https://<USER>.github.io/health-analyzer/legacy/`

React assets are **built on the deploy runner** (not committed). Root `index.html` / `assets/` are gitignored.

## Option 3: Cloudflare

`wrangler.toml` → `assets.directory = ./web-ui/public`. Prefer `VITE_BASE=/` unless hosting under a subpath.

### B. Classic `gh-pages` branch

1. Publish contents of `web-ui/public/` to a `gh-pages` branch  
2. Settings → Pages → Source: `gh-pages`  
3. Visit `https://<your-name>.github.io/<repo>/`

## Option 4: Netlify / Vercel / Cloudflare Pages

1. Sign in (GitHub is fine)  
2. New site → select the repository  
3. Build command: leave empty (or run `cd lib && npm ci && npm run build` if you prefer CI rebuild)  
4. Publish directory: `web-ui/public` (or `health-analyzer/web-ui/public` if the monorepo root is parent)  
5. Deploy → HTTPS URL provided automatically  

## Option 5: Your own VPS

```bash
scp -r health-analyzer/web-ui/public user@server:/var/www/health-analyzer
```

Example nginx:

```nginx
server {
    listen 80;
    server_name health.example.com;
    root /var/www/health-analyzer;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Optional HTTPS:

```bash
certbot --nginx -d health.example.com
```

## Option 6: Fully offline (no host)

Open `index.html` via `file://` on a personal device.

Caveats:

- iOS Safari will not install a PWA from `file://`
- Some File API behavior differs under `file://`
- Service Worker does not register on `file://` (core parse/stats still work)

## Add to Home Screen

After HTTPS (or localhost) deploy:

- **iOS Safari**: Share → **Add to Home Screen**
- **Android Chrome**: menu → **Add to Home Screen** / **Install app**

Then launch from the icon; offline use is supported when SW is active.

## Verify deployment

In the browser console:

```js
HealthAnalyzer.parseHealthXml
```

Should be a function. If `undefined`, `lib.js` failed to load.

## Troubleshooting

| Issue | What to try |
|---|---|
| Parse completes with no metrics | Confirm XML is named `export.xml` or `导出.xml` inside the ZIP |
| ZIP fails to open | Prefer local `fflate.min.js` (already bundled). Fall back to **single XML file** import |
| Folder import does nothing | Needs `webkitdirectory`; desktop Chrome/Edge work best; iOS Safari is file-oriented |
| Blank UI / missing data | Use Chrome 100+ / Safari 16+ |
| Service Worker not registered | Requires HTTPS or `localhost`; plain HTTP sites skip SW (core features still work) |
| Stale UI after deploy | Hard refresh or bump SW `CACHE_NAME`; network-first reduces staleness |

## Customization

### Colors

Edit CSS variables at the top of `web-ui/public/styles.css`:

```css
:root {
  --primary: #2980b9;
  --primary-dark: #1a5276;
  --primary-light: #ebf5fb;
  /* … */
}
```

### Prompt tone / structure

Edit `MAIN_PROMPT_TEMPLATE` in `lib/src/prompts/llm-prompt.ts`, then:

```bash
cd lib && npm run build
```

### New metric dimension

1. Add fields in `lib/src/types.ts`  
2. Parse in `lib/src/parser.ts`  
3. Aggregate in `lib/src/stats.ts` (and signals / weekly report if needed)  
4. Format sections in `lib/src/prompts/llm-prompt.ts` → `formatAnalysisForLLM()`  
5. `cd lib && npm run build`  
6. Render in `web-ui/public/app.js` (`renderSummary`, charts, etc.)  

### UI copy / i18n

Locale resources live under `web-ui/public/i18n/`. Prefer keys over hard-coded strings when extending the UI. Documentation is bilingual: Chinese under `docs/`, English under `docs/en/`.
