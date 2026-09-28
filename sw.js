// Stale-while-revalidate: instant offline loads, fresh files picked up on the next visit.
const CACHE = 'tonequest-v3';
const FILES = ['./', 'index.html', 'app.js', 'game.js', 'fonts/pixelify.ttf', 'fonts/vt323.ttf', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'audio/manifest.json', 'audio/manifest.js'];

self.addEventListener('install', e => {
  // Pregenerated clips (audio-cmn + Piper, via tools/generate-audio.sh) are precached from audio/manifest.json
  // after the core list so a missing corpus can never block installation.
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES);
    try {
      const r = await fetch('audio/manifest.json'); if (!r.ok) return;
      const m = await r.json();
      await Promise.allSettled(m.files.map(f => c.add('audio/' + f)));
    } catch (err) {}
  }));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const key = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  }));
});
