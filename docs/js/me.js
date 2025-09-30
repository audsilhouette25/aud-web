/* ========================================================================
 * path: /public/js/me.js
 * desc: me 페이지 — 계정/프로필 + aud laboratory (단일 IIFE, "use strict" 1회)
 * ===================================================================== */
(() => {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────────
   * 0) Utilities & Globals
   * ──────────────────────────────────────────────────────────────────────────── */

  // 실제 업로드 호스트로 반드시 바꿔주세요.
  window.API_BASE = "https://aud-api-dtd1.onrender.com/";

  window.__toAPI = function (u) {
    const s = String(u || "");
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    const base = window.API_BASE || location.origin + "/";
    return new URL(s.replace(/^\/+/, ""), base).toString();
  };

  const $  = (sel, root = document) => root.querySelector(sel);
  const fmtInt = (n) => { try { return new Intl.NumberFormat("en-US").format(Number(n ?? 0)); } catch { return String(n ?? 0); } };

  /* [A] helpers (file-scope) */
  function isEmailNS(s) { return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || "").trim()); }
  function currentNs() { try { const ns = (localStorage.getItem("auth:userns") || "").toLowerCase().trim(); return isEmailNS(ns) ? ns : ""; } catch { return ""; } }
  function nsKey(base) { const ns = currentNs(); return ns ? `${base}::${ns}` : base; }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; } }
  function normalizeNs(v) {
    let s = String(v ?? "").trim().toLowerCase();
    if (!s) return "";
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith("`") && s.endsWith("`"))) s = s.slice(1, -1);
    s = s.replace(/^user:/, "");
    return isEmailNS(s) ? s : "";
  }
  function __readProfileCacheSafe() {
    try { if (typeof window.readProfileCache === "function") return window.readProfileCache() || null; } catch {}
    try {
      const keys = ["me:profile", `me:profile:${(localStorage.getItem("auth:userns") || "default").toLowerCase()}`];
      for (const k of keys) {
        const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return null;
  }
  function readNs() { try { const raw = (localStorage.getItem("auth:userns") || "").trim(); return normalizeNs(raw); } catch { return ""; } }
  function writeNs(ns) {
    try {
      let next = normalizeNs(ns);
      if (!isEmailNS(next)) {
        const snap = __readProfileCacheSafe();
        const cand = deriveNSFromProfile(snap);
        if (isEmailNS(cand)) next = cand;
      }
      if (!isEmailNS(next)) return;
      const prev = readNs();
      const prevIsEmail = isEmailNS(prev);
      const nextIsEmail = isEmailNS(next);
      if (!prev) { if (next) localStorage.setItem("auth:userns", next); return; }
      if (prevIsEmail && !nextIsEmail) return;
      if (!prevIsEmail && nextIsEmail && prev !== next) { localStorage.setItem("auth:userns", next); return; }
    } catch {}
  }
  function deriveNSFromProfile(snap) {
    if (!snap || typeof snap !== "object") return null;
    const email = (snap.email ?? snap.user?.email ?? "").toString().trim().toLowerCase();
    return isEmailNS(email) ? email : null;
  }
  function getNS() {
    try {
      let cur = readNs();
      if (isEmailNS(cur)) return cur;
      const cached = __readProfileCacheSafe();
      const candFromCache = deriveNSFromProfile(cached);
      if (isEmailNS(candFromCache)) { writeNs(candFromCache); return candFromCache; }
      const email = (window.__ME_EMAIL || "").toString().trim().toLowerCase();
      if (isEmailNS(email)) { writeNs(email); return email; }
      return "";
    } catch { return ""; }
  }
  try { window.getNS = getNS; } catch {}

  (() => {
    let ns = readNs();
    if (!isEmailNS(ns)) {
      const snap = (typeof window.readProfileCache === "function") ? window.readProfileCache() : null;
      const cand = deriveNSFromProfile(snap);
      if (isEmailNS(cand)) writeNs(cand);
    }
    ns = readNs();
    if (ns && isEmailNS(ns)) {
      window.dispatchEvent(new CustomEvent("user:updated", { detail: { email: ns, username: ns, id: ns, ns } }));
    }
  })();

  (() => {
    function pickNSFrom(detail) {
      const email = (detail?.email ?? detail?.user?.email ?? "").toString().trim().toLowerCase();
      return isEmailNS(email) ? email : null;
    }
    const isEmail = (s)=>/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s||'').trim());
    (async () => {
      try {
        const cached = (typeof window.readProfileCache === "function") ? window.readProfileCache() : null;
        let cand = pickNSFrom(cached);
        if (!cand && window.auth?.getUser) {
          const me = await window.auth.getUser().catch(() => null);
          cand = pickNSFrom(me);
        }
        const prev = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
        if (!isEmail(cand)) return;
        if (isEmail(prev) && !isEmail(cand)) return;
        if (cand && (!prev || prev === "default" || prev !== cand)) {
          localStorage.setItem("auth:userns", cand);
          window.dispatchEvent(new CustomEvent("user:updated", { detail: { username: cand, email: cand, id: cand } }));
        }
      } catch {}
    })();
    window.addEventListener("user:updated", (ev) => {
      try {
        const cand = pickNSFrom(ev?.detail || {});
        if (!cand) return;
        const prev = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
        if (isEmailNS(prev) && !isEmailNS(cand)) return;
        if (!prev || prev === "default" || prev !== cand) localStorage.setItem("auth:userns", cand);
      } catch {}
    });
  })();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // External knobs / keys
  const REG_KEY        = "collectedLabels";
  const JIB_KEY        = "jib:collected";
  const LABEL_SYNC_KEY = (window.LABEL_SYNC_KEY || "label:sync");
  const JIB_SYNC_KEY   = (window.JIB_SYNC_KEY   || "jib:sync");
  const EVT_LABEL      = (window.LABEL_COLLECTED_EVT || "label:collected-changed");
  const EVT_JIB        = (window.JIB_COLLECTED_EVT   || "jib:collection-changed");

  const toAPI = (u) => (typeof window.__toAPI === "function") ? window.__toAPI(u) : String(u || "");
  const ensureCSRF = window.auth?.ensureCSRF || (async () => {});
  const withCSRF   = window.auth?.withCSRF   || (async (opt) => opt);

  let MY_UID   = null;
  let ME_STATE = { displayName: "member", email: "", avatarUrl: "" };

  const parseJSON = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };
  const normalizeId = (v) => String(v ?? "").trim().toLowerCase();
  const dedupList   = (arr) => Array.isArray(arr) ? [...new Set(arr.map(normalizeId).filter(Boolean))] : [];
  const uniqueCount = (arr) => dedupList(arr).length;

  function coerceList(x, kind) {
    if (!x) return null;
    if (typeof x === "string") {
      const p = parseJSON(x, null);
      if (p) return coerceList(p, kind);
    }
    if (Array.isArray(x)) {
      const pick = (o) => (o && typeof o === "object")
        ? (o.id ?? o.label ?? o.name ?? o.key ?? o.value ?? o.uid ?? o.slug ?? o._id)
        : o;
      return dedupList(x.map(pick));
    }
    if (x instanceof Set) return dedupList([...x]);
    if (x instanceof Map) return dedupList([...x.keys()]);
    if (typeof x === "object") {
      const candidates =
        kind === "jib"
          ? ["jibs", "jibIds", "ids", "items", "list", "collection", "data"]
          : kind === "label"
            ? ["labels", "labelIds", "ids", "items", "list", "collection", "data"]
            : ["labels", "jibs", "ids", "items", "list", "collection", "data"];
      for (const k of candidates) {
        if (Array.isArray(x[k])) return coerceList(x[k], kind);
        if (x[k] && typeof x[k] === "object") {
          const nested = coerceList(x[k], kind);
          if (Array.isArray(nested)) return nested;
        }
      }
      const vals = Object.values(x);
      if (vals.length && vals.every(v => typeof v === "boolean" || typeof v === "number")) return dedupList(Object.keys(x).filter(Boolean));
      if (x.data) {
        const d = coerceList(x.data, kind);
        if (Array.isArray(d)) return d;
      }
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 1) Collections helpers
   * ──────────────────────────────────────────────────────────────────────────── */
  function readRawLists(){
    const ns = currentNs();
    let storeLabels = readJson(nsKey("REG_COLLECT"), []);
    let storeJibs   = readJson(nsKey("JIBC_COLLECT"), []);
    const legacyReg  = readJson("REG_COLLECT", null);
    const legacyJibc = readJson("JIBC_COLLECT", null);
    if (legacyReg !== null) {
      try { localStorage.setItem(nsKey("REG_COLLECT"), JSON.stringify(legacyReg)); } catch {}
      try { localStorage.removeItem("REG_COLLECT"); } catch {}
      storeLabels = Array.isArray(legacyReg) ? legacyReg : [];
    }
    if (legacyJibc !== null) {
      try { localStorage.setItem(nsKey("JIBC_COLLECT"), JSON.stringify(legacyJibc)); } catch {}
      try { localStorage.removeItem("JIBC_COLLECT"); } catch {}
      storeJibs = Array.isArray(legacyJibc) ? legacyJibc : [];
    }
    let sessLabels = []; let sessJibs = [];
    try { const v = JSON.parse(sessionStorage.getItem(REG_KEY) || "[]"); if (Array.isArray(v)) sessLabels = v; } catch {}
    try { const v = JSON.parse(sessionStorage.getItem(JIB_KEY) || "[]"); if (Array.isArray(v)) sessJibs   = v; } catch {}
    storeLabels = Array.isArray(storeLabels) ? storeLabels : [];
    storeJibs   = Array.isArray(storeJibs)   ? storeJibs   : [];
    sessLabels  = Array.isArray(sessLabels)  ? sessLabels  : [];
    sessJibs    = Array.isArray(sessJibs)    ? sessJibs    : [];
    return { storeLabels, storeJibs, sessLabels, sessJibs };
  }
  function readLabels() { const { storeLabels, sessLabels } = readRawLists(); if (Array.isArray(storeLabels) && storeLabels.length) return dedupList(storeLabels); if (sessLabels.length) return dedupList(sessLabels); return dedupList(storeLabels || []); }
  function readJibs()    { const { storeJibs, sessJibs } = readRawLists();   if (Array.isArray(storeJibs) && storeJibs.length)   return dedupList(storeJibs);   if (sessJibs.length) return dedupList(sessJibs);   return dedupList(storeJibs || []); }

  async function settleInitialCounts(maxWaitMs = 1800, tickMs = 50) {
    const t0 = performance.now();
    let prev = "", stable = 0;
    while (performance.now() - t0 < maxWaitMs) {
      const { storeLabels, storeJibs, sessLabels, sessJibs } = readRawLists();
      const storeShapeReady = Array.isArray(storeLabels) || Array.isArray(storeJibs);
      const storeNonEmpty   = (Array.isArray(storeLabels) && storeLabels.length) || (Array.isArray(storeJibs) && storeJibs.length);
      const L = storeNonEmpty ? uniqueCount(storeLabels || []) : (sessLabels.length ? uniqueCount(sessLabels) : uniqueCount(storeLabels || []));
      const J = storeNonEmpty ? uniqueCount(storeJibs   || []) : (sessJibs.length   ? uniqueCount(sessJibs)   : uniqueCount(storeJibs   || []));
      const sig = `${storeShapeReady ? "S" : "X"}|${storeNonEmpty ? "N" : "0"}|${L}|${J}`;
      if (sig === prev) { if (++stable >= 2) return { labels: L, jibs: J }; } else { stable = 0; prev = sig; }
      await sleep(tickMs);
    }
    const { storeLabels, storeJibs, sessLabels, sessJibs } = readRawLists();
    const pick = (sArr, fArr) => (Array.isArray(sArr) && sArr.length) ? sArr : (fArr || sArr || []);
    return { labels: uniqueCount(pick(storeLabels, sessLabels)), jibs: uniqueCount(pick(storeJibs, sessJibs)) };
  }

  function purgeCollectionsIfUserChanged(prevProfile, meProfileNow) {
    const ns = getNS();
    const lastUIDKey = isEmailNS(ns) ? `me:last-uid:${ns}` : `me:last-uid`;
    const lastNSKey  = `me:last-ns`;
    const lastUIDSeen = sessionStorage.getItem(lastUIDKey) || (prevProfile?.id ? String(prevProfile.id) : null);
    const lastNSSeen  = sessionStorage.getItem(lastNSKey);
    const currUID     = meProfileNow?.user?.id ?? meProfileNow?.id ?? meProfileNow?.uid ?? meProfileNow?.sub ?? null;
    const sessLabels = dedupList(parseJSON(sessionStorage.getItem(REG_KEY), []) || []);
    const sessJibs   = dedupList(parseJSON(sessionStorage.getItem(JIB_KEY), []) || []);
    const hasSessPayload = (sessLabels.length > 0) || (sessJibs.length > 0);
    const nsChanged   = !!lastNSSeen && lastNSSeen !== ns;
    const userChanged = !!currUID && !!lastUIDSeen && String(lastUIDSeen) !== String(currUID);
    const firstRunWithResidue = !!currUID && !lastUIDSeen && hasSessPayload;
    if (nsChanged || userChanged || firstRunWithResidue) {
      try { sessionStorage.removeItem(REG_KEY); } catch {}
      try { sessionStorage.removeItem(JIB_KEY); } catch {}
    }
    if (currUID != null) { try { sessionStorage.setItem(lastUIDKey, String(currUID)); } catch {} }
    try { if (isEmailNS(ns)) sessionStorage.setItem(lastNSKey, ns); else sessionStorage.removeItem(lastNSKey); } catch {}
  }
  function syncSessionFromStoreIfReady() {
    const { storeLabels, storeJibs } = readRawLists();
    const ready = (Array.isArray(storeLabels) && storeLabels.length) || (Array.isArray(storeJibs) && storeJibs.length);
    if (!ready) return;
    try { if (Array.isArray(storeLabels)) sessionStorage.setItem(REG_KEY, JSON.stringify(dedupList(storeLabels))); } catch {}
    try { if (Array.isArray(storeJibs))   sessionStorage.setItem(JIB_KEY,  JSON.stringify(dedupList(storeJibs))); } catch {}
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 2) Profile cache & avatar rendering
   * ──────────────────────────────────────────────────────────────────────────── */
  const emailLocal = (e) => String(e||"").toLowerCase().split("@")[0] || "user";
  const PROFILE_KEY_PREFIX = "me:profile";
  const profileKeys = () => {
    const ns  = getNS();
    const uid = MY_UID || "anon";
    const keys = [PROFILE_KEY_PREFIX];
    if (isEmailNS(ns)) keys.unshift(`${PROFILE_KEY_PREFIX}:${ns}`, `${PROFILE_KEY_PREFIX}:${ns}:${uid}`);
    return keys;
  };
  function writeProfileCache(detail) {
    const ns  = getNS();
    const uid = detail?.id ?? MY_UID ?? "anon";
    const email = detail?.email ?? ME_STATE?.email ?? "";
    const displayName = detail?.displayName ?? detail?.name ?? ME_STATE?.displayName ?? "member";
    const payload = JSON.stringify({ ns, email, displayName, ...(detail || {}) });
    try {
      if (isEmailNS(ns)) {
        sessionStorage.setItem(`${PROFILE_KEY_PREFIX}:${ns}:${uid}`, payload);
        localStorage.setItem(`${PROFILE_KEY_PREFIX}:${ns}:${uid}`,  payload);
        sessionStorage.setItem(`${PROFILE_KEY_PREFIX}:${ns}`,       payload);
        localStorage.setItem(`${PROFILE_KEY_PREFIX}:${ns}`,         payload);
      }
      sessionStorage.setItem(PROFILE_KEY_PREFIX, payload);
      localStorage.setItem(PROFILE_KEY_PREFIX,  payload);
    } catch {}
  }
  function readProfileCache() {
    let latest = null;
    const consider = (obj) => {
      if (!obj) return;
      const rv = Number(obj.rev ?? obj.updatedAt ?? obj.updated_at ?? obj.ts ?? 0);
      if (!latest || rv > Number(latest.rev ?? latest.updatedAt ?? latest.updated_at ?? latest.ts ?? 0)) latest = obj;
    };
    for (const k of profileKeys()) {
      try { consider(parseJSON(sessionStorage.getItem(k), null)); } catch {}
      try { consider(parseJSON(localStorage.getItem(k),  null)); } catch {}
    }
    return latest;
  }
  const initials = (name = "member") => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const init  = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
    return (init || name[0] || "U").toUpperCase().slice(0, 2);
  };
  const hueIndexFrom = (s = "") => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; const hue = Math.abs(h) % 360; return Math.round(hue / 15) % 24; };
  function ensureAvatarEl() {
    let el = $("#me-avatar"); if (!el) return null;
    if (el.tagName === "IMG") { const div = document.createElement("div"); div.id = el.id; div.className = `${el.className || ""} avatar`; el.replaceWith(div); el = div; }
    else el.classList.add("avatar");
    return el;
  }
  function paintAvatar(nameOrEmail) {
    const name = String(nameOrEmail || "member").trim() || "member";
    const el   = ensureAvatarEl(); if (!el) return;
    const init = initials(name);
    const idx  = hueIndexFrom(name);
    for (const c of Array.from(el.classList)) if (/^h\d+$/.test(c)) el.classList.remove(c);
    el.classList.add(`h${idx}`);
    el.setAttribute("data-initials", init);
    el.setAttribute("aria-label", `avatar ${init}`);
    el.classList.remove("has-img", "url-mode");
  }
  function ensureAvatarImg(container, url, opts = {}) {
    let img = container.querySelector("img.avatar-img");
    if (!img) { img = document.createElement("img"); img.className = "avatar-img"; img.alt = ""; img.decoding = "async"; img.loading = "lazy"; img.fetchPriority = "low"; img.referrerPolicy = "no-referrer"; container.appendChild(img); }
    let nextSrc = toAPI(url);
    try {
      const u = new URL(nextSrc, location.origin);
      if (opts && opts.version != null) u.searchParams.set("v", String(opts.version));
      else if (!u.searchParams.has("v")) {
        const cached = readProfileCache() || {};
        const rev = Number(cached.rev ?? cached.updatedAt ?? cached.updated_at ?? cached.ts ?? 0) || Date.now();
        u.searchParams.set("v", String(rev));
      }
      nextSrc = u.toString();
    } catch {}
    if (img.src !== nextSrc) img.src = nextSrc;
    container.classList.add("has-img", "url-mode");
    container.removeAttribute("data-initials");
  }
  function clearAvatarImg() { const el = ensureAvatarEl(); if (!el) return; el.querySelector("img.avatar-img")?.remove(); el.classList.remove("has-img", "url-mode"); }
  async function broadcastMyProfile(patch = {}) {
    let me = null;
    try { me = await window.auth?.getUser?.().catch(() => null); } catch {}
    const id = me?.user?.id ?? me?.id ?? me?.uid ?? me?.sub ?? null;
    const detail = { id, displayName: ME_STATE.displayName || me?.user?.displayName || me?.user?.name || "member", avatarUrl: ME_STATE.avatarUrl || "", email: ME_STATE.email || me?.user?.email || me?.email || "", ...patch, rev: Date.now(), };
    writeProfileCache(detail);
    try { window.dispatchEvent(new CustomEvent("user:updated", { detail })); } catch {}
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 3) API helpers & rendering
   * ──────────────────────────────────────────────────────────────────────────── */
  const hasAuthedFlag = () => sessionStorage.getItem("auth:flag") === "1";
  const serverAuthed  = () => !!(window.auth?.isAuthed && window.auth.isAuthed());
  const sessionAuthed = () => hasAuthedFlag() || serverAuthed();

  async function api(path, opt = {}) {
    const url = (typeof window.__toAPI === "function") ? window.__toAPI(path) : String(path || "");
    const fn  = window.auth?.apiFetch || fetch;
    const opt2 = { credentials: "include", ...opt };
    try {
      const res = await fn(url, opt2);
      if (res && res.status === 401) {
        try { sessionStorage.removeItem("auth:flag"); } catch {}
        try { localStorage.removeItem("auth:flag"); } catch {}
        return null;
      }
      return res;
    } catch { return null; }
  }

  async function fetchMe() { const r = await api("/auth/me", { credentials: "include", cache: "no-store" }); if (!r || !r.ok) return null; try { return await r.json(); } catch { return null; } }

  function cardHTML(it) {
    const raw   = it.preview || it.previewDataURL || it.thumbnail || it.image || it.png || "";
    const thumb = (typeof window.__toAPI === "function") ? window.__toAPI(raw) : raw;
    const when  = it.createdAt ? new Date(it.createdAt).toLocaleString() : "";
    const ownerId   = String(it.ownerId || it.ns || "").trim();
    const ns        = String(it.ns || "").toLowerCase();
    const ownerName = String(it.ownerName || ownerId || "—");
    const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    return `
      <div class="card" data-id="${esc(it.id)}" data-ns="${esc(ns)}">
        <img alt="" src="${esc(thumb)}" />
        <div class="meta">
          <span class="owner" title="${esc(ownerId)}">${esc(ownerName)}</span>
          ${ns && ownerId && ns !== ownerId ? `<span class="ns" title="${esc(ns)}">${esc(ns)}</span>` : ""}
          <span class="time">${esc(when)}</span>
        </div>
        <div class="row row--spaced">
          <button class="btn" data-act="hear">Hear</button>
        </div>
      </div>
    `.trim();
  }
  function wireCardActions(root){
    root.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", async (e) => {
        const act = e.target?.dataset?.act;
        if (!act) return;
        const id = card.dataset.id;
        const ns = card.dataset.ns;
        if (act === "hear") {
          try { e.target.disabled = true; await hearSubmission({ id, ns, card }); } finally { e.target.disabled = false; }
        }
      });
    });
  }

  async function hearSubmission({ id, ns, card }) {
    let audioUrl = card.__audioUrl || "";
    let jsonUrl  = card.__jsonUrl  || "";
    if (audioUrl) {
      const url = (typeof window.__toAPI === "function") ? window.__toAPI(audioUrl) : audioUrl;
      await playHTMLAudioOnce(url, { card }); card.__audioUrl = audioUrl; return;
    }
    if (!jsonUrl) {
      const base = window.PROD_BACKEND || window.API_BASE || location.origin;
      jsonUrl = new URL(`/uploads/audlab/${encodeURIComponent(ns)}/${id}.json`, base).toString();
    }
    try {
      const url = (typeof window.__toAPI === "function") ? window.__toAPI(jsonUrl) : jsonUrl;
      const r = await fetch(url, { credentials:"include", cache:"no-store" });
      const meta = await r.json();
      const strokes = Array.isArray(meta?.strokes) ? meta.strokes : [];
      if (!strokes.length) { alert("재생할 데이터가 없습니다."); return; }
      await synthPlayFromStrokes(strokes);
      card.__jsonUrl = jsonUrl;
    } catch { alert("재생 데이터(JSON)를 불러오지 못했습니다."); }
  }
  function playHTMLAudioOnce(url) {
    return new Promise((resolve) => {
      try {
        const a = new Audio(url);
        a.preload = "auto";
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(()=>resolve());
      } catch { resolve(); }
    });
  }
  async function synthPlayFromStrokes(strokes) {
    const AC = new (window.AudioContext || window.webkitAudioContext)();
    const master = AC.createGain(); master.gain.value = 0.0; master.connect(AC.destination);
    const osc = AC.createOscillator(); osc.type = "sine"; osc.connect(master); osc.start();
    const fMin = 110, fMax = 1760;
    const freqFromY = (y) => fMin * Math.pow(fMax / fMin, 1 - Math.max(0, Math.min(1, y)));
    const pts = [];
    for (const st of strokes) {
      const arr = Array.isArray(st?.points) ? st.points : [];
      for (const p of arr) {
        const t = Number(p.t || 0), x = Number(p.x || 0), y = Number(p.y || 0);
        if (Number.isFinite(t)) pts.push({ t, x, y });
      }
    }
    if (!pts.length) { AC.close(); return; }
    pts.sort((a,b)=> a.t - b.t);
    const t0 = pts[0].t;
    const port = 0.04;
    const startAt = AC.currentTime + 0.05;
    let lastGainEnd = startAt;
    for (let i=0; i<pts.length; i++) {
      const p   = pts[i];
      const at  = startAt + Math.max(0, (p.t - t0)/1000);
      const fq  = Math.max(40, freqFromY(p.y));
      osc.frequency.cancelScheduledValues(at);
      osc.frequency.exponentialRampToValueAtTime(fq, at + port);
      const a = 0.01, r = 0.08;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(0.0, at);
      master.gain.linearRampToValueAtTime(0.8, at + a);
      master.gain.linearRampToValueAtTime(0.0, at + a + r);
      lastGainEnd = at + a + r;
    }
    await new Promise((res)=> setTimeout(res, Math.max(0, (lastGainEnd - AC.currentTime)*1000 + 80)));
    try { AC.close(); } catch {}
  }

  // [REPLACE] renderProfile
  function renderProfile({ name, displayName, email, avatarUrl }) {
    const nm = (displayName && String(displayName).trim()) || (name && String(name).trim()) || (isEmailNS(email) ? emailLocal(email) : "member");
    ME_STATE.displayName = nm;
    ME_STATE.email = email || "";
    ME_STATE.avatarUrl = avatarUrl || "";
    try {
      const ns = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
      if (window.setNSIdentity && isEmailNS(ns)) window.setNSIdentity(ns, { email: ME_STATE.email, displayName: nm, avatarUrl: ME_STATE.avatarUrl });
    } catch {}
    const nameEl  = $("#me-name");  if (nameEl)  nameEl.textContent  = nm;
    const emailEl = $("#me-email"); if (emailEl) emailEl.textContent = email || "";
    if (avatarUrl) { const el = ensureAvatarEl(); if (el) ensureAvatarImg(el, avatarUrl); }
    else { clearAvatarImg(); paintAvatar(nm || email || "member"); }
  }

  function renderQuick({ labels = 0, jibs = 0, posts = 0 /* authed unused */ }) {
    $("#k-labels") && ($("#k-labels").textContent = fmtInt(labels));
    $("#k-jibs")   && ($("#k-jibs").textContent   = fmtInt(jibs));
    $("#k-posts")  && ($("#k-posts").textContent  = fmtInt(posts));
  }

  window.addEventListener("user:updated", (ev) => {
    const d = ev?.detail; if (!d) return;
    renderProfile({
      displayName: d.displayName ?? ME_STATE.displayName,
      email:       d.email ?? ME_STATE.email,
      avatarUrl:   d.avatarUrl   ?? ME_STATE.avatarUrl,
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * 3.5) Server-first quick counts
   * ──────────────────────────────────────────────────────────────────────────── */
  const OPTIONS = ["thump", "miro", "whee", "track", "echo", "portal"];
  const arrify = (x, kind) => { const a = coerceList(x, kind); return Array.isArray(a) ? a : []; };
  function readInsightsCache(ns) {
    try {
      ns = String(ns || "").toLowerCase();
      if (!isEmailNS(ns)) return null;
      const raw = sessionStorage.getItem(`insights:${String(ns||"").toLowerCase()}`);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : null;
    } catch { return null; }
  }
  function extractJibListFromState(st) {
    if (!st || typeof st !== "object") return [];
    const tryPick = (...paths) => {
      for (const p of paths) {
        let cur = st;
        for (const k of p.split(".")) {
          if (!cur || typeof cur !== "object") { cur = undefined; break; }
          cur = cur[k];
        }
        const arr = coerceList(cur, "jib");
        if (Array.isArray(arr) && arr.length) return arr;
      }
      return null;
    };
    return (
      tryPick("jibs.collected") ||
      tryPick("jibs.items", "jibs.list", "jibs.data", "jibs") ||
      tryPick("jib.collected", "jib.items", "jib") ||
      tryPick("collectedJibs", "collected") ||
      tryPick("data.jibs", "data.jibIds") ||
      tryPick("state.jibs.collected", "state.jibs") ||
      []
    );
  }
  async function fetchCountsFromServer(ns) {
    if (!isEmailNS(ns)) return null;
    const res = await api(`/api/state?ns=${encodeURIComponent(ns)}`, { method: "GET", credentials: "include", cache: "no-store" });
    if (!res || !res.ok) return null;
    const j  = await res.json().catch(() => ({}));
    const st = j?.state || j || {};
    const labelsArr = arrify(st.labels, "label").filter((k) => OPTIONS.includes(k));
    const jibsArr   = extractJibListFromState(st);
    if (!labelsArr.length && !jibsArr.length) return null;
    return { labels: labelsArr.length, jibs: jibsArr.length, source: "server" };
  }
  async function getQuickCounts() {
    let localCounts;
    try { localCounts = await settleInitialCounts(1000, 40); }
    catch { localCounts = { labels: readLabels().length, jibs: readJibs().length }; }
    if (sessionAuthed()) {
      const ns = getNS();
      const s = await fetchCountsFromServer(ns).catch(() => null);
      if (s) {
        const labels = (typeof s.labels === "number" && s.labels > 0) ? s.labels : localCounts.labels;
        const jibs   = (typeof s.jibs   === "number" && s.jibs   > 0) ? s.jibs   : localCounts.jibs;
        return { labels, jibs, source: s.source };
      }
    }
    return localCounts;
  }
  let __countsBusy = false;
  async function refreshQuickCounts() {
    if (__countsBusy) return;
    __countsBusy = true;
    try {
      const ns = getNS();
      let postsNow = Number($("#k-posts")?.textContent?.replace(/[^0-9]/g, "") || 0);
      if (!postsNow) {
        const cached = readInsightsCache(ns);
        if (cached && typeof cached.posts === "number" && cached.posts >= 0) postsNow = cached.posts;
        else if (sessionAuthed()) {
          try { const mine = await fetchAllMyItems(4, 60); if (Array.isArray(mine)) postsNow = mine.length; } catch {}
        }
      }
      const counts = await getQuickCounts();
      renderQuick({ labels: counts.labels || 0, jibs: counts.jibs || 0, posts: Number.isFinite(postsNow) ? postsNow : 0, authed: sessionAuthed() });
    } finally { __countsBusy = false; }
  }
  window.__meCountsRefresh = refreshQuickCounts;

  /* ─────────────────────────────────────────────────────────────────────────────
   * 5) Vote insights (KPI)
   * ──────────────────────────────────────────────────────────────────────────── */
  const emptyCounts = () => OPTIONS.reduce((a, k) => (a[k] = 0, a), {});
  function normalizeCounts(raw) {
    if (!raw) return emptyCounts();
    if (Array.isArray(raw)) {
      const out = emptyCounts();
      raw.forEach((r) => { const k = String(r.label || "").trim(); const n = Number(r.count || 0); if (OPTIONS.includes(k)) out[k] = Math.max(0, n); });
      return out;
    }
    if (typeof raw === "object") {
      const out = emptyCounts();
      for (const k of OPTIONS) out[k] = Math.max(0, Number(raw[k] || 0));
      return out;
    }
    return emptyCounts();
  }
  function pickVotesFrom(obj) {
    if (!obj || typeof obj !== "object") return { counts: emptyCounts(), my: null, total: 0 };
    const c = normalizeCounts(obj.votes || obj.counts || obj.totals || obj.items || obj.data || obj);
    const my = obj.my ?? obj.mine ?? obj.choice ?? obj.selected ?? null;
    const sum = Object.values(c).reduce((s, n) => s + Number(n || 0), 0);
    const total = Number.isFinite(Number(obj.total)) ? Number(obj.total) : sum;
    return { counts: c, my: (OPTIONS.includes(my) ? my : null), total };
  }
  async function fetchVotesSafe(itemId, ns) {
    const pid = encodeURIComponent(itemId);
    const nsq = `ns=${encodeURIComponent(ns)}`;
    try {
      const r = await api(`/api/items/${pid}/votes?${nsq}`, { credentials: "include", cache: "no-store" });
      if (r?.ok) {
        const j = await r.json().catch(() => ({}));
        const picked = pickVotesFrom(j) || pickVotesFrom(j.item) || pickVotesFrom(j.data);
        if (picked?.counts) return picked;
      }
    } catch {}
    try {
      const r = await api(`/api/votes?item=${pid}&${nsq}`, { credentials: "include", cache: "no-store" });
      if (r?.ok) {
        const j = await r.json().catch(() => ({}));
        const picked = pickVotesFrom(j) || pickVotesFrom(j?.item) || pickVotesFrom(j?.data);
        if (picked?.counts) return picked;
      }
    } catch {}
    try {
      const r = await api(`/api/items/${pid}?${nsq}`, { credentials: "include", cache: "no-store" });
      if (r?.ok) {
        const j = await r.json().catch(() => ({}));
        const picked = pickVotesFrom(j) || pickVotesFrom(j?.item) || pickVotesFrom(j?.data);
        if (picked?.counts) return picked;
      }
    } catch {}
    return { counts: emptyCounts(), my: null, total: 0 };
  }

  async function fetchAllMyItems(maxPages = 20, pageSize = 60) {
    const myns = getNS();
    if (!isEmailNS(myns)) return [];
    const nsCandidates = [myns];
    const seen = new Set(); const out  = [];
    async function fetchByNs(nsVal) {
      let cursor = null;
      for (let p = 0; p < maxPages; p++) {
        const qs = new URLSearchParams({ limit: String(Math.min(pageSize, 60)), ns: nsVal });
        if (cursor) { qs.set("after", String(cursor)); qs.set("cursor", String(cursor)); }
        const r = await api(`/api/gallery/public?${qs.toString()}`, { credentials: "include", cache: "no-store" });
        if (!r || !r.ok) break;
        const j = await r.json().catch(() => ({}));
        const items = Array.isArray(j?.items) ? j.items : [];
        for (const it of items) {
          const id = String(it?.id || ""); if (!id || seen.has(id)) continue;
          const nsMatch    = String(it?.ns || "").toLowerCase() === nsVal;
          const mineFlag   = (it?.mine === true);
          const ownerMatch = (MY_UID != null) && (String(it?.user?.id || "").toLowerCase() === String(MY_UID).toLowerCase());
          if (nsMatch || mineFlag || ownerMatch) { seen.add(id); out.push(it); }
        }
        cursor = j?.nextCursor || null;
        if (!cursor || items.length === 0) break;
      }
    }
    await fetchByNs(nsCandidates[0]);
    if (out.length === 0 && nsCandidates[1]) await fetchByNs(nsCandidates[1]);
    return out;
  }

  async function mapLimit(arr, limit, worker) {
    const ret = new Array(arr.length);
    let idx = 0, running = 0;
    return await new Promise((resolve) => {
      const pump = () => {
        while (running < limit && idx < arr.length) {
          const i = idx++; running++;
          Promise.resolve(worker(arr[i], i))
            .then((v) => { ret[i] = v; })
            .catch(() => { ret[i] = null; })
            .finally(() => { running--; (idx >= arr.length && running === 0) ? resolve(ret) : pump(); });
        }
      };
      pump();
    });
  }
  const winnersOf = (counts) => {
    const entries = Object.entries(counts || {});
    if (!entries.length) return [];
    const max = Math.max(...entries.map(([, n]) => Number(n || 0)), 0);
    if (max <= 0) return [];
    return entries.filter(([, n]) => Number(n || 0) === max).map(([k]) => k);
  };
  function setRateBar(rate = 0) {
    const el = $("#m-rate-bar"); if (!el) return;
    const clamped = Math.max(0, Math.min(100, Math.round(rate)));
    if (el.tagName === "PROGRESS") {
      el.max = 100; el.value = clamped;
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
      el.setAttribute("aria-valuenow", String(clamped));
    } else {
      const step = Math.round(clamped / 5) * 5;
      for (const c of Array.from(el.classList)) if (/^p(100|[0-9]{1,2})$/.test(c)) el.classList.remove(c);
      el.classList.add(`p${step}`);
      el.setAttribute("data-pct", String(step));
    }
  }
  async function computeAndRenderInsights() {
    const elPosts = $("#m-posts");
    const elPart  = $("#m-participated");
    const elRate  = $("#m-rate");
    const elRateDetail = $("#m-rate-detail");
    const myItems = await fetchAllMyItems();
    const postCount = myItems.length;
    const votes = await mapLimit(myItems, 6, async (it) => {
      if (it?.votes || it?.counts || it?.totals) {
        const vRaw = pickVotesFrom(it);
        return { label: String(it.label || "").trim(), total: Number(vRaw.total || 0), tops: winnersOf(vRaw.counts) };
      }
      const v = await fetchVotesSafe(it.id, it.ns || getNS());
      const total = Number(v.total || Object.values(v.counts || {}).reduce((s, n) => s + Number(n || 0), 0));
      const tops  = winnersOf(v.counts);
      return { label: String(it.label || "").trim(), total, tops };
    });
    const participated = votes.filter((v) => v && v.total > 0).length;
    let matched = 0;
    for (const v of votes) { if (!v || v.total === 0) continue; if (v.label && v.tops.includes(v.label)) matched++; }
    const rate = (participated > 0) ? Math.round((matched / participated) * 100) : 0;
    try {
      const ns = getNS();
      const insights = { posts: postCount, participated, matched, rate };
      if (isEmailNS(ns)) sessionStorage.setItem(`insights:${ns}`, JSON.stringify({ ...insights, t: Date.now() }));
      window.dispatchEvent(new CustomEvent("insights:ready", { detail: { ns, ...insights } }));
    } catch {}
    elPosts && (elPosts.textContent = fmtInt(postCount));
    elPart  && (elPart.textContent  = fmtInt(participated));
    elRate  && (elRate.textContent  = `${rate}%`);
    setRateBar(rate);
    elRateDetail && (elRateDetail.textContent = `(${fmtInt(matched)} / ${fmtInt(participated)})`);
    $("#k-posts") && ($("#k-posts").textContent = fmtInt(postCount));
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 6) Profile & Password update (unchanged)
   * ──────────────────────────────────────────────────────────────────────────── */
  async function updateDisplayName(displayName) {
    const name = String(displayName || "").trim();
    if (!name) return { ok: false, msg: "Display name is required." };
    const jsonBody = JSON.stringify({ displayName: name, name });
    const asJson = (url, method) => ({ url, method, headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: jsonBody });
    const asForm = (url, method, extra = {}) => {
      const usp = new URLSearchParams({ displayName: name, name, ...extra });
      return { url, method, headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Accept": "application/json" }, body: usp.toString() };
    };
    await ensureCSRF();
    const variants = [
      asJson("/auth/me","PATCH"), asJson("/api/users/me","PUT"), asJson("/auth/profile","POST"),
      asForm("/auth/me","POST",{ _method:"PATCH" }), asForm("/api/users/me","POST",{ _method:"PUT" }), asForm("/auth/profile","POST"),
    ];
    for (const v of variants) {
      const opt = await withCSRF({ method: v.method, credentials: "include", headers: v.headers, body: v.body });
      const res = await api(v.url, opt);
      if (!res) continue;
      if (res.ok) return { ok: true };
      if (res.status === 400 || res.status === 422) {
        let err = "Invalid input."; try { const j = await res.json(); err = j?.message || j?.error || err; } catch {}
        return { ok: false, msg: err };
      }
    }
    return { ok: false, msg: "The server couldn’t update your display name." };
  }

  async function updatePassword(currentPassword, newPassword) {
    const pw  = String(newPassword || "");
    const cur = String(currentPassword || "");
    if (!pw || pw.length < 8) return { ok: false, msg: "Your new password must be at least 8 characters long." };
    if (!cur) return { ok: false, msg: "Please enter your current password." };
    await ensureCSRF();
    const payloads = [
      { url: "/auth/password",         method: "POST",  body: { currentPassword: cur, newPassword: pw } },
      { url: "/auth/change-password",  method: "POST",  body: { currentPassword: cur, newPassword: pw } },
      { url: "/api/users/me/password", method: "PUT",   body: { currentPassword: cur, newPassword: pw } },
      { url: "/auth/me",               method: "PATCH", body: { currentPassword: cur, password: pw } },
    ];
    for (const p of payloads) {
      try {
        const r = await api(p.url, await withCSRF({
          method: p.method, credentials: "include",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(p.body),
        }));
        if (r?.ok) return { ok: true };
      } catch {}
    }
    return { ok: false, msg: "Password change request was rejected." };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 7) Edit Modal (CSS-only structure)
   * ──────────────────────────────────────────────────────────────────────────── */
  function ensureEditModal() {
    let wrap = $("#edit-modal");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "edit-modal";
    wrap.className = "modal";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "edit-title");
    wrap.innerHTML = `
      <button type="button" class="overlay" aria-label="Close"></button>
      <div class="sheet" role="document" aria-labelledby="edit-title">
        <h2 id="edit-title" class="title">Edit profile</h2>

        <div class="toolbar">
          <button type="button" class="btn" id="btn-change-avatar">Change profile</button>
        </div>

        <form id="edit-form" novalidate>
          <div class="form-row">
            <label for="f-displayName">Name</label>
            <input id="f-displayName" name="displayName" autocomplete="nickname" required maxlength="40" />
            <p class="hint">This is the name that will appear on the screen, not the email address.</p>
          </div>

          <fieldset class="fieldset">
            <legend>Change password</legend>
            <div class="form-row">
              <label for="f-current">Current password</label>
              <input id="f-current" name="currentPassword" type="password" autocomplete="current-password" />
            </div>
            <div class="form-row">
              <label for="f-new">New password</label>
              <input id="f-new" name="newPassword" type="password" autocomplete="new-password" minlength="8" />
            </div>
            <div class="form-row">
              <label for="f-new2">Confirm new password</label>
              <input id="f-new2" name="newPassword2" type="password" autocomplete="new-password" minlength="8" />
            </div>
            <p class="hint">If you do not wish to change your password, leave it blank.</p>
          </fieldset>

          <div class="actions">
            <button type="submit" class="btn btn-primary" id="btn-save">Save</button>
            <button type="button" class="btn" id="btn-cancel">Cancel</button>
          </div>

          <p class="msg" id="edit-msg" aria-live="polite"></p>
        </form>
      </div>
    `.trim();

    document.body.appendChild(wrap);

    wrap.querySelector(".overlay")?.addEventListener("click", closeEditModal);
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditModal(); });

    wrap.querySelector("#edit-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msgEl = wrap.querySelector("#edit-msg");
      const dnEl  = wrap.querySelector("#f-displayName");
      const curEl = wrap.querySelector("#f-current");
      const nwEl  = wrap.querySelector("#f-new");
      const nw2El = wrap.querySelector("#f-new2");

      const displayName = (dnEl?.value || "").trim();
      const cur = curEl?.value || "";
      const nw  = nwEl?.value || "";
      const nw2 = nw2El?.value || "";

      if (!displayName) { msgEl.textContent = "Please enter your name."; dnEl?.focus(); return; }
      if (nw || nw2 || cur) {
        if (!cur)          { msgEl.textContent = "Please enter your current password."; curEl?.focus(); return; }
        if (nw.length < 8) { msgEl.textContent = "Your new password must be at least 8 characters long."; nwEl?.focus(); return; }
        if (nw !== nw2)    { msgEl.textContent = "New passwords do not match."; nw2El?.focus(); return; }
      }

      msgEl.textContent = "Submitting…";

      if (displayName !== (ME_STATE.displayName || "")) {
        const r = await updateDisplayName(displayName);
        if (!r.ok) { msgEl.textContent = r.msg || "Failed to change your name."; return; }
      }
      if (nw) {
        const r2 = await updatePassword(cur, nw);
        if (!r2.ok) { msgEl.textContent = r2.msg || "Failed to change your password."; return; }
      }

      ME_STATE.displayName = displayName;
      $("#me-name") && ($("#me-name").textContent = displayName);
      paintAvatar(displayName);
      await broadcastMyProfile({});

      msgEl.textContent = "Saved";
      setTimeout(closeEditModal, 350);
    });

    wrap.querySelector("#btn-change-avatar")?.addEventListener("click", () => {
      try { window.auth?.markNavigate?.(); } catch {}
      openAvatarCropper();
    });
    wrap.querySelector("#btn-cancel")?.addEventListener("click", closeEditModal);

    return wrap;
  }

  function openEditModal() {
    const modal = ensureEditModal();
    const dn = modal.querySelector("#f-displayName");
    if (dn) dn.value = ME_STATE.displayName || ME_STATE.email || "member";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => dn?.focus(), 0);
  }

  function closeEditModal() {
    const modal = $("#edit-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 8) Avatar Cropper (client-only, no external lib)
   * ──────────────────────────────────────────────────────────────────────────── */
  const AV = {
    img: null, url: null,
    scale: 1, minScale: 1,
    tx: 0, ty: 0, drag: false, sx: 0, sy: 0,
    canvas: null, ctx: null, size: 360, rotate: 0,
  };

  function ensureAvatarCropper() {
    let wrap = $("#avatar-modal");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "avatar-modal";
    wrap.className = "modal";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "avatar-title");
    wrap.innerHTML = `
      <button type="button" class="overlay" aria-label="Close"></button>
      <div class="sheet" role="document">
        <h2 id="avatar-title" class="title">Change profile</h2>

        <div class="form-row">
          <input id="av-file" type="file" accept="image/*" />
          <p class="hint">Crop</p>
        </div>

        <div class="cropper">
          <canvas id="av-canvas" width="360" height="360" aria-label="Preview crop"></canvas>
        </div>

        <div class="form-row">
          <label for="av-zoom">Zoom in/out</label>
          <input id="av-zoom" type="range" min="1" max="4" step="0.01" value="1" />
        </div>

        <div class="actions">
          <button type="button" class="btn" id="av-rotate">Rotate 90°</button>
          <button type="button" class="btn" id="av-reset">Reset</button>
          <button type="button" class="btn btn-primary" id="av-save">Save</button>
          <button type="button" class="btn" id="av-cancel">Cancel</button>
        </div>

        <p class="msg" id="av-msg" aria-live="polite"></p>
      </div>
    `.trim();

    document.body.appendChild(wrap);

    AV.canvas = wrap.querySelector("#av-canvas");
    AV.ctx    = AV.canvas.getContext("2d", { alpha: false });

    const inp  = wrap.querySelector("#av-file");
    const zoom = wrap.querySelector("#av-zoom");
    const msg  = wrap.querySelector("#av-msg");

    wrap.querySelector(".overlay")?.addEventListener("click", closeAvatarCropper);
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAvatarCropper(); });

    inp?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { msg.textContent = "Please choose an image file."; return; }
      await loadImageFile(f);
      fitImage(true);
      drawCrop();
      msg.textContent = "Drag the image to adjust its position.";
    });

    zoom?.addEventListener("input", () => {
      AV.scale = Math.max(AV.minScale, Number(zoom.value) || 1);
      drawCrop();
    });

    const start = (x, y) => { AV.drag = true; AV.sx = x; AV.sy = y; };
    const move  = (x, y) => { if (!AV.drag) return; AV.tx += (x - AV.sx); AV.ty += (y - AV.sy); AV.sx = x; AV.sy = y; drawCrop(); };
    const end   = () => { AV.drag = false; };

    AV.canvas.addEventListener("pointerdown", (e) => { AV.canvas.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); });
    AV.canvas.addEventListener("pointermove",  (e) => move(e.clientX, e.clientY));
    AV.canvas.addEventListener("pointerup",    end);
    AV.canvas.addEventListener("pointercancel",end);

    AV.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const z = (-e.deltaY || 0) > 0 ? 1.06 : 0.94;
      const next = Math.max(AV.minScale, Math.min(4, AV.scale * z));
      AV.scale = next;
      zoom.value = String(next);
      drawCrop();
    }, { passive: false });

    wrap.querySelector("#av-rotate")?.addEventListener("click", () => {
      AV.rotate = (AV.rotate + 90) % 360;
      fitImage(true);
      drawCrop();
    });

    wrap.querySelector("#av-reset")?.addEventListener("click", () => {
      fitImage(true);
      drawCrop();
      msg.textContent = "Reset.";
    });

    wrap.querySelector("#av-save")?.addEventListener("click", async () => {
      msg.textContent = "Uploading…";
      const blob = await exportCroppedBlob(512);
      const r = await uploadAvatar(blob);
      if (r?.ok) {
        ME_STATE.avatarUrl = r.url || "";
        renderProfile({ displayName: ME_STATE.displayName, email: ME_STATE.email, avatarUrl: r.url });
        await broadcastMyProfile({ avatarUrl: r.url });
        msg.textContent = "Saved.";
        setTimeout(closeAvatarCropper, 350);
      } else {
        msg.textContent = r?.msg || "Upload failed.";
      }
    });

    wrap.querySelector("#av-cancel")?.addEventListener("click", closeAvatarCropper);

    return wrap;
  }

  function openAvatarCropper() {
    const m = ensureAvatarCropper();
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    const file = m.querySelector("#av-file");
    if (file) file.value = "";
    cleanupImage();
    drawBlank();
  }

  function closeAvatarCropper() {
    const m = $("#avatar-modal");
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    cleanupImage();
  }

  function cleanupImage() {
    if (AV.url) { try { URL.revokeObjectURL(AV.url); } catch {} AV.url = null; }
    AV.img = null;
  }

  function drawBlank() {
    const { ctx, size } = AV;
    ctx.fillStyle = "#E9E9EC";
    ctx.fillRect(0, 0, size, size);
    drawMask();
  }

  async function loadImageFile(file) {
    cleanupImage();
    AV.url = URL.createObjectURL(file);
    try {
      AV.img = await createImageBitmap(file);
    } catch {
      const img = new Image();
      img.decoding = "async";
      img.src = AV.url;
      await img.decode().catch(() => {});
      AV.img = img;
    }
  }

  function fitImage(resetOffset = false) {
    const { img, size } = AV; if (!img) return;
    const rotated = (AV.rotate % 180) !== 0;
    const iw = rotated ? img.height : img.width;
    const ih = rotated ? img.width  : img.height;
    const coverScale = Math.max(size / iw, size / ih);
    AV.minScale = coverScale;
    AV.scale = Math.max(AV.scale || coverScale, coverScale);
    if (resetOffset) { AV.tx = 0; AV.ty = 0; }
    const zoom = $("#av-zoom");
    if (zoom) zoom.value = String(AV.scale);
  }

  function drawMask() {
    const { ctx, size } = AV;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const r = size * 0.48;
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 2;
    ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCrop() {
    const { ctx, size, img, scale, tx, ty, rotate } = AV;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#F3F3F6";
    ctx.fillRect(0, 0, size, size);
    if (img) {
      ctx.save();
      ctx.translate(size / 2 + tx, size / 2 + ty);
      ctx.rotate(rotate * Math.PI / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    drawMask();
  }

  async function exportCroppedBlob(outSize = 512) {
    const { img, scale, tx, ty, rotate, size } = AV;
    if (!img) return null;

    const off = document.createElement("canvas");
    off.width = outSize; off.height = outSize;
    const oc = off.getContext("2d", { alpha: false });

    oc.fillStyle = "#F3F3F6";
    oc.fillRect(0, 0, outSize, outSize);

    const k = outSize / size;
    oc.save();
    oc.translate(outSize / 2 + tx * k, outSize / 2 + ty * k);
    oc.rotate(rotate * Math.PI / 180);
    oc.scale(scale * k, scale * k);
    oc.drawImage(img, -img.width / 2, -img.height / 2);
    oc.restore();

    const tryWebp = await new Promise((res) => { if (off.toBlob) off.toBlob(res, "image/webp", 0.92); else res(null); });
    if (tryWebp) return tryWebp;
    return await new Promise((res) => { if (off.toBlob) off.toBlob(res, "image/png"); else res(null); });
  }

  async function uploadAvatar(blob) {
    if (!blob) return { ok: false, msg: "There’s no image to export." };
    await ensureCSRF();
    const fd = new FormData();
    fd.append("avatar", blob, "avatar.webp");
    const url = "/api/users/me/avatar";
    try {
      const r = await api(url, await withCSRF({ method: "POST", credentials: "include", body: fd }));
      const j = await r?.json?.().catch?.(() => ({}));
      if (!r || !r.ok) return { ok: false, msg: `Upload failed (HTTP ${r?.status || 0})` };
      return { ok: true, url: j.avatarUrl || j.url || j.location || "" };
    } catch {
      return { ok: false, msg: "Network error" };
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 9) Reactive resync hooks
   * ──────────────────────────────────────────────────────────────────────────── */
  const RESYNC_EVENTS = ["store:ready","labels:ready","label:ready","collected:ready","jib:ready","jibs:ready","collection:ready","store:changed","labels:changed","jibs:changed","collectedLabels:changed","jib:collection-changed"];
  RESYNC_EVENTS.forEach((ev) => {
    window.addEventListener(ev, () => {
      setTimeout(() => {
        try {
          const { storeLabels, storeJibs } = readRawLists();
          if (Array.isArray(storeLabels) && storeLabels.length) sessionStorage.setItem(REG_KEY, JSON.stringify(dedupList(storeLabels)));
          if (Array.isArray(storeJibs)   && storeJibs.length)   sessionStorage.setItem(JIB_KEY,  JSON.stringify(dedupList(storeJibs)));
        } catch {}
        refreshQuickCounts();
      }, 0);
    });
  });

   /* ─────────────────────────────────────────────────────────────────────────────
   * 10) Boot
   * ──────────────────────────────────────────────────────────────────────────── */
  async function boot() {
    if (window.__PURGING) return;
    let me    = { displayName: "member", email: "", avatarUrl: "" };
    let quick = { posts: 0, labels: 0, jibs: 0, authed: false };
    const cached = readProfileCache();
    if (cached) {
      me.displayName = cached.displayName || me.displayName;
      me.email       = cached.email || "";
      me.avatarUrl   = cached.avatarUrl || "";
    }
    const meResp = await fetchMe();
    if (meResp && typeof meResp === "object") {
      purgeCollectionsIfUserChanged(cached, meResp);
      MY_UID = meResp?.user?.id ?? meResp?.id ?? null;
      me = { displayName: meResp.displayName || meResp.name || me.displayName, email: meResp.email || me.email, avatarUrl: meResp.avatarUrl || me.avatarUrl };
      quick.authed = true;
      try { sessionStorage.setItem("auth:flag", "1"); localStorage.setItem("auth:flag", "1"); } catch {}
    }
    try { const c = await getQuickCounts(); quick.labels = c.labels || 0; quick.jibs = c.jibs || 0; } catch { quick.labels = readLabels().length; quick.jibs = readJibs().length; }
    try { const ic = readInsightsCache(getNS()); if (ic && typeof ic.posts === "number" && ic.posts >= 0) quick.posts = ic.posts; } catch {}
    renderProfile(me);
    await broadcastMyProfile({});
    renderQuick(quick);
    syncSessionFromStoreIfReady();
    refreshQuickCounts();
    setTimeout(() => { syncSessionFromStoreIfReady(); refreshQuickCounts(); }, 300);
    setTimeout(() => { syncSessionFromStoreIfReady(); refreshQuickCounts(); }, 1500);
    window.addEventListener(EVT_LABEL, refreshQuickCounts);
    window.addEventListener(EVT_JIB,   refreshQuickCounts);
    window.addEventListener("storage", (e) => {
      if (window.__PURGING) return;
      if (!e?.key) return;
      if (e.key === LABEL_SYNC_KEY || /label:sync/.test(e.key)) refreshQuickCounts();
      if (e.key === JIB_SYNC_KEY   || /jib:sync/.test(e.key))   refreshQuickCounts();
      if (e.key === "auth:userns" || e.key === "auth:flag")     refreshQuickCounts();
      if (e.key.startsWith("me:profile") && e.newValue) { try { renderProfile(parseJSON(e.newValue, {})); } catch {} }
    }, { capture: true });
    window.addEventListener("auth:state",        refreshQuickCounts);
    window.addEventListener("store:ns-changed",  refreshQuickCounts);
    window.addEventListener("itemLikes:changed",       () => window.__meCountsRefresh?.());
    window.addEventListener("label:votes-changed",     () => window.__meCountsRefresh?.());
    window.addEventListener("label:collected-changed", () => window.__meCountsRefresh?.());
    window.addEventListener("jib:collection-changed",  () => window.__meCountsRefresh?.());
    $("#btn-edit")?.addEventListener("click", () => { try { window.auth?.markNavigate?.(); } catch {} openEditModal(); });
    $("#me-avatar")?.addEventListener("click", () => { try { window.auth?.markNavigate?.(); } catch {} openAvatarCropper(); });
    if (quick.authed) { computeAndRenderInsights().catch(() => {}); }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 11) Purge / Logout / Delete (unchanged)
   * ──────────────────────────────────────────────────────────────────────────── */
    function __purgeNamespaceKeys(ns) {
    if (!ns || !isEmailNS(ns)) return;
    const enc = encodeURIComponent(ns);

    const wipe = (k) => { try { localStorage.removeItem(k); } catch {} try { sessionStorage.removeItem(k); } catch {} };

    // 전역 인증 키
    ["auth:flag","auth:userns","auth:ns"].forEach(wipe);

    // 알려진 접두/네임스페이스 키들
    const KNOWN = [
      // me/profile/insights caches
      "me:profile","insights","mine","aud:label",
      // collections(레거시/네임스페이스)
      "REG_COLLECT","JIBC_COLLECT",
      // store.js families
      "label:sync","jib:sync","label:hearts-sync","label:ts-sync",
      "itemLikes:sync","labelVotes:sync","state:updatedAt",
      "collectedLabels","tempCollectedLabels","labelTimestamps","labelHearts",
      "itemLikes","labelVotes","aud:selectedLabel","jib:selected","jib:collected"
    ];
    KNOWN.forEach(base => {
      wipe(base);
      wipe(`${base}:${ns}`);   wipe(`${base}:${enc}`);
      wipe(`${base}::${ns}`);  wipe(`${base}::${enc}`);
    });

    // 스캔 삭제(남은 모든 키에서 ns 문자열 탐지)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i); if (!k) continue;
        const kl = k.toLowerCase();
        if (kl.includes(`:${ns}`) || kl.includes(`::${ns}`) || kl.includes(`:${enc}`) || kl.endsWith(ns) || kl.endsWith(enc)) wipe(k);
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i); if (!k) continue;
        const kl = k.toLowerCase();
        if (kl.includes(`:${ns}`) || kl.includes(`::${ns}`) || kl.includes(`:${enc}`) || kl.endsWith(ns) || kl.endsWith(enc)) wipe(k);
      }
    } catch {}
  }  
  async function __purgeLocalStateHard(reason = "account-delete") {
    // [A] 재수화 가드: 이후 부팅/리스토어 경로 동작 차단
    try { window.__PURGING = true; } catch {}

    // [B] 스토어 계열 먼저 완전 중지/초기화(있으면)
    try { window.store?.shutdown?.(); } catch {}
    try { window.store?.nuke?.(); } catch {}
    try { window.store?.purgeAccount?.(); } catch {}
    try { window.store?.reset?.(); } catch {}
    try { window.store?.clearAll?.(); } catch {}
    try { window.jib?.reset?.(); } catch {}
    try { window.__flushStoreSnapshot?.({ server:false }); } catch {}

    // [C] 기존 Storage 키 정리(현행 코드 유지)
    const wipe = (k) => { try { sessionStorage.removeItem(k); } catch {} try { localStorage.removeItem(k); } catch {} };
    const ns = currentNs();
    const enc = encodeURIComponent(ns || "");
    ["auth:flag","auth:userns","auth:ns","collectedLabels","jib:collected"].forEach(wipe);
    const KNOWN = [
      "me:profile","insights","mine","aud:label",
      "REG_COLLECT","JIBC_COLLECT",
      "label:sync","jib:sync","label:hearts-sync","label:ts-sync",
      "itemLikes:sync","labelVotes:sync","state:updatedAt",
      "collectedLabels","tempCollectedLabels","labelTimestamps","labelHearts",
      "itemLikes","labelVotes","aud:selectedLabel","jib:selected","jib:collected"
    ];
    KNOWN.forEach(base => {
      wipe(base);
      if (ns) { wipe(`${base}:${ns}`); wipe(`${base}::${ns}`); wipe(`${base}:${enc}`); wipe(`${base}::${enc}`); }
    });
    try { __purgeNamespaceKeys(ns); } catch {}

    // [C2] 부팅 힌트/세션 힌트 제거
    try {
      // me:last-uid:* / me:last-ns
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith("me:last-uid:") || k === "me:last-ns") sessionStorage.removeItem(k);
      }
    } catch {}

    // [D] 전체 스캔(ns 흔적)
    if (isEmailNS(ns)) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i); if (!k) continue;
          const kk = k.toLowerCase();
          if (kk.includes(`:${ns}`) || kk.includes(`::${ns}`) || kk.includes(`:${enc}`) || kk.endsWith(ns) || kk.endsWith(enc)) wipe(k);
        }
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i); if (!k) continue;
          const kk = k.toLowerCase();
          if (kk.includes(`:${ns}`) || kk.includes(`::${ns}`) || kk.includes(`:${enc}`) || kk.endsWith(ns) || kk.endsWith(enc)) wipe(k);
        }
      } catch {}
    }

    // [E] IndexedDB 전부 삭제(지원 브라우저)
    try {
      if (indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db && db.name) {
            try { indexedDB.deleteDatabase(db.name); } catch {}
          }
        }
      } else {
        // 이름을 아는 DB가 있으면 수동으로:
        ["aud-store", "aud-cache", "app-db"].forEach((name) => { try { indexedDB.deleteDatabase(name); } catch {} });
      }
    } catch {}

    // [F] Cache Storage(서비스워커 캐시) 삭제
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}

    // [G] 서비스워커 언레지스터
    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(()=>{})));
      }
    } catch {}

    // [H] 브레드크럼/이벤트
    try { localStorage.setItem(`purge:reason:${Date.now()}`, reason); } catch {}
    try { window.dispatchEvent(new Event("store:purged")); } catch {}
    try { window.dispatchEvent(new Event("auth:logout")); } catch {}

    // [I] 옵션: 강제 리프레시(메모리 날리기)
    // location.replace(location.pathname + "?purged=" + Date.now());
  }

  // === 탈퇴 전용: 경고 + 하드 정리 + 백엔드 삭제 ===
  async function __confirmAndDeleteAccount() {
    const ok = window.confirm("Are you sure you want to permanently delete your account?\nThis action cannot be undone and all saved data will be removed.");
    if (!ok) return { ok: false, msg: "cancelled" };

    __purgeLocalStateHard("account-delete");

    try { sessionStorage.removeItem("auth:flag"); } catch {}
    try { localStorage.removeItem("auth:flag"); localStorage.removeItem("auth:userns"); localStorage.removeItem("auth:ns"); } catch {}

    try { await ensureCSRF(); } catch {}
    const attempts = [
      { url: "/auth/me",          method: "DELETE" },
      { url: "/api/users/me",     method: "DELETE" },
      { url: "/auth/delete",      method: "POST"   },
      { url: "/api/users/me",     method: "POST",  body: { _method: "DELETE" } },
    ];

    for (const a of attempts) {
      try {
        const opt = await withCSRF({
          method: a.method, credentials: "include",
          headers: { "Accept": "application/json", ...(a.body ? { "Content-Type": "application/json" } : {}) },
          body: a.body ? JSON.stringify(a.body) : undefined,
        });
        const r = await api(a.url, opt);
        if (r && (r.status === 200 || r.status === 204)) return { ok: true };
      } catch {}
    }
    return { ok: false, msg: "server-failed" };
  }


  // === Logout button support (ported from mine.js) ===
  async function __safeBeaconLogout() {
    try { window.__flushStoreSnapshot?.({ server:true }); } catch {}
    try {
      const blob = new Blob([JSON.stringify({})], { type: "application/json" });
      (navigator.sendBeacon && navigator.sendBeacon("/auth/logout-beacon", blob)) ||
        await fetch("/auth/logout-beacon", { method: "POST", keepalive: true, credentials: "include" });
    } catch {}
    try { sessionStorage.removeItem("auth:flag"); } catch {}
    try { localStorage.removeItem("auth:flag"); localStorage.removeItem("auth:userns"); } catch {}
    try { window.dispatchEvent(new Event("auth:logout")); } catch {}
  }
  function bindLogoutButtonForMe() {
    const btn = $("#btn-logout");
    if (!btn || btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      try { btn.disabled = true; btn.setAttribute("aria-busy", "true"); } catch {}
      try {
        await __safeBeaconLogout();
        try { window.auth?.markNavigate?.(); } catch {}
        const loginURL = new URL("./login.html", document.baseURI);
        loginURL.searchParams.set("next", new URL("./me.html", document.baseURI).href);
        location.assign(loginURL.href);
      } finally { try { btn.disabled = false; btn.removeAttribute("aria-busy"); } catch {} }
    }, { capture: false });
    btn.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); } });
    try {
      const mo = new MutationObserver(() => {
        const b = $("#btn-logout");
        if (b && !b.__bound) bindLogoutButtonForMe();
      });
      mo.observe(document.body, { childList:true, subtree:true });
    } catch {}
  }
  function bindDeleteButtonForMe() {
    const btn = $("#btn-delete");
    if (!btn || btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const res = await __confirmAndDeleteAccount();
      if (!res?.ok && res?.msg === "cancelled") return;
      if (!res?.ok) { alert("Failed to delete your account on the server. Local data has been cleared; please try again later."); return; }
      await __safeBeaconLogout();
      try { window.auth?.markNavigate?.(); } catch {}
      const loginURL = new URL("./login.html", document.baseURI);
      loginURL.searchParams.set("next", new URL("./me.html", document.baseURI).href);
      location.assign(loginURL.href);
    }, { capture: false });
    btn.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); } });
    try {
      const mo = new MutationObserver(() => {
        const b = $("#btn-delete");
        if (b && !b.__bound) bindDeleteButtonForMe();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { bindLogoutButtonForMe(); bindDeleteButtonForMe(); }, { once: true });
  } else { bindLogoutButtonForMe(); bindDeleteButtonForMe(); }

  /* ========================================================================
   * 12) Aud Laboratory — draw → internal audio record → submit (merged)
   *      (이전의 안쪽 IIFE를 함수로 치환하여 단일 IIFE 내에 포함)
   * ===================================================================== */
  function initAudLab() {
    const cvs = document.getElementById("aud-canvas");
    if (!cvs) return; // why: 페이지에 aud-lab 영역이 없을 수 있음
    const ctx = cvs.getContext("2d");
    const btnPlay   = document.getElementById("lab-play");
    const btnUndo   = document.getElementById("lab-undo");
    const btnClear  = document.getElementById("lab-clear");
    const btnSubmit = document.getElementById("lab-submit");
    const elStrokeCount = document.getElementById("lab-strokes");
    const elPointCount  = document.getElementById("lab-points");

    let W = 800, H = 500;
    let playing = false;
    let curStroke = null;
    const strokes = [];

    // Audio (sine synth with internal recording)
    let AC = null, master = null, osc = null;
    let mDest = null;
    let rec = null;
    let recChunks = [];
    let isRecording = false;
    const port = 0.02; // why: 부드러운 피치 천이

    const freqFromY = (y01) => {
      const y = Math.min(1, Math.max(0, y01));
      const fTop = 880, fBot = 110;
      return fTop + (fBot - fTop) * y;
    };

    function startAudio() {
      if (!AC) {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain();
        master.gain.value = 0.0;
        master.connect(AC.destination);
        mDest = AC.createMediaStreamDestination();
        master.connect(mDest);
      }
      if (!osc) {
        osc = AC.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 440;
        osc.connect(master);
        osc.start();
      }
    }
    function noteOn(freq) {
      if (!AC || !osc || !master) return;
      const t = AC.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.linearRampToValueAtTime(0.15, t + 0.01);
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq), t + port);
    }
    function noteOff() {
      if (!AC || !master) return;
      const t = AC.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.05);
    }

    function resizeCanvas() {
      const r = cvs.getBoundingClientRect();
      W = Math.max(300, Math.floor(r.width));
      H = Math.max(200, Math.floor((r.height || (r.width * 0.6))));
      cvs.width = W; cvs.height = H;
      redraw(); updateCounters();
    }
    function clearAll() { strokes.length = 0; curStroke = null; redraw(); updateCounters(); }
    function undoStroke() { strokes.pop(); curStroke = null; redraw(); updateCounters(); }
    function redraw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "#111";
      for (const s of strokes) {
        const pts = s.points || []; if (pts.length < 2) continue;
        ctx.beginPath(); ctx.moveTo(pts[0].x * W, pts[0].y * H);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
        ctx.stroke();
      }
      if (curStroke && curStroke.points.length >= 1) {
        const p = curStroke.points;
        ctx.beginPath(); ctx.moveTo(p[0].x * W, p[0].y * H);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x * W, p[i].y * H);
        ctx.stroke();
      }
    }
    function updateCounters() {
      const s = strokes.length;
      const pts = strokes.reduce((n, st) => n + (st.points?.length || 0), 0);
      if (elStrokeCount) elStrokeCount.textContent = String(s);
      if (elPointCount)  elPointCount.textContent  = String(pts);
      btnSubmit && (btnSubmit.disabled = s === 0);
      btnUndo   && (btnUndo.disabled   = s === 0);
      btnClear  && (btnClear.disabled  = s === 0);
    }

    function beginStroke(e) {
      if (!playing) return; // why: Play 눌러야 녹화/발음 시작
      const rect = cvs.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top)  / rect.height;
      curStroke = { points: [{ x, y, t: performance.now() }] };
      noteOn(freqFromY(y));
      redraw();
    }
    function moveStroke(e) {
      if (!playing || !curStroke) return;
      const rect = cvs.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top)  / rect.height;
      curStroke.points.push({ x, y, t: performance.now() });
      noteOn(freqFromY(y));
      redraw();
    }
    function endStroke() {
      if (!playing || !curStroke) return;
      noteOff();
      if (curStroke.points.length >= 2) { strokes.push(curStroke); updateCounters(); }
      curStroke = null;
      redraw();
    }

    function togglePlay() {
      playing = !playing;
      btnPlay?.setAttribute("aria-pressed", String(playing));
      btnPlay && (btnPlay.textContent = playing ? "Pause" : "Play");
      if (playing) {
        startAudio();
        try {
          if (mDest && !isRecording) {
            recChunks = [];
            try { rec = new MediaRecorder(mDest.stream, { mimeType: 'audio/webm' }); }
            catch { rec = new MediaRecorder(mDest.stream); }
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) recChunks.push(ev.data); };
            rec.onstop = () => {};
            rec.start();
            isRecording = true;
          }
        } catch {}
      } else {
        noteOff();
        // 녹음은 Submit 시 정지(연속 드로잉 허용)
      }
    }

    async function submitLab() {
      try {
        btnSubmit && (btnSubmit.disabled = true);
        const previewDataURL = cvs.toDataURL("image/png", 0.9);
        const nsEmail = (window.getNS ? String(window.getNS()).toLowerCase().trim() : "");
        if (!isEmailNS(nsEmail)) throw new Error("need_login");
        let audioDataURL = "";
        if (rec && isRecording) {
          await new Promise((res) => { try { rec.onstop = () => res(); } catch { res(); } try { rec.stop(); } catch { res(); } });
          isRecording = false;
          try {
            const blob = new Blob(recChunks, { type: (rec && rec.mimeType) ? rec.mimeType : "audio/webm" });
            audioDataURL = await new Promise((resolve) => { const fr = new FileReader(); fr.onloadend = () => resolve(fr.result); fr.readAsDataURL(blob); });
          } catch {}
        }
        const payload = { ns: nsEmail, width: W, height: H, previewDataURL, audioDataURL };
        const res = await fetch(toAPI("/api/audlab/submit"), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || `HTTP_${res.status}`);
        btnSubmit && (btnSubmit.textContent = "Submitted ✓");
        setTimeout(() => { if (btnSubmit) btnSubmit.textContent = "Submit"; }, 900);
      } catch (e) {
        alert("Submit 실패: " + (e?.message || e));
      } finally {
        btnSubmit && (btnSubmit.disabled = false);
      }
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas(); updateCounters();
    cvs.addEventListener("pointerdown", (e) => { try { cvs.setPointerCapture(e.pointerId); } catch {} beginStroke(e); });
    cvs.addEventListener("pointermove", moveStroke);
    cvs.addEventListener("pointerup",   (e) => { try { cvs.releasePointerCapture(e.pointerId); } catch {} endStroke(); });
    cvs.addEventListener("pointercancel", endStroke);
    cvs.addEventListener("touchstart", (e)=>e.preventDefault(), { passive:false });
    btnPlay  && btnPlay.addEventListener("click", togglePlay);
    btnUndo  && btnUndo.addEventListener("click", undoStroke);
    btnClear && btnClear.addEventListener("click", clearAll);
    btnSubmit&& btnSubmit.addEventListener("click", submitLab);
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 13) Ready — boot + aud-lab init (단일 IIFE에서 끝)
   * ──────────────────────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot(); initAudLab(); }, { once: true });
  } else {
    boot(); initAudLab();
  }
})();