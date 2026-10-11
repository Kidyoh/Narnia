// Offline support: cache the whole game on first load, then serve from cache.
// Bump VERSION whenever files change so phones pick up the update.
const VERSION = 'hillward-v1';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/levels.js',
  'js/terrain.js',
  'js/player.js',
  'js/world.js',
  'js/bot.js',
  'js/background.js',
  'js/draw.js',
  'js/audio.js',
  'js/storage.js',
  'js/color.js',
  'js/rng.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive when online), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
