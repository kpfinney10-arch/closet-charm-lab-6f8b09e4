// Service worker for Web Push notifications.
// Receives push events from the server and shows an OS-level notification.

self.addEventListener("install", (event) => {
  // Activate immediately on first install
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any open clients without requiring a reload
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "New update", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Transport Dispatch";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: payload.tag, // collapses duplicates if same tag
    data: { url: payload.url || "/driver" },
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/driver";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
