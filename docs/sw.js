
/* sw.js — Service Worker for Web Push (GH Pages subpath-safe)
   Scope should be the directory where this file lives (e.g., /aud-web/)
*/
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function focusOrOpen(url) {
  try {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all && all.length) {
      const client = all[0];
      try { await client.focus(); } catch {}
      if (url && "navigate" in client) {
        try { await client.navigate(url); } catch {}
      }
      return;
    }
    if (url && self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  } catch {}
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || "aud";
  const body  = payload.body  || "새 알림이 도착했습니다.";
  const opts = {
    body,
    tag: payload.tag || undefined,
    renotify: !!payload.renotify,
    data: payload.data || null,
    icon: payload.icon  || "./asset/icon-192.png",
    badge: payload.badge || "./asset/badge-72.png",
    actions: payload.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./me.html";
  if (event.action === "open") {
    event.waitUntil(self.clients.openWindow(url));
    return;
  }
  event.waitUntil(focusOrOpen(url));
});
