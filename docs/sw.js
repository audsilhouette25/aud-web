// sw.js — Web Push listener (extends your existing minimal SW)
// -----------------------------------------------------------
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.__recentTags = self.__recentTags || new Map();

// Local notifications from page
self.addEventListener("message", (ev) => {
  const msg = ev?.data || {};
  if (msg.type === "LOCAL_NOTIFY") {
    const p = msg.payload || {};
    const opt = Object.assign({
      body: p.sub || "",
      icon: "./asset/icon-192.png",
      badge: "./asset/badge-72.png",
      tag:  p.opt?.tag || undefined,
      data: p.opt?.data || null,
      renotify: !!(p.opt?.renotify),
      actions: p.opt?.actions || []
    }, p.opt || {});
    try { self.registration.showNotification(p.title || "", opt); } catch {}
  }
});

// sw.js - push 핸들러 교체
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json() || {}; }
  catch { payload = { title: "aud:", body: event.data.text() }; }

  const tag = String(payload.tag || "");
  const allowed = /^like:|^vote:/.test(tag);   // ★ 좋아요/투표만
  if (!allowed) return;                        // 나머지는 무시

  // ★ 10초 내 동일 tag 중복 방지
  self.__dedup = self.__dedup || {};
  const now = Date.now();
  if (self.__dedup[tag] && (now - self.__dedup[tag] < 10_000)) return;
  self.__dedup[tag] = now;

  const title = payload.title || "aud:";
  const opt = {
    body: payload.body || "",
    icon: "./asset/icon-192.png",
    badge: "./asset/badge-72.png",
    tag,
    data: payload.data || null,
    renotify: !!payload.renotify,
    actions: payload.actions || []
  };
  event.waitUntil(self.registration.showNotification(title, opt));
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

// Chrome can rotate the key; try to resubscribe here if you want (requires an API)
// For now, just log.
self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("[sw] pushsubscriptionchange:", event);
});
