if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      // Force unregister semua SW lama, lalu register ulang yang baru
      const unregisterPromises = regs.map((r) => r.unregister().catch(() => {}));
      Promise.all(unregisterPromises).then(() => {
        // Clear Cache Storage lama (jaga-jaga asset usang)
        if (window.caches) {
          caches.keys().then((keys) => {
            keys.forEach((k) => {
              if (k.includes('workbox-precache') || k.includes('vite-pwa') || k.includes('titan')) {
                caches.delete(k).catch(() => {});
              }
            });
          });
        }
        // Register SW baru (Vite PWA autoUpdate)
        navigator.serviceWorker.register('/TITAN/sw.js', { scope: '/TITAN/' })
          .then((reg) => {
            // Jika ada SW baru waiting, kirim SKIP_WAITING message agar langsung activate
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            // Listen update found: ketika SW baru installing → activated
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // Ada update baru tapi page masih dikontrol SW lama
                    // Trigger skipWaiting via message (SW akan handle di activate event)
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
          })
          .catch(() => {});
      });
    });
  });

  // Listen controllerchange: track ketika ada SW baru take over (no reload, biar smooth)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // SW baru telah activate, dashboard sudah served dari cache baru.
    // Tidak perlu reload — current load selesai dengan SW lama, next nav akan pakai SW baru.
  });
}
