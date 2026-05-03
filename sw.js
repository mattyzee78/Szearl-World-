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
