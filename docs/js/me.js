
/* me.js — notifications only when *others* change your items (no re-fire on reload)
 * - Tracks previous like/vote snapshots in sessionStorage by NS.
 * - Pushes a notice only if the new value strictly increases vs previous snapshot.
 * - Also ignores events whose actor/by equals MY_UID.
 */

(function(){
  const $  = (sel, root = document) => root.querySelector(sel);
  const parseJSON = (s, d=null) => { try { return JSON.parse(s); } catch { return d; } };
  const getNS = () => { try { return (localStorage.getItem("auth:userns") || "default").trim().toLowerCase(); } catch { return "default"; } };
  const NOTIFY_KEY = "me:notify-enabled";
  const NATIVE_KEY = "me:notify-native";
  const isNotifyOn = () => { try { return localStorage.getItem(NOTIFY_KEY) === "1"; } catch { return false; } };
  const wantsNative = () => { try { return localStorage.getItem(NATIVE_KEY) === "1"; } catch { return false; } };

  // Externs provided by existing app (no-op safe)
  const qty = (n, word) => `${Number(n||0)} ${word}${Number(n||0)===1?"":"s"}`;
  const pushNotice = (title, sub, opt={}) => {
    // Existing in-page toast + optional native path; this wrapper just re-exposes
    try { window.__pushNotice(title, sub, opt); } catch {}
    // Optional native via SW
    try {
      if (wantsNative() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.active?.postMessage({ type:"LOCAL_NOTIFY", payload:{ title, sub, opt } });
        }).catch(()=>{});
      }
    } catch {}
  };

  // -------------------------
  // Snapshot storage helpers
  // -------------------------
  const LIKE_KEY  = () => `me:prev-likes:${getNS()}`;
  const VOTE_KEY  = () => `me:prev-votes:${getNS()}`;
  function readPrevLikes() { try { return parseJSON(sessionStorage.getItem(LIKE_KEY()), {}); } catch { return {}; } }
  function writePrevLikes(m) { try { sessionStorage.setItem(LIKE_KEY(), JSON.stringify(m||{})); } catch {} }
  function readPrevVotes() { try { return parseJSON(sessionStorage.getItem(VOTE_KEY()), {}); } catch { return {}; } }
  function writePrevVotes(m) { try { sessionStorage.setItem(VOTE_KEY(), JSON.stringify(m||{})); } catch {} }

  function voteTotal(counts) {
    if (!counts || typeof counts !== "object") return 0;
    try { return Object.values(counts).map(Number).reduce((a,b)=>a+b,0); } catch { return 0; }
  }

  // State visible inside this file
  let MY_UID = null;       // filled after /auth/me
  let socket = null;
  let MY_ITEM_IDS = new Set();

  // Boot: fetch my identity early so actor!=me check is reliable
  (async function bootIdentity(){
    try {
      const r = await fetch("/auth/me", { credentials:"include" });
      if (r.ok) {
        const j = await r.json().catch(()=>null);
        MY_UID = j?.user?.id ?? j?.id ?? null;
      }
    } catch {}
  })();

  // Utility to update my item ids (allows server to subscribe me to my rooms)
  function updateMyItemRooms(ids = []) {
    try {
      MY_ITEM_IDS = new Set((ids||[]).map(v => String(v)));
      if (socket?.connected) {
        const watch = (localStorage.getItem("me:watched-ns") || "[]");
        const payload = { items: [...MY_ITEM_IDS], ns: getNS() };
        try { payload.watch = JSON.parse(watch); } catch {}
        socket.emit("subscribe", payload);
      }
    } catch {}
  }
  window.__meUpdateItemRooms = updateMyItemRooms;

  // ---------------
  // Socket wiring
  // ---------------
  function ensureSocket() {
    if (!window.io) return null;
    if (socket && socket.connected !== undefined) {
      // reuse
    } else if (window.sock && window.sock.connected !== undefined) {
      socket = window.sock;
    } else {
      socket = window.io({ path: "/socket.io" });
      try { window.sock = socket; } catch {}
    }
    if (!socket.__meHandlersAttached) {
      Object.defineProperty(socket, "__meHandlersAttached", { value: true, enumerable: false });

      socket.on("connect", () => {
        const watch = (localStorage.getItem("me:watched-ns") || "[]");
        const payload = { items: [...MY_ITEM_IDS], ns: getNS() };
        try { payload.watch = JSON.parse(watch); } catch {}
        socket.emit("subscribe", payload);
      });

      socket.on("item:like", (p) => {
        if (!isNotifyOn()) return;
        if (!p || !p.id) return;
        // mine or watched?
        const mineMatch = MY_ITEM_IDS.has(String(p.id));
        const ownerNS = String(p?.owner?.ns || p?.ns || "").toLowerCase();
        const nsMatch  = ownerNS && (ownerNS === getNS());
        if (!(mineMatch || nsMatch)) return;

        // actor self guard
        if (MY_UID && (String(p.by) === String(MY_UID) || String(p.actor) === String(MY_UID))) return;

        // increase-only guard
        const prev = readPrevLikes();
        const id   = String(p.id);
        const nowLikes = Number(p.likes || 0);
        const before   = Number(prev[id] || 0);
        if (nowLikes > before && p.liked) {
          pushNotice("My post got liked", `Total ${qty(nowLikes, "like")}`, { tag:`like:${id}`, data:{ id } });
          prev[id] = nowLikes;
          writePrevLikes(prev);
        } else {
          // keep the higher watermark so reload doesn't re-fire
          if (nowLikes > before) { prev[id] = nowLikes; writePrevLikes(prev); }
        }
      });

      socket.on("vote:update", (p) => {
        if (!isNotifyOn()) return;
        if (!p || !p.id) return;

        // guard by mine or watched ns
        const mineMatch = MY_ITEM_IDS.has(String(p.id));
        const ownerNS = String(p?.owner?.ns || p?.ns || "").toLowerCase();
        const nsMatch  = ownerNS && (ownerNS === getNS());
        if (!(mineMatch || nsMatch)) return;

        // actor self guard
        if (MY_UID && (String(p.by) === String(MY_UID) || String(p.actor) === String(MY_UID))) return;

        const id = String(p.id);
        const counts = p.counts || {};
        const total  = voteTotal(counts);

        const prev = readPrevVotes();
        const before = Number(prev[id]?.total || 0);

        if (total > before) {
          // build a human label
          let label = "—";
          try {
            const entries = Object.entries(counts);
            const max = Math.max(...entries.map(([, n]) => Number(n||0)), 0);
            const tops = entries.filter(([, n]) => Number(n||0) === max && max>0).map(([k])=>k);
            label = tops.length ? tops.join(", ") : "—";
          } catch {}
          pushNotice("My post votes have been updated", `Top: ${label} · Total ${qty(total, "vote")}`, { tag:`vote:${id}`, data:{ id } });
          prev[id] = { total };
          writePrevVotes(prev);
        } else {
          if (total > before) { prev[id] = { total }; writePrevVotes(prev); }
        }
      });
    }
    return socket;
  }

  // Make sure socket exists early (safe if unused)
  ensureSocket();

  // -----------------------------
  // BroadcastChannel from mine.js
  // -----------------------------
  try {
    const CH = (window.FEED_EVENT_KIND || "feed:event");
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CH) : null;
    bc?.addEventListener("message", (ev) => {
      const { type:t, data:d } = ev?.data || {};
      if (!t || !d) return;

      // Act only when notify is ON
      if (!isNotifyOn()) return;

      // actor self guard
      if (MY_UID && (String(d.by) === String(MY_UID) || String(d.actor) === String(MY_UID))) return;

      if (t === "item:like" && d?.id != null) {
        const id = String(d.id);
        const prev = readPrevLikes();
        const before = Number(prev[id] || 0);
        const nowLikes = Number(d.likes || 0);
        if (nowLikes > before && d.liked) {
          pushNotice("My post got liked", `Total ${qty(nowLikes, "like")}`, { tag:`like:${id}`, data:{ id } });
          prev[id] = nowLikes; writePrevLikes(prev);
        } else {
          if (nowLikes > before) { prev[id] = nowLikes; writePrevLikes(prev); }
        }
      }

      if (t === "vote:update" && d?.id != null) {
        const id = String(d.id);
        const counts = d.counts || {};
        const total  = voteTotal(counts);

        const prev = readPrevVotes();
        const before = Number(prev[id]?.total || 0);
        if (total > before) {
          let label = "—";
          try {
            const entries = Object.entries(counts);
            const max = Math.max(...entries.map(([, n]) => Number(n||0)), 0);
            const tops = entries.filter(([, n]) => Number(n||0) === max && max>0).map(([k])=>k);
            label = tops.length ? tops.join(", ") : "—";
          } catch {}
          pushNotice("My post votes have been updated", `Top: ${label} · Total ${qty(total, "vote")}`, { tag:`vote:${id}`, data:{ id } });
          prev[id] = { total }; writePrevVotes(prev);
        } else {
          if (total > before) { prev[id] = { total }; writePrevVotes(prev); }
        }
      }
    }, { capture:true });
  } catch {}

  // expose for testing
  window.__meDebug = {
    readPrevLikes, writePrevLikes, readPrevVotes, writePrevVotes,
  };
})();
