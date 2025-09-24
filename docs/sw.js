
// sw.js — strict like/vote-only notifications + toggle/backlog + entry-burst guard
// Version bump to force update
const SW_VERSION = "v10";

// === runtime state (in-memory; persists while SW stays alive) ===
self.__dedup = self.__dedup || {};
self.__notifyOn = (typeof self.__notifyOn === "boolean") ? self.__notifyOn : true;
self.__baseAt = self.__baseAt || 0;                    // ignore payloads with ts < baseAt
self.__backlog = self.__backlog || [];                 // queued notifications while OFF
self.__BACKLOG_MAX = 200;
self.__BACKLOG_TTL = 1000 * 60 * 60 * 48;              // 48h

// Fast takeover so the new SW activates immediately
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

// ---- debug echo to page (optional) ----
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
function isFresh(ts) {
  if (!ts || !Number.isFinite(Number(ts))) return true; // if no ts, consider fresh
  const t = Number(ts);
  if (self.__baseAt && t < self.__baseAt) return false;
  return true;
}
function keepBacklog(arr) {
  const now = Date.now();
  const fresh = arr.filter(n => (now - (n.ts||0)) < self.__BACKLOG_TTL);
  while (fresh.length > self.__BACKLOG_MAX) fresh.shift();
  self.__backlog = fresh;
}
function enqueueBacklog(n) {
  const rec = {
    title: n.title || "aud:",
    opt: Object.assign({}, n.opt || {}),
    ts: n.ts || Date.now()
  };
  if (!rec.opt.tag && n.tag) rec.opt.tag = n.tag;
  if (!rec.opt.data && n.data) rec.opt.data = n.data;
  self.__backlog.push(rec);
  keepBacklog(self.__backlog);
  echoToClients({ phase: "queued", tag: rec.opt.tag || "", size: self.__backlog.length });
}
async function flushBacklog(limit = 50) {
  keepBacklog(self.__backlog);
  if (!self.__backlog.length) return 0;
  const cut = Math.max(0, self.__backlog.length - limit);
  const recent = self.__backlog.slice(cut);
  self.__backlog = self.__backlog.slice(0, cut);
  if (cut > 0) {
    await safeShowNotification("aud:", { body: `Skipped ${cut} older notifications`, tag: `replay:summary:${Date.now()}` });
  }
  for (const it of recent) {
    const tagWithTs = it.opt?.tag ? `${it.opt.tag}@${it.ts}` : `replay:${it.ts}`;
    const opt = Object.assign({}, it.opt, { tag: tagWithTs });
    await safeShowNotification(it.title, opt);
    await new Promise(r => setTimeout(r, 30));
  }
  return recent.length;
}

// ---- push: only like/vote + gates ----
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json() || {}; } catch { payload = { title: "aud:", body: event.data.text() }; }
  const tag = String(payload.tag || "");
  const typ = String(payload?.data?.type || "");
  const ts  = Number(payload?.data?.ts || 0);

  if (!isAllowedTag(tag, typ)) {
    event.waitUntil(echoToClients({ phase: "blocked", via: "push", tag }));
    return;
  }
  if (!isFresh(ts)) {
    event.waitUntil(echoToClients({ phase: "stale", via: "push", tag, ts }));
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

  if (!self.__notifyOn) {
    enqueueBacklog({ title, opt, data: opt.data, ts });
    return;
  }

  event.waitUntil(safeShowNotification(title, opt));
});

// ---- message channel ----
self.addEventListener("message", (event) => {
  const msg = event?.data || {};

  // Toggle ON/OFF + session base time
  if (msg.type === "NOTIFY_TOGGLE") {
    self.__notifyOn = !!msg.on;
    // Optionally set baseAt if provided
    if (msg.baseAt && Number.isFinite(Number(msg.baseAt))) self.__baseAt = Number(msg.baseAt);
    event.waitUntil(echoToClients({ phase: "toggle", on: self.__notifyOn, baseAt: self.__baseAt }));
    if (self.__notifyOn) {
      event.waitUntil(flushBacklog());
    }
    return;
  }
  if (msg.type === "NOTIFY_SESSION") {
    if (msg.baseAt && Number.isFinite(Number(msg.baseAt))) self.__baseAt = Number(msg.baseAt);
    if (typeof msg.on === "boolean") self.__notifyOn = !!msg.on;
    event.waitUntil(echoToClients({ phase: "session", on: self.__notifyOn, baseAt: self.__baseAt }));
    return;
  }

  // LOCAL_NOTIFY with same policy, but require explicit opt.force to allow from page
  if (msg.type === "LOCAL_NOTIFY") {
    const payload = msg.payload || {};
    const tag = String(payload?.opt?.tag || "");
    const typ = String(payload?.data?.type || "");
    const ts  = Number(payload?.data?.ts || payload?.opt?.ts || Date.now());
    const force = payload?.opt?.force === true;

    if (!force) {
      echoToClients({ phase: "blocked", via: "message", tag, reason: "no-force" });
      return;
    }
    if (!isAllowedTag(tag, typ)) {
      echoToClients({ phase: "blocked", via: "message", tag });
      return;
    }
    if (!isFresh(ts)) {
      echoToClients({ phase: "stale", via: "message", tag, ts });
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

    if (!self.__notifyOn) {
      enqueueBacklog({ title, opt, data: opt.data, ts });
      return;
    }

    event.waitUntil(safeShowNotification(title, opt));
    return;
  }
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
