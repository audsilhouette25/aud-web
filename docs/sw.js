
// sw.js — strict like/vote-only notifications + 10s dedup + debug echo
// Version bump to force update
const SW_VERSION = "v9";
self.__dedup = self.__dedup || {};

// Fast takeover so the new SW activates immediately
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// ---- debug echo to page (optional; harmless if page ignores) ----
self.__DEBUG_ECHO = true;
async function echoToClients(payload) {
  if (!self.__DEBUG_ECHO) return;
  try {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) c.postMessage({ type: "NOTIFY_ECHO", ...payload });
  } catch {}
}
async function safeShowNotification(title, opt) {
  await echoToClients({ phase: "show", tag: opt?.tag || "", title });
  return self.registration.showNotification(title, opt);
}

// ---- helpers ----
function isAllowedTag(tag, typ) {
  if (!tag) tag = "";
  if (!typ) typ = "";
  return /^like:/.test(tag) || /^vote:/.test(tag) || typ === "item:like" || typ === "vote:update";
}
function passDedup(tag, winMs = 10_000) {
  if (!tag) return true;
  const now = Date.now();
  const last = self.__dedup[tag] || 0;
  if (now - last < winMs) return false;
  self.__dedup[tag] = now;
  return true;
}

// ---- push: only like/vote ----
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json() || {}; } catch { payload = { title: "aud:", body: event.data.text() }; }
  const tag = String(payload.tag || "");
  const typ = String(payload?.data?.type || "");

  if (!isAllowedTag(tag, typ)) {
    event.waitUntil(echoToClients({ phase: "blocked", via: "push", tag }));
    return;
  }
  if (tag && !passDedup(tag)) {
    event.waitUntil(echoToClients({ phase: "dedup", via: "push", tag }));
    return;
  }

  const title = payload.title || "aud:";
  const opt = {
    body: payload.body || "",
    icon: "./asset/icon-192.png",
    badge: "./asset/badge-72.png",
    tag: tag || undefined,
    data: payload.data || null,
    renotify: !!payload.renotify,
    actions: payload.actions || []
  };
  event.waitUntil(safeShowNotification(title, opt));
});

// ---- message: LOCAL_NOTIFY with same policy ----
self.addEventListener("message", (event) => {
  const msg = event?.data || {};
  if (msg.type !== "LOCAL_NOTIFY") return;

  const payload = msg.payload || {};
  const tag = String(payload?.opt?.tag || "");
  const typ = String(payload?.data?.type || "");

  if (!isAllowedTag(tag, typ)) {
    echoToClients({ phase: "blocked", via: "message", tag });
    return;
  }
  if (tag && !passDedup(tag)) {
    echoToClients({ phase: "dedup", via: "message", tag });
    return;
  }

  const title = payload.title || "aud:";
  const body  = payload.sub   || payload.body || "";
  const opt   = Object.assign(
    {
      icon: "./asset/icon-192.png",
      badge:"./asset/badge-72.png",
      tag: tag || undefined,
      data: payload.data || null,
      renotify: !!payload.renotify,
      actions: payload.actions || []
    },
    payload.opt || {}
  );

  self.registration.showNotification(title, opt);
});

// optional click handler keep existing behavior minimal-safe
self.addEventListener("notificationclick", (event) => {
  const url = (event.notification?.data?.url) || "./me.html";
  event.notification?.close?.();
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const match = all.find(c => (c.url || "").includes(url));
    if (match) {
      await match.focus();
    } else {
      await clients.openWindow(url);
    }
  })());
});
