// /js/jibbitz.js
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
    // store.js가 이미 계산해 둔 값을 최우선으로 사용
    try { const ns = (window.__STORE_NS || "").trim().toLowerCase(); if (ns) return ns; } catch {}
    // 폴백(아주 초기 부팅 타이밍)
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

  const JIBS  = (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) || window.ALL_JIBS || WINDOW.JIBS;
  if (!Array.isArray(JIBS)   || !JIBS.length)   throw new Error("APP_CONFIG.JIBBITZ missing");
  const isKind = (v) => typeof v === "string" && JIBS.includes(v);

  /* =========================
  * URL → 선택 부트스트랩 (SSOT: URL)
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
      // URL이 있으면 그것을 '사실'로 저장 → 이후 전체 UI/스토리지/브로드캐스트가 일치
      if (typeof setSelected === "function") setSelected(q);
      else {
        // (아주 드문 경우) setSelected가 아직 바인딩 전이면 직접 평면에 기록
        try { plane().setItem(JIB_SELECTED(), q); dispatchEvent(new Event(EVT_SELECTED)); } catch {}
      }
    }
  }

  // DOM 준비되면 1회만 실행 (type="module" defer 환경 포함)
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
      try { __bc?.postMessage({ kind: "jib:sync", payload: { type: "select", k: kind, t: Date.now() } }); } catch {}
    } catch {}
  }

  // ⬇️ jibbitz.js의 readCollectedSet / writeCollectedSet 교체

  function readCollectedSet() {
    try {
      const raw = plane().getItem(JIB_COLLECTED()); // ← NS 전용 키만
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

    // 1) NS 평면에만 기록 (authed=localStorage, guest=sessionStorage)
    try { plane().setItem(key, v); } catch {}

    // 2) UI 알림
    try { window.dispatchEvent(new Event(EVT_COLLECTED)); } catch {}

    // 3) 로그인 상태면 탭 간 동기화(로컬스토리지 이벤트/BC)
    if (isAuthed()) {
      try { localStorage.setItem(JIB_SYNC(), JSON.stringify({ type: "set", arr, t: Date.now() })); } catch {}
      try { __bc?.postMessage({ kind: "jib:sync", payload: { type: "set", arr, t: Date.now() } }); } catch {}
    }
  }

  function add(k){ const s = readCollectedSet(); s.add(k); writeCollectedSet(s); return true; }
  function remove(k){ const s = readCollectedSet(); s.delete(k); writeCollectedSet(s); return false; }
  function toggle(k){ const s = readCollectedSet(); return s.has(k) ? remove(k) : add(k); }
  function clear(){ writeCollectedSet(new Set()); }
  function getCollected(){ return Array.from(readCollectedSet()); }
  function isCollected(k){ return readCollectedSet().has(k); }

  // 전역 노출
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
    const SRC = {
      bloom:"./asset/bloom.png",
      tail:"./asset/tail.png",
      cap:"./asset/cap.png",
      keyring:"./asset/keyring.png",
      duck:"./asset/duck.png",
      twinkle:"./asset/twinkle.png",
      xmas:"./asset/xmas.png",
      bunny:"./asset/bunny.png",
    };
    function render() {
      const box = document.getElementById(BOX_ID);
      if (!box) return;
      box.innerHTML = "";
      const k = getSelected();
      if (!k) { box.classList.add("is-empty"); return; }
      box.classList.remove("is-empty");
      const img = document.createElement("img");
      img.alt = k; img.src = SRC[k] || ""; img.decoding = "async"; img.loading = "lazy";
      box.appendChild(img);
    }
    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
  })();

  /* =========================
   * UI: Story (server-backed, label.js와 동일 포맷)
   * ========================= */
  (function story() {
    const ROOT_ID = "jibStory";

    // API helper (label.js와 동일 규칙)
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

    // 다양한 응답 스키마를 흡수해 story 텍스트만 추출
    function pickStoryFrom(obj){
      if (!obj || typeof obj !== "object") return "";
      const cands = [
        obj.story, obj.text, obj.body, obj.content, obj.description,
        obj?.data?.story, obj?.data?.text, obj?.data?.content,
        obj?.item?.story, obj?.item?.text
      ];
      return String(cands.find(v => typeof v === "string") || "").trim();
    }

    // 서버에서 스토리 가져오기 (여러 엔드포인트 시도)
    async function fetchJibStory(jb){
      const J = encodeURIComponent(jb);
      const tryGet = async (path) => {
        const r = await api(path, { credentials: "include", cache: "no-store" });
        if (!r || !r.ok) return "";
        let j = {};
        try { j = await r.json(); } catch {}
        return pickStoryFrom(j);
      };
      // 우선순위: /api/jibbitz/:jib → /api/jibbitz/:jib/story → /api/jib/story?jib=...
      return (
        await tryGet(`/api/jibbitz/${J}`) ||
        await tryGet(`/api/jibbitz/${J}/story`) ||
        await tryGet(`/api/jib/story?jib=${J}`) ||
        ""
      );
    }

    // 렌더러 (하드코딩 제거, 서버 데이터 사용)
    async function renderJibStory() {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const jb = getSelected();
      root.innerHTML = "";
      if (!jb) return;

      // 캐시 → 서버 순
      let story = readStoryCache(jb);
      if (!story) {
        story = await fetchJibStory(jb);
        writeStoryCache(jb, story);
      }
      if (!story) return;

      // \r\n 정규화 후 빈 줄 문단 분리 + 줄바꿈 유지 (label.js 동일)
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

    // 초기 및 이벤트 바인딩
    onReady(() => renderJibStory());
    addEventListener(EVT_SELECTED, renderJibStory);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") renderJibStory();
    });

    // admin 저장 직후 브로드캐스트 수신 → 캐시 갱신 + 조건부 리렌더
    try {
      const bc = new BroadcastChannel("aud:jib-story");
      bc.addEventListener("message", (e) => {
        const m = e?.data || {};
        if (m.kind === "jib:story-updated" && m.jib && m.story != null) {
          writeStoryCache(m.jib, String(m.story));
          if (getSelected() === m.jib) renderJibStory();
        }
      });
    } catch {}

    // 서버 푸시(socket.io) 실시간 반영 (타 기기까지)
    try {
      if (window.SOCKET && typeof window.SOCKET.on === "function") {
        window.SOCKET.on("jib:story-updated", (m = {}) => {
          if (!m.jib) return;
          writeStoryCache(m.jib, String(m.story || ""));
          if (getSelected() === m.jib) renderJibStory();
        });
      } else {
        window.addEventListener?.("socket:ready", () => {
          if (window.SOCKET && typeof window.SOCKET.on === "function") {
            window.SOCKET.on("jib:story-updated", (m = {}) => {
              if (!m.jib) return;
              writeStoryCache(m.jib, String(m.story || ""));
              if (getSelected() === m.jib) renderJibStory();
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
          render(); // 즉시 UI
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
