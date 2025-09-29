// path: /js/jibbitzadmin.js — 독립형 Jibbitz Admin (jibbitz.js 의존 없음)
"use strict";

/* ======================= 기본 셋업 ======================= */
const SELECTED_KEY = "aud:selectedJib";
const EVT          = "aud:selectedJib-changed";
const JIBS = (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) || window.ALL_JIBS || window.JIBS;
if (!Array.isArray(JIBS) || !JIBS.length) throw new Error("APP_CONFIG.JIBBITZ missing");

let __bcJib = null;
try { __bcJib = new BroadcastChannel("aud:sync:jib"); } catch {}

let __bcJibStory = null;
try { __bcJibStory = new BroadcastChannel("aud:jib-story"); } catch {}

function emitStorySocket(payload){
  // why: 실서비스에서 실시간 반영(옵션)
  try {
    const s = (window.SOCKET && typeof window.SOCKET.emit === "function")
      ? window.SOCKET
      : (window.sock && typeof window.sock.emit === "function" ? window.sock : null);
    s?.emit("jib:update", payload, () => {});
  } catch {}
}

// === optional: global setter ===============================
function setSelectedJib(jib) {
  if (!isJib(jib)) return;
  try {
    const prev = sessionStorage.getItem(SELECTED_KEY);
    if (prev !== jib) {
      sessionStorage.setItem(SELECTED_KEY, jib);
      window.dispatchEvent(new Event(EVT));
    }
  } catch {}
}
try { window.setSelectedJib = window.setSelectedJib || setSelectedJib; } catch {}

/* ======================= API 헬퍼 (jibbitzadmin.js와 동일) ======================= */
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

/* ======================= JIBBITZ 스토리 CRUD ======================= */
async function fetchJibStory(jb){
  const J = encodeURIComponent(jb);
  const tryGet = async (path) => {
    const r = await api(path, { method:"GET" });
    if (!r || !r.ok) return "";
    let j = {};
    try { j = await r.json(); } catch {}
    return pickStoryFrom(j);
  };
  return (
    await tryGet(`/api/jibbitz/${J}`) ||
    await tryGet(`/api/jibbitz/${J}/story`) ||
    await tryGet(`/api/jib/story?jib=${J}`) ||
    ""
  );
}
async function saveJibStory(jb, story){
  const J = encodeURIComponent(jb);
  const body = JSON.stringify({ story });

  const tryPut = await api(`/api/jibbitz/${J}/story`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body
  });
  if (tryPut && tryPut.ok) return true;

  const tryPostA = await api(`/api/jibbitz/${J}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
  if (tryPostA && tryPostA.ok) return true;

  const tryPostB = await api(`/api/jib/story`, {
    method:"POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jib: jb, story })
  });
  return !!(tryPostB && tryPostB.ok);
}

/* ======================= 상태/유틸 ======================= */
const isJib = (x) => JIBS.includes(String(x));
const readSelected = () => {
  try {
    const v = sessionStorage.getItem(SELECTED_KEY);
    return (v && isJib(v)) ? v : null;
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

/* ======================= 렌더러 ======================= */
function renderLastJib() {
  const el = document.getElementById("jibTitle");
  if (!el) return;
  const jib = readSelected();
  el.textContent = jib ? jib.toUpperCase() : "";
  el.setAttribute("aria-live", "polite");
}
function renderCategoryRow() {
  const row = document.getElementById("categoryRow");
  if (!row) return;
  row.innerHTML = "";

  const jib = readSelected();
  if (!jib) return;

  const pill = document.createElement("div");
  pill.className = "pill";
  const txt = document.createElement("span");
  txt.className = "pill__text";
  txt.textContent = "JIBBITZ";
  pill.appendChild(txt);

  row.appendChild(pill);
}
function renderJibGalleryBox() {
  const box = document.getElementById("jibadminGalleryBox");
  if (!box) return;
  box.innerHTML = "";

  const jib = readSelected();
  if (!jib) { box.classList.add("is-empty"); return; }

  box.classList.remove("is-empty");
  const img = document.createElement("img");
  img.alt = jib;
  // SSOT
  if (window.ASSETS?.attachJibImg) window.ASSETS.attachJibImg(img, jib);
  else img.src = window.ASSETS?.getJibImg?.(jib) || "";
  box.appendChild(img);
}

/* ======================= 에디터 DOM (jibbitzadmin과 동일 포맷) ======================= */
// why: jibbitzadmin.js와 동일 포맷/문구/버튼을 보장
let __editorBooted = false;
function renderEditorFrame() {
  if (__editorBooted) return;

  const host = document.getElementById("jibAdmin");
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
      <div id="previewStory" class="jibbitzadmin-story__container preview" aria-live="polite"></div>
    </section>
  `;
  host.hidden = false;
  __editorBooted = true;
}

