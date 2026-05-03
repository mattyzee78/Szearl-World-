const C = 'szearl-v3';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  if (/firestore\.googleapis\.com|firebase|gstatic\.com/.test(e.request.url)) return;
  e.respondWith(
    caches.open(C).then(cache =>
      fetch(e.request)
        .then(r => { cache.put(e.request, r.clone()); return r; })
        .catch(() => caches.match(e.request))
    )
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: '☀️ Morning Brief', body: 'Your morning brief is ready.' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'morning-brief',
      renotify: true,
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
