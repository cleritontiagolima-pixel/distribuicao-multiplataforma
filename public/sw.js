// CTUBE Service Worker v5
// - Static assets: cache-first (fast repeat loads).
// - Page navigations: network-only (never cache navigations to avoid stale SPA shells).
// - Offline fallback: serve last cached navigation response only when truly offline.
// - NEVER cache error responses or HTML responses for JS/CSS/font requests.
const CACHE_NAME = "ctube-v5";
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

  // Never intercept API calls, YouTube resources, analytics, or cross-origin requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_vercel/") ||
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("ytimg.com") ||
    url.hostname.includes("ggpht.com") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Page navigation: ALWAYS try network first, never cache.
  // This prevents stale HTML from breaking JS/CSS loading.
  // Only serve cached response when truly offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful HTML responses for offline fallback
          if (response && response.status === 200) {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("text/html")) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) =>
                cache.put(event.request, clone)
              );
            }
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) => cached || caches.match("/")
          )
        )
    );
    return;
  }

  // Static assets and other same-origin GETs: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200) {
          return response;
        }

        const contentType = response.headers.get("content-type") || "";

        // CRITICAL: Never cache HTML responses for JS/CSS/font requests
        const isJsRequest =
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".mjs") ||
          url.pathname.startsWith("/_next/static/");
        const isCssRequest = url.pathname.endsWith(".css");
        const isFontRequest =
          url.pathname.endsWith(".woff") ||
          url.pathname.endsWith(".woff2") ||
          url.pathname.endsWith(".ttf");

        if (
          (isJsRequest || isCssRequest || isFontRequest) &&
          contentType.includes("text/html")
        ) {
          // Server returned HTML for a JS/CSS/font request — do NOT cache
          return response;
        }

        // Only cache actual static assets (JS, CSS, images, fonts)
        if (
          url.pathname.startsWith("/_next/static/") ||
          STATIC_ASSETS.includes(url.pathname) ||
          (url.pathname.endsWith(".js") && contentType.includes("javascript")) ||
          (url.pathname.endsWith(".css") && contentType.includes("text/css")) ||
          url.pathname.endsWith(".png") ||
          url.pathname.endsWith(".jpg") ||
          url.pathname.endsWith(".svg") ||
          url.pathname.endsWith(".ico") ||
          url.pathname.endsWith(".woff") ||
          url.pathname.endsWith(".woff2")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, clone)
          );
        }

        return response;
      });
    })
  );
});
