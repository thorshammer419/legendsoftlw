const CACHE = 'legends-v1';
const OFFLINE_URL = '/offline.html';

// Cache shell assets on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/', '/offline.html'])
    ).then(() => self.skipWaiting())
  );
});

// Clean old caches on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for API, cache-first for assets
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return; // Never cache API calls

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});

// Push notification handler
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: 'The Legends of TLW', body: e.data.text() };
  }

  e.waitUntil(
    self.registration.showNotification(data.title || 'The Legends of TLW', {
      body: data.body || 'Your adventure awaits.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: data,
    })
  );
});

// Tap notification → open app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length > 0) return wins[0].focus();
      return clients.openWindow('/');
    })
  );
});
