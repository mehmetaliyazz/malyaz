/* Malyaz çevrimdışı çalışma */
const CACHE = 'malyaz-1.0.0';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ebru.js', 'manifest.webmanifest',
  'fonts/Lora-Variable.woff', 'fonts/Lora-Italic-Variable.woff', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/data/')) return; // içerik her zaman ağdan; uygulama kendi kopyasını tutar
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
