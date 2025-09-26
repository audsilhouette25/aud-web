/* sw.js — like/vote notifications with queueing, session cutoff, and instant activation (patched 2025-09-26)
 * - Accepts payloads missing 'tag' by inferring from kind/itemId (e.g., item:like → like:{id})
 * - Flushes backlog on OFF→ON and also broadcasts flushed items to pages
 * - Uses scope-relative URL in notificationclick to support GitHub Pages subpaths
 * - Broadcasts push events to all open pages so the in-page Alarm list is updated in real time
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => { try { await self.clients.claim(); } catch {} })());
});

/** Backlog & policy */
self.__BACKLOG = self.__BACKLOG || [];
const Q_TTL_MS = 1000 * 60 * 60 * 48; // 48h
const Q_MAX    = 500;
let TOGGLE_ON  = true;  // page will sync actual value
let BASE_AT    = 0;     // session baseline (ignore ts < BASE_AT)

function keepFreshQueue(){
  const now = Date.now();
  self.__BACKLOG = (self.__BACKLOG || []).filter(n => (now - (n.ts || 0)) < Q_TTL_MS);
  if (self.__BACKLOG.length > Q_MAX) self.__BACKLOG = self.__BACKLOG.slice(-Q_MAX);
}

async function broadcastToPages(msg){
  try {
    const all = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const c of all) c.postMessage(msg);
  } catch {}
}

async function flushQueue(reg, limit = 100){
  keepFreshQueue();
  const out = self.__BACKLOG.splice(0, limit);
  for (const n of out){
    const { t, b, tag, ts, kind, itemId, thumb } = n;
    try {
      await reg.showNotification(t || "알림", {
        body: b || "",
        tag,
        data: { ts, kind, itemId },
        renotify: false,
        requireInteraction: false,
        ...(thumb ? { icon: thumb, image: thumb } : {})
      });
      // Mirror to pages as well (so in-page Alarm updates for flushed notices)
      await broadcastToPages({ __fromSW:'push', tag, ts, kind, itemId, title: t, body: b });
    } catch {}
  }
}

self.addEventListener('message', (ev) => {
  const d = ev.data || {};
  if (d.type === 'PING') {
    try { ev.ports && ev.ports[0] && ev.ports[0].postMessage({ ok:true, pong:true, at: Date.now() }); } catch {}
    return;
  }
  if (d.type === 'NOTIFY_SESSION'){
    BASE_AT = Number(d.baseAt || Date.now());
    TOGGLE_ON = d.hasOwnProperty('on') ? !!d.on : (d.hasOwnProperty('enabled') ? !!d.enabled : TOGGLE_ON);
  } else if (d.type === 'NOTIFY_TOGGLE'){
    const prev = !!TOGGLE_ON;
    TOGGLE_ON = (d.hasOwnProperty('on') ? !!d.on : !!d.enabled);
    if (!prev && TOGGLE_ON) {
      self.registration && flushQueue(self.registration, 100);
    }
  } else if (d.type === 'DEBUG_ENQUEUE'){
    const p = d.payload || {};
    self.__BACKLOG.push({
      t: p.title, b: p.body, tag: p.tag || `like:debug-${Date.now()}`,
      ts: p.ts || Date.now(), kind: p.kind || 'like', itemId: p.itemId || 'debug', thumb: p.thumb
    });
  }
});

self.addEventListener('push', (ev) => {
  let payload = {};
  try { payload = ev.data ? ev.data.json() : {}; } catch {}

  const data   = payload.data || {};
  const kind   = String(payload.kind   ?? data.kind   ?? "");
  const itemId = String(payload.itemId ?? data.itemId ?? data.id ?? "");
  const ts     = Number(payload.ts     ?? data.ts     ?? Date.now());
  const t      = String(payload.title  || "알림");
  const b      = String(payload.body   || "");
  const thumb  = payload.thumb || null;

  // Prefer explicit 'tag'; otherwise infer from kind/itemId
  let tag = String(payload.tag ?? data.tag ?? "");
  if (!tag) {
    if (/^item:like$/i.test(kind) || /^like$/i.test(kind)) tag = itemId ? `like:${itemId}` : "like";
    else if (/^vote(?::update)?$/i.test(kind))             tag = itemId ? `vote:${itemId}` : "vote";
  }
  // Normalize legacy shapes
  tag = tag.replace(/^item-like:/i, 'like:')
           .replace(/^vote-update:/i, 'vote:');

  // Policy 1: only like/vote
  if (!/^like:/.test(tag) && !/^vote:/.test(tag)) return;
  // Policy 2: session freshness
  if (ts < (BASE_AT || 0)) return;

  if (!TOGGLE_ON){
    self.__BACKLOG.push({ t, b, tag, ts, kind, itemId, thumb });
    keepFreshQueue();
    return;
  }

  ev.waitUntil((async () => {
    try {
      const reg = self.registration;
      await reg.showNotification(t, {
        body: b, tag,
        data: { ts, kind, itemId },
        renotify: false,
        requireInteraction: false,
        ...(thumb ? { icon: thumb, image: thumb } : {})
      });
      await broadcastToPages({ __fromSW:'push', tag, ts, kind, itemId, title: t, body: b });
    } catch {}
  })());
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const dest = new URL(`./me.html#item=${encodeURIComponent(ev.notification?.data?.itemId || '')}`,
                       self.registration.scope).toString();
  ev.waitUntil(self.clients.openWindow(dest));
});
