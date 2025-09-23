
/* sw.js — Web Push Service Worker (minimal, production-safe)
   - Shows native notifications even when the page is closed/logged-out.
   - Keeps scope at "/" so it covers all pages that register it.
*/
self.addEventListener("install", (event) => {
  // Activate immediately on first install
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Become the active SW for all clients
  event.waitUntil(self.clients.claim());
});

/** Utility: focus an existing client or open a new one */
async function focusOrOpen(url) {
  try {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Try focus the most recently used visible client
    for (const c of all) {
      try {
        if ("focus" in c) { await c.focus(); }
        if (url && "navigate" in c) {
          // Best-effort; ignore errors
          try { await c.navigate(url); } catch {}
        }
        return;
      } catch {}
    }
    if (url && self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  } catch {}
}

self.addEventListener("push", (event) => {
  // Expect: event.data.json() → { title, body, icon?, badge?, tag?, data? }
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || "aud";
  const body  = payload.body  || "새 알림이 도착했습니다.";
  const opts = {
    body,
    tag: payload.tag || undefined,
    renotify: !!payload.renotify,
    data: payload.data || null,
    // Optional assets (kept light-weight; can be customized server-side)
    icon: payload.icon || "/asset/icon-192.png",
    badge: payload.badge || "/asset/badge-72.png",
    actions: payload.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./me.html";
  event.waitUntil(focusOrOpen(url));
});
