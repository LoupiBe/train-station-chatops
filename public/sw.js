/**
 * Service Worker: Assistant des horaires La Station
 * Cache version: kiosk-chatops-v0.5.1
 */

const CACHE_NAME = 'kiosk-chatops-v0.5.1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/chat.js',
  '/js/image-processor.js',
  '/js/schedule-view.js',
  '/js/sw-register.js',
  '/fonts/quicksand-bold.woff2',
  '/manifest.json',
  '/images/logo.png',
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
        const isDeviceOnline = typeof self.navigator !== 'undefined' ? self.navigator.onLine !== false : false;
        if (isDeviceOnline) {
          return new Response(
            JSON.stringify({
              error: "Votre session Cloudflare Zero Trust a expiré. Veuillez recharger la page pour vous reconnecter avec votre code PIN.",
              authExpired: true,
              offline: false
            }),
            {
              status: 401,
              statusText: 'Unauthorized',
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );
        }
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

  // B. Schedule Status API (/api/status): Network-Only with 503 Fallback
  // The client ScheduleViewController manages its own localStorage caching, consecutive failure
  // counting, and amber sync warning banner display. Returning a cached 200 OK would mask network
  // failures and prevent the warning banner from ever displaying.
  if (url.pathname === '/api/status') {
    event.respondWith(
      fetch(request).catch(() => {
        const isDeviceOnline = typeof self.navigator !== 'undefined' ? self.navigator.onLine !== false : false;
        if (isDeviceOnline) {
          return new Response(
            JSON.stringify({
              error: "Votre session Cloudflare Zero Trust a expiré. Veuillez recharger la page pour vous reconnecter avec votre code PIN.",
              authExpired: true,
              offline: false,
              schedule: null
            }),
            {
              status: 401,
              statusText: 'Unauthorized',
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );
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

  // D. Page Navigation Requests (request.mode === 'navigate'): Network-First with Cache Fallback
  // Crucial for Cloudflare Zero Trust authentication:
  // When online, Cloudflare intercepts the navigation request and presents the login/PIN challenge screen
  // if the session has expired. When genuinely offline, the browser catches the network error and
  // seamlessly serves the cached App Shell (/index.html).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'default')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // E. Core App Shell Static Assets: Cache-First with Network Fallback
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
        });
    })
  );
});
