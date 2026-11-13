/* Mercato: only a public, static offline notice is stored. No business-data cache. */
const CACHE_NAME = "mercato-offline-v1";
const OFFLINE_URL = "/mercato-offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(new Request(OFFLINE_URL, { cache: "reload", credentials: "omit" }))));
  // Never skipWaiting/reload: open forms and pricing drafts must not be interrupted.
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("mercato-offline-") && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  // APIs (including OAuth), documents/assets, non-GET and external requests bypass the worker.
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin ||
      /^\/(?:api|manus-storage)(?:\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(OFFLINE_URL)) || new Response("Mercato sem conexão. Reconecte à internet para continuar.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }));
});
