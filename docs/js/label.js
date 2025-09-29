// path: /scripts/label.js — store.js 기반 hearts & timestamps (탭/기기간 동기화)
// Behavior:
//  - 선택 라벨은 sessionStorage(탭 스코프)
//  - hearts/timestamps는 window.store API를 통해 관리(탭/기기간 + 서버 동기화)
//  - 로그인 상태일 때만 localStorage 브로드캐스트(크로스탭 선택 동기화)

"use strict";

let __bcLabel = null;
try { __bcLabel = new BroadcastChannel("aud:sync:label"); } catch {}
/* ── constants ─────────────────────────────────────────── */
/* === API helpers (mine.js와 동일한 규칙) === */
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

const SELECTED_KEY = "aud:selectedLabel";            // sessionStorage
const MIRROR_KEY   = "aud:selectedLabel:mirror";     // localStorage broadcast (cross-tab, authed only)
const EVT          = "aud:selectedLabel-changed";
const FALLBACK_URL = "./gallery.html";
const MAX_STARS    = 3;
const BOOT_KEY     = "__boot.id";                    // guest reset on server reboot

const LABELS = (window.APP_CONFIG && window.APP_CONFIG.LABELS) || window.ALL_LABELS;
if (!Array.isArray(LABELS) || !LABELS.length) throw new Error("APP_CONFIG.LABELS missing");

const MAP = {
  miro:   { category: "play", stars: 3 },
  whee:   { category: "asmr", stars: 1 },
  thump:  { category: "asmr", stars: 1 },
  track:  { category: "play", stars: 2 },
  echo:   { category: "asmr", stars: 2 },
  portal: { category: "play", stars: 2 },
};

const IMG_SRC = {
  thump:"./asset/thump.png",
  miro:"./asset/miro.png",
  whee:"./asset/whee.png",
  track:"./asset/track.png",
  echo:"./asset/echo.png",
  portal:"./asset/portal.png",
};

// store.js API 사용 (단일 소스)
const storeTsGet    = (lb) => window.store.getTimestamp(lb);
const storeTsSet    = (lb, ymd) => window.store.setTimestamp(lb, ymd);
const storeHeartGet = (lb) => window.store.getHeart(lb);
const storeHeartInc = (lb) => window.store.incrementHeart(lb);

/* ── login-gated localStorage helpers ───────────────────── */
function whenStoreReady(fn){
  if (window.store) fn();
  else window.addEventListener("store:ready", fn, { once: true });
}

function persistEnabled(){
  try { return !!(window.auth && window.auth.isAuthed && window.auth.isAuthed()); }
  catch { return false; }
}
function lsSet(k, v){ if (!persistEnabled()) return; try { localStorage.setItem(k, v); } catch {} }
function lsGet(k){ try { return persistEnabled() ? localStorage.getItem(k) : null; } catch { return null; } }

/* ── guest boot reset (server reboot) ───────────────────── */
window.addEventListener("auth:state", (ev)=>{
  try{
    const d = ev?.detail || {};
    if (!d.authed && d.bootId){
      const prev = sessionStorage.getItem(BOOT_KEY);
      if (prev !== d.bootId){
        sessionStorage.clear();
        sessionStorage.setItem(BOOT_KEY, d.bootId);
        scheduleSync();
      }
    }
  }catch{}
});

/* ===== [ADD] admin 캐시 & 바디 클래스 동기화 헬퍼 ===== */
let __authUser = null;

function syncAdminClass() {
  try { document.body.classList.toggle("is-admin", isAdmin()); } catch {}
}

function hideAdminOnlyWidgetsIfNeeded() {
  // why: 렌더 전/후 모두에서 한 번 더 강제 적용 (초기 플리커/레이스 방지)
  const admin = isAdmin();
  const ts = document.getElementById("timestamp");
  const hb = document.getElementById("heartButton");
  if (ts) ts.style.display = admin ? "none" : "";
  if (hb) {
    hb.style.display = admin ? "none" : "";
    if (admin) hb.innerHTML = ""; // 클릭 핸들러/아이콘 제거
  }
}

