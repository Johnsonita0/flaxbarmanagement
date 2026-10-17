const CACHE_NAME = "flexbar-shell-v1";
const APP_SHELL = ["/", "/flexbar-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("flexbar-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (appClient) {
        appClient.postMessage({
          type: "flexbar:open-notification",
          notificationId: data.notificationId,
          notificationType: data.notificationType,
        });
        return appClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedShell = await caches.match("/");
          if (cachedShell) return cachedShell;
          return Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/flexbar-icon.svg") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
