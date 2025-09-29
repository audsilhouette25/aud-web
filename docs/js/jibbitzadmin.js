// /public/js/jibbitz.js (수정본) — 하드코딩 스토리 제거, 서버 연동 + BC 반영
(() => {
  "use strict";

  let __bc = null;

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

  const JIBS =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS ||
    window.JIBS;

  if (!Array.isArray(JIBS) || !JIBS.length) throw new Error("APP_CONFIG.JIBBITZ missing");
  const isKind = (v) => typeof v === "string" && JIBS.includes(v);

  /* =========================
  * URL → 선택 부트스트랩
  * ========================= */
  function urlSelectedKind() {
    try {
      const q = new URLSearchParams(location.search).get("jib");
      return (typeof q === "string" ? q.trim().toLowerCase() : "");
    } catch { return ""; }
  }

  function bootstrapSelectedFromURL() {
    const q = urlSelectedKind();
    if (q && isKind(q)) {
      if (typeof setSelected === "function") setSelected(q);
      else {
        try { plane().setItem(JIB_SELECTED(), q); dispatchEvent(new Event(EVT_SELECTED)); } catch {}
      }
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
      const legacySel = sessionStorage.getItem("jib:selected");
      if (legacySel && !plane().getItem(JIB_SELECTED())) {
        plane().setItem(JIB_SELECTED(), legacySel);
        sessionStorage.removeItem("jib:selected");
      }
      const legacyCol = sessionStorage.getItem("jib:collected");
      if (legacyCol && !plane().getItem(JIB_COLLECTED())) {
        plane().setItem(JIB_COLLECTED(), legacyCol);
        sessionStorage.removeItem("jib:collected");
      }
    } catch {}
  })();

  /* =========================
   * Store-like API
   * ========================= */
  function getSelected() {
    try {
      const v = plane().getItem(JIB_SELECTED());
      if (isKind(v)) return v;
    } catch {}
    try {
      const q = new URLSearchParams(location.search).get("jib");
      return isKind(q) ? q : null;
    } catch { return null; }
  }
  function setSelected(kind) {
    try {
      plane().setItem(JIB_SELECTED(), kind);
      window.dispatchEvent(new Event(EVT_SELECTED));
      localStorage.setItem(JIB_SYNC(), JSON.stringify({ type: "select", k: kind, t: Date.now() }));
      try { __bc && __bc.postMessage({ kind: "jib:sync", payload: { type: "select", k: kind, t: Date.now() } }); } catch {}
    } catch {}
  }

  function readCollectedSet() {
    try {
      const raw = plane().getItem(JIB_COLLECTED());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr.filter(isKind));
    } catch {
      return new Set();
    }
  }

  function writeCollectedSet(set) {
    const arr = Array.from(set).filter(isKind);
    const ns  = currentNS();
    const key = `jib:collected:${ns}`;
    const v   = JSON.stringify(arr);

    try { plane().setItem(key, v); } catch {}
    try { window.dispatchEvent(new Event(EVT_COLLECTED)); } catch {}

    if (isAuthed()) {
      try { localStorage.setItem(JIB_SYNC(), JSON.stringify({ type: "set", arr, t: Date.now() })); } catch {}
      try { __bc && __bc.postMessage({ kind: "jib:sync", payload: { type: "set", arr, t: Date.now() } }); } catch {}
    }
  }

  function add(k){ const s = readCollectedSet(); s.add(k); writeCollectedSet(s); return true; }
  function remove(k){ const s = readCollectedSet(); s.delete(k); writeCollectedSet(s); return false; }
  function toggle(k){ const s = readCollectedSet(); return s.has(k) ? remove(k) : add(k); }
  function clear(){ writeCollectedSet(new Set()); }
  function getCollected(){ return Array.from(readCollectedSet()); }
  function isCollected(k){ return readCollectedSet().has(k); }

  window.jib = Object.assign(window.jib || {}, {
    setSelected, getSelected, add, remove, toggle, clear, getCollected, isCollected
  });

  /* =========================
   * Cross-tab sync
   * ========================= */
  try { __bc = new BroadcastChannel(BC_NAME()); } catch {}
  if (__bc) {
    __bc.addEventListener("message", (e) => {
      const m = e?.data;
      if (!m || m.kind !== "jib:sync") return;
      const p = m.payload || {};
      if (p.type === "select" && isKind(p.k)) {
        plane().setItem(JIB_SELECTED(), p.k); window.dispatchEvent(new Event(EVT_SELECTED));
      } else if (p.type === "set" && Array.isArray(p.arr)) {
        plane().setItem(JIB_COLLECTED(), JSON.stringify(p.arr.filter(isKind)));
        window.dispatchEvent(new Event(EVT_COLLECTED));
      }
    });
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== JIB_SYNC() || !e.newValue) return;
    try {
      const p = JSON.parse(e.newValue);
      if (p.type === "select" && isKind(p.k)) {
        plane().setItem(JIB_SELECTED(), p.k); window.dispatchEvent(new Event(EVT_SELECTED));
      } else if (p.type === "set" && Array.isArray(p.arr)) {
        plane().setItem(JIB_COLLECTED(), JSON.stringify(p.arr.filter(isKind)));
        window.dispatchEvent(new Event(EVT_COLLECTED));
      }
    } catch {}
  });

  /* =========================
   * onReady
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
      el.textContent = k.toUpperCase();
    }
    function sync(){ renderPill(); renderTitle(); }
    onReady(() => sync());
    addEventListener(EVT_SELECTED, sync);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  })();

  /* =========================
   * UI: Preview
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
      img.decoding = "async";
      img.loading = "lazy";
      // SSOT
      img.src = window.ASSETS?.getJibImg?.(k) || "";
      box.appendChild(img);
    }
    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
  })();

  /* =========================
   * UI: Story (server-backed; no hardcoding)
   * ========================= */
  // 캐시 (세션 탭 한정) — 5분 TTL
  const STORY_TTL = 5 * 60 * 1000;
  const storyCacheKey = (jb) => `jib:story:${jb}`;
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
  function pickStoryFrom(obj){
    if (!obj || typeof obj !== "object") return "";
    const cands = [
      obj.story, obj.text, obj.body, obj.content, obj.description,
      obj?.data?.story, obj?.data?.text, obj?.data?.content,
      obj?.item?.story, obj?.item?.text
    ];
    return String(cands.find(v => typeof v === "string") || "").trim();
  }
  async function fetchJibStory(jb){
    const J = encodeURIComponent(jb);
    const tryGet = async (path) => {
      try {
        const r = await fetch(path, { credentials: "include", cache: "no-store" });
        if (!r || !r.ok) return "";
        let j = {};
        try { j = await r.json(); } catch {}
        return pickStoryFrom(j);
      } catch { return ""; }
    };
    return (
      await tryGet(`/api/jibbitz/${J}`) ||
      await tryGet(`/api/jibbitz/${J}/story`) ||
      await tryGet(`/api/jib/story?jib=${J}`) ||
      ""
    );
  }

  (function story() {
    const ROOT_ID = "jibStory";
    async function render() {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const k = getSelected();
      root.innerHTML = "";
      if (!k) return;

      let story = readStoryCache(k);
      if (!story) {
        story = await fetchJibStory(k);
        writeStoryCache(k, story);
      }
      if (!story) return;

      // 문단(빈 줄) 단위로 <p> 구성 + 줄바꿈 유지
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
    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });

    // admin 저장 브로드캐스트 반영
    try {
      const bc = new BroadcastChannel("aud:jib-story");
      bc.addEventListener("message", (e) => {
        const m = e?.data || {};
        if (m.kind === "jib:story-updated" && m.jib && m.story != null) {
          writeStoryCache(m.jib, String(m.story));
          if (getSelected() === m.jib) render();
        }
      });
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
      const isActive  = !!selected && collected.has(selected);

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

    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    addEventListener(EVT_COLLECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
    window.addEventListener("storage", (e) => { if (e.key === JIB_SYNC()) render(); });
  })();
})();
