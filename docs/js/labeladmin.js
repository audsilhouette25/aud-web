// path: /js/labeladmin.js — 독립형 Label Admin (label.js 의존 없음)
"use strict";

/* ======================= 기본 셋업 ======================= */
// 선택 라벨은 기존 사이트 규칙(sessionStorage) 그대로 사용
const SELECTED_KEY = "aud:selectedLabel";
const EVT          = "aud:selectedLabel-changed";

// 선택 라벨 허용 목록 (UI 표시/이미지용)
const OK = ["thump","miro","whee","track","echo","portal"];

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

// BroadcastChannel(게스트 동기화용) — 선택 라벨 수신만
let __bcLabel = null;
try { __bcLabel = new BroadcastChannel("aud:sync:label"); } catch {}

// ... (상단 선언부 아래에 추가)
let __bcLabelStory = null;
try { __bcLabelStory = new BroadcastChannel("aud:label-story"); } catch {}

function emitStorySocket(payload){
  try {
    const s = (window.SOCKET && typeof window.SOCKET.emit === "function")
      ? window.SOCKET
      : (window.sock && typeof window.sock.emit === "function" ? window.sock : null);
    s?.emit("label:update", payload, () => {});
  } catch {}
}
// 저장 버튼 핸들러 내부는 이미 다음을 호출함:
// __bcLabelStory?.postMessage({ kind:"label:story-updated", label, story });
// emitStorySocket({ label, story });


/* ======================= API 헬퍼 ======================= */
const API_ORIGIN = window.PROD_BACKEND || window.API_BASE || window.API_ORIGIN || null;
const toAPI = (p) => {
  try {
    const u = new URL(p, location.href);
    return (API_ORIGIN && /^\/(api|auth|uploads)\//.test(u.pathname))
      ? new URL(u.pathname + u.search + u.hash, API_ORIGIN).toString()
      : u.toString();
  } catch { return p; }
};
function readSignedCookie(name){
  try {
    // 간단 파서(서명 무검증) — 서버가 쿠키를 헤더로만 확인하면 충분
    const m = document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
    return m ? decodeURIComponent(m.split("=").slice(1).join("=")) : null;
  } catch { return null; }
}

async function api(path, opt = {}) {
  const url = toAPI(path);
  const base = { credentials: "include", cache: "no-store", ...opt };

  // window.auth.apiFetch가 없다면 CSRF 헤더를 best-effort로 붙여줌
  if (!window.auth?.apiFetch) {
    const csrf = readSignedCookie((window.PROD ? "__Host-csrf" : "csrf"));
    base.headers = { ...(base.headers || {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) };
  }

  const fn = window.auth?.apiFetch || fetch;
  try { return await fn(url, base); } catch { return null; }
}


// 다양한 응답 스키마에서 story 텍스트만 추출
function pickStoryFrom(obj){
  if (!obj || typeof obj !== "object") return "";
  const cands = [
    obj.story, obj.text, obj.body, obj.content, obj.description,
    obj?.data?.story, obj?.data?.text, obj?.data?.content,
    obj?.item?.story, obj?.item?.text
  ];
  return String(cands.find(v => typeof v === "string") || "").trim();
}

// 스토리 GET (여러 엔드포인트 시도)
async function fetchLabelStory(lb){
  const L = encodeURIComponent(lb);
  const tryGet = async (path) => {
    const r = await api(path, { method:"GET" });
    if (!r || !r.ok) return "";
    let j = {};
    try { j = await r.json(); } catch {}
    return pickStoryFrom(j);
  };
  return (
    await tryGet(`/api/labels/${L}`) ||
    await tryGet(`/api/labels/${L}/story`) ||
    await tryGet(`/api/label/story?label=${L}`) ||
    ""
  );
}

// 스토리 SAVE (PUT → POST 폴백)
async function saveLabelStory(lb, story){
  const L = encodeURIComponent(lb);
  const body = JSON.stringify({ story });

  const tryPut = await api(`/api/labels/${L}/story`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body
  });
  if (tryPut && tryPut.ok) return true;

  const tryPostA = await api(`/api/labels/${L}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
  if (tryPostA && tryPostA.ok) return true;

  const tryPostB = await api(`/api/label/story`, {
    method:"POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: lb, story })
  });
  return !!(tryPostB && tryPostB.ok);
}

/* ======================= 상태/유틸 ======================= */
const isLabel = (x) => OK.includes(String(x));
const readSelected = () => {
  try {
    const v = sessionStorage.getItem(SELECTED_KEY);
    return (v && isLabel(v)) ? v : null;
  } catch { return null; }
};

function ensureReady(fn){
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else { fn(); }
}
let syncScheduled = false;
function scheduleSync(){
  if (syncScheduled) return;
  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncAll();
  });
}

/* ======================= 렌더러(공통) ======================= */
const MAX_STARS = 3;
function starSVG(filled) {
  const fill = filled ? "#666" : "none";
  const stroke = "#666";
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 3.6l2.6 5.26 5.81.84-4.2 4.09.99 5.77L12 17.77 6.8 20.56l.99-5.77-4.2-4.09 5.81-.84L12 3.6z"
            fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
    </svg>`;
}

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

/* ======================= 에디터 UI ======================= */
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
    sessionStorage.setItem(
      storyCacheKey(lb),
      JSON.stringify({ t: Date.now(), story: clean })
    );
  } catch {}
}


