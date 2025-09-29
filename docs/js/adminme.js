// adminme.js — Web 마이페이지 (no inline styles; CSS-only rendering)
// 2025-09-14 rebuilt from scratch (server-first counts; safe fallbacks)

(() => {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────────
   * 0) Utilities & Globals
   * ──────────────────────────────────────────────────────────────────────────── */

  // me.js 상단 유틸로 추가

  // 실제 업로드 호스트로 반드시 바꿔주세요.
  window.API_BASE    = "https://aud-api-dtd1.onrender.com/";
  window.STATIC_BASE = location.origin + "/";
  window.LB_REPAIR = true;

  // [ADD] admin allowlist
  const ADMIN_EMAILS = ["audsilhouette@gmail.com"]; // 운영자 이메일

  // 🔁 기존 window.__toAPI 교체
  window.__toAPI = function (u) {
    const s = String(u || "");
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s; // 절대 URL은 통과

    const p = s.replace(/^\/+/, "/"); // 정규화
    const isAPI     = p.startsWith("/api/") || p.startsWith("auth/");
    const isUploads = p.startsWith("/uploads/");

    const base =
      isAPI     ? (window.API_BASE    || location.origin + "/") :
      isUploads ? (window.STATIC_BASE || location.origin + "/") :
                  (window.STATIC_BASE || location.origin + "/");

    return new URL(p.replace(/^\/+/, ""), base).toString();
  };

  const $  = (sel, root = document) => root.querySelector(sel);

  const fmtInt = (n) => {
    try { return new Intl.NumberFormat("en-US").format(Number(n ?? 0)); }
    catch { return String(n ?? 0); }
  };

  /* [A] helpers (file-scope) */
  function isEmailNS(s) {
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || "").trim());
  }
  function currentNs() {
    try {
      const ns = (localStorage.getItem("auth:userns") || "").toLowerCase().trim();
      return isEmailNS(ns) ? ns : "";
    } catch { return ""; }
  }
  function nsKey(base) {
    const ns = currentNs();
    return ns ? `${base}::${ns}` : base;
  }
  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
  }


  function normalizeNs(v) {
    let s = String(v ?? "").trim().toLowerCase();
    if (!s) return "";
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith("`") && s.endsWith("`"))) {
      s = s.slice(1, -1);
    }
    s = s.replace(/^user:/, ""); // legacy shapes

    // ★ 변경: 이메일만 통과, 아니면 빈값
    return isEmailNS(s) ? s : "";
  }

  function __readProfileCacheSafe() {
    try {
      if (typeof window.readProfileCache === "function") return window.readProfileCache() || null;
    } catch {}
    try {
      // fallback: best-effort from storage
      const keys = ["me:profile", `me:profile:${(localStorage.getItem("auth:userns") || "default").toLowerCase()}`];
      for (const k of keys) {
        const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  function readNs() {
    try {
      const raw = (localStorage.getItem("auth:userns") || "").trim();
      return normalizeNs(raw);
    } catch {
      return "";
    }
  }
  function writeNs(ns) {
    try {
      let next = normalizeNs(ns);        // ★ 여기서 이미 비이메일 → ""
      // Try to upgrade to email from profile if provided value is not an email.
      if (!isEmailNS(next)) {
        const snap = __readProfileCacheSafe();
        const cand = deriveNSFromProfile(snap);
        if (isEmailNS(cand)) next = cand;
      }

      // ★ 추가: 여전히 이메일이 아니면 기록 금지
      if (!isEmailNS(next)) return;

      const prev = readNs();
      const prevIsEmail = isEmailNS(prev);
      const nextIsEmail = isEmailNS(next);

      if (!prev) {
        if (next) localStorage.setItem("auth:userns", next);
        return;
      }

      if (prevIsEmail && !nextIsEmail) {
        // Do not downgrade an email to id/username.
        return;
      }

      if (!prevIsEmail && nextIsEmail && prev !== next) {
        localStorage.setItem("auth:userns", next); // upgrade
        return;
      }

    } catch {}
  }

  function deriveNSFromProfile(snap) {
    if (!snap || typeof snap !== "object") return null;
    const email    = (snap.email    ?? snap.user?.email    ?? "").toString().trim().toLowerCase();
    // ★ 변경: 이메일만 허용
    return isEmailNS(email) ? email : null;
  }

  function getNS() {
    try {
      // 1) From storage
      let cur = readNs();
      if (isEmailNS(cur)) return cur;

      // 2) Try cached profile
      const cached = __readProfileCacheSafe();
      const candFromCache = deriveNSFromProfile(cached);
      if (isEmailNS(candFromCache)) {
        writeNs(candFromCache);
        return candFromCache;
      }

      // 3) Try live user (sync; if async API exists elsewhere, boot will upgrade later)
      const email = (window.__ME_EMAIL || "").toString().trim().toLowerCase();
      if (isEmailNS(email)) {
        writeNs(email);
        return email;
      }

      // ★ 변경: 비이메일 fallback 완전 제거. 저장하지 않고 "default"만 반환.
      return "";
    } catch {
      return "";
    }
  }

  // Ensure the global symbol uses the fixed version
  try { window.getNS = getNS; } catch {}

  /* [B] run once before any push/socket init */
  (() => {
    let ns = readNs();
    if (!isEmailNS(ns)) {
      const snap = (typeof window.readProfileCache === "function") ? window.readProfileCache() : null;
      const cand = deriveNSFromProfile(snap);
      if (isEmailNS(cand)) writeNs(cand);
    }
    ns = readNs();
    // ★ 변경: 이메일일 때만 브로드캐스트
    if (ns && isEmailNS(ns)) {
      window.dispatchEvent(new CustomEvent("user:updated", { detail: { email: ns, username: ns, id: ns, ns } }));
    }
  })();

  /* [KEEP] Email-first NS bootstrap with downgrade guard */
  (() => {
    function pickNSFrom(detail) {
      const email    = (detail?.email    ?? detail?.user?.email    ?? "").toString().trim().toLowerCase();
      // ★ 변경: 이메일만 반환
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

        // ★ 변경: 비이메일 cand는 무시
        if (!isEmail(cand)) return;

        // 아래는 기존 업그레이드/차등 저장 로직 그대로
        if (isEmail(prev) && !isEmail(cand)) return; // don't downgrade
        if (cand && (!prev || prev === "default" || prev !== cand)) {
          localStorage.setItem("auth:userns", cand);
          window.dispatchEvent(new CustomEvent("user:updated", { detail: { username: cand, email: cand, id: cand } }));
        }
      } catch {}
    })();

    // 이후 업데이트에도 다운그레이드 금지
    window.addEventListener("user:updated", (ev) => {
      try {
        const cand = pickNSFrom(ev?.detail || {});
        if (!cand) return;                  // ★ 비이메일이면 null → 저장 안 함
        const prev = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
        if (isEmail(prev) && !isEmail(cand)) return;
        if (!prev || prev === "default" || prev !== cand) localStorage.setItem("auth:userns", cand);
      } catch {}
    });
  })();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // External knobs / keys (backward compatible)
  const REG_KEY        = "collectedLabels";
  const JIB_KEY        = "jib:collected";
  const LABEL_SYNC_KEY = (window.LABEL_SYNC_KEY || "label:sync");
  const JIB_SYNC_KEY   = (window.JIB_SYNC_KEY   || "jib:sync");
  const EVT_LABEL      = (window.LABEL_COLLECTED_EVT || "label:collected-changed");
  const EVT_JIB        = (window.JIB_COLLECTED_EVT   || "jib:collection-changed");

  const toAPI = (u) =>
  (typeof window.__toAPI === "function") ? window.__toAPI(u) : String(u || "");

  function toAPI2(p) {
    return (typeof window.__toAPI === "function") ? window.__toAPI(p) : String(p || "");
  }

  // Auth helpers (no-op safe)
  const ensureCSRF = window.auth?.ensureCSRF || (async () => {});
  const withCSRF   = window.auth?.withCSRF   || (async (opt) => opt);

  // In-memory state
  let MY_UID   = null;
  let ME_STATE = { displayName: "member", email: "", avatarUrl: "" };

  // JSON & list normalization
  const parseJSON = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };
  const normalizeId = (v) => String(v ?? "").trim().toLowerCase();
  const dedupList   = (arr) => Array.isArray(arr) ? [...new Set(arr.map(normalizeId).filter(Boolean))] : [];
  const uniqueCount = (arr) => dedupList(arr).length;

  /**
   * Any → string[] (IDs). Accepts common shapes & coerces into de-duplicated IDs.
   * @param {any} x
   * @param {'label'|'jib'=} kind
   */
  function coerceList(x, kind) {
    if (!x) return null;

    // 1) JSON text
    if (typeof x === "string") {
      const p = parseJSON(x, null);
      if (p) return coerceList(p, kind);
    }

    // 2) Array of anything (object gets best-effort id-ish pick)
    if (Array.isArray(x)) {
      const pick = (o) => (o && typeof o === "object")
        ? (o.id ?? o.label ?? o.name ?? o.key ?? o.value ?? o.uid ?? o.slug ?? o._id)
        : o;
      return dedupList(x.map(pick));
    }

    // 3) Set / Map
    if (x instanceof Set) return dedupList([...x]);
    if (x instanceof Map) return dedupList([...x.keys()]);

    // 4) Object candidates
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

      // Flag-shape { idA:true, idB:1, ... }
      const vals = Object.values(x);
      if (vals.length && vals.every(v => typeof v === "boolean" || typeof v === "number")) {
        return dedupList(Object.keys(x).filter(Boolean));
      }

      // Nested `data`
      if (x.data) {
        const d = coerceList(x.data, kind);
        if (Array.isArray(d)) return d;
      }
    }

    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * 1) Collections: store/session readers & stabilizers
  * ──────────────────────────────────────────────────────────────────────────── */
  function readRawLists(){
    const ns = currentNs();

    // ── localStorage (NS별 신규 키)
    let storeLabels = readJson(nsKey("REG_COLLECT"), []);
    let storeJibs   = readJson(nsKey("JIBC_COLLECT"), []);

    // ── 레거시 전역 키가 남아있으면 NS 키로 이관
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

    // ── sessionStorage (페이지 세션 캐시)
    let sessLabels = [];
    let sessJibs   = [];
    try { const v = JSON.parse(sessionStorage.getItem(REG_KEY) || "[]"); if (Array.isArray(v)) sessLabels = v; } catch {}
    try { const v = JSON.parse(sessionStorage.getItem(JIB_KEY) || "[]"); if (Array.isArray(v)) sessJibs   = v; } catch {}

    // 항상 배열 보장
    storeLabels = Array.isArray(storeLabels) ? storeLabels : [];
    storeJibs   = Array.isArray(storeJibs)   ? storeJibs   : [];
    sessLabels  = Array.isArray(sessLabels)  ? sessLabels  : [];
    sessJibs    = Array.isArray(sessJibs)    ? sessJibs    : [];

    return { storeLabels, storeJibs, sessLabels, sessJibs };
  }

  function readLabels() {
    const { storeLabels, sessLabels } = readRawLists();
    if (Array.isArray(storeLabels) && storeLabels.length) return dedupList(storeLabels);
    if (sessLabels.length) return dedupList(sessLabels);
    return dedupList(storeLabels || []);
  }

  function readJibs() {
    const { storeJibs, sessJibs } = readRawLists();
    if (Array.isArray(storeJibs) && storeJibs.length) return dedupList(storeJibs);
    if (sessJibs.length) return dedupList(sessJibs);
    return dedupList(storeJibs || []);
  }

  /** Wait until store shape stabilizes or timeout, then pick robust counts. */
  async function settleInitialCounts(maxWaitMs = 1800, tickMs = 50) {
    const t0 = performance.now();
    let prev = "", stable = 0;

    while (performance.now() - t0 < maxWaitMs) {
      const { storeLabels, storeJibs, sessLabels, sessJibs } = readRawLists();
      const storeShapeReady = Array.isArray(storeLabels) || Array.isArray(storeJibs);
      const storeNonEmpty   = (Array.isArray(storeLabels) && storeLabels.length) || (Array.isArray(storeJibs) && storeJibs.length);

      const L = storeNonEmpty
        ? uniqueCount(storeLabels || [])
        : (sessLabels.length ? uniqueCount(sessLabels) : uniqueCount(storeLabels || []));

      const J = storeNonEmpty
        ? uniqueCount(storeJibs || [])
        : (sessJibs.length ? uniqueCount(sessJibs) : uniqueCount(storeJibs || []));

      const sig = `${storeShapeReady ? "S" : "X"}|${storeNonEmpty ? "N" : "0"}|${L}|${J}`;
      if (sig === prev) { if (++stable >= 2) return { labels: L, jibs: J }; } else { stable = 0; prev = sig; }

      await sleep(tickMs);
    }

    // Final fallback
    const { storeLabels, storeJibs, sessLabels, sessJibs } = readRawLists();
    const pick = (sArr, fArr) => (Array.isArray(sArr) && sArr.length) ? sArr : (fArr || sArr || []);
    return {
      labels: uniqueCount(pick(storeLabels, sessLabels)),
      jibs:   uniqueCount(pick(storeJibs,   sessJibs)),
    };
  }

  /** Clear session collections when user or namespace changes. */
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
    try {
      if (isEmailNS(ns)) sessionStorage.setItem(lastNSKey, ns);
      else sessionStorage.removeItem(lastNSKey);
    } catch {}
  }

  /** When store becomes ready with values, snapshot into session once (to prevent residue). */
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
    const keys = [PROFILE_KEY_PREFIX]; // 기본 키
    if (isEmailNS(ns)) {
      keys.unshift(`${PROFILE_KEY_PREFIX}:${ns}`, `${PROFILE_KEY_PREFIX}:${ns}:${uid}`);
    }
    return keys;
  };

  function writeProfileCache(detail) {
    const ns  = getNS();
    const uid = detail?.id ?? MY_UID ?? "anon";

    // ☆ email / displayName 보강
    const email = detail?.email ?? ME_STATE?.email ?? "";
    const displayName = detail?.displayName ?? detail?.name ?? ME_STATE?.displayName ?? "member";
    const payload = JSON.stringify({ ns, email, displayName, ...(detail || {}) });

    // 이메일이면 NS별 키 + 기본키, 아니면 기본키만
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
      if (!latest || rv > Number(latest.rev ?? latest.updatedAt ?? latest.updated_at ?? latest.ts ?? 0)) {
        latest = obj;
      }
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

  const hueIndexFrom = (s = "") => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return Math.round(hue / 15) % 24; // 24 buckets
  };

  function ensureAvatarEl() {
    let el = $("#me-avatar");
    if (!el) return null;
    if (el.tagName === "IMG") {
      // Convert <img> to <div> avatar container (CSS-only)
      const div = document.createElement("div");
      div.id = el.id;
      div.className = `${el.className || ""} avatar`;
      el.replaceWith(div);
      el = div;
    } else {
      el.classList.add("avatar");
    }
    return el;
  }

  function paintAvatar(nameOrEmail) {
    const name = String(nameOrEmail || "member").trim() || "member";
    const el   = ensureAvatarEl(); if (!el) return;
    const init = initials(name);
    const idx  = hueIndexFrom(name);
    // remove old hue classes
    for (const c of Array.from(el.classList)) if (/^h\d+$/.test(c)) el.classList.remove(c);
    el.classList.add(`h${idx}`);
    el.setAttribute("data-initials", init);
    el.setAttribute("aria-label", `avatar ${init}`);
    el.classList.remove("has-img", "url-mode");
  }

  function ensureAvatarImg(container, url, opts = {}) {
    let img = container.querySelector("img.avatar-img");
    if (!img) {
      img = document.createElement("img");
      img.className = "avatar-img";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.fetchPriority = "low";
      img.referrerPolicy = "no-referrer";
      container.appendChild(img);
    }
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

  function clearAvatarImg() {
    const el = ensureAvatarEl(); if (!el) return;
    el.querySelector("img.avatar-img")?.remove();
    el.classList.remove("has-img", "url-mode");
  }

  async function broadcastMyProfile(patch = {}) {
    let me = null;
    try { me = await window.auth?.getUser?.().catch(() => null); } catch {}
    const id = me?.user?.id ?? me?.id ?? me?.uid ?? me?.sub ?? null;
    const detail = {
      id,
      displayName: ME_STATE.displayName || me?.user?.displayName || me?.user?.name || "member",
      avatarUrl:   ME_STATE.avatarUrl || "",
      email:       ME_STATE.email || me?.user?.email || me?.email || "", 
      ...patch,
      rev: Date.now(),
    };
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

  async function fetchMe() {
    const r = await api("/auth/me", { credentials: "include", cache: "no-store" });
    if (!r || !r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }

  // [ADD] admin helpers (place right after fetchMe)
  async function isAdmin() {
    try {
      const me = await fetchMe();            // 이미 있는 helper 재사용
      const email = (me?.email || me?.user?.email || "").toLowerCase();
      if (email && ADMIN_EMAILS.includes(email)) return true;
      // 서버에 admin bootstrap 엔드포인트가 없으면 아예 호출하지 않음
      if (window.ENABLE_ADMIN_BACKEND === true) {
        const res = await fetch(
          (window.PROD_BACKEND || window.API_BASE || location.origin) + "/api/admin/audlab/bootstrap",
          { credentials: "include" }
        ).catch(() => null);
        if (res?.ok) {
          const j = await res.json().catch(() => null);
          if (j?.ok && (j.admin === true || j.role === "admin")) return true;
        }
      }
    } catch {}
    return false;
  }

  /* [ADD] Admin aud-lab modal (NSA: namespace switchable gallery) */
  function ensureAdminLabModal() {
    let wrap = document.querySelector("#admin-lab");

    // 없으면 생성
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "admin-lab";
      wrap.className = "modal";
      wrap.setAttribute("role","dialog");
      wrap.setAttribute("aria-modal","true");
      wrap.innerHTML = `
        <button type="button" class="overlay" aria-label="Close"></button>
        <div class="sheet" role="document" aria-labelledby="admin-lab-title">
          <h2 id="admin-lab-title" class="title">aud laboratory · Admin</h2>
          <div class="admin-toolbar">
            <div class="spacer"></div>
            <input id="admin-lab-q" placeholder="Search by ns / id" aria-label="search" />
            <button class="btn" id="admin-lab-refresh">Refresh</button>
            <button class="btn" id="admin-lab-close">Close</button>
          </div>
          <div id="admin-lab-grid" class="admin-grid" aria-live="polite"></div>
          <p class="msg" id="admin-lab-msg" aria-live="polite"></p>
        </div>
      `.trim();
      document.body.appendChild(wrap);
    }

    // 이미 있어도 바인딩은 한 번 보장
    if (!wrap.__bound) {
      wrap.querySelector(".overlay")?.addEventListener("click", closeAdminLabModal);
      wrap.querySelector("#admin-lab-close")?.addEventListener("click", closeAdminLabModal);

      // 입력/리프레시
      wrap.querySelector("#admin-lab-refresh")?.addEventListener("click", () => loadAdminLab());
      wrap.querySelector("#admin-lab-q")?.addEventListener("input", (e) => {
        const v = (e.target.value||"").trim().toLowerCase();
        filterAdminCards(v);
      });

      // ESC 핸들러를 저장만 해두고, 실제 add/remove는 open/close에서
      wrap.__onEsc = (e) => { if (e.key === "Escape") closeAdminLabModal(); };

      wrap.__bound = true;
    }

    return wrap;
  }
  // 모달 열기: 포커스 트랩 시작 & inert 해제
  function openAdminLabModal(){
    const m = ensureAdminLabModal();
    // 이전 포커스 저장 (닫힐 때 복원)
    m.__prevFocus = document.activeElement && document.activeElement instanceof HTMLElement
      ? document.activeElement : null;

    m.removeAttribute('inert');                // 포커스 가능
    m.classList.add("open");
    m.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");

    // 첫 포커스 이동(시트나 닫기 버튼)
    const first =
      m.querySelector("#admin-lab-q") ||
      m.querySelector("#admin-lab-close") ||
      m.querySelector(".sheet");
    if (first && first instanceof HTMLElement) first.focus({ preventScroll: true });

    if (m.__onEsc && !m.__escAttached) {
      document.addEventListener("keydown", m.__onEsc);
      m.__escAttached = true;
    }
    loadAdminLab().catch(()=>{});
  }

  // 모달 닫기: 포커스 밖으로 이동 → aria-hidden/inert 적용
  function closeAdminLabModal(){
    const m = document.querySelector("#admin-lab");
    if (!m) return;

    // 1) 모달 내부에 포커스가 있으면 먼저 밖으로 빼기
    const active = document.activeElement;
    if (active && m.contains(active)) {
      // 트리거 버튼이 있으면 복원, 없으면 body로 이동
      const target = (m.__prevFocus && document.contains(m.__prevFocus)) ? m.__prevFocus : document.body;
      if (target && target instanceof HTMLElement) target.focus({ preventScroll: true });
      // 그래도 남아있으면 강제 blur
      if (active instanceof HTMLElement) active.blur();
    }

    // 2) 시각/접근성 상태 업데이트
    m.classList.remove("open");
    m.setAttribute("aria-hidden","true");
    m.setAttribute("inert", "");               // 포커스/탭 막기 (권고)
    document.body.classList.remove("modal-open");

    // 3) ESC 핸들러 해제
    if (m.__onEsc && m.__escAttached) {
      document.removeEventListener("keydown", m.__onEsc);
      m.__escAttached = false;
    }
  }

  // 1) Replace the existing cardHTML(...) with the version below
  function cardHTML(it) {
    const raw   = it.preview || it.previewDataURL || it.thumbnail || it.image || it.png || "";
    const thumb = (typeof window.__toAPI === "function") ? window.__toAPI(raw) : raw;
    const when  = it.createdAt ? new Date(it.createdAt).toLocaleString() : "";
    const accepted = !!it.accepted;

    const ownerId   = String(it.ownerId || it.ns || "").trim();
    const ns        = String(it.ns || "").toLowerCase();
    const ownerName = String(it.ownerName || ownerId || "—");

    const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));

    return `
      <div class="card"
          data-id="${esc(it.id)}"
          data-ns="${esc(ns)}"
          data-owner="${esc(ownerId)}"
          ${accepted ? 'data-accepted="1"' : ''}>
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
          try {
            e.target.disabled = true;
            await hearSubmission({ id, ns, card });
          } finally {
            e.target.disabled = false;
          }
        } else if (act === "accept") {
          const btn = e.target;
          btn.disabled = true;
          try {
            const base = window.PROD_BACKEND || window.API_BASE || location.origin;
            const csrfRes = await fetch(new URL("/auth/csrf", base), { credentials: "include" }).catch(() => null);
            const csrf = await csrfRes?.json?.().catch(() => null);
            const headers = {
              "Content-Type": "application/json",
              "Accept": "application/json",
              ...(csrf?.csrfToken ? { "X-CSRF-Token": csrf.csrfToken } : {})
            };
            const r = await fetch(new URL("/api/admin/audlab/accept", base), {
              method: "POST",
              credentials: "include",
              headers,
              body: JSON.stringify({ ns, id })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) throw new Error(j?.error || "accept_failed");
            btn.textContent = "Accepted ✓";
            btn.classList.remove("primary");
            btn.classList.add("ghost");
            card.setAttribute("data-accepted", "1");
          } catch (err) {
            alert("Accept 실패: " + (err?.message || err));
            btn.disabled = false;
          }
        } else if (act === "copy-owner") {
          const btn = e.target;
          const owner = card.dataset.owner || card.querySelector(".owner")?.textContent || ns || "";
          if (!owner) { alert("owner id가 없습니다."); return; }
          try {
            await navigator.clipboard.writeText(owner);
            const prev = btn.textContent;
            btn.textContent = "Copied!";
            btn.disabled = true;
            setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 900);
          } catch {
            // 환경에 따라 clipboard 권한이 없을 수 있음 → fallback
            prompt("Copy this owner id:", owner);
          }
        }
      });
    });
}

  // ====== Hear: 녹음 있으면 재생, 없으면 strokes로 합성 ======
  async function hearSubmission({ id, ns, card }) {
    // 1) 오디오 URL 우선
    let audioUrl = card.__audioUrl || "";
    let jsonUrl  = card.__jsonUrl  || "";

    // 카드에 없으면 서버에서 한 번 조회 (가벼운 단건 메타)
    if (!audioUrl || !jsonUrl) {
      try {
        const base = window.PROD_BACKEND || window.API_BASE || location.origin;
        const u = new URL("/api/admin/audlab/item", base);
        u.searchParams.set("ns", ns);
        u.searchParams.set("id", id);
        const r = await fetch(u.toString(), { credentials:"include" }).catch(()=>null);
        const j = await r?.json?.().catch?.(()=>({}));
        if (j?.ok) {
          audioUrl = j.audioUrl || "";
          jsonUrl  = j.jsonUrl  || jsonUrl || "";
        }
      } catch {}
    }

    // 2) 녹음이 있으면 그것부터 재생
    if (audioUrl) {
      const url = (typeof window.__toAPI === "function") ? window.__toAPI(audioUrl) : audioUrl;
      await playHTMLAudioOnce(url, { card });
      card.__audioUrl = audioUrl; // 캐시
      return;
    }

    // 3) 폴백: strokes 합성
    // jsonUrl이 없으면 규칙대로 유추
    if (!jsonUrl) {
      const base = window.STATIC_BASE || location.origin;
      jsonUrl = new URL(`/uploads/audlab/${encodeURIComponent(ns)}/${id}.json`, base).toString();
    }
    try {
      const url = (typeof window.__toAPI === "function")
        ? window.__toAPI(jsonUrl)
        : jsonUrl;
      const r = await fetch(url, { credentials:"include", cache:"no-store" });
      const meta = await r.json();
      const strokes = Array.isArray(meta?.strokes) ? meta.strokes : [];
      if (!strokes.length) { alert("재생할 데이터가 없습니다."); return; }
      await synthPlayFromStrokes(strokes);
      card.__jsonUrl = jsonUrl; // 캐시
    } catch {
      alert("재생 데이터(JSON)를 불러오지 못했습니다.");
    }
  }

  function playHTMLAudioOnce(url, { card } = {}) {
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

  // strokes 합성 재생기 (me 페이지 캔버스와 동일한 매핑 사용)
  async function synthPlayFromStrokes(strokes) {
    const AC = new (window.AudioContext || window.webkitAudioContext)();
    const master = AC.createGain(); master.gain.value = 0.0; master.connect(AC.destination);
    const osc = AC.createOscillator(); osc.type = "sine"; osc.connect(master); osc.start();

    const fMin = 110, fMax = 1760; // A2 ~ A6
    const freqFromY = (y) => fMin * Math.pow(fMax / fMin, 1 - Math.max(0, Math.min(1, y)));

    // 모든 포인트를 시간축으로 펴기
    const pts = [];
    for (const st of strokes) {
      const arr = Array.isArray(st?.points) ? st.points : [];
      for (const p of arr) {
        const t = Number(p.t || 0);
        const x = Number(p.x || 0);
        const y = Number(p.y || 0);
        if (Number.isFinite(t)) pts.push({ t, x, y });
      }
    }
    if (!pts.length) { AC.close(); return; }
    pts.sort((a,b)=> a.t - b.t);
    const t0 = pts[0].t;
    const T  = pts[pts.length-1].t - t0;
    const port = 0.04;

    const startAt = AC.currentTime + 0.05;
    let lastGainEnd = startAt;
    for (let i=0; i<pts.length; i++) {
      const p   = pts[i];
      const at  = startAt + Math.max(0, (p.t - t0)/1000);
      const fq  = Math.max(40, freqFromY(p.y));
      osc.frequency.cancelScheduledValues(at);
      osc.frequency.exponentialRampToValueAtTime(fq, at + port);

      // 간단한 게이트(좌우로 legato 가정 없이 짧게)
      const a = 0.01, r = 0.08;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(0.0, at);
      master.gain.linearRampToValueAtTime(0.8, at + a);
      master.gain.linearRampToValueAtTime(0.0, at + a + r);
      lastGainEnd = at + a + r;
    }
    // 끝나면 종료
    await new Promise((res)=> setTimeout(res, Math.max(0, (lastGainEnd - AC.currentTime)*1000 + 80)));
    try { AC.close(); } catch {}
  }

  function filterAdminCards(q){
    const grid = document.querySelector("#admin-lab-grid");
    if (!grid) return;
    const query = String(q||"").toLowerCase();
    grid.querySelectorAll(".card").forEach(c=>{
      const ns = c.dataset.ns || "";
      const id = c.dataset.id || "";
      const owner = c.querySelector(".meta span")?.getAttribute("title")?.toLowerCase() || "";
      const match = !query || ns.includes(query) || id.includes(query) || owner.includes(query);
      c.classList.toggle("is-hidden", !match);
    });
  }

  // 탭/NS 비활성화: 전체 목록 한 번에 로드
  async function loadAdminLab() {
    const msg  = document.querySelector("#admin-lab-msg");
    const grid = document.querySelector("#admin-lab-grid");

    // 로딩 상태
    if (msg)  msg.textContent = "Loading…";
    if (grid) grid.innerHTML = "";

    // 표시명 파생(지역 헬퍼)
    const nameFrom = (snap) => {
      if (!snap || typeof snap !== "object") return "";
      const username    = (snap.username    ?? snap.user?.username    ?? "").toString().trim();
      const displayName = (snap.displayName ?? snap.user?.displayName ?? snap.name ?? snap.user?.name ?? "").toString().trim();
      return username || displayName;
    };

    try {
      const base = window.PROD_BACKEND || window.API_BASE || location.origin;
      const url  = new URL("/api/admin/audlab/all", base).toString();

      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const j = await r.json().catch(() => ({}));

      // 원본 → 카드 모델 매핑
      const items = Array.isArray(j?.items) ? j.items.map(src => {
        const ns       = src.ns || src.owner?.ns || "";
        const ownerId  = (src.user?.id ?? src.owner?.id ?? ns ?? "");
        const email    = (src.user?.email ?? src.owner?.email ?? "").toString();
        const emailLocal = email.includes("@") ? email.split("@")[0] : email;

        const ownerName =
          nameFrom(src.user) ||
          nameFrom(src.owner) ||
          emailLocal ||
          ownerId || "—";

        const preview =
          (typeof window.__toAPI === "function")
            ? window.__toAPI(src.image || src.preview || src.png || "")
            : (src.image || src.preview || src.png || "");

        return {
          id: src.id,
          ns,
          ownerId: String(ownerId || ""),
          ownerName: String(ownerName || ""),
          preview,
          createdAt: src.createdAt ?? src.created_at ?? null,
          accepted: !!src.accepted
        };
      }) : [];

      // 비어있음 처리
      if (!items.length) {
        if (grid) grid.innerHTML = `<div class="empty">No submissions.</div>`;
        if (msg)  msg.textContent = "";
        return;
      }

      // 렌더 + 액션 와이어링
      if (grid) {
        grid.innerHTML = items.map(cardHTML).join("");
        wireCardActions(grid);

        // 관리자면 Accept 버튼 주입
        try {
          const admin = await (typeof isAdmin === "function" ? isAdmin() : Promise.resolve(false));
          if (admin) {
            grid.querySelectorAll(".card .row--spaced").forEach((row) => {
              if (!row.querySelector('[data-act="accept"]')) {
                const b = document.createElement("button");
                b.className = "btn primary";
                b.setAttribute("data-act", "accept");
                b.textContent = "Accept";
                row.appendChild(b);
              }
            });
          }
        } catch {}
      }

      if (msg) msg.textContent = `${items.length} item(s)`;
    } catch (err) {
      if (grid) grid.innerHTML = `<div class="empty">Failed to load.</div>`;
      if (msg)  msg.textContent = "Error";
      try { console.error("[admin-lab] load failed:", err); } catch {}
    }
  }
  
  // [REPLACE] 기존 renderProfile(...) 전체를 아래로 교체
  function renderProfile({ name, displayName, email, avatarUrl }) {
    const nm =
      (displayName && String(displayName).trim()) ||
      (name && String(name).trim()) ||
      (isEmailNS(email) ? emailLocal(email) : "member");

    ME_STATE.displayName = nm;
    ME_STATE.email = email || "";
    ME_STATE.avatarUrl = avatarUrl || "";

    // 전역 아이덴티티(why: NS → 프로필 매핑 유지)
    try {
      const ns = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
      if (window.setNSIdentity && isEmailNS(ns)) {
        window.setNSIdentity(ns, { email: ME_STATE.email, displayName: nm, avatarUrl: ME_STATE.avatarUrl });
      }
    } catch {}

    const $  = (sel, root = document) => root.querySelector(sel);
    const nameEl  = $("#me-name");  if (nameEl)  nameEl.textContent  = nm;
    const emailEl = $("#me-email"); if (emailEl) emailEl.textContent = email || "";

    if (avatarUrl) {
      const el = ensureAvatarEl();
      if (el) ensureAvatarImg(el, avatarUrl);
    } else {
      clearAvatarImg();
      paintAvatar(nm || email || "member");
    }
  }

  function renderQuick({ labels = 0, jibs = 0 /* authed unused */ }) {
    $("#k-labels") && ($("#k-labels").textContent = fmtInt(labels));
    $("#k-jibs")   && ($("#k-jibs").textContent   = fmtInt(jibs));
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
   * 3.5) Server-first quick counts (labels & jibbitz)
   * ──────────────────────────────────────────────────────────────────────────── */
  const OPTIONS = ["thump", "miro", "whee", "track", "echo", "portal"]; // valid label set

  const arrify = (x, kind) => {
    const a = coerceList(x, kind);
    return Array.isArray(a) ? a : [];
  };

  // PATCH for me.js — robust jibbitz counting (server-first but safe)

  // 1) 유틸: 서버 state에서 지비츠 리스트를 최대한 유연하게 추출
  function extractJibListFromState(st) {
    // why: 백엔드/버전별로 스키마가 달라서 coerceList를 여러 후보에 시도
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
    // 흔한 스키마 후보들
    return (
      tryPick("jibs.collected") ||
      tryPick("jibs.items", "jibs.list", "jibs.data", "jibs") ||
      tryPick("jib.collected", "jib.items", "jib") ||
      tryPick("collectedJibs", "collected") ||
      tryPick("data.jibs", "data.jibIds") ||
      tryPick("state.jibs.collected", "state.jibs") || // 일부 래핑
      []
    );
  }

  // 2) 서버 카운트: 실패/빈값일 때 null 리턴(로컬에 맡김)
  async function fetchCountsFromServer(ns) {
    if (!isEmailNS(ns)) return null; // ★ 이메일 NS만 허용ㄴ
    const res = await api(`/api/state?ns=${encodeURIComponent(ns)}`, { method: "GET", credentials: "include", cache: "no-store" });
    if (!res || !res.ok) return null;
    const j  = await res.json().catch(() => ({}));
    const st = j?.state || j || {};
    const labelsArr = arrify(st.labels, "label").filter((k) => OPTIONS.includes(k));
    const jibsArr   = extractJibListFromState(st);

    // 아무 것도 못 읽으면 null (로컬에 맡김)
    const hasAny = (labelsArr.length + jibsArr.length) > 0;
    if (!hasAny) return null;

    return { labels: labelsArr.length, jibs: jibsArr.length, source: "server" };
  }

  // 3) 병합 로직: 로컬 먼저 계산 → 서버가 유효하면만 덮어쓰기
  async function getQuickCounts() {
    // 로컬(스토어/세션) 먼저 안정화
    let localCounts;
    try { localCounts = await settleInitialCounts(1000, 40); }
    catch { localCounts = { labels: readLabels().length, jibs: readJibs().length }; }

    // 로그인 상태면 서버도 시도
    if (sessionAuthed()) {
      const ns = getNS();
      const s = await fetchCountsFromServer(ns).catch(() => null);
      if (s) {
        // 규칙: 서버값이 명확히 유효(>=0)하되, **0은 덮어쓰지 않음**(로컬 보존)
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
      // 라벨/지비츠는 서버-우선 병합 로직 그대로 사용
      const counts = await getQuickCounts();

      renderQuick({
        labels: counts.labels || 0,
        jibs:   counts.jibs   || 0,
        authed: sessionAuthed()
      });
    } finally {
      __countsBusy = false;
    }
  }
  window.__meCountsRefresh = refreshQuickCounts;

  /* ─────────────────────────────────────────────────────────────────────────────
  * 5) Leaderboards (Top10) — replaces personal KPI widgets
  * ──────────────────────────────────────────────────────────────────────────── */

  /** 기존 .insights 섹션을 리더보드 호스트로 바꿔치기 */
  function ensureLeaderboardHost() {
    const insights =
      document.querySelector('section.insights[aria-label]') ||
      document.getElementById('insights') ||
      document.querySelector('section.insights');
    if (!insights) return null;
    insights.innerHTML = `
      <div id="lb-root" class="lb-grid">
        <article class="panel"><div class="kpi-lg">Loading leaderboards…</div></article>
      </div>
    `.trim();
    return document.getElementById('lb-root');
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function who(row) {
    // 백엔드가 author를 주면 최우선, 없으면 user/owner, 그래도 없으면 row 자체에서 추출
    const a = row?.author || row?.user || row?.owner || row || {};
    const name  = a.displayName || a.username || row.displayName || row.username || "";
    const email = a.email || row.email || "";
    const ns    = a.ns || row.ns || email || "";
    const avatar = a.avatarUrl || row.avatarUrl || "";
    return { name, email, ns, avatar };
  }
  function tableHTML(title, rows, mode = "posts") {
    const metricHead =
      mode === "votes" ? `<th title="Total votes received on posts">Votes</th>` :
      mode === "rate"  ? `<th title="Match rate">Rate</th>` :
                        `<th title="Posts created">Posts</th>`;

    const thead = `
      <thead>
        <tr>
          <th>Rank</th>
          <th>Account</th>
          ${metricHead}
        </tr>
      </thead>`;

    const fmt = (n) => (Number(n || 0)).toLocaleString();

    const tr = (r, i) => {
      const a = who(r); // ← 추가한 헬퍼 사용( author/user/owner → 우선 )
      const metricCell =
        mode === "votes" ? fmt(r.votes) :
        mode === "rate"  ? `${Math.round(Number(r.rate || 0))}%` :
                          fmt(r.posts);

      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div class="acc">
              ${a.avatar ? `<img class="lb-avatar" src="${toAPI2(a.avatar)}" alt="">` : ``}
              <div>
                <div>${esc(a.name || a.email || a.ns || "—")}</div>
                <div class="muted">${esc(a.email || a.ns || "")}</div>
              </div>
            </div>
          </td>
          <td>${metricCell}</td>
        </tr>`;
    };

    return `<article class="panel"><h3>${esc(title)}</h3><table class="lb">${thead}<tbody>${rows.map(tr).join("")}</tbody></table></article>`;
  }
  async function __json(url, opt = {}) {
    const r = await fetch(url, { credentials: "include", cache: "no-store", ...opt });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  const __sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  async function buildLeaderboardsFallback(onlyNs = "") {
    // 1) gallery(public) 수집 (페이지네이션)
    const galleryItems = [];
    let cursor="", rounds=0;
    while (rounds < 6) {
      const q = new URLSearchParams({ limit: "60" });
      if (cursor) q.set("after", cursor);
      const j = await __json(toAPI2(`/api/gallery/public?${q}`)).catch(()=>({}));
      if (!j?.ok) break;
      for (const it of (j.items||[])) {
        const ns = String(it.ns||"").toLowerCase();
        if (onlyNs && ns !== onlyNs.toLowerCase()) continue;
        galleryItems.push({ id: it.id, ns, src: "gallery" });
      }
      if (!j.nextCursor) break;
      cursor = j.nextCursor; rounds++;
      await __sleep(30);
    }
    const galleryMap = new Map(galleryItems.map(it => [it.id, it]));

    // 2) audlab(all) 수집(관리자)
    let audlabItems = [];
    try {
      const all = await __json(toAPI2(`/api/admin/audlab/all`));
      if (all?.ok) {
        audlabItems = (all.items||[])
          .map(it => ({ id: it.id, ns: String((it.ns||it.owner?.ns||"")).toLowerCase(), src: "audlab" }))
          .filter(v => v.ns && (!onlyNs || v.ns === onlyNs.toLowerCase()));
      }
    } catch {}
    const audlabMap = new Map(audlabItems.map(it => [it.id, it]));

    // 3) 아이템 집합
    const ids = [...new Set([...galleryMap.keys(), ...audlabMap.keys()])];

    // 4) 각 아이템 득표 조회
    const voteRows = [];
    for (const id of ids) {
      try {
        const r = await __json(toAPI2(`/api/items/${encodeURIComponent(id)}/votes`)).catch(()=>null);
        if (r?.ok) {
          const total = Object.values(r.counts||{}).reduce((s,n)=>s+Number(n||0),0);
          if (total > 0) {
            const src = galleryMap.has(id) ? "gallery" : audlabMap.has(id) ? "audlab" : "unknown";
            const ns  = (galleryMap.get(id)?.ns) || (audlabMap.get(id)?.ns) || "(unknown)";
            voteRows.push({ id, ns, src, total });
          }
        }
      } catch {}
      await __sleep(12);
    }

    // 5) NS별 집계
    const by = new Map();
    // posts: 양쪽 목록의 아이템 수(중복 제거)로 계산
    const postsBy = new Map();
    for (const it of [...galleryItems, ...audlabItems]) {
      const key = it.ns;
      const set = postsBy.get(key) || new Set();
      set.add(it.id);
      postsBy.set(key, set);
    }
    // votes: voteRows 합
    for (const v of voteRows) {
      const k = v.ns;
      const row = by.get(k) || { ns:k, votes:0, votes_gallery:0, votes_audlab:0 };
      row.votes += v.total;
      if (v.src === "gallery") row.votes_gallery += v.total;
      if (v.src === "audlab")  row.votes_audlab  += v.total;
      by.set(k, row);
    }

    const postsTop10 = [...postsBy.entries()]
      .map(([ns,set]) => ({ ns, posts: set.size }))
      .sort((a,b)=> b.posts - a.posts)
      .slice(0,10);

    const votesTop10 = [...by.values()]
      .sort((a,b)=> b.votes - a.votes)
      .slice(0,10);

    // match rate 정의가 서버와 다르면 “득표 있는 아이템 중 비율” 등으로 달라질 수 있으므로,
    // 일단 표 수 대비 gallery 비율(참고치)로 구성. 필요하면 서버 정의에 맞게 바꾸세요.
    const rateTop10 = [...by.values()]
      .map(r => {
        const posts = postsBy.get(r.ns)?.size || 0;
        const rate = posts ? (100 * r.votes_gallery / r.votes) : 0;
        return { ns: r.ns, rate };
      })
      .sort((a,b)=> b.rate - a.rate)
      .slice(0,10);

    return { postsTop10, votesTop10, rateTop10 };
  }
  async function loadLeaderboardsIntoInsights() {
    const host = ensureLeaderboardHost();
    if (!host) return;

    host.innerHTML = `<article class="panel"><div class="kpi-lg">Loading leaderboards…</div></article>`;

    try {
      // 1차: 서버 리더보드 시도
      const r = await fetch(toAPI2("/api/admin/leaderboards"), { credentials: "include", cache: "no-store" });
      let P=[], V=[], R=[];
      if (r.ok) {
        const j = await r.json().catch(()=> ({}));
        P = Array.isArray(j.postsTop10) ? j.postsTop10 : [];
        V = Array.isArray(j.votesTop10) ? j.votesTop10 : [];
        R = Array.isArray(j.rateTop10)  ? j.rateTop10  : [];
      }

      // ✅ 보정 모드: 관리자이면서(또는 플래그) 서버 값이 비면 우리가 재계산
      const needRepair = (window.LB_REPAIR === true) && ((!V?.length) || V.every(x => (x.votes||0) === 0));
      if (needRepair && (await isAdmin())) {
        const fb = await buildLeaderboardsFallback(""); // onlyNs 원하면 이메일 넣기
        // 서버 스키마에 맞춰 키 정리
        P = fb.postsTop10.map(x => ({ ns:x.ns, posts:x.posts }));
        V = fb.votesTop10.map(x => ({ ns:x.ns, votes:x.votes }));
        R = fb.rateTop10 .map(x => ({ ns:x.ns, rate:x.rate }));
        console.info("[leaderboards] fallback(repair) applied.");
      }

      host.innerHTML = `
        ${tableHTML("Most Posts", P, "posts")}
        ${tableHTML("Most Votes", V, "votes")}
        ${tableHTML("Best Match Rate", R, "rate")}
      `;
    } catch (e) {
      console.error("[leaderboards] load failed:", e);
      host.innerHTML = `
        ${tableHTML("Most Posts", [], "posts")}
        ${tableHTML("Most Votes", [], "votes")}
        ${tableHTML("Best Match Rate", [], "rate")}
      `;
    }
  }
  /* ─────────────────────────────────────────────────────────────────────────────
   * 6) Profile & Password update
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
      asJson("/auth/me",          "PATCH"),
      asJson("/api/users/me",     "PUT"),
      asJson("/auth/profile",     "POST"),
      asForm("/auth/me",          "POST", { _method: "PATCH" }),
      asForm("/api/users/me",     "POST", { _method: "PUT" }),
      asForm("/auth/profile",     "POST"),
    ];

    for (const v of variants) {
      const opt = await withCSRF({ method: v.method, credentials: "include", headers: v.headers, body: v.body });
      const res = await api(v.url, opt);
      if (!res) continue;
      if (res.ok) return { ok: true };
      if (res.status === 400 || res.status === 422) {
        let err = "Invalid input.";
        try { const j = await res.json(); err = j?.message || j?.error || err; } catch {}
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
   * 9) Reactive resync hooks for late-ready stores
   * ──────────────────────────────────────────────────────────────────────────── */
  const RESYNC_EVENTS = [
    "store:ready","labels:ready","label:ready","collected:ready",
    "jib:ready","jibs:ready","collection:ready",
    "store:changed","labels:changed","jibs:changed",
    "collectedLabels:changed", // EVT_LABEL alias
    "jib:collection-changed",  // EVT_JIB alias
  ];

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

  // ──────────────────────────────────────────────────────────────────────────────
  // 10) Boot  — REORDERED for early room subscription + predictable notifications
  // ──────────────────────────────────────────────────────────────────────────────
  async function boot() {
    if (window.__PURGING) return;
    let me    = { displayName: "member", email: "", avatarUrl: "" };
    let quick = { labels: 0, jibs: 0, authed: false };

    // 0) Warm from cache (빠른 초기 렌더)
    const cached = readProfileCache();
    if (cached) {
      me.displayName = cached.displayName || me.displayName;
      me.email       = cached.email || "";
      me.avatarUrl   = cached.avatarUrl || "";
    }

    // 1) /auth/me 로 실사용자 파악 + 세션 잔여물 정리
    const meResp = await fetchMe();
    if (meResp && typeof meResp === "object") {
      purgeCollectionsIfUserChanged(cached, meResp);
      MY_UID = meResp?.user?.id ?? meResp?.id ?? null;
      me = {
        displayName: meResp.displayName || meResp.name || me.displayName,
        email:       meResp.email || me.email,
        avatarUrl:   meResp.avatarUrl || me.avatarUrl,
      };
      quick.authed = true;
      try { sessionStorage.setItem("auth:flag", "1"); localStorage.setItem("auth:flag", "1"); } catch {}
    }

    // 2) 초기 카운트(server-first → fallback)
    try {
      const c = await getQuickCounts();
      quick.labels = c.labels || 0;
      quick.jibs   = c.jibs   || 0;
    } catch {
      quick.labels = readLabels().length;
      quick.jibs   = readJibs().length;
    }

    // 3) 1차 렌더(프로필/카운트) + 프로필 브로드캐스트
    renderProfile(me);
    await broadcastMyProfile({});
    renderQuick(quick);

    // 5) store 안정화되면 세션 한 번 동기화 + 카운트 보정 타이머
    syncSessionFromStoreIfReady();
    refreshQuickCounts();
    setTimeout(() => { syncSessionFromStoreIfReady(); refreshQuickCounts(); }, 300);
    setTimeout(() => { syncSessionFromStoreIfReady(); refreshQuickCounts(); }, 1500);

    // 6) 이벤트 연결(라벨/집 수집 변화, 스토리지 변화, 인증 변화)
    window.addEventListener(EVT_LABEL, refreshQuickCounts);
    window.addEventListener(EVT_JIB,   refreshQuickCounts);

    window.addEventListener("storage", (e) => {
      if (window.__PURGING) return;
      if (!e?.key) return;

      if (e.key === LABEL_SYNC_KEY || /label:sync/.test(e.key)) refreshQuickCounts();
      if (e.key === JIB_SYNC_KEY   || /jib:sync/.test(e.key))   refreshQuickCounts();
      if (e.key === "auth:userns" || e.key === "auth:flag")     refreshQuickCounts();

      if (e.key.startsWith(PROFILE_KEY_PREFIX) && e.newValue) {
        try { renderProfile(parseJSON(e.newValue, {})); } catch {}
      }
    }, { capture: true });

    window.addEventListener("auth:state",        refreshQuickCounts);
    window.addEventListener("store:ns-changed",  refreshQuickCounts);
    // [ADD] me.js — 스토어 변경 이벤트를 들을 때마다 빠르게 카운트 리프레시
    window.addEventListener("itemLikes:changed",       () => window.__meCountsRefresh?.());
    window.addEventListener("label:votes-changed",     () => window.__meCountsRefresh?.());
    window.addEventListener("label:collected-changed", () => window.__meCountsRefresh?.());
    window.addEventListener("jib:collection-changed",  () => window.__meCountsRefresh?.());

    // 7) UI 핸들러(프로필 편집/아바타)
    $("#btn-edit")?.addEventListener("click", () => { try { window.auth?.markNavigate?.(); } catch {} openEditModal(); });
    $("#me-avatar")?.addEventListener("click", () => { try { window.auth?.markNavigate?.(); } catch {} openAvatarCropper(); });

    // 10) 인사이트 계산(게시물 수 확정 후 방 구독은 유지)
    if (quick.authed) await loadLeaderboardsIntoInsights();
  }
 
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // [ADD] 파일 상단 유틸 근처(함수 선언부들) 어딘가에 추가
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

  // me.js — __purgeLocalStateHard 보강 부분만 발췌
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
    const KNOWN = [ /* ... (현행 KNOWN 목록 그대로) ... */ ];
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
        // ✅ 순수 로그아웃만 수행
        await __safeBeaconLogout();
        try { window.auth?.markNavigate?.(); } catch {}
        const loginURL = new URL("./login.html", document.baseURI);
        loginURL.searchParams.set("next", new URL("./me.html", document.baseURI).href);
        location.assign(loginURL.href);
      } finally {
        try { btn.disabled = false; btn.removeAttribute("aria-busy"); } catch {}
      }
    }, { capture: false });

    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); }
    });

    try {
      const mo = new MutationObserver(() => {
        const b = $("#btn-logout");
        if (b && !b.__bound) bindLogoutButtonForMe();
      });
      mo.observe(document.body, { childList:true, subtree:true });
    } catch {}
  }

  // === Delete(탈퇴) 버튼 바인딩: #btn-delete ===
  function bindDeleteButtonForMe() {
    const btn = $("#btn-delete");
    if (!btn || btn.__bound) return;
    btn.__bound = true;

    // inline 스타일 금지 정책을 지키기 위해 style 조작은 하지 않습니다.

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const res = await __confirmAndDeleteAccount();

      // ⬇️ 확인 취소 시 즉시 중단 (아무 변화 없음)
      if (!res?.ok && res?.msg === "cancelled") return;

      // ⬇️ 서버 실패 시: 알림만 띄우고 현재 페이지 유지 (로컬은 이미 정리됨)
      if (!res?.ok) {
        alert("Failed to delete your account on the server. Local data has been cleared; please try again later.");
        return;
      }

      // 성공 시 세션 마무리 후 로그인으로
      await __safeBeaconLogout();
      try { window.auth?.markNavigate?.(); } catch {}
      const loginURL = new URL("./login.html", document.baseURI);
      loginURL.searchParams.set("next", new URL("./me.html", document.baseURI).href);
      location.assign(loginURL.href);
    }, { capture: false });

    // 접근성: 키보드 엔터/스페이스로 활성화
    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); }
    });

    // 동적 리렌더 대비 재바인딩 가드
    try {
      const mo = new MutationObserver(() => {
        const b = $("#btn-delete");
        if (b && !b.__bound) bindDeleteButtonForMe();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bindLogoutButtonForMe();
      bindDeleteButtonForMe();
    }, { once: true });
  } else {
    bindLogoutButtonForMe();
    bindDeleteButtonForMe();
  }

  /* ==== PATCH: append to bottom of public/js/me.js ==== */
