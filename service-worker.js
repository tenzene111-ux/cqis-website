// CQIS service worker — app-shell caching so the site can launch and the UI
// remains usable when offline (Firestore handles data sync separately via
// enablePersistence in index.html).
const CACHE_VERSION = 'cqis-shell-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache Firestore/Storage/Auth API calls — Firestore SDK handles its own offline cache
  const url = new URL(req.url);
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebasestorage') ||
      url.hostname.includes('identitytoolkit')) {
    return;
  }

  // Navigation requests (the app shell): network-first, fall back to cache when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          caches.open(CACHE_VERSION).then(cache => cache.put(req, resp.clone()));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Other assets (fonts, CDN scripts, icons): cache-first, then network, caching the result
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          caches.open(CACHE_VERSION).then(cache => cache.put(req, resp.clone()));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
