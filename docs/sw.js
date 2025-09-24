/* sw.js — like/vote only + toggle backlog + session freshness */

self.__BACKLOG = self.__BACKLOG || [];
const Q_TTL_MS = 1000*60*60*48;   // 48h
const Q_MAX    = 200;
let TOGGLE_ON  = true;            // assume ON; page will sync actual
let BASE_AT    = 0;               // session baseline (cut older events)

function keepFreshQueue(){
  const now = Date.now();
  self.__BACKLOG = (self.__BACKLOG || []).filter(n => (now - (n.ts||0)) < Q_TTL_MS);
  if (self.__BACKLOG.length > Q_MAX) self.__BACKLOG = self.__BACKLOG.slice(-Q_MAX);
}

async function flushQueue(reg, limit=50){
  keepFreshQueue();
  const out = self.__BACKLOG.splice(0, limit);
  for (const n of out){
    try {
      await reg.showNotification(n.t || n.title || "알림", {
        body: n.b || n.body || "",
        tag: n.tag,
        data: { ts: n.ts, kind: n.kind, itemId: n.itemId },
        renotify: false, requireInteraction: false,
        ...(n.thumb ? { icon: n.thumb, image: n.thumb } : {})
      });
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
    TOGGLE_ON = !!d.on;
  } else if (d.type === 'NOTIFY_TOGGLE'){
    TOGGLE_ON = (d.hasOwnProperty('on') ? !!d.on : !!d.enabled);
    if (TOGGLE_ON){
      self.registration && flushQueue(self.registration, 50);
    }
  }
});

self.addEventListener('push', (ev) => {
  let p = {};
  try { p = JSON.parse(ev.data?.text() || '{}'); } catch {}
  const t = p.t || p.title, b = p.b || p.body;
  const { tag, ts, kind, itemId, thumb } = p;

  // ① like/vote only
  if (!/^like:|^vote:/.test(String(tag||''))) return;
  // ② cut events older than session baseline
  if (Number(ts||0) < Number(BASE_AT||0)) return;

  ev.waitUntil((async () => {
    const reg = await self.registration;
    if (!TOGGLE_ON){
      // ③ when OFF, backlog instead of showing
      self.__BACKLOG.push({ t, b, tag, ts, kind, itemId, thumb });
      keepFreshQueue();
      return;
    }
    // ④ when ON, show immediately
    try {
      await reg.showNotification(t || "알림", {
        body: b || "",
        tag, data: { ts, kind, itemId },
        renotify: false, requireInteraction: false,
        ...(thumb ? { icon: thumb, image: thumb } : {})
      });
    } catch {}
  })());
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = `/me.html#item=${encodeURIComponent(ev.notification.data?.itemId||'')}`;
  ev.waitUntil(clients.openWindow(url));
});