// === [REPLACE] admin detect (ev.detail 캐시 + 다양한 형태 지원) ===
function isAdmin() {
  try {
    const a = window.auth || {};
    // 이벤트로 캐싱된 사용자(가장 신뢰)
    const u = __authUser ?? (typeof a.user === "function" ? a.user() : a.user);

    // 함수형 헬퍼 우선
    if (typeof a.isAdmin === "function" && a.isAdmin()) return true;

    if (!u) return false;
    if (u.isAdmin === true) return true;
    if (typeof u.role === "string" && u.role.toLowerCase() === "admin") return true;
    if (Array.isArray(u.roles) && u.roles.map(s => String(s).toLowerCase()).includes("admin")) return true;
    if (u.claims && (u.claims.admin === true || u.claims.isAdmin === true)) return true;

    // 일부 백엔드: permissions/scopes 형태
    if (Array.isArray(u.permissions) && u.permissions.includes("admin")) return true;
    if (Array.isArray(u.scopes) && u.scopes.includes("admin")) return true;

    return false;
  } catch { return false; }
}


/* ── utils ─────────────────────────────────────────────── */
const isLabel = (x) => LABELS.includes(String(x));

function readSelected() {
  try {
    const v = sessionStorage.getItem(SELECTED_KEY);
    return (v && isLabel(v)) ? v : null;
  } catch { return null; }
}

/**
 * 선택 라벨 설정.
 * - 같은 탭: sessionStorage + EVT 디스패치
 * - 다른 탭: 로그인 상태일 때만 localStorage 브로드캐스트
 */
function setSelectedLabel(label) {
  if (!isLabel(label)) return;
  try {
    const prev = sessionStorage.getItem(SELECTED_KEY);
    if (prev !== label) {
      sessionStorage.setItem(SELECTED_KEY, label);
      window.dispatchEvent(new Event(EVT));
      // Authed: localStorage 브로드캐스트, Guest: BroadcastChannel 브로드캐스트
     if (persistEnabled()) {
       lsSet(MIRROR_KEY, JSON.stringify({ label, t: Date.now() }));
     } else if (__bcLabel) {
       __bcLabel.postMessage({ kind:"label:selected", label, t: Date.now() });
     }
    }
  } catch {}
}
// 전역 접근(비-모듈 환경)
try { if (typeof window !== "undefined") window.setSelectedLabel = setSelectedLabel; } catch {}

function ensureReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else { fn(); }
}

// rAF로 재렌더 합치기
let syncScheduled = false;
function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncAll();
  });
}