/* ======================= 에디터 UI ======================= */
const STORY_TTL = 5 * 60 * 1000;
function storyCacheKey(jb){ return `jib:story:${jb}`; }
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
    sessionStorage.setItem(
      storyCacheKey(jb),
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
  const jib = readSelected();
  const textarea = document.getElementById("storyEditor");
  if (!textarea) return;
  textarea.value = "";
  renderPreview("");
  setStatus("", "");

  if (!jib){
    setStatus("NO LABEL SELECTED.", "warn"); // jibbitzadmin과 문구/UX 통일
    return;
  }

  const cached = readStoryCache(jib);
  if (cached != null){
    textarea.value = cached;
    renderPreview(cached);
    currentLoadedStory = cached;
  } else {
    textarea.value = "";
    renderPreview("");
    currentLoadedStory = "";
  }

  const s = await fetchJibStory(jib);
  if (s != null){
    writeStoryCache(jib, s);
    if (readSelected() === jib){
      textarea.value = s;
      renderPreview(s);
      currentLoadedStory = s;
    }
  }
}
let __wired = false;
function wireEditor(){
  if (__wired) return; // 중복 방지
  const ta = document.getElementById("storyEditor");
  const saveBtn = document.getElementById("saveStoryBtn");
  const discardBtn = document.getElementById("discardStoryBtn");
  if (!ta) return;

  ta.addEventListener("input", ()=>{
    renderPreview(ta.value);
    setStatus(ta.value !== currentLoadedStory ? "MODIFIED (SAVE REQUIRED)" : "", ta.value !== currentLoadedStory ? "warn" : "");
  });

  discardBtn?.addEventListener("click", ()=>{
    ta.value = currentLoadedStory || "";
    renderPreview(ta.value);
    setStatus("REVERTED.", "ok");
  });

  saveBtn?.addEventListener("click", async ()=>{
    const jib = readSelected();
    if (!jib){ setStatus("NO LABEL SELECTED.", "error"); return; }

    saveBtn.disabled = true;
    saveBtn.setAttribute("aria-busy","true");
    setStatus("SAVING…");

    const ok = await saveJibStory(jib, ta.value);
    if (!ok){
      setStatus("SAVE FAILED", "error");
      saveBtn.disabled = false;
      saveBtn.removeAttribute("aria-busy");
      return;
    }

    writeStoryCache(jib, ta.value);
    currentLoadedStory = ta.value;
    setStatus("SAVED", "ok");

    try { __bcJibStory?.postMessage({ kind:"jib:story-updated", jib, story: ta.value }); } catch {}
    emitStorySocket({ jib, story: ta.value });

    setTimeout(()=>{
      saveBtn.disabled = false;
      saveBtn.removeAttribute("aria-busy");
    }, 250);
  });

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
  renderEditorFrame();      // DOM 먼저
  renderCategoryRow();
  renderLastJib();
  renderJibGalleryBox();
  wireEditor();             // 바인딩
  loadStoryToEditor();      // 데이터 로드
}

// === bootstrap from URL ?jib=… =============================
(function bootstrapSelectedFromURL(){
  try {
    const sp = new URL(location.href).searchParams;
    const q  = (sp.get("jib") || sp.get("j") || "").trim().toLowerCase();
    if (q && isJib(q)) setSelectedJib(q);
  } catch {}
})();

ensureReady(()=>{
  // 초기 부트
  renderEditorFrame();
  wireEditor();
  syncAll();

  window.addEventListener(EVT, scheduleSync);
  window.addEventListener("popstate", () => {
    try{
      const u = new URL(location.href);
      const q = (u.searchParams.get("jib") || "").trim().toLowerCase();
      if (q && isJib(q)) {
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
    if (__bcJib){
      __bcJib.addEventListener("message", (e)=>{
        const m = e?.data;
        if (m?.kind === "jib:selected" && m.jib && isJib(m.jib)) {
          try { sessionStorage.setItem(SELECTED_KEY, m.jib); } catch {}
          window.dispatchEvent(new Event(EVT));
        }
      });
    }
  } catch{}

  window.addEventListener("storage", (e)=>{
    if (e?.key === "aud:selectedJib:mirror" && e.newValue){
      try {
        const { jib } = JSON.parse(e.newValue);
        if (isJib(jib)){
          const prev = sessionStorage.getItem(SELECTED_KEY);
          if (prev !== jib) sessionStorage.setItem(SELECTED_KEY, jib);
          window.dispatchEvent(new Event(EVT));
        }
      } catch {}
    }
  });
});

// ── socket join (옵션)
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
    s.emit("subscribe", { jibs: JIBS });
    joined = true;
  }
  try { joinAll(); } catch {}
  window.addEventListener?.("socket:ready", () => { try { joinAll(); } catch {} }, { once: true });
})();
