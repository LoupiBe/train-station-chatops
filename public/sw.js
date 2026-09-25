/**
 * Service Worker: Gare de Genval — Kiosque ChatOps
 * Cache version: kiosk-chatops-v0.1.0
 */

const CACHE_NAME = 'kiosk-chatops-v0.1.0';

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/chat.js',
  '/js/schedule-view.js',
  '/js/sw-register.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const OFFLINE_MESSAGE = "Oups, pas de connexion Internet ! 📡 Vérifiez votre réseau pour papoter avec le bot et mettre à jour les horaires.";

// 1. Install Event: Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(APP_SHELL);
      } catch {
        // Resilient fallback in dev if optional assets are missing
        await Promise.all(
          APP_SHELL.map((url) => cache.add(url).catch(() => {}))
        );
      }
    })
  );
  // Deliberately do not call self.skipWaiting() here; allow user-controlled update prompt
});

// 2. Activate Event: Clean up outdated caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Message Listener: Handle SKIP_WAITING from update toast
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Event: Differentiated routing strategies
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-http/https requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // A. API Mutations (/api/chat, /api/confirm): Network-Only
  if (url.pathname === '/api/chat' || url.pathname === '/api/confirm') {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            error: OFFLINE_MESSAGE,
            offline: true
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            }
          }
        );
      })
    );
    return;
  }

  // B. Schedule Status API (/api/status): Network-First with Cache Fallback
  if (url.pathname === '/api/status') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            JSON.stringify({
              error: OFFLINE_MESSAGE,
              offline: true,
              schedule: null
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );
        })
    );
    return;
  }

  // C. Non-GET requests should not be cached
  if (request.method !== 'GET') {
    return;
  }

  // D. Core App Shell & Static Assets: Cache-First with Network Fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'default')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline navigation fallback: serve index.html for SPA page loads
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
