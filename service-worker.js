const CACHE_NAME = "happy-song-shell-api-observability-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=api-observability-v1",
  "./css/style.css?v=api-observability-v1",
  "./js/app.js?v=api-observability-v1",
  "./js/config.js?v=stable-api-v229",
  "./js/mock-data.js",
  "./js/receipt.js?v=lc-receipt-breakdown-v1",
  "./js/printer-adapter.js?v=lc-receipt-breakdown-v1",
  "./js/offline-store.js?v=offline-mode-v3",
  "./js/api-diagnostics.js?v=api-observability-v1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
