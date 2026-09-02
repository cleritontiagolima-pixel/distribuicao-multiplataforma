// CTUBE Service Worker - Basic offline caching
const CACHE_NAME = "ctube-v2";
const STATIC_ASSETS = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Don't cache API requests, YouTube, or non-same-origin
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("ytimg.com") ||
    url.hostname.includes("ggpht.com") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful responses with correct content types
        if (response.status === 200) {
          const contentType = response.headers.get("content-type") || "";
          // Don't cache HTML responses for script/style requests
          const isScriptRequest = url.pathname.endsWith(".js") || url.pathname.endsWith(".mjs");
          const isStyleRequest = url.pathname.endsWith(".css");
          const isHtmlResponse = contentType.includes("text/html");

          if ((isScriptRequest || isStyleRequest) && isHtmlResponse) {
            // Server returned HTML for a JS/CSS request - don't cache
            return response;
          }

          // Only cache actual static assets
          if (
            url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/static/") ||
            STATIC_ASSETS.includes(url.pathname) ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".png") ||
            url.pathname.endsWith(".jpg") ||
            url.pathname.endsWith(".svg") ||
            url.pathname.endsWith(".ico") ||
            url.pathname.endsWith(".woff") ||
            url.pathname.endsWith(".woff2")
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }
        return response;
      });
    })
  );
});
