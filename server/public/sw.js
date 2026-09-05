// Minimal service worker: network-first for the app shell, no video caching
// (reels are large and served over the LAN — caching them would bloat storage).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/reels/") || url.pathname.startsWith("/api/") || e.request.method !== "GET")
    return;
  e.respondWith(
    (async () => {
      const cache = await caches.open("rikrok-shell-v1");
      try {
        const resp = await fetch(e.request);
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      } catch {
        const cached = await cache.match(e.request);
        return cached || Response.error();
      }
    })(),
  );
});
