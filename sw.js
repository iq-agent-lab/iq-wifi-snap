// sw.js - service worker
// 전략:
//   - 앱 셸 (HTML/CSS/JS/icon): cache-first + 백그라운드 갱신 (stale-while-revalidate)
//   - 외부 CDN (fonts, qrcode): cache-first
//   - Anthropic API: network-only (캐시 절대 안 함)

const CACHE = 'iq-wifi-snap-v0.7.0';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './lib/claude.js',
  './lib/wifi.js',
  './lib/storage.js',
  './lib/location.js',
  './lib/share.js',
  './lib/kakao.js',
  './lib/ocr.js',
  './lib/parser.js',
  './lib/env.js',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Anthropic API는 캐시 안 함
  if (url.host === 'api.anthropic.com') return;

  // stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
