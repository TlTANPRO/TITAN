// V16.2 — PWA OFF. No-op service worker that unregisters itself on install.
// Replaces V15.x PWA SW that aggressively precached chunks and caused
// stale-content issues (V15.1 SW kept serving V15.1 chunks after V16 deploy).
// The dashboard doesn't need offline-first PWA — plain HTTP cache is fine.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      // Unregister this SW so it stops controlling the page
      self.registration.unregister(),
      // Claim any open clients briefly, then they'll fall back to no SW
      self.clients.claim(),
    ])
  );
});
// No fetch handler — let everything go to network
