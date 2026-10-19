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
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const data = payload && typeof payload === "object" ? payload : {};
  const title = typeof data.title === "string" ? data.title : "Flex Bar call";
  const body = typeof data.body === "string" ? data.body : "You have an incoming call.";
  const callId = typeof data.callId === "string" ? data.callId : null;
  const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;
  const isIncomingCall = data.type === "incoming-call" && typeof callId === "string";
  const showNotification = self.registration.showNotification(title, {
    body,
    icon: "/icons/flexbar-192.png",
    requireInteraction: isIncomingCall,
    renotify: true,
    vibrate: isIncomingCall ? [450, 200, 450, 200, 700] : [200, 100, 200],
    ...(isIncomingCall ? {
      actions: [
        { action: "answer", title: "Answer" },
        { action: "decline", title: "Decline" },
      ],
    } : {}),
    tag: callId
      ? `flexbar-call-${callId}`
      : notificationId ? `flexbar-notification-${notificationId}` : "flexbar-notification",
    data: {
      type: data.type === "incoming-call" ? "incoming-call" : "workspace-notification",
      callId,
      notificationId,
      notificationType: typeof data.notificationType === "string" ? data.notificationType : "unknown",
      mediaMode: data.mediaMode === "video" ? "video" : "audio",
      url: typeof data.url === "string" ? data.url : "/",
    },
  });
  const notifyOpenClients = data.type === "incoming-call"
    ? Promise.resolve()
    : self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: "flexbar:notification",
          notificationId,
          notificationType: typeof data.notificationType === "string" ? data.notificationType : "unknown",
        });
      }
    });
  event.waitUntil(Promise.all([showNotification, notifyOpenClients]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const isIncomingCall = data.type === "incoming-call" && typeof data.callId === "string";
  const callAction = isIncomingCall
    ? event.action === "answer" || event.action === "decline" ? event.action : "open"
    : null;
  const target = new URL(data.url || "/", self.location.origin);
  if (isIncomingCall) {
    target.searchParams.set("incomingCallId", data.callId);
    target.searchParams.set("incomingCallAction", callAction);
  } else if (typeof data.notificationId === "string") {
    target.searchParams.set("notificationId", data.notificationId);
    target.searchParams.set("notificationType", typeof data.notificationType === "string" ? data.notificationType : "unknown");
  }
  const targetUrl = `${target.pathname}${target.search}${target.hash}`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (appClient) {
        if (isIncomingCall) {
          return appClient.navigate(targetUrl).then((navigatedClient) =>
            (navigatedClient || appClient).focus(),
          );
        }
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
