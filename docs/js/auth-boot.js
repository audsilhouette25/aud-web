// /public/js/auth-boot.js — hardened navigation + selective logout (2025-09-03)
/* eslint-disable no-console */
(() => {
  "use strict";

  /* =========================
   * Constants & small utils
   * ========================= */
  const AUTH_FLAG_KEY = "auth:flag";
  const NAV_KEY = "auth:navigate";
  const NAV_TTL_MS = 60000;
  const USERNS_KEY = "auth:userns";

  const TAB_ID_KEY      = "auth:tab-id";
  const TAB_REG_KEY     = "auth:open-tabs";
  const TAB_AUThed_KEY  = "auth:open-tabs:authed";
  const TAB_HB_MS       = 15_000;
  const TAB_STALE_MS    = 5 * 60_000;

  const TAB_CLOSE_GRACE_MS = 0;
  const LOGOUT_ON_TAB_CLOSE = "always";
  const GRACE_NAV_BOOT_MS = 200;

  const setAuthedFlag = () => { try { sessionStorage.setItem(AUTH_FLAG_KEY, "1"); } catch {} };
  const clearAuthedFlag = () => { try { sessionStorage.removeItem(AUTH_FLAG_KEY); } catch {} };
  const isAuthedFlag = () => { try { return sessionStorage.getItem(AUTH_FLAG_KEY) === "1"; } catch { return false; } };

  const now = () => Date.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const uid = () => {
    try {
      const a = String(localStorage.getItem(USERNS_KEY) || "").trim();
      return a || null;
    } catch { return null; }
  };

  // --- API Origin resolver (config.js 선로드/후로드 모두 안전)
  function apiOrigin() {
    try {
      // 왜: window.PROD_BACKEND가 표준, 레거시는 API_BASE
      return window.PROD_BACKEND || window.API_BASE || null;
    } catch { return null; }
  }
  // --- 단일 toAPI (중복 제거): 항상 최신 ORI 사용
  function toAPI(p) {
    try {
      const u = new URL(p, location.href);
      const ORI = apiOrigin();              // why: 로드 순서/환경변수 변경 대응
      if (ORI && /^\/(?:auth|api)\//.test(u.pathname)) {
        return new URL(u.pathname + u.search + u.hash, ORI).toString();
      }
      return u.toString();
    } catch { return p; }
  }

  try {
    window.COLLECTED_EVT     = "collectedLabels:changed";
    window.JIB_COLLECTED_EVT = "jib:collection-changed";
  } catch {}

  let __lastNavPing = 0;
  function markNavigate() {
    try { sessionStorage.setItem(NAV_KEY, String(now())); } catch {}
    __lastNavPing = now();
  }
  function recentlyNavigated() {
    try {
      const t = Number(sessionStorage.getItem(NAV_KEY) || "0");
      return (now() - t) <= NAV_TTL_MS;
    } catch { return false; }
  }

  // 탭 ID/레지스트리
  function tabId() {
    try {
      const k = TAB_ID_KEY;
      let v = sessionStorage.getItem(k);
      if (!v) { v = (Math.random().toString(36).slice(2) + now()); sessionStorage.setItem(k, v); }
      return v;
    } catch { return "tab-" + Math.random().toString(36).slice(2); }
  }
  function regKey() { return TAB_REG_KEY; }
  function regAuthedKey() { return TAB_AUThed_KEY; }

  function readTabRegistry() {
    try { return JSON.parse(localStorage.getItem(regKey()) || "[]"); } catch { return []; }
  }
  function writeTabRegistry(list) {
    try { localStorage.setItem(regKey(), JSON.stringify(list || [])); } catch {}
  }
  function readAuthedRegistry() {
    try { return JSON.parse(localStorage.getItem(regAuthedKey()) || "[]"); } catch { return []; }
  }
  function writeAuthedRegistry(list) {
    try { localStorage.setItem(regAuthedKey(), JSON.stringify(list || [])); } catch {}
  }

  function upsert(list, id) {
    const s = new Set(list || []);
    if (id) s.add(String(id));
    return Array.from(s);
  }
  function remove(list, id) {
    const s = new Set(list || []);
    if (id) s.delete(String(id));
    return Array.from(s);
  }

  // 서버 상태 확인(탭 하트비트)
  async function heartbeat() {
    try {
      const r = await fetch(toAPI("/auth/me"), { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      return !!j?.authenticated;
    } catch { return false; }
  }

  // 탭 레지스트리 유지
  async function touchTab() {
    const id = tabId();
    writeTabRegistry(upsert(readTabRegistry(), id));
    if (await heartbeat()) {
      writeAuthedRegistry(upsert(readAuthedRegistry(), id));
      setAuthedFlag();
    } else {
      writeAuthedRegistry(remove(readAuthedRegistry(), id));
      clearAuthedFlag();
    }
  }

  // 최초 부트: 약간의 유예 후 하트비트
  (async () => {
    await sleep(GRACE_NAV_BOOT_MS);
    await touchTab();
  })().catch(() => {});

  // 내비게이션 마킹
  window.addEventListener("beforeunload", () => {
    try { markNavigate(); } catch {}
  });

  // 로그아웃 비콘(마지막 탭/혹은 항상)
  function sendLogoutBeacon() {
    try {
      const url = toAPI("/auth/logout-beacon");
      if (navigator.sendBeacon) {
        const b = new Blob([], { type: "application/octet-stream" });
        navigator.sendBeacon(url, b);
      } else {
        // why: WebView/낡은 브라우저 대응
        fetch(url, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  window.addEventListener("pagehide", () => {
    try {
      const id = tabId();
      writeTabRegistry(remove(readTabRegistry(), id));
      writeAuthedRegistry(remove(readAuthedRegistry(), id));
      const authedTabs = readAuthedRegistry();
      if (LOGOUT_ON_TAB_CLOSE === "always" || (LOGOUT_ON_TAB_CLOSE === "last" && authedTabs.length === 0)) {
        sendLogoutBeacon();
      }
    } catch {}
  });

  // 외부에서 쓰는 최소 API
  try {
    window.auth = Object.assign(window.auth || {}, {
      markNavigate,
      isAuthed: () => isAuthedFlag(),
      logout: async () => {
        try { await fetch(toAPI("/auth/logout"), { method: "POST", credentials: "include" }); } catch {}
        clearAuthedFlag();
      }
    });
  } catch {}
})();