function starSVG(filled) {
  const fill = filled ? "#666" : "none";
  const stroke = "#666";
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 3.6l2.6 5.26 5.81.84-4.2 4.09.99 5.77L12 17.77 6.8 20.56l.99-5.77-4.2-4.09 5.81-.84L12 3.6z"
            fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
    </svg>`;
}

/* ── renderers ─────────────────────────────────────────── */
function renderLastLabel() {
  const el = document.getElementById("lastLabel");
  if (!el) return;
  const label = readSelected();
  el.textContent = label ? label.toUpperCase() : "";
  el.setAttribute("aria-live", "polite");
}

function renderCategoryRow() {
  const row = document.getElementById("categoryRow");
  if (!row) return;
  row.innerHTML = "";

  const label = readSelected();
  if (!label) return;

  const info = MAP[label] || { category: "play", stars: 0 };

  const pill = document.createElement("div");
  pill.className = "pill";
  const txt = document.createElement("span");
  txt.className = "pill__text";
  txt.textContent = info.category.toUpperCase();
  pill.appendChild(txt);

  const starsPill = document.createElement("div");
  starsPill.className = "pill";
  const starsWrap = document.createElement("div");
  starsWrap.className = "stars";
  starsWrap.setAttribute("role", "img");
  starsWrap.setAttribute("aria-label", `${info.stars} out of ${MAX_STARS} stars`);
  for (let i = 0; i < MAX_STARS; i++) {
    starsWrap.insertAdjacentHTML("beforeend", starSVG(i < info.stars));
  }
  starsPill.appendChild(starsWrap);

  row.appendChild(pill);
  row.appendChild(starsPill);
}

function renderLabelGalleryBox() {
  const box = document.getElementById("labelGalleryBox");
  if (!box) return;
  box.innerHTML = "";

  const label = readSelected();
  if (!label) { box.classList.add("is-empty"); return; }

  box.classList.remove("is-empty");
  const img = document.createElement("img");
  img.alt = label;
  img.src = IMG_SRC[label];
  box.appendChild(img);
}

/* --- timestamp block --- */
const isValidYMD = (s) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ymdToDate  = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const todayYMD   = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const getTs = (label) => storeTsGet(label);
const setTs = (label, ymd) => { if (label && ymd) storeTsSet(label, ymd); };

function renderTimestamp() {
  const root = document.getElementById("timestamp");
  if (!root) return;

  // admin은 안보이게
  if (isAdmin()) { root.style.display = "none"; return; }
  root.style.display = ""; // 비관리자: 다시 보이게

  const dataLabel = root.dataset.label || null;
  const dataDate  = root.dataset.date  || null;

  const selected = readSelected();
  const effectiveLabel = (dataLabel && isLabel(dataLabel)) ? dataLabel : (selected || "miro");

  if (isValidYMD(dataDate) && getTs(effectiveLabel) !== dataDate) setTs(effectiveLabel, dataDate);

  let ymd = isValidYMD(dataDate) ? dataDate : getTs(effectiveLabel);
  if (!isValidYMD(ymd)) { ymd = todayYMD(); setTs(effectiveLabel, ymd); }

  const d = ymdToDate(ymd);
  root.textContent = isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }).toUpperCase();
}

/* --- heart button block --- */
const heartColorFromCount = (c) => {
  const t = 1 - Math.exp(-(c||0)/14);
  const hue = 350, sat = 88 - 6*t, light = 86 - 28*t;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
};
const heartColorWhileClicked = (c) => {
  const t = Math.max(0.85, 1 - Math.exp(-(c||0)/14));
  const hue = 350, sat = 88 - 6*t, light = 86 - 30*t;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
};

const getHeartCount = (label) => storeHeartGet(label) || 0;
const incHeart      = (label) => storeHeartInc(label);

function createHeartSVG({ filled, color = "#777" }) {
  const svg  = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("aria-hidden","true"); svg.style.display="block";
  const path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d","M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1 4.22 2.44C11.09 5 12.76 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z");
  path.setAttribute("fill", filled ? color : "none");
  path.setAttribute("stroke", filled ? color : "#777");
  path.setAttribute("stroke-width", filled ? "0" : "1.5");
  svg.appendChild(path);
  return svg;
}

function renderHeartButton() {
  const root = document.getElementById("heartButton");
  if (!root) return;

  // admin은 안보이게
  if (isAdmin()) { root.style.display = "none"; root.innerHTML = ""; return; }
  root.style.display = ""; // 비관리자: 다시 보이게

  root.innerHTML = "";

  const label = readSelected();
  const count = label ? getHeartCount(label) : 0;
  const showFilled = count > 0;

  root.classList.toggle("is-disabled", !label);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", label ? `Like ${label}` : "Like");
  btn.style.cursor = label ? "pointer" : "default";
  btn.setAttribute("aria-pressed", "true");

  let icon = createHeartSVG({ filled: showFilled, color: showFilled ? heartColorFromCount(count) : "#777" });
  btn.appendChild(icon);

  const num = document.createElement("span");
  num.textContent = String(count);

  let timer = null;
  btn.addEventListener("click", () => {
    if (!label) return;
    const clicked = heartColorWhileClicked(getHeartCount(label));
    btn.removeChild(icon);
    icon = createHeartSVG({ filled: true, color: clicked });
    btn.appendChild(icon);

    incHeart(label);
    const n = getHeartCount(label);
    num.textContent = String(n);

    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.removeChild(icon);
      icon = createHeartSVG({ filled: true, color: heartColorFromCount(n) });
      btn.appendChild(icon);
    }, 420);
  });

  root.appendChild(btn);
  root.appendChild(num);
}

/* --- label story block --- */
/* --- label story (server-backed) --- */
// 캐시 (세션 탭 한정) — 5분 TTL
const STORY_TTL = 5 * 60 * 1000;
function storyCacheKey(lb){ return `label:story:${lb}`; }
function readStoryCache(lb){
  try{
    const raw = sessionStorage.getItem(storyCacheKey(lb));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.t || (Date.now() - obj.t) > STORY_TTL) return null;
    return obj.story || "";
  } catch { return null; }
}
function writeStoryCache(lb, story){
  try{
    const clean = String(story || "").replace(/\r\n?/g, "\n");
    sessionStorage.setItem(storyCacheKey(lb), JSON.stringify({ t: Date.now(), story: clean }));
  } catch {}
}

// 다양한 응답 스키마를 흡수해 story 텍스트만 뽑기
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
async function fetchLabelStory(lb){
  const L = encodeURIComponent(lb);
  const tryGet = async (path) => {
    const r = await api(path, { credentials: "include", cache: "no-store" });
    if (!r || !r.ok) return "";
    let j = {};
    try { j = await r.json(); } catch {}
    return pickStoryFrom(j);
  };

  // 우선순위: /api/labels/:label → /api/labels/:label/story → /api/label/story?label=...
  return (
    await tryGet(`/api/labels/${L}`) ||
    await tryGet(`/api/labels/${L}/story`) ||
    await tryGet(`/api/label/story?label=${L}`) ||
    ""
  );
}

// 렌더러 (하드코딩 제거, 서버 데이터 사용)
async function renderLabelStory() {
  const root = document.getElementById("labelStory");
  if (!root) return;
  const label = readSelected();
  root.innerHTML = "";
  if (!label) return;

  // 캐시 → 서버 순
  let story = readStoryCache(label);
  if (!story) {
    story = await fetchLabelStory(label);
    writeStoryCache(label, story);
  }

  if (!story) return; // 글이 없으면 비워둠

  // \r\n, \r 정규화 후 빈 줄로 문단 분리
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

/* (선택) labeladmin에서 저장 직후 갱신 신호 받기 */
try {
  const bc = new BroadcastChannel("aud:label-story");
  bc.addEventListener("message", (e) => {
    const m = e?.data || {};
    if (m.kind === "label:story-updated" && m.label && m.story != null) {
      // 캐시 갱신 후 현재 선택이 같으면 리렌더
      writeStoryCache(m.label, String(m.story));
      if (readSelected() === m.label) renderLabelStory();
    }
  });
} catch {}

// (중요) 서버 푸시(socket.io)로도 실시간 반영 — 다른 기기/브라우저까지 커버
try {
  if (window.SOCKET && typeof window.SOCKET.on === "function") {
    window.SOCKET.on("label:story-updated", (m = {}) => {
      if (!m.label) return;
      writeStoryCache(m.label, String(m.story || ""));
      if (readSelected() === m.label) renderLabelStory();
    });
  } else {
    // socket이 나중에 준비되는 환경 대비: 준비 신호를 받을 수 있으면 연결 후 핸들러 장착
    window.addEventListener?.("socket:ready", () => {
      if (window.SOCKET && typeof window.SOCKET.on === "function") {
        window.SOCKET.on("label:story-updated", (m = {}) => {
          if (!m.label) return;
          writeStoryCache(m.label, String(m.story || ""));
          if (readSelected() === m.label) renderLabelStory();
        });
      }
    }, { once: true });
  }
} catch {}

/* ── compose & wire ───────────────────────────────────── */
function syncAll() {
  hideAdminOnlyWidgetsIfNeeded();   // [ADD] 가장 먼저 강제 적용

  renderCategoryRow();
  renderLastLabel();
  renderLabelGalleryBox();
  renderTimestamp();      // admin이면 내부에서 숨김/skip (이중 안전망)
  renderHeartButton();    // admin이면 내부에서 숨김/skip
  renderLabelStory();
}


ensureReady(() => whenStoreReady(() => {
  // auth 준비 직후 한 번 바디 클래스/표시 상태 동기화
  syncAdminClass();
  hideAdminOnlyWidgetsIfNeeded();

  // 첫 렌더
  syncAll();

  // same-tab (coalesced)
  window.addEventListener(EVT, scheduleSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSync();
  });
  window.addEventListener("pageshow", scheduleSync); // BFCache 복귀

  // 🔁 역할/로그인 상태 변경되면 즉시 반영 (admin ↔ user)
  window.addEventListener("auth:state", (ev) => {
    try { __authUser = ev?.detail?.user ?? __authUser; } catch {}
    syncAdminClass();
    hideAdminOnlyWidgetsIfNeeded();
    scheduleSync();
  });

  // store.js 브로드캐스트(기존 유지)
  window.addEventListener("label:timestamps-changed", scheduleSync);
  window.addEventListener("label:hearts-changed", scheduleSync);

  // cross-tab (선택 라벨만) → 로그인 상태에서만 반응
  window.addEventListener("storage", (e) => {
    if (!e || !persistEnabled()) return;
    if (e.key === MIRROR_KEY && e.newValue) {
      try {
        const { label } = JSON.parse(e.newValue);
        if (isLabel(label)) {
          const prev = sessionStorage.getItem(SELECTED_KEY);
          if (prev !== label) sessionStorage.setItem(SELECTED_KEY, label);
          scheduleSync();
        }
      } catch {}
    }
  });

  // BroadcastChannel(게스트) — 선택 라벨 동기화
  try {
    __bcLabel?.addEventListener("message", (e) => {
      const m = e?.data;
      if (m?.kind !== "label:selected") return;
      if (m.label && isLabel(m.label)) {
        try { sessionStorage.setItem(SELECTED_KEY, m.label); } catch {}
        window.dispatchEvent(new Event(EVT));
      }
    });
  } catch {}

  // 로그아웃 시 선택 상태/미러 정리
  window.addEventListener("auth:logout", () => {
    try { sessionStorage.removeItem(SELECTED_KEY); } catch {}
    try { localStorage.removeItem(MIRROR_KEY); } catch {}
    // 로그아웃 즉시 admin 해제
    __authUser = null;
    syncAdminClass();
    hideAdminOnlyWidgetsIfNeeded();
    scheduleSync();
  });
}));

// 모든 라벨 룸 구독(중복 호출 안전)
(() => {
  let __joined = false;
  function joinAll() {
    if (!window.SOCKET || typeof window.SOCKET.emit !== "function") return;
    if (__joined) return;
    window.SOCKET.emit("subscribe", { labels: LABELS });
    __joined = true;
  }
  // 즉시 시도
  try { joinAll(); } catch {}
  // 나중에 socket:ready가 뜨는 환경도 커버
  window.addEventListener?.("socket:ready", () => { try { joinAll(); } catch {} }, { once: true });
})();

// URL ?label=... 처리 + 폴백 라우팅 (safe against same-URL loops)
(() => {
  try {
    const q = new URLSearchParams(location.search).get("label");
    const here = new URL(location.href);
    const fallback = new URL(FALLBACK_URL, location.href);

    if (q && isLabel(q)) {
      setSelectedLabel(q);
      return;
    }

    if (!sessionStorage.getItem(SELECTED_KEY)) {
      if (here.href !== fallback.href) {
        location.replace(fallback.href);
      }
    }
  } catch {
    try { location.replace(FALLBACK_URL); } catch {}
  }
})();
