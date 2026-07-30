/* Apple Health 数据分析 PWA Service Worker */
/* network-first（HTML/JS/CSS）+ 缓存回退，保持离线可用并减少陈旧资源 */

const CACHE_NAME = 'health-analyzer-v53';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './fflate.min.js',
  './lib.js',
  './charts.js',
  './history-db.js',
  './parse-worker.js',
  './unzip-worker.js',
  './hae-worker.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Activate promptly; UI may still prompt a reload for already-open tabs
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/**
 * 导航 / HTML / JS / CSS：network-first，失败再用 cache（离线仍可用）
 * 其他静态资源（图标等）：cache-first，后台可选更新
 */
function isHtmlJsCss(request, url) {
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  return (
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('/') ||
    path.endsWith('/index.html')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // 后台刷新，不阻塞响应
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => { /* offline */ });
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // 仅处理同源请求
  if (url.origin !== self.location.origin) return;

  if (isHtmlJsCss(event.request, url)) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});
