/* sw.js — like/vote notifications with queueing, session cutoff, and instant activation */

/** Ensure new SW takes control ASAP */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => { try { await self.clients.claim(); } catch {} })());
});

/** Backlog & policy */
self.__BACKLOG = self.__BACKLOG || [];
const Q_TTL_MS = 1000 * 60 * 60 * 48; // keep queued notifications up to 48h
const Q_MAX    = 500;                 // backlog cap
let TOGGLE_ON  = true;                // assume ON; the page will sync the actual value
let BASE_AT    = 0;                   // session baseline (cut older events)

function keepFreshQueue(){
  const now = Date.now();
  self.__BACKLOG = (self.__BACKLOG || []).filter(n => (now - (n.ts || 0)) < Q_TTL_MS);
  if (self.__BACKLOG.length > Q_MAX) self.__BACKLOG = self.__BACKLOG.slice(-Q_MAX);
}

async function flushQueue(reg, limit = 100){
  keepFreshQueue();
  const out = self.__BACKLOG.splice(0, limit);
  for (const n of out){
    const { t, b, tag, ts, kind, itemId, thumb } = n;
    try {
      await reg.showNotification(t || "알림", {
        body: b || "",
        tag,                           // OS-level de-dupe by tag
        data: { ts, kind, itemId },
        renotify: false,
        requireInteraction: false,
        ...(thumb ? { icon: thumb, image: thumb } : {})
      });
    } catch {}
  }
}

self.addEventListener('message', (ev) => {
  const d = ev.data || {};
  // Health check for page↔SW roundtrip
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
      // OFF → ON 으로 실제 전환된 경우에만 백로그 방출
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

  const tag   = String(payload.tag || "");
  const kind  = String(payload.kind || "");
  const ts    = Number(payload.ts || Date.now());
  const itemId= String(payload.itemId || "");
  const t     = String(payload.title || "알림");
  const b     = String(payload.body || "");
  const thumb = payload.thumb || null;

  // Policy 1: only like/vote
  if (!/^like:/.test(tag) && !/^vote:/.test(tag)) {
    return;
  }
  // Policy 2: session freshness
  if (ts < (BASE_AT || 0)) {
    return;
  }

  if (!TOGGLE_ON){
    self.__BACKLOG.push({ t, b, tag, ts, kind, itemId, thumb });
    keepFreshQueue();
    return;
  }

  ev.waitUntil((async () => {
    try {
      const reg = self.registration;

      // ① OS 배너 표시
      await reg.showNotification(t, {
        body: b,
        tag,
        data: { ts, kind, itemId },
        renotify: false,
        requireInteraction: false,
        ...(thumb ? { icon: thumb, image: thumb } : {})
      });

      // ② 페이지로 브로드캐스트 (인앱 미러/콘솔 확인용)
      try {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of allClients) {
          c.postMessage({ __fromSW: 'push', tag, ts, kind, itemId, title: t, body: b });
        }
      } catch {}
    } catch {}
  })());
});


self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = `/me.html#item=${encodeURIComponent(ev.notification.data?.itemId || '')}`;
  ev.waitUntil(clients.openWindow(url));
});