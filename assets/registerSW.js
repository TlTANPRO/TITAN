if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      const unregisterPromises = regs.map((r) => r.unregister().catch(() => {}));
      Promise.all(unregisterPromises).then(() => {
        if (window.caches) {
          caches.keys().then((keys) => {
            keys.forEach((k) => {
              if (k.includes('workbox-precache') || k.includes('vite-pwa') || k.includes('titan')) {
                caches.delete(k).catch(() => {});
              }
            });
          });
        }
        navigator.serviceWorker.register('/TITAN/sw.js', { scope: '/TITAN/' }).then((reg) => {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        }).catch(() => {});
      });
    });
  });
}
