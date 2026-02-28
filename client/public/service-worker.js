const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const APP_SHELL_FILES = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Enforce same-origin only
  if (url.origin !== self.location.origin) return;

  // Only cache GET requests
  if (request.method && request.method !== 'GET') {
    // For non-GET API requests, just proxy the network
    if (url.pathname.startsWith('/api')) {
      event.respondWith(fetch(request));
      return;
    }
    // Otherwise let default network behavior proceed
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const respClone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/index.html', respClone));
          return response;
        })
        .catch(() => caches.match('/index.html').then((resp) => resp || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets: cache-first
  if (/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const respClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, respClone));
            return response;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // API requests: stale-while-revalidate
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            cache.put(request, response.clone());
            return response;
          })
          .catch(() => cache.match(request))
      )
    );
    return;
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Notification';
  const body = data.body || '';
  const icon = data.icon || undefined;
  const actions = data.actions || [];
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      tag: data.tag || 'becxus-notification',
      data: data.data,
      actions,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const campaignId = event.notification.data && event.notification.data.campaignId;
  event.waitUntil(
    (async () => {
      try {
        if (campaignId) {
          await fetch('/api/notifications/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId }),
          });
        }
      } catch {}
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })()
  );
});
