// /public/js/auth-boot.js — clean logout mechanism (2025-12)
(() => {
  "use strict";

  /* =========================
   * Constants
   * ========================= */
  const AUTH_FLAG_KEY = "auth:flag";
  const NAV_KEY = "auth:navigate";
  const USERNS_KEY = "auth:userns";
  const SESSION_ALIVE_KEY = "auth:session-alive";

  const TAB_ID_KEY = "auth:tab-id";
  const TAB_REG_KEY = "auth:open-tabs";
  const TAB_AUTHED_KEY = "auth:open-tabs:authed";
  const TAB_HB_MS = 15_000;
  const TAB_STALE_MS = 5 * 60_000;

  /* =========================
   * Auth flag helpers
   * ========================= */
  const setAuthedFlag = () => {
    try { sessionStorage.setItem(AUTH_FLAG_KEY, "1"); } catch {}
    try { localStorage.setItem(AUTH_FLAG_KEY, "1"); } catch {}
  };
  const clearAuthedFlag = () => {
    try { sessionStorage.removeItem(AUTH_FLAG_KEY); } catch {}
    try { localStorage.removeItem(AUTH_FLAG_KEY); } catch {}
  };

  const now = () => Date.now();

  /* =========================
   * API URL helpers
   * ========================= */
  function apiOrigin() {
    return window.PROD_BACKEND || window.API_BASE || null;
  }
  function toAPI(p) {
    try {
      const u = new URL(p, location.href);
      const ORI = apiOrigin();
      if (ORI && /^\/(?:auth|api)\//.test(u.pathname)) {
        return new URL(u.pathname + u.search + u.hash, ORI).toString();
      }
      return u.toString();
    } catch { return p; }
  }

  // 이벤트 이름 노출
  try {
    window.COLLECTED_EVT = "collectedLabels:changed";
    window.JIB_COLLECTED_EVT = "jib:collection-changed";
  } catch {}

  /* =========================
   * Navigation marking
   * ========================= */
  let __lastNavPing = 0;
  function markNavigate() {
    try { sessionStorage.setItem(NAV_KEY, String(now())); } catch {}
    try {
      const t = now();
      if (t - __lastNavPing > 2000) {
        __lastNavPing = t;
        const blob = new Blob([JSON.stringify({ t })], { type: "application/json" });
        navigator.sendBeacon?.(toAPI("/auth/nav"), blob);
      }
    } catch {}
  }


  /* =========================
   * Tab registry
   * ========================= */
  function getTabId() {
    try {
      let id = sessionStorage.getItem(TAB_ID_KEY);
      if (!id) {
        id = `t_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(TAB_ID_KEY, id);
      }
      return id;
    } catch { return "t_fallback"; }
  }

  const readKV = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
  const writeKV = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const prune = (obj) => {
    const out = {}; const t = now();
    for (const [k, ts] of Object.entries(obj || {})) if (t - (ts || 0) < TAB_STALE_MS) out[k] = ts;
    return out;
  };
  function regUpdate(key, modFn) { const next = modFn(prune(readKV(key))); writeKV(key, next); return next; }

  function registerTab() {
    const id = getTabId();
    regUpdate(TAB_REG_KEY, reg => (reg[id] = now(), reg));
  }
  function unregisterTab() {
    const id = getTabId();
    regUpdate(TAB_REG_KEY, reg => (delete reg[id], reg));
    regUpdate(TAB_AUTHED_KEY, reg => (delete reg[id], reg));
  }
  function registerAuthedTab() {
    const id = getTabId();
    regUpdate(TAB_AUTHED_KEY, reg => (reg[id] = now(), reg));
  }

  let hbTimer = null;
  function startHeartbeat() {
    if (hbTimer) return;
    const beat = () => {
      const id = getTabId();
      regUpdate(TAB_REG_KEY, reg => (reg[id] = now(), reg));
      if (state.authed) regUpdate(TAB_AUTHED_KEY, reg => (reg[id] = now(), reg));
    };
    beat();
    hbTimer = setInterval(beat, TAB_HB_MS);
  }
  function stopHeartbeat() { if (hbTimer) { clearInterval(hbTimer); hbTimer = null; } }

  // ns별 캐시 정리
  function wipeLocalForNs(ns) {
    if (!ns) return;
    const bases = ["REG_COLLECT", "JIBC_COLLECT", "REG_LABELS", "JIBC_LABELS"];
    for (const b of bases) localStorage.removeItem(`${b}::${ns.toLowerCase()}`);
  }

  /* =========================
   * Navigation event listeners
   * ========================= */
  document.addEventListener("click", (e) => {
    try {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      const u = new URL(href, location.href);
      if (u.origin === location.origin) markNavigate();
    } catch {}
  }, { capture: true, passive: true });

  document.addEventListener("submit", (e) => {
    try {
      const f = e.target;
      if (!f || e.defaultPrevented) return;
      const u = new URL(f.action || location.href, location.href);
      if (u.origin === location.origin) markNavigate();
    } catch {}
  }, { capture: true });

  document.addEventListener("keydown", (e) => {
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    const isNavKey = k === "F5" ||
      (mod && (k === "r" || k === "R")) ||
      (e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) ||
      (mod && (k === "[" || k === "]"));
    if (isNavKey) {
      try { sessionStorage.setItem(NAV_KEY, String(Date.now())); } catch {}
    }
  }, { capture: true });

  // 브라우저 뒤로가기/앞으로가기 감지
  window.addEventListener("popstate", () => {
    markNavigate();
  });

  // Location API 패치
  (function patchLocationMethods() {
    try {
      if (Location.prototype.__audPatched) return;
      const origAssign = Location.prototype.assign;
      const origReplace = Location.prototype.replace;
      const origReload = Location.prototype.reload;

      Location.prototype.assign = function(u) { try { markNavigate(); } catch {} return origAssign.call(this, u); };
      Location.prototype.replace = function(u) { try { markNavigate(); } catch {} return origReplace.call(this, u); };
      Location.prototype.reload = function(...args) { try { markNavigate(); } catch {} return origReload.apply(this, args); };

      const d = Object.getOwnPropertyDescriptor(Location.prototype, "href");
      if (d && d.set && d.configurable) {
        Object.defineProperty(Location.prototype, "href", {
          configurable: true,
          get: d.get,
          set(v) { try { markNavigate(); } catch {} return d.set.call(this, v); }
        });
      }

      Object.defineProperty(Location.prototype, "__audPatched", { value: true });
    } catch {}
  })();

  /* =========================
   * Tab management (pagehide/pageshow)
   * 로그아웃은 오직 로그아웃 버튼 클릭 시에만 발생
   * 모든 탭 닫힘 시 로그아웃은 서버 세션 만료로 처리
   * ========================= */
  window.addEventListener("pagehide", () => {
    // 탭 레지스트리에서 현재 탭 제거 (로그아웃 없음)
    unregisterTab();
  }, { capture: true });

  // bfcache 복구 시 탭 재등록
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      registerTab();
      startHeartbeat();
      if (state.authed) registerAuthedTab();
    }
  });

  /* =========================
   * State & subscribers
   * ========================= */
  let state = { ready: false, authed: false, csrf: null, user: null, bootId: null };
  const subs = new Set();
  function notify() { subs.forEach(fn => { try { fn(state); } catch {} }); }
  function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
  function isAuthed() { return !!state.authed; }
  async function getUser() {
    if (!state.ready) await refreshMe();
    return state.user || null;
  }

  /* =========================
   * CSRF helpers
   * ========================= */
  let csrfInFlight = null;
  async function getCSRF(force = false) {
    if (state.csrf && !force) return state.csrf;
    if (csrfInFlight && !force) return csrfInFlight;
    csrfInFlight = fetch(toAPI("/auth/csrf"), { credentials: "include", headers: { "Accept": "application/json" } })
      .then(r => { if (!r.ok) throw new Error("csrf-fetch-failed"); return r.json(); })
      .then(j => (state.csrf = j?.csrfToken || null))
      .finally(() => { csrfInFlight = null; });
    return csrfInFlight;
  }
  function getCSRFTokenSync() { return state.csrf || null; }

  // 개발환경 localhost/127.0.0.1 호환
  function coerceToSameOrigin(input) {
    try {
      const u = new URL(input, location.href);
      const devPair = (a, b) => (a === "localhost" && b === "127.0.0.1") || (a === "127.0.0.1" && b === "localhost");
      if (u.origin !== location.origin && devPair(u.hostname, location.hostname)) {
        return location.origin + u.pathname + u.search + u.hash;
      }
      return u.toString();
    } catch { return input; }
  }

  /* =========================
   * fetch wrapper (CSRF + retry)
   * ========================= */
  async function apiFetch(path, opt = {}) {
    const method = (opt.method || "GET").toUpperCase();
    const needsCSRF = !["GET", "HEAD", "OPTIONS"].includes(method);

    const headers = new Headers(opt.headers || {});
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const isFD = (typeof FormData !== "undefined") && (opt.body instanceof FormData);
    if (isFD) {
      headers.delete("Content-Type");
    }

    const isPlainObjBody = !isFD && opt.body && typeof opt.body === "object" &&
      !(opt.body instanceof Blob) && !(opt.body instanceof URLSearchParams);
    if (isPlainObjBody) {
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      opt.body = JSON.stringify(opt.body);
    }

    const isJSONStr = !isFD && typeof opt.body === "string" && /^\s*\{/.test(opt.body);

    let token = null;
    if (needsCSRF) {
      token = await getCSRF().catch(() => null);
      if (token) {
        headers.set("X-CSRF-Token", token);
        headers.set("X-XSRF-Token", token);
      }
      if (!isFD && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      if (token) {
        if (isFD) { try { if (!opt.body.has("_csrf")) opt.body.append("_csrf", token); } catch {} }
        else if (isJSONStr) {
          try {
            const obj = JSON.parse(opt.body || "{}");
            if (!obj._csrf) obj._csrf = token;
            opt.body = JSON.stringify(obj);
          } catch {}
        }
        try {
          const u = new URL(path, location.href);
          if (token && !u.searchParams.has("_csrf")) u.searchParams.set("_csrf", token);
          path = u.toString();
        } catch {}
      }
    }

    const req = { ...opt, method, credentials: "include", headers };
    path = toAPI(path);
    path = coerceToSameOrigin(path);
    let res = await fetch(path, req);

    // CSRF 재시도
    if (needsCSRF && res.status === 403) {
      state.csrf = null;
      try {
        token = await getCSRF(true);
        headers.set("X-CSRF-Token", token);
        headers.set("X-XSRF-Token", token);
        if (isFD) { try { if (!opt.body.has("_csrf")) opt.body.append("_csrf", token); } catch {} }
        else if (isJSONStr) {
          try {
            const obj = JSON.parse(opt.body || "{}");
            obj._csrf = token;
            opt.body = JSON.stringify(obj);
          } catch {}
        }
        try {
          const u = new URL(path, location.href);
          u.searchParams.set("_csrf", token);
          path = u.toString();
        } catch {}
        res = await fetch(path, { ...req, headers });
      } catch {}
    }

    // 401 처리
    if (res.status === 401) {
      clearAuthedFlag();
      state.authed = false;
      state.user = null;
      notify();
      try { window.dispatchEvent(new Event("auth:logout")); } catch {}
    } else if (res.status === 403) {
      state.csrf = null;
    }
    return res;
  }

  /* =========================
   * refreshMe - 서버에서 인증 상태 확인
   * ========================= */
  async function refreshMe() {
    try {
      // ★ localStorage에 auth:flag가 없으면 로그아웃된 것
      const lsFlag = localStorage.getItem(AUTH_FLAG_KEY) === "1";
      if (!lsFlag) {
        state.authed = false;
        state.user = null;
        state.bootId = null;
        clearAuthedFlag();
        regUpdate(TAB_AUTHED_KEY, reg => (delete reg[getTabId()], reg));
        return;
      }

      const r = await fetch(toAPI("/auth/me"), {
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      const j = await r.json().catch(() => null);

      state.authed = !!j?.authenticated;
      state.user = state.authed ? (j?.user || null) : null;
      state.bootId = j?.bootId || null;

      if (state.authed) {
        setAuthedFlag();
        registerAuthedTab();
        try { await getCSRF(); } catch {}

        // admin 여부 확인 및 저장
        try {
          const userIsAdmin = !!(j?.user?.isAdmin || j?.user?.admin || j?.user?.role === 'admin');
          sessionStorage.setItem('auth:isAdmin', userIsAdmin ? '1' : '0');
        } catch {}

        try {
          const nsPersist = String(j?.ns || j?.user?.email || "").trim().toLowerCase();
          if (nsPersist) {
            localStorage.setItem(USERNS_KEY, nsPersist);
            localStorage.setItem("auth:ns", nsPersist);
            const wipedKey = `auth:wiped:${nsPersist}`;
            if (!localStorage.getItem(wipedKey)) {
              wipeLocalForNs(nsPersist);
              ["REG_COLLECT", "JIBC_COLLECT", "REG_LABELS", "JIBC_LABELS"].forEach(k => localStorage.removeItem(k));
              localStorage.setItem(wipedKey, "1");
            }
          }
        } catch {}
      } else {
        clearAuthedFlag();
        regUpdate(TAB_AUTHED_KEY, reg => (delete reg[getTabId()], reg));
        // 로그아웃 상태면 admin 플래그도 제거
        try { sessionStorage.removeItem('auth:isAdmin'); } catch {}
      }
    } finally {
      state.ready = true;
      let nsDetail = null;
      try { nsDetail = localStorage.getItem(USERNS_KEY) || null; } catch {}
      try {
        window.dispatchEvent(new CustomEvent("auth:state", {
          detail: { authed: state.authed, user: state.user, bootId: state.bootId, ns: nsDetail }
        }));
      } catch {}
      notify();
    }
  }

  /* =========================
   * Cross-tab logout sync (storage event)
   * ========================= */
  window.addEventListener("storage", (ev) => {
    // auth:flag가 삭제되면 이 탭도 로그아웃
    if (ev.key === AUTH_FLAG_KEY) {
      const wasSet = ev.oldValue === "1";
      const nowCleared = !ev.newValue || ev.newValue !== "1";
      if (wasSet && nowCleared) {
        try { sessionStorage.removeItem(AUTH_FLAG_KEY); } catch {}
        try { sessionStorage.removeItem('auth:isAdmin'); } catch {}
        try { localStorage.removeItem("auth:token"); } catch {}
        state.authed = false;
        state.user = null;
        state.csrf = null;
        notify();
        try { window.dispatchEvent(new Event("auth:logout")); } catch {}
      }
      return;
    }

    // auth:token이 삭제되면 이 탭도 로그아웃
    if (ev.key === "auth:token") {
      const hadToken = !!ev.oldValue;
      const noToken = !ev.newValue;
      if (hadToken && noToken) {
        try { sessionStorage.removeItem(AUTH_FLAG_KEY); } catch {}
        try { sessionStorage.removeItem('auth:isAdmin'); } catch {}
        try { localStorage.removeItem(AUTH_FLAG_KEY); } catch {}
        state.authed = false;
        state.user = null;
        state.csrf = null;
        notify();
        try { window.dispatchEvent(new Event("auth:logout")); } catch {}
      }
    }
  });

  /* =========================
   * Public actions
   * ========================= */
  async function login(email, password) {
    const normEmail = String(email || "").trim().toLowerCase();

    const r = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normEmail, password: String(password || "") })
    });

    const j = await r.json().catch(() => ({}));
    if (j?.ok) {
      // JWT 토큰 저장
      if (j?.token) {
        try { localStorage.setItem("auth:token", j.token); } catch {}
      }

      state.csrf = null;
      setAuthedFlag();
      registerAuthedTab();
      await refreshMe();
      try { await getCSRF(true); } catch {}

      // admin 여부 확인을 위해 /auth/me 호출 (refreshMe 후에 호출)
      try {
        const meRes = await apiFetch("/auth/me", { credentials: "include", cache: "no-store" });
        const meData = await meRes.json();
        const userIsAdmin = !!(meData?.user?.isAdmin || meData?.user?.admin || meData?.user?.role === 'admin');
        sessionStorage.setItem('auth:isAdmin', userIsAdmin ? '1' : '0');
      } catch {}

      try {
        localStorage.setItem(USERNS_KEY, normEmail);
        localStorage.setItem("auth:ns", normEmail);
        const wipedKey = `auth:wiped:${normEmail}`;
        if (!localStorage.getItem(wipedKey)) {
          wipeLocalForNs(normEmail);
          ["REG_COLLECT", "JIBC_COLLECT", "REG_LABELS", "JIBC_LABELS"].forEach(k => localStorage.removeItem(k));
          localStorage.setItem(wipedKey, "1");
        }
      } catch {}
    }

    return j;
  }

  async function signup(email, password, opts = {}) {
    const { autoLogin = true, redirect = true, next = null } = opts;
    const normEmail = String(email || "").trim().toLowerCase();

    const r = await apiFetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normEmail, password: String(password || "") })
    });
    const sign = await r.json().catch(() => ({}));

    if (!sign?.ok) return sign;
    if (!autoLogin) return { ...sign, autologin: false };

    const loginRes = await login(normEmail, password);
    if (redirect && loginRes?.ok) {
      // admin 여부 확인을 위해 /auth/me 호출
      let isAdmin = false;
      try {
        const meRes = await apiFetch("/auth/me", { credentials: "include", cache: "no-store" });
        const meData = await meRes.json();
        isAdmin = !!(meData?.user?.isAdmin || meData?.user?.admin || meData?.user?.role === 'admin');
        sessionStorage.setItem('auth:isAdmin', isAdmin ? '1' : '0');
      } catch {}

      const defaultPath = isAdmin ? "/adminme.html" : "/me.html";
      const to = next || new URLSearchParams(location.search).get("next") || defaultPath;
      try { markNavigate(); } catch {}
      location.replace(to);
    }
    return { ...loginRes, autologin: true };
  }

  async function logout(e) {
    e?.preventDefault?.();

    // 서버에 로그아웃 요청
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}

    // sessionStorage 정리 (auth:isAdmin 명시적으로 제거)
    try {
      sessionStorage.removeItem('auth:isAdmin');
      const rm = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && /^(auth:|__boot\.id)/.test(k)) rm.push(k);
      }
      rm.forEach(k => sessionStorage.removeItem(k));
    } catch {}

    // ★ 핵심: localStorage에서 auth 관련 항목 삭제 (다른 탭에서 storage 이벤트로 감지)
    clearAuthedFlag();
    try { localStorage.removeItem("auth:token"); } catch {}
    try { localStorage.removeItem(USERNS_KEY); } catch {}

    // 상태 초기화
    regUpdate(TAB_AUTHED_KEY, reg => (delete reg[getTabId()], reg));
    state.csrf = null;
    state.authed = false;
    state.user = null;
    notify();

    try { window.dispatchEvent(new CustomEvent("auth:state", { detail: { authed: false, user: null, ns: "default" } })); } catch {}
    try { window.dispatchEvent(new Event("auth:logout")); } catch {}

    // 로그인 페이지로 이동 (next 파라미터 없이 - 로그인 후 관리자 권한에 따라 자동 결정)
    markNavigate();
    location.href = `./login.html?reset=1`;
  }

  /* =========================
   * State API
   * ========================= */
  async function loadState(ns = "default") {
    const u = toAPI(`/api/state?ns=${encodeURIComponent(ns)}`);
    const j = await fetch(u, { credentials: "include", headers: { "Accept": "application/json" } }).then(r => r.json()).catch(() => ({}));
    return j?.state || {};
  }
  async function saveState(ns = "default", stateObj = {}) {
    const body = JSON.stringify({ ns, state: stateObj });
    let r = await apiFetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    if (!r.ok) r = await apiFetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    return r.ok;
  }

  /* =========================
   * Expose window.auth
   * ========================= */
  window.auth = {
    apiFetch,
    onChange,
    isAuthed,
    getUser,
    require: async () => {
      if (state.ready && state.authed) { await getCSRF().catch(() => null); return true; }
      if (!state.ready) await refreshMe();
      if (state.authed) { await getCSRF().catch(() => null); return true; }
      // 인증되지 않은 경우 로그인 페이지로 리다이렉트 (next 파라미터 없이)
      markNavigate();
      location.href = "./login.html";
      return false;
    },
    login,
    signup,
    logout,
    getCSRF,
    getCSRFTokenSync,
    ensureCSRF: getCSRF,
    ping: async () => { try { await fetch(toAPI("/auth/ping"), { credentials: "include" }); } catch {} },
    loadState,
    saveState,
    markNavigate,
  };

  /* =========================
   * Boot
   * ========================= */
  try { sessionStorage.removeItem(NAV_KEY); } catch {}

  // 탭/창이 닫혔다가 다시 열린 경우 감지
  // sessionStorage는 탭이 닫히면 사라지므로, 값이 없으면 새 탭이거나 탭이 닫혔다가 다시 열린 것
  const sessionAlive = sessionStorage.getItem(SESSION_ALIVE_KEY);
  const wasLoggedIn = localStorage.getItem(AUTH_FLAG_KEY) === "1";

  if (!sessionAlive && wasLoggedIn) {
    // 탭이 닫혔다가 다시 열린 경우 → 로그아웃 처리
    try { localStorage.removeItem(AUTH_FLAG_KEY); } catch {}
    try { localStorage.removeItem("auth:token"); } catch {}
    try { localStorage.removeItem(USERNS_KEY); } catch {}

    // 서버에 로그아웃 알림
    try {
      fetch(toAPI("/auth/logout"), { method: "POST", credentials: "include" }).catch(() => {});
    } catch {}
  }

  // 세션 활성 표시 (탭이 열려있는 동안 유지)
  try { sessionStorage.setItem(SESSION_ALIVE_KEY, "1"); } catch {}

  registerTab();
  startHeartbeat();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { refreshMe(); }, { once: true });
  } else {
    refreshMe();
  }
})();
