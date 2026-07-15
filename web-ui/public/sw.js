/* Apple Health 数据分析 PWA Service Worker */
/* 离线缓存所有静态资源，所有数据处理在本地完成 */

const CACHE_NAME = 'health-analyzer-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './fflate.min.js',
  './lib.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).catch(() => {
          /* 离线时返回缓存的根页面 */
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        })
    )
  );
});