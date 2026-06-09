importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");

if (workbox) {
  const manifest = self.__WB_MANIFEST;

  // Force skip waiting and claim clients immediately so new builds take effect without stale tabs blocking them
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  // Define precache logging plugin
  const logPrecachePlugin = {
    cachedResponseWillBeUsed: async ({ cacheName, request, cachedResponse }) => {
      if (cachedResponse) {
        console.log(`[Service Worker] Precache HIT [${cacheName}]: ${request.url}`);
      } else {
        console.warn(`[Service Worker] Precache MISS [${cacheName}]: ${request.url}`);
      }
      return cachedResponse;
    },
  };
  workbox.precaching.addPlugins([logPrecachePlugin]);

  // Log precached assets on start
  console.log("[Service Worker] Initializing precached route bundles...");
  manifest.forEach((entry) => {
    console.log(`[Service Worker] Precached route bundle: ${entry.url} (rev: ${entry.revision})`);
  });

  // Precache all assets injected by workbox-build
  workbox.precaching.precacheAndRoute(manifest);

  // Helper function to wrap caching strategies with detailed HIT/MISS/FETCH logging
  const loggedStrategy = (strategyInstance, cacheName) => {
    return async (params) => {
      const { request } = params;
      const url = request.url;

      // Check if it exists in cache first for visual logging
      const cached = await caches.match(request);
      if (cached) {
        console.log(`[Service Worker] Cache HIT [${cacheName}]: ${url}`);
        return cached;
      }

      console.log(`[Service Worker] Cache MISS [${cacheName}]: ${url} -> Fetching from network...`);
      try {
        const response = await strategyInstance.handle(params);
        if (response) {
          console.log(`[Service Worker] Cache FETCH SUCCESS [${cacheName}]: ${url}`);
        } else {
          console.warn(`[Service Worker] Cache FETCH EMPTY RESPONSE [${cacheName}]: ${url}`);
        }
        return response;
      } catch (err) {
        console.error(`[Service Worker] Cache FETCH FAILURE [${cacheName}] for ${url}:`, err);
        throw err;
      }
    };
  };

  // 1. Navigation Route Handler (HTML Shell fallback)
  const navStrategy = loggedStrategy(
    new workbox.strategies.NetworkFirst({
      cacheName: "html-cache",
      networkTimeoutSeconds: 4,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
      ],
    }),
    "html-cache",
  );

  workbox.routing.registerRoute(
    new workbox.routing.NavigationRoute(
      async ({ request, event }) => {
        try {
          return await navStrategy({ request, event });
        } catch (err) {
          // Serve the precached root application shell if network fails
          console.log(
            "[Service Worker] Offline fallback: serving precached root shell /index.html",
          );
          return (
            (await caches.match("/index.html")) || (await caches.match("/")) || Response.error()
          );
        }
      },
      {
        denylist: [/^\/api\//, /^\/~oauth/, /^\/_serverFn/],
      },
    ),
  );

  // 2. Supabase Storage Images
  workbox.routing.registerRoute(
    ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/"),
    loggedStrategy(
      new workbox.strategies.CacheFirst({
        cacheName: "supabase-images",
        plugins: [
          new workbox.expiration.ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
          new workbox.cacheableResponse.CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
      "supabase-images",
    ),
  );

  // 3. Supabase REST Read Operations (StaleWhileRevalidate)
  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/rest/v1/") &&
      request.method === "GET",
    loggedStrategy(
      new workbox.strategies.StaleWhileRevalidate({
        cacheName: "supabase-rest",
        plugins: [
          new workbox.expiration.ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24,
          }),
        ],
      }),
      "supabase-rest",
    ),
  );

  // 4. Static Assets (Scripts, Styles, Fonts, Workers)
  workbox.routing.registerRoute(
    ({ request }) => ["style", "script", "worker", "font"].includes(request.destination),
    loggedStrategy(
      new workbox.strategies.StaleWhileRevalidate({
        cacheName: "assets",
      }),
      "assets",
    ),
  );

  // 5. Normal Images
  workbox.routing.registerRoute(
    ({ request }) => request.destination === "image",
    loggedStrategy(
      new workbox.strategies.CacheFirst({
        cacheName: "images",
        plugins: [
          new workbox.expiration.ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
      "images",
    ),
  );
} else {
  console.error("[Service Worker] Workbox failed to load from CDN.");
}
