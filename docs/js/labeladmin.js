// path: /js/labeladmin.js — 독립형 Label Admin (label.js 의존 없음)
"use strict";

/* ======================= 기본 셋업 ======================= */
const SELECTED_KEY = "aud:selectedLabel";
const EVT          = "aud:selectedLabel-changed";
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


let __bcLabel = null;
try { __bcLabel = new BroadcastChannel("aud:sync:label"); } catch {}

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

// === add: global setter (optional) =========================
function setSelectedLabel(label) {
  if (!isLabel(label)) return;
  try {
    const prev = sessionStorage.getItem(SELECTED_KEY);
    if (prev !== label) {
      sessionStorage.setItem(SELECTED_KEY, label);
      window.dispatchEvent(new Event(EVT));
    }
  } catch {}
}
try { window.setSelectedLabel = window.setSelectedLabel || setSelectedLabel; } catch {}

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
    const m = document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
    return m ? decodeURIComponent(m.split("=").slice(1).join("=")) : null;
  } catch { return null; }
}

async function api(path, opt = {}) {
  const url = toAPI(path);
  const base = { credentials: "include", cache: "no-store", ...opt };
  if (!window.auth?.apiFetch) {
    const csrf = readSignedCookie((window.PROD ? "__Host-csrf" : "csrf"));
    base.headers = { ...(base.headers || {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) };
  }
  const fn = window.auth?.apiFetch || fetch;
  try { return await fn(url, base); } catch { return null; }
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
const isLabel = (x) => LABELS.includes(String(x));
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
  const box = document.getElementById("labeladminGalleryBox");
  if (!box) return;
  box.innerHTML = "";

  const label = readSelected();
  if (!label) { box.classList.add("is-empty"); return; }

  box.classList.remove("is-empty");
  const img = document.createElement("img");
  img.alt = label;
  window.ASSETS.attachLabelImg(img, label, { prefer: "blackImage" });
  box.appendChild(img);
}

/* ======================= 에디터 DOM (추가) ======================= */
// why: 기존 코드엔 에디터 마크업 생성이 없어 textarea가 존재하지 않음 → 입력창이 안뜸.
let __editorBooted = false;
function renderEditorFrame() {
  if (__editorBooted) return;

  const host = document.getElementById("labelAdmin");
  if (!host) return;

  host.innerHTML = `
    <section class="label-admin__editor" aria-label="Label story editor">
      <div class="editor-head">
        <div class="editor-title">Story</div>
        <div id="storyStatus" class="story-status" aria-live="polite"></div>
      </div>

      <textarea id="storyEditor" class="story-editor"
        placeholder="ENTER THE LABEL STORY. BLANK LINES ARE TREATED AS PARAGRAPHS."></textarea>

      <div class="editor-actions">
        <button id="discardStoryBtn" class="btn ghost" type="button">REVERT</button>
        <button id="saveStoryBtn" class="btn primary" type="button">SAVE</button>
      </div>

      <div class="preview-title">PREVIEW</div>
      <div id="previewStory" class="labeladmin-story__container preview" aria-live="polite"></div>
    </section>
  `;
  host.hidden = false; // 숨김 해제
  __editorBooted = true;
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

let currentLoadedStory = "";
async function loadStoryToEditor(){
  const label = readSelected();
  const textarea = document.getElementById("storyEditor");
  if (!textarea) return;
  textarea.value = "";
  renderPreview("");
  setStatus("", "");

  if (!label){
    setStatus("NO LABEL SELECTED.", "warn");
    return;
  }

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

  const s = await fetchLabelStory(label);
  if (s != null){
    writeStoryCache(label, s);
    if (readSelected() === label){
      textarea.value = s;
      renderPreview(s);
      currentLoadedStory = s;
    }
  }
}

let __wired = false;
function wireEditor(){
  if (__wired) return; // why: 이벤트 중복 방지
  const ta = document.getElementById("storyEditor");
  const saveBtn = document.getElementById("saveStoryBtn");
  const discardBtn = document.getElementById("discardStoryBtn");
  if (!ta) return;

  ta.addEventListener("input", ()=>{
    renderPreview(ta.value);
    setStatus(ta.value !== currentLoadedStory ? "MODIFIED (SAVE REQUIRED)" : "", ta.value !== currentLoadedStory ? "warn" : "");
  });

  if (discardBtn){
    discardBtn.addEventListener("click", ()=>{
      ta.value = currentLoadedStory || "";
      renderPreview(ta.value);
      setStatus("REVERTED.", "ok");
    });
  }

  if (saveBtn){
    saveBtn.addEventListener("click", async ()=>{
      const label = readSelected();
      if (!label){ setStatus("NO LABEL SELECTED.", "error"); return; }

      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy","true");
      setStatus("SAVING…");

      const ok = await saveLabelStory(label, ta.value);
      if (!ok){
        setStatus("SAVE FAILED", "error");
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
        return;
      }

      writeStoryCache(label, ta.value);
      currentLoadedStory = ta.value;
      setStatus("SAVED", "ok");

      try { __bcLabelStory?.postMessage({ kind:"label:story-updated", label, story: ta.value }); } catch {}
      emitStorySocket({ label, story: ta.value });

      setTimeout(()=>{
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
      }, 250);
    });
  }

  window.addEventListener("beforeunload", (e)=>{
    if (ta.value !== currentLoadedStory){
      e.preventDefault();
      e.returnValue = "";
    }
  });

  __wired = true;
}

/* ======================= 합쳐서 동작 ======================= */
function syncAll(){
  renderEditorFrame();      // [ADD] 먼저 DOM 생성/표시
  renderCategoryRow();
  renderLastLabel();
  renderLabelGalleryBox();
  wireEditor();             // [MOVE] DOM 생성 이후 바인딩
  loadStoryToEditor();      // [MOVE] 바인딩 이후 데이터 로드
}

// === add: bootstrap from URL ?label=… ======================
(function bootstrapSelectedFromURL(){
  try {
    const sp = new URL(location.href).searchParams;
    const q  = sp.get("label") || sp.get("lb") || sp.get("l");
    if (q && isLabel(q)) {
      setSelectedLabel(q);
    }
  } catch {}
})();

ensureReady(()=>{
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

  // [ADD] 초기 부트에서도 DOM 먼저
  renderEditorFrame();
  wireEditor();
  syncAll();

  window.addEventListener(EVT, scheduleSync);
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

  try{
    if (__bcLabel){
      __bcLabel.addEventListener("message", (e)=>{
        const m = e?.data;
        if (m?.kind === "label:selected" && m.label && isLabel(m.label)) {
          try { sessionStorage.setItem(SELECTED_KEY, m.label); } catch {}
          window.dispatchEvent(new Event(EVT));
        }
      });
    }
  } catch{}

  window.addEventListener("storage", (e)=>{
    if (e?.key === "aud:selectedLabel:mirror" && e.newValue){
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
    s.emit("subscribe", { labels: LABELS });
    joined = true;
  }
  try { joinAll(); } catch {}
  window.addEventListener?.("socket:ready", () => { try { joinAll(); } catch {} }, { once: true });
})();
