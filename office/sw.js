// Keeps the app shell on the phone so it opens at once; data always comes from the PC.
const SHELL = 'dp-shell-2', FILES = ['m.html', 'board.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && FILES.some(f => u.pathname.endsWith(f))) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r.clone(); }).catch(() => caches.match(e.request)));
});
