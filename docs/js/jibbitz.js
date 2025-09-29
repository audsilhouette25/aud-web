// /public/js/app-assets.js
// Single Source of Truth for ./asset paths (labels & jibbitz)
(function initAppAssets(){
  "use strict";

  const BASE = "./asset/"; // 변경은 여기 한 곳

  const LABELS =
    (window.APP_CONFIG && window.APP_CONFIG.LABELS) ||
    window.ALL_LABELS ||
    [];

  const JIBS =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS ||
    window.JIBS ||
    [];

  const LABEL_MAP = {};
  for (const lb of LABELS) {
    LABEL_MAP[lb] = {
      img:        `${BASE}${lb}.png`,
      imgBlack:   `${BASE}${lb}black.png`,
      video:      `${BASE}${lb}video.mp4`,
      videoBlack: `${BASE}black${lb}.mp4`,
    };
  }

  const JIB_MAP = {};
  for (const jb of JIBS) {
    JIB_MAP[jb] = {
      img:   `${BASE}${jb}.png`,
      video: `${BASE}${jb}video.mp4`,
    };
  }

  function getLabelImg(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.imgBlack : m.img;
  }
  function getLabelVideo(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.videoBlack : m.video;
  }
  function getJibImg(jib) {
    const m = JIB_MAP[jib]; return m ? m.img : "";
  }
  function getJibVideo(jib) {
    const m = JIB_MAP[jib]; return m ? m.video : "";
  }

  // why: 각 페이지에서 폴백/이벤트 처리 중복 방지
  function attachLabelImg(imgEl, label, opt = { prefer: "blackImage" }) {
    if (!imgEl || !label) return;
    const prefer = String(opt.prefer || "blackImage");
    const first  = (prefer === "blackImage") ? getLabelImg(label, { black:true }) : getLabelImg(label, { black:false });
    const alt    = (prefer === "blackImage") ? getLabelImg(label, { black:false }) : getLabelImg(label, { black:true });
    imgEl.src = first;
    const onerr = () => {
      if (imgEl.dataset.fallbackTried === "1") return;
      imgEl.dataset.fallbackTried = "1";
      imgEl.src = alt || "";
      imgEl.removeEventListener("error", onerr);
    };
    imgEl.addEventListener("error", onerr);
  }

  function mapForGallery(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = { orange: getLabelVideo(lb, { black:false }), black: getLabelVideo(lb, { black:true }) };
    }
    return ICONS;
  }
  function mapForMine(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = { orange: getLabelVideo(lb, { black:false }), black: getLabelImg(lb, { black:true }) };
    }
    const JMAP = {};
    for (const jb of JIBS) JMAP[jb] = getJibVideo(jb);
    return { ICONS, JIBS: JMAP };
  }

  const api = Object.freeze({
    base: BASE,
    labels: Object.freeze({ ...LABEL_MAP }),
    jibs:   Object.freeze({ ...JIB_MAP }),
    getLabelImg, getLabelVideo,
    getJibImg, getJibVideo,
    attachLabelImg,
    mapForGallery, mapForMine,
  });

  try { window.ASSETS = Object.freeze({ ...(window.ASSETS || {}), ...api }); }
  catch { window.ASSETS = api; }
})();


// /js/jibbitz.js
(() => {
  "use strict";

  // TDZ 회피: setSelected에서 사용하기 전에 선언
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

  // ⬇️ jibbitz.js의 readCollectedSet / writeCollectedSet 교체
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
   * UI: Preview  (./asset 제거)
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
      // SSOT: 지비츠 PNG 경로
      img.src = window.ASSETS?.getJibImg?.(k) || "";
      box.appendChild(img);
    }
    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
  })();

  /* =========================
   * UI: Story
   * ========================= */
  (function story() {
    const ROOT_ID = "jibStory";
    const STORIES = {
      bloom:{ lines:["어느날 머리에서 꽃 한 송이가 자랐다 ?!"] },
      tail:{ lines:["물고기? 인어? 이건 누구의 꼬리일까…"] },
      cap:{ lines:["AUD를 햇빛으로부터 가려 줄 모자"] },
      keyring:{ lines:["열쇠고리와 연결할 수 있는 기본 모듈."] },
      duck:{ lines:["AUD의 반려 동물 오리."] },
      twinkle:{ lines:["반짝이는 별을 AUD에 추가해 보세요!"] },
      xmas:{ lines:["산타가 굴뚝으로 들어가다 흘리고 간 모자."] },
      bunny:{ lines:["토끼 귀로 더 귀여워진 AUD"] },
    };
    function render() {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const k = getSelected();
      if (!k) { root.innerHTML = ""; return; }
      const { lines } = STORIES[k] || { lines: [] };
      root.innerHTML = "";
      const spacer = document.createElement("div");
      spacer.style.height = "14px"; root.appendChild(spacer);
      lines.forEach(line => { const p = document.createElement("p"); p.textContent = line; root.appendChild(p); });
    }
    onReady(() => render());
    addEventListener(EVT_SELECTED, render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
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