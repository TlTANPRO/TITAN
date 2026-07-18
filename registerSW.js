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
        navigator.serviceWorker.register('/TITAN/sw.js', { scope: '/TITAN/' }).catch(() => {});
      });
    });
  });
}
