// sw.js — Web Push listener (extends your existing minimal SW)
// -----------------------------------------------------------
self.addEventListener("install", (e) => {
  self.skipWaiting();                // 새 워커 즉시 대기 해제
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim()); // 기존 탭도 새 워커가 즉시 장악
});
self.__recentTags = self.__recentTags || new Map();

// Local notifications from page
// 전역(파일 상단 근처)
const SW_VERSION = "v8";                 // ← 버전 변경으로 즉시 업데이트
self.__dedup = self.__dedup || {};
self.__DEBUG_ECHO = true;                // ← 필요 시 true/false 토글

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

// === LOCAL_NOTIFY: like/vote만 표시 + 10초 디듀프 ===
self.addEventListener("message", (event) => {
  const msg = event?.data || {};
  if (msg.type !== "LOCAL_NOTIFY") return;

  const payload = msg.payload || {};
  const tag = String(payload?.opt?.tag || "");

  // 화이트리스트
  const allowed = /^like:|^vote:/.test(tag);
  if (!allowed) { echoToClients({ phase: "blocked", tag, via: "message" }); return; }

  // 디듀프(10초)
  const now = Date.now();
  const last = self.__dedup[tag] || 0;
  if (now - last < 10_000) { echoToClients({ phase: "dedup", tag, via: "message" }); return; }
  self.__dedup[tag] = now;

  const title = payload.title || "aud:";
  const body  = payload.sub   || payload.body || "";
  const opt   = Object.assign(
    {
      icon: "./asset/icon-192.png",
      badge:"./asset/badge-72.png",
      tag,
      data: payload.data || null,
      renotify: !!payload.renotify,
      actions: payload.actions || []
    },
    payload.opt || {}
  );

  safeShowNotification(title, opt);
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json() || {}; }
  catch { payload = { title: "aud:", body: event.data.text() }; }

  const tag = String(payload.tag || "");
  const typ = String(payload?.data?.type || "");
  const allowed =
    /^like:/.test(tag) || /^vote:/.test(tag) ||
    typ === "item:like" || typ === "vote:update";
  if (!allowed) { event.waitUntil(echoToClients({ phase:"blocked", tag, via:"push" })); return; }

  const now = Date.now();
  const last = self.__dedup[tag] || 0;
  if (tag && (now - last < 10_000)) { event.waitUntil(echoToClients({ phase:"dedup", tag, via:"push" })); return; }
  if (tag) self.__dedup[tag] = now;

  const title = payload.title || "aud:";
  const opt = {
    body: payload.body || "",
    icon: "./asset/icon-192.png",
    badge:"./asset/badge-72.png",
    tag,
    data: payload.data || null,
    renotify: !!payload.renotify,
    actions: payload.actions || []
  };
  event.waitUntil(safeShowNotification(title, opt));
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