function setStatus(msg, kind=""){
  const s = document.getElementById("storyStatus");
  if (!s) return;
  s.classList.remove("ok","warn","error");
  if (kind) s.classList.add(kind);
  s.textContent = msg || "";
}

function renderPreview(text){
  const root = document.getElementById("previewStory");
  if (!root) return;
  root.innerHTML = "";
  if (!text) return;
  // \r\n, \r 정규화 후 빈 줄 기준 문단 분리, 줄바꿈은 <br>로 보존
  text.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/).forEach(block=>{
    const p = document.createElement("p");
    const lines = block.split("\n");
    lines.forEach((line, i) => {
      p.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) p.appendChild(document.createElement("br"));
    });
    root.appendChild(p);
  });
}

let currentLoadedStory = "";  // 서버/캐시에서 마지막으로 로드된 텍스트
function loadStoryToEditor(){
  const label = readSelected();
  const textarea = document.getElementById("storyEditor");
  if (!textarea) return;
  textarea.value = "";
  renderPreview("");
  setStatus("", "");

  if (!label){
    setStatus("선택된 라벨이 없습니다.", "warn");
    return;
  }

  // 캐시 → 서버
  const cached = readStoryCache(label);
  if (cached != null){
    textarea.value = cached;
    renderPreview(cached);
    currentLoadedStory = cached;
  } else {
    textarea.value = "";
    renderPreview("");
    currentLoadedStory = "";
  }

  (async ()=>{
    const s = await fetchLabelStory(label);
    if (s != null){
      writeStoryCache(label, s);
      // 현재 선택이 바뀌지 않았다면 반영
      if (readSelected() === label){
        textarea.value = s;
        renderPreview(s);
        currentLoadedStory = s;
      }
    }
  })();
}

