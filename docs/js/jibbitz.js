// /js/jibbitz.js  — server-backed story + fallback endpoints (admin과 동일 전략) + app-assets.js 사용
(() => {
  "use strict";

  /* =========================
   * NS / Storage helpers
   * ========================= */
  function isAuthed() {
    try { return !!(window.auth?.isAuthed?.()) || sessionStorage.getItem("auth:flag") === "1"; }
    catch { return false; }
  }
  function currentNS() {
    try { const ns = (window.__STORE_NS || "").trim().toLowerCase(); if (ns) return ns; } catch {}
    if (!isAuthed()) return "default";
    try {
      const ns = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
      return ns || "default";
    } catch { return "default"; }
  }
  function plane() { return currentNS() === "default" ? sessionStorage : localStorage; }

  const EVT_SELECTED  = "jib:selected-changed";
  const EVT_COLLECTED = "jib:collection-changed";
  const JIB_SELECTED  = () => `jib:selected:${currentNS()}`;
  const JIB_COLLECTED = () => `jib:collected:${currentNS()}`;
  const JIB_SYNC      = () => `jib:sync:${currentNS()}`;
  const BC_NAME       = () => `aud:sync:${currentNS()}`;

  const NORM = (s) => String(s || "").trim().toLowerCase();

  // ⚠️ 핵심 수정: 원본 목록을 소문자화하여 SSOT 일치 (admin과 동일 전략)
  const JIBS_RAW =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS || window.JIBS;
  if (!Array.isArray(JIBS_RAW) || !JIBS_RAW.length) throw new Error("APP_CONFIG.JIBBITZ missing");
  const JIBS = JIBS_RAW.map(NORM);
  const isKind = (v) => typeof v === "string" && JIBS.includes(NORM(v));

  const readNSParam = () => {
    try {
      const sp = new URL(location.href).searchParams;
      return NORM(sp.get("ns") || "");
    } catch { return ""; }
  };

  /* =========================
  * URL → 선택 부트스트랩 (SSOT: URL)
  * ========================= */
  function urlSelectedKind() {
    try {
      const q = new URLSearchParams(location.search).get("jib");
      return (typeof q === "string" ? NORM(q) : "");
    } catch { return ""; }
  }
  function bootstrapSelectedFromURL() {
    const q = urlSelectedKind();
    if (q && isKind(q)) {
      if (typeof setSelected === "function") setSelected(q);
      else { try { plane().setItem(JIB_SELECTED(), q); dispatchEvent(new Event(EVT_SELECTED)); } catch {} }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapSelectedFromURL, { once: true });
  } else {
    bootstrapSelectedFromURL();
  }

  /* =========================
   * 1회 레거시 → NS 마이그레이션
   * ========================= */
  (function migrateLegacyOnce() {
    try {
      const legacySel = plane().getItem("jib:selected"); // same plane() to avoid cross-mode mismatch
      if (legacySel && !plane().getItem(JIB_SELECTED())) {
        plane().setItem(JIB_SELECTED(), NORM(legacySel));
        plane().removeItem("jib:selected");
      }
      const legacyCol = plane().getItem("jib:collected");
      if (legacyCol && !plane().getItem(JIB_COLLECTED())) {
        const arr = JSON.parse(legacyCol || "[]").map(NORM).filter(isKind);
        plane().setItem(JIB_COLLECTED(), JSON.stringify(arr));
        plane().removeItem("jib:collected");
      }
    } catch {}
  })();

  /* =========================
   * Store-like API
   * ========================= */
  function getSelected() {
    try {
      const v = plane().getItem(JIB_SELECTED());
      const k = v ? NORM(v) : "";
      if (isKind(k)) return k;
    } catch {}
    try {
      const q = urlSelectedKind();
      return isKind(q) ? q : null;
    } catch { return null; }
  }
  function setSelected(kind) {
    const k = NORM(kind); // ⚠️ 핵심: 저장도 NORM
    if (!isKind(k)) return;
    try {
      plane().setItem(JIB_SELECTED(), k);
      window.dispatchEvent(new Event(EVT_SELECTED));
      const payload = { type: "select", k, t: Date.now() };
      localStorage.setItem(JIB_SYNC(), JSON.stringify(payload));
      try { __bc?.postMessage({ kind: "jib:sync", payload }); } catch {}
    } catch {}
  }

  function readCollectedSet() {
    try {
      const raw = plane().getItem(JIB_COLLECTED());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr.map(NORM).filter(isKind));
    } catch { return new Set(); }
  }
  function writeCollectedSet(set) {
    const arr = Array.from(set).map(NORM).filter(isKind);
    const v   = JSON.stringify(arr);
    try { plane().setItem(JIB_COLLECTED(), v); } catch {}
    try { window.dispatchEvent(new Event(EVT_COLLECTED)); } catch {}
    if (isAuthed()) {
      const payload = { type: "set", arr, t: Date.now() };
      try { localStorage.setItem(JIB_SYNC(), JSON.stringify(payload)); } catch {}
      try { __bc?.postMessage({ kind: "jib:sync", payload }); } catch {}
    }
  }
  function add(k){ const s = readCollectedSet(); s.add(NORM(k)); writeCollectedSet(s); return true; }
  function remove(k){ const s = readCollectedSet(); s.delete(NORM(k)); writeCollectedSet(s); return false; }
  function toggle(k){ const s = readCollectedSet(); const kk = NORM(k); return s.has(kk) ? remove(kk) : add(kk); }
  function clear(){ writeCollectedSet(new Set()); }
  function getCollected(){ return Array.from(readCollectedSet()); }
  function isCollected(k){ return readCollectedSet().has(NORM(k)); }

  window.jib = Object.assign(window.jib || {}, {
    setSelected, getSelected, add, remove, toggle, clear, getCollected, isCollected
  });

  /* =========================
   * Cross-tab sync
   * ========================= */
  let __bc = null;
  try { __bc = new BroadcastChannel(BC_NAME()); } catch {}
  if (__bc) {
    __bc.addEventListener("message", (e) => {
      const m = e?.data;
      if (!m || m.kind !== "jib:sync") return;
      const p = m.payload || {};
      if (p.type === "select" && isKind(p.k)) {
        plane().setItem(JIB_SELECTED(), NORM(p.k)); window.dispatchEvent(new Event(EVT_SELECTED));
      } else if (p.type === "set" && Array.isArray(p.arr)) {
        plane().setItem(JIB_COLLECTED(), JSON.stringify(p.arr.map(NORM).filter(isKind)));
        window.dispatchEvent(new Event(EVT_COLLECTED));
      }
    });
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== JIB_SYNC() || !e.newValue) return;
    try {
      const p = JSON.parse(e.newValue);
      if (p.type === "select" && isKind(p.k)) {
        plane().setItem(JIB_SELECTED(), NORM(p.k)); window.dispatchEvent(new Event(EVT_SELECTED));
      } else if (p.type === "set" && Array.isArray(p.arr)) {
        plane().setItem(JIB_COLLECTED(), JSON.stringify(p.arr.map(NORM).filter(isKind)));
        window.dispatchEvent(new Event(EVT_COLLECTED));
      }
    } catch {}
  });

  /* =========================
   * onReady helper
   * ========================= */
  const onReady = (fn) =>
    (document.readyState === "loading")
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();

  /* =========================
   * UI: Header & Title
   * ========================= */
  (function header() {
    function renderPill() {
      const row = document.getElementById("categoryRow");
      if (!row) return;
      row.innerHTML = "";
      const pill = document.createElement("div");
      pill.className = "pill";
      const txt = document.createElement("span");
      txt.className = "pill__text";
      txt.textContent = "JIBBITZ";
      pill.appendChild(txt);
      row.appendChild(pill);
    }
    function renderTitle() {
      const el = document.getElementById("jibTitle");
      if (!el) return;
      const k = getSelected();
      if (!k) return;
      el.textContent = k.toUpperCase(); // why: UI 가독성만 대문자
    }
    function sync(){ renderPill(); renderTitle(); }
    onReady(() => sync());
    addEventListener(EVT_SELECTED, sync);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  })();

  /* =========================
   * UI: Preview (app-assets.js 사용)
   * ========================= */
  (function preview() {
    const BOX_ID = "jibPreviewBox";

    function render() {
      const box = document.getElementById(BOX_ID);
      if (!box) return;
      box.innerHTML = "";
      const k = getSelected();
      if (!k) { box.classList.add("is-empty"); return; }
      box.classList.remove("is-empty");

      const img = document.createElement("img");
      img.alt = k;

      if (window.ASSETS?.attachJibImg) {
        window.ASSETS.attachJibImg(img, k);
      } else {
        img.src = window.ASSETS?.getJibImg?.(k) || "";
      }
      img.decoding = "async";
      img.loading = "lazy";
      box.appendChild(img);
    }

    onReady(render);
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
    window.addEventListener("ASSETS:ready", render, { once:false });
  })();

  /* =========================
   * UI: Story (server-backed, admin과 동일 폴백)
   * ========================= */
  (function story() {
    const ROOT_ID = "jibStory";

    const API_ORIGIN = window.PROD_BACKEND || window.API_BASE || window.API_ORIGIN || null;
    const toAPI = (p) => {
      try {
        const u = new URL(p, location.href);
        return (API_ORIGIN && /^\/(api|auth|uploads)\//.test(u.pathname))
          ? new URL(u.pathname + u.search + u.hash, API_ORIGIN).toString()
          : u.toString();
      } catch { return p; }
    };
    async function api(path, opt = {}) {
      const url = toAPI(path);
      const base = { credentials: "include", cache: "no-store", ...opt };
      const fn = window.auth?.apiFetch || fetch;
      try { return await fn(url, base); } catch { return null; }
    }
    function pickStoryFrom(obj){
      if (!obj || typeof obj !== "object") return "";
      const cands = [obj.story, obj.text, obj.body, obj.content, obj.description, obj?.data?.story, obj?.data?.text, obj?.data?.content, obj?.item?.story, obj?.item?.text];
      return String(cands.find(v => typeof v === "string") || "").trim();
    }

    const STORY_TTL = 5 * 60 * 1000;
    const storyCacheKey = (jb) => `jib:story:${NORM(jb)}`;
    function readStoryCache(jb){
      try{
        const raw = sessionStorage.getItem(storyCacheKey(jb));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.t || (Date.now() - obj.t) > STORY_TTL) return null;
        return obj.story || "";
      } catch { return null; }
    }
    function writeStoryCache(jb, story){
      try{
        const clean = String(story || "").replace(/\r\n?/g, "\n");
        sessionStorage.setItem(storyCacheKey(jb), JSON.stringify({ t: Date.now(), story: clean }));
      } catch {}
    }

    async function fetchJibStory(jb){
      const k = NORM(jb);
      const J = encodeURIComponent(k);
      const ns = readNSParam();
      const qs = ns ? `?ns=${encodeURIComponent(ns)}` : "";

      const tryGet = async (paths) => {
        for (const p of paths) {
          const r = await api(p, { method:"GET" });
          if (!r) continue;
          if (r.ok) { try { return pickStoryFrom(await r.json()); } catch { return ""; } }
        }
        return "";
      };

      return await tryGet([
        `/api/jibbitz/${J}${qs}`,
        `/api/jibbitz/${J}/story${qs}`,
        `/api/jibbitz/${J}/stories${qs}`,
        `/api/jibbitzes/${J}${qs}`,
        `/api/jibbitzes/${J}/story${qs}`,
        `/api/jib/${J}${qs}`,
        `/api/jib/${J}/story${qs}`,
        `/api/jibbitz/story?jib=${J}${ns ? `&ns=${encodeURIComponent(ns)}` : ""}`,
        `/api/jib/story?jib=${J}${ns ? `&ns=${encodeURIComponent(ns)}` : ""}`,
        `/api/story/jibbitz/${J}${qs}`,
      ]);
    }

    async function renderJibStory() {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const jb = getSelected();
      root.innerHTML = "";
      if (!jb) return;

      let story = readStoryCache(jb);
      if (!story) {
        story = await fetchJibStory(jb);
        writeStoryCache(jb, story);
      }
      if (!story) return;

      story.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/).forEach(block => {
        const p = document.createElement("p");
        const lines = block.split("\n");
        lines.forEach((line, i) => {
          p.appendChild(document.createTextNode(line));
          if (i < lines.length - 1) p.appendChild(document.createElement("br"));
        });
        root.appendChild(p);
      });
    }

    onReady(renderJibStory);
    addEventListener(EVT_SELECTED, renderJibStory);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") renderJibStory();
    });

    try {
      const bc = new BroadcastChannel("aud:jib-story");
      bc.addEventListener("message", (e) => {
        const m = e?.data || {};
        if (m.kind === "jib:story-updated" && m.jib && m.story != null) {
          const k = NORM(m.jib);
          writeStoryCache(k, String(m.story));
          if (getSelected() === k) renderJibStory();
        }
      });
    } catch {}
    try {
      if (window.SOCKET && typeof window.SOCKET.on === "function") {
        window.SOCKET.on("jib:story-updated", (m = {}) => {
          if (!m.jib) return;
          const k = NORM(m.jib);
          writeStoryCache(k, String(m.story || ""));
          if (getSelected() === k) renderJibStory();
        });
      } else {
        window.addEventListener?.("socket:ready", () => {
          if (window.SOCKET && typeof window.SOCKET.on === "function") {
            window.SOCKET.on("jib:story-updated", (m = {}) => {
              if (!m.jib) return;
              const k = NORM(m.jib);
              writeStoryCache(k, String(m.story || ""));
              if (getSelected() === k) renderJibStory();
            });
          }
        }, { once: true });
      }
    } catch {}
  })();

  /* =========================
   * UI: Collect Button
   * ========================= */
  (function collectButton() {
    const mount = document.getElementById("jibCollectBtn");
    if (!mount) return;

    function render() {
      const selected  = getSelected();
      const collected = readCollectedSet();
      const isActive  = !!selected && collected.has(NORM(selected));

      mount.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jib-btn " + (isActive ? "jib-btn--active" : "jib-btn--inactive");
      btn.textContent = isActive ? "Collected" : "Collect";
      if (!selected) btn.classList.add("is-disabled");

      if (selected) {
        btn.addEventListener("click", () => {
          const k = getSelected(); if (!k) return;
          toggle(k);
          render();
          try { (window.mineRenderAll?.() || window.renderAll?.()); } catch {}
        }, { passive: true });
      }
      mount.appendChild(btn);
    }

    onReady(render);
    addEventListener(EVT_SELECTED, render);
    addEventListener(EVT_COLLECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
    window.addEventListener("storage", (e) => { if (e.key === JIB_SYNC()) render(); });
  })();
})();
