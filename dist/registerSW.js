// V16.2 — PWA OFF. Just nuke everything and let browser HTTP cache do its job.
// V16.1 force-reload loop was unreliable (race between unregister and reload).
// V16.2: nuke all SWs, nuke all caches, do NOT re-register. The PWA is disabled.
// The browser's normal HTTP cache will serve the latest index.html with cache
// headers from gh-pages. The user's hard refresh will then bypass HTTP cache.
//
// Why no re-register: the PWA SW was a Vite-plugin-pwa auto-generated service
// worker that aggressively precached chunks. Once the user upgrades, the old
// SW keeps serving stale precached content. We don't need a SW for this app —
// it's a dashboard, not an offline-first tool. Plain HTTP cache is fine.
(function () {
  if (!('serviceWorker' in navigator)) return;

  // Step 1: unregister all SWs
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  });

  // Step 2: nuke ALL caches
  if (window.caches) {
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        caches.delete(k).catch(() => {});
      });
    });
  }

  // Do NOT re-register. PWA disabled.
  // Next time the user loads the page, browser will fetch fresh index.html
  // and all V16 chunks from network (after hard refresh).
})();
