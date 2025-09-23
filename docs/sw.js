
// sw.js — minimal listener used only when you decide to enable native notifications.
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });

// Receive local notifications from the page
self.addEventListener("message", (ev) => {
  const msg = ev?.data || {};
  if (msg.type === "LOCAL_NOTIFY") {
    const p = msg.payload || {};
    const title = p.title || "";
    const sub   = p.sub || "";
    const opt   = Object.assign({
      body: sub,
      icon: "./asset/icon-192.png",
      badge: "./asset/badge-72.png",
      tag: p.opt?.tag || undefined,
      data: p.opt?.data || null,
      renotify: !!(p.opt?.renotify),
      actions: p.opt?.actions || []
    }, p.opt || {});
    try { self.registration.showNotification(title, opt); } catch {}
  }
});

// Click-through
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/me.html";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