function wireEditor(){
  const ta = document.getElementById("storyEditor");
  const saveBtn = document.getElementById("saveStoryBtn");
  const discardBtn = document.getElementById("discardStoryBtn");

  if (!ta) return;

  ta.addEventListener("input", ()=>{
    renderPreview(ta.value);
    // 변경 감지
    if (ta.value !== currentLoadedStory) {
      setStatus("변경됨 (저장 필요)", "warn");
    } else {
      setStatus("", "");
    }
  });

  if (discardBtn){
    discardBtn.addEventListener("click", ()=>{
      ta.value = currentLoadedStory || "";
      renderPreview(ta.value);
      setStatus("되돌렸습니다.", "ok");
    });
  }

  if (saveBtn){
    saveBtn.addEventListener("click", async ()=>{
      const label = readSelected();
      const ta = document.getElementById("storyEditor");
      if (!label){ setStatus("라벨이 선택되지 않았습니다.", "error"); return; }

      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy","true");
      setStatus("저장 중…");

      const ok = await saveLabelStory(label, ta.value);
      if (!ok){
        setStatus("저장 실패", "error");
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
        return;
      }

      // 캐시/상태 갱신
      writeStoryCache(label, ta.value);
      currentLoadedStory = ta.value;
      setStatus("저장 완료", "ok");

      // 실시간 반영
      try { __bcLabelStory?.postMessage({ kind:"label:story-updated", label, story: ta.value }); } catch {}
      emitStorySocket({ label, story: ta.value });

      // 약간의 여유 후 버튼 복구
      setTimeout(()=>{
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
      }, 250);
    });
  }

  // 페이지 이탈 경고(미저장 시)
  window.addEventListener("beforeunload", (e)=>{
    if (!ta) return;
    if (ta.value !== currentLoadedStory){
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/* ======================= 합쳐서 동작 ======================= */
function syncAll(){
  renderCategoryRow();
  renderLastLabel();
  renderLabelGalleryBox();
  loadStoryToEditor();
}

ensureReady(()=>{
  // ① 최초 진입: URL ?label=... -> sessionStorage 반영
  (function adoptLabelFromURL(){
    try{
      const u = new URL(location.href);
      const q = (u.searchParams.get("label") || "").trim();
      if (q && isLabel(q)) {
        const prev = sessionStorage.getItem(SELECTED_KEY);
        if (prev !== q) {
          sessionStorage.setItem(SELECTED_KEY, q);
          window.dispatchEvent(new Event(EVT));
        }
      }
    } catch {}
  })();
  // 초기 렌더
  syncAll();

  // 라벨 선택 변경(같은 탭)
  window.addEventListener(EVT, scheduleSync);
  // ② popstate: 히스토리 이동으로 URL이 바뀌면 다시 채택
  window.addEventListener("popstate", () => {
    try{
      const u = new URL(location.href);
      const q = (u.searchParams.get("label") || "").trim();
      if (q && isLabel(q)) {
        const prev = sessionStorage.getItem(SELECTED_KEY);
        if (prev !== q) {
          sessionStorage.setItem(SELECTED_KEY, q);
          window.dispatchEvent(new Event(EVT));
        } else {
          scheduleSync();
        }
      }
    } catch {}
  });

  // 다른 탭/창에서 선택 라벨 동기화(게스트용 BroadcastChannel 수신)
  try{
    if (__bcLabel){
      __bcLabel.addEventListener("message", (e)=>{
        const m = e?.data;
        if (!m || m.kind !== "label:selected") return;
        if (m.label && isLabel(m.label)) {
          // 동일 탭에 반영(세션 저장 + 이벤트)
          try { sessionStorage.setItem(SELECTED_KEY, m.label); } catch {}
          window.dispatchEvent(new Event(EVT));
        }
      });
    }
  } catch{}

  // storage 이벤트(로그인 상태에서 localStorage 브로드캐스트를 쓰는 환경이 있을 수 있으니 대비)
  window.addEventListener("storage", (e)=>{
    if (!e) return;
    if (e.key === "aud:selectedLabel:mirror" && e.newValue){
      try {
        const { label } = JSON.parse(e.newValue);
        if (isLabel(label)){
          const prev = sessionStorage.getItem(SELECTED_KEY);
          if (prev !== label) sessionStorage.setItem(SELECTED_KEY, label);
          window.dispatchEvent(new Event(EVT));
        }
      } catch {}
    }
  });

  // 에디터 이벤트 바인딩
  wireEditor();
});
// ── socket join (window.SOCKET 우선, window.sock도 호환)
(() => {
  let joined = false;
  function getSocket() {
    return (window.SOCKET && typeof window.SOCKET.emit === "function")
      ? window.SOCKET
      : (window.sock && typeof window.sock.emit === "function" ? window.sock : null);
  }
  function joinAll() {
    const s = getSocket();
    if (!s || joined) return;
    s.emit("subscribe", { labels: OK });
    joined = true;
  }
  try { joinAll(); } catch {}
  window.addEventListener?.("socket:ready", () => { try { joinAll(); } catch {} }, { once: true });
})();