/* aud laboratory inlined into me.js (isolated via IIFE). 
   Why: keep single-file page JS without polluting globals. */
(() => {
  // --- fast exit if lab UI is not on this page ---
  const $ = (s, r = document) => r.querySelector(s);
  const cvs = $("#aud-canvas");
  if (!cvs) return; // lab not present → do nothing

  // --- DOM refs ---
  const btnPlay = $("#lab-play");
  const btnUndo = $("#lab-undo");
  const btnClear = $("#lab-clear");
  const btnSubmit = $("#lab-submit");
  const spanStrokes = $("#lab-strokes");
  const spanPoints = $("#lab-points");
  const btnViewList = $("#lab-view-list");

  // --- API base (reuse existing globals if present) ---
  const API = (path) => {
    const base = window.PROD_BACKEND || window.API_BASE || location.origin;
    const u = new URL(String(path).replace(/^\/+/, ""), base);
    return u.toString();
  };

  // --- Canvas & drawing state ---
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  let W = 900, H = 500;
  const ctx2d = cvs.getContext("2d", { desynchronized: true, alpha: false });

  /** @typedef {{x:number,y:number,t:number}} Point */
  /** @typedef {{points: Point[]}} Stroke */
  const strokes = [];
  let curStroke = null;
  let isDrawing = false;

  // --- Audio state ---
  let AC = null, master = null, osc = null;
  let playing = false;
  let lastNoteAt = 0;

  /* === Recorder (NEW) === */
  let recDest = null, mediaRecorder = null, recChunks = [], lastRecording = null;

  function startRecorder(){
    if (!AC) return;
    if (!recDest) recDest = AC.createMediaStreamDestination();
    if (master && recDest && !master.__recWired){
      master.connect(recDest);             // 스피커 연결은 기존 master→destination 그대로 유지
      master.__recWired = true;
    }
    if (!mediaRecorder) {
      const mtype =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")  ? "audio/ogg;codecs=opus" :
        "audio/webm";
      mediaRecorder = new MediaRecorder(recDest.stream, {
        mimeType: mtype,
        audioBitsPerSecond: 128000
      });
      mediaRecorder.ondataavailable = (ev)=>{ if (ev.data && ev.data.size) recChunks.push(ev.data); };
      mediaRecorder.onstop = ()=>{
        try { lastRecording = new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" }); }
        catch { lastRecording = null; }
        recChunks = [];
      };
    }
    if (mediaRecorder.state !== "recording") mediaRecorder.start(1000); // 1s 청크
  }

  function stopRecorder(){
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  // --- Helpers ---
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function now(){ return performance.now(); }

  function resizeCanvas() {
    const rect = cvs.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width * DPR));
    H = Math.max(180, Math.floor(rect.height * DPR));
    cvs.width = W; cvs.height = H;
    drawAll();
  }

  function updateCounters(){
    const p = strokes.reduce((s, st)=>s + st.points.length, 0);
    if (spanStrokes) spanStrokes.textContent = String(strokes.length);
    if (spanPoints)  spanPoints.textContent  = String(p);
    if (btnUndo)  btnUndo.disabled  = strokes.length === 0;
    if (btnClear) btnClear.disabled = strokes.length === 0;
  }

  function drawAll() {
    // background bands
    ctx2d.fillStyle = "#eef2f7";
    ctx2d.fillRect(0,0,W,H);
    const bands = 8;
    for (let i=0;i<bands;i++){
      const y0 = Math.floor((i + (i%2?0.5:0))*H/bands);
      ctx2d.fillStyle = i%2? "#f7f9fb" : "#f1f4f9";
      ctx2d.fillRect(0, Math.floor(i*H/bands), W, Math.floor(H/bands));
      if (i%2) {
        ctx2d.fillStyle = "rgba(0,0,0,.03)";
        ctx2d.fillRect(0, y0, W, 1);
      }
    }
    // strokes
    ctx2d.lineJoin = "round";
    ctx2d.lineCap = "round";
    for (const st of strokes) {
      if (st.points.length < 2) continue;
      ctx2d.strokeStyle = "#111";
      ctx2d.lineWidth = Math.max(2, Math.min(6, H * 0.006));
      ctx2d.beginPath();
      ctx2d.moveTo(st.points[0].x*W, st.points[0].y*H);
      for (let i=1;i<st.points.length;i++){
        const p = st.points[i];
        ctx2d.lineTo(p.x*W, p.y*H);
      }
      ctx2d.stroke();
    }
  }

  function startAudio(){
    if (AC) return;
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.0;
    master.connect(AC.destination);   // 스피커

    osc = AC.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 440;
    osc.connect(master);
    osc.start();

    // (NEW) 녹음 경로도 준비
    startRecorder();
  }

  function freqFromY(yNorm){
    // y=0(top) -> high, y=1(bottom) -> low
    const fMin = 110;  // A2
    const fMax = 1760; // A6
    const inv = 1 - clamp(yNorm, 0, 1);
    return fMin * Math.pow(fMax / fMin, inv); // exponential mapping
  }

  function applySoundForPoint(pxNorm, pyNorm){
    if (!AC) startAudio();
    if (AC.state === "suspended") AC.resume();

    const legato = clamp(pxNorm, 0, 1); // 0=staccato, 1=legato
    const f = freqFromY(pyNorm);

    const t = AC.currentTime;
    const portamento = 0.02 + 0.18 * legato; // smoother to the right
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f), t + portamento);

    const nowMs = now();
    const staccato = 1 - legato;
    const retriggerGap = 18 + 120 * staccato; // ms
    const a = 0.003 + 0.020 * legato; // attack
    const r = 0.030 + 0.250 * (1 - legato); // release

    // Left: chopped via retrigger; Right: sustained
    if (staccato > 0.12) {
      if (nowMs - lastNoteAt > retriggerGap) {
        lastNoteAt = nowMs;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(0.0, t);
        master.gain.linearRampToValueAtTime(0.9, t + a);
        master.gain.linearRampToValueAtTime(0.0, t + a + r);
      }
    } else {
      master.gain.cancelScheduledValues(t);
      const g = 0.15 + 0.75 * legato;
      master.gain.linearRampToValueAtTime(g, t + a);
    }
  }

  function noteOff(){
    if (!AC || !master) return;
    const t = AC.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(0.0, t + 0.08);
  }

  // --- Pointer handlers ---
  function getXY(e){
    const rect = cvs.getBoundingClientRect();
    const x = ("clientX" in e ? e.clientX : e.touches?.[0]?.clientX) - rect.left;
    const y = ("clientY" in e ? e.clientY : e.touches?.[0]?.clientY) - rect.top;
    return { x: clamp(x, 0, rect.width), y: clamp(y, 0, rect.height) };
  }
  function toNorm({x,y}){
    const rect = cvs.getBoundingClientRect();
    return { x: x/rect.width, y: y/rect.height };
  }

  function beginStroke(e){
    if (!playing) return; // only when play ON
    isDrawing = true;
    curStroke = { points: [] };
    const p = toNorm(getXY(e));
    curStroke.points.push({ x:p.x, y:p.y, t: performance.now() });
    strokes.push(curStroke);
    applySoundForPoint(p.x, p.y);
    updateCounters();
    drawAll();
  }

  function moveStroke(e){
    if (!isDrawing || !curStroke) return;
    const p = toNorm(getXY(e));
    curStroke.points.push({ x:p.x, y:p.y, t: performance.now() });
    applySoundForPoint(p.x, p.y);
    // incremental draw
    const lastTwo = curStroke.points.slice(-2);
    if (lastTwo.length === 2){
      ctx2d.strokeStyle = "#111";
      ctx2d.lineWidth = Math.max(2, Math.min(6, H * 0.006));
      ctx2d.beginPath();
      ctx2d.moveTo(lastTwo[0].x*W, lastTwo[0].y*H);
      ctx2d.lineTo(lastTwo[1].x*W, lastTwo[1].y*H);
      ctx2d.stroke();
    }
    if (spanPoints) spanPoints.textContent = String(Number(spanPoints.textContent||"0")+1);
  }

  function endStroke(){
    if (!isDrawing) return;
    isDrawing = false;
    curStroke = null;
    if (!playing) noteOff();
    updateCounters();
  }

  function undoStroke(){
    if (!strokes.length) return;
    strokes.pop();
    drawAll();
    updateCounters();
  }

  function clearAll(){
    strokes.length = 0;
    drawAll();
    updateCounters();
  }

  function togglePlay(){
    playing = !playing;
    if (btnPlay) {
      btnPlay.setAttribute("aria-pressed", String(playing));
      btnPlay.textContent = playing ? "Pause" : "Play";
    }
    if (playing) {
      startAudio();
      startRecorder();
    } else {
      noteOff();
      stopRecorder();
    }
  }

  // --- Submit ---
  function blobToDataURL(blob){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  async function submitLab(){
    if (btnSubmit) btnSubmit.disabled = true;
    try {
      // 1) 캔버스 → PNG dataURL
      const dataURL = cvs.toDataURL("image/png", 0.92);

      // 2) 녹음 마무리(재생 중이면 일시정지 → stopRecorder)
      if (playing) { togglePlay(); }   // 내부에서 stopRecorder 호출됨
      // stop 이벤트가 비동기라 아주 잠깐 대기
      await new Promise(r => setTimeout(r, 120));

      // 3) 마지막 녹음 → dataURL (없으면 빈 문자열)
      let audioDataURL = "";
      if (lastRecording && lastRecording.size > 0) {
        audioDataURL = await blobToDataURL(lastRecording);
      }

      // 4) 페이로드 구성 (이메일 userns만 허용)
      const nsEmail = (typeof window.getNS === "function" ? window.getNS() : "")
        .toString().trim().toLowerCase();

      if (!isEmailNS(nsEmail)) {
        alert("로그인이 필요합니다(이메일 기반 계정을 확인할 수 없습니다).");
        if (btnSubmit) btnSubmit.disabled = false; // 버튼 풀어주기
        return;
      }

      const payload = {
        ns: nsEmail,
        width: W,
        height: H,
        strokes,
        previewDataURL: dataURL,
        audioDataURL
      };

      // 5) 전송
      const res = await fetch(API("/api/audlab/submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      // 6) 응답 처리(기존 로직 유지)
      const ct = res.headers.get("content-type") || "";
      const isJSON = /\bapplication\/json\b/i.test(ct);
      let j = null, text = null;
      if (!res.ok) {
        text = await res.text().catch(()=> "");
        const hint = text && !text.trim().startsWith("<") ? `: ${text.slice(0,160)}` : "";
        throw new Error(`submit_api_${res.status}${hint}`);
      }
      j = isJSON ? await res.json().catch(()=>null) : null;
      if (!j || j.ok === false) {
        if (!j && !isJSON) j = (window.parseJSON ? parseJSON(text, null) : null);
        throw new Error(j?.error || "submit_failed");
      }

      if (btnSubmit){
        btnSubmit.textContent = "Submitted ✓";
        setTimeout(()=>{ btnSubmit.textContent="Submit"; btnSubmit.disabled = strokes.length===0; }, 1200);
      }
      try {
        const m = document.querySelector("#admin-lab");
        if (m && m.classList.contains("open")) loadAdminLab();
      } catch {}
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.startsWith("submit_api_404")) {
        alert("제출 실패: 서버에 제출 API(/api/audlab/submit)가 없습니다(404). 백엔드 경로/배포를 확인하세요.");
      } else if (msg.startsWith("submit_api_401")) {
        alert("제출 실패: 로그인이 필요합니다(401).");
      } else if (msg.startsWith("submit_api_")) {
        alert("제출 실패: 서버 오류 (" + msg.replace("submit_api_","HTTP ") + ")");
      } else {
        alert("제출 실패: " + msg);
      }
    } finally {
      if (btnSubmit) btnSubmit.disabled = strokes.length===0;
    }
  }

  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden && AC && master && AC.state !== "closed") {
        master.gain.setValueAtTime(0, AC.currentTime); // 왜: 탭 전환 시 잔음 컷
      }
    } catch {}
  });

  // --- Wire up ---
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateCounters();

  cvs.addEventListener("pointerdown", (e)=>{ try{ cvs.setPointerCapture(e.pointerId); }catch{} beginStroke(e); });
  cvs.addEventListener("pointermove", moveStroke);
  cvs.addEventListener("pointerup",   (e)=>{ try{ cvs.releasePointerCapture(e.pointerId); }catch{} endStroke(); });
  cvs.addEventListener("pointercancel", endStroke);
  cvs.addEventListener("touchstart", (e)=>e.preventDefault(), { passive:false });

  if (btnPlay)  btnPlay.addEventListener("click", togglePlay);
  if (btnUndo)  btnUndo.addEventListener("click", undoStroke);
  if (btnClear) btnClear.addEventListener("click", clearAll);
  if (btnViewList) btnViewList.addEventListener("click", openAdminLabModal);

  // a11y: space toggles play when canvas focused
  cvs.tabIndex = 0;
  cvs.addEventListener("keydown", (e)=>{
    if (e.code === "Space"){ e.preventDefault(); togglePlay(); }
  });
})(); 

})();
