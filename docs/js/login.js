// /public/js/login.js — unified, robust, and CSRF-safe (2025-09-05)
(() => {
  "use strict";

  /* =============================================================
   *  0) CONFIG & LIGHTWEIGHT SHIMS
   * ============================================================= */
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[login]", ...a);

  // Ensure a non-breaking auth namespace without overriding a real one
  (function ensureAuthShim(){
    const a = (window.auth = window.auth || {});
    a.isAuthed      = a.isAuthed      || (() => false);
    a.login         = a.login         || null;           // if provided, preferred
    a.getCSRF       = a.getCSRF       || (async () => null);
    a.markNavigate  = a.markNavigate  || (() => {});
    a.logout        = a.logout        || (() => {});
  })();

  // --- Backend router (GH Pages-safe) ---
  const API_ORIGIN = window.PROD_BACKEND || window.API_BASE || null;
  function toAPI(p) {
    try {
      const u = new URL(p, location.href);
      return (API_ORIGIN && /^\/(?:auth|api)\//.test(u.pathname))
        ? new URL(u.pathname + u.search + u.hash, API_ORIGIN).toString()
        : u.toString();
    } catch { return p; }
  }

  const $  = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

  const EMAIL_RX       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DATE_RX        = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/; // MM/DD/YYYY
  const AUTH_FLAG_KEY  = "auth:flag";     // tab-scoped auth flag
  const NAV_MARK_KEY   = "auth:navigate"; // internal navigation mark
  const MINE_PATH = (window.pageHref ? pageHref("mine.html") : "./mine.html");    // default landing

  // Validate date string in MM/DD/YYYY format
  function isValidDate(str) {
    if (!DATE_RX.test(str)) return false;
    const [month, day, year] = str.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year &&
           date.getMonth() === month - 1 &&
           date.getDate() === day;
  }

  const FORCE_LOGIN =
    new URL(location.href).searchParams.get("force") === "1" ||
    location.hash === "#force";

  // DOM cache (ids are optional; delegation handles the rest)
  const els = {
    pageTitle:   $("#page-title"),
    tabContainer: $(".auth-switch[role='tablist']"),
    tabLogin:    $("#tab-login") || $('[data-tab="login"]'),
    tabSignup:   $("#tab-signup")|| $('[data-tab="signup"]'),
    panelLogin:  $("#login")     || $("#panel-login")  || $('[data-panel="login"]'),
    panelSignup: $("#signup")    || $("#panel-signup") || $('[data-panel="signup"]'),

    loginEmail:  $("#email"),
    loginPw:     $("#pw"),
    loginErr:    $("#login-error"),

    signupEmail: $("#su-email"),
    signupPw:    $("#su-pw"),
    signupPw2:   $("#su-pw2"),
    signupErr:   $("#signup-error"),

    loginBtn:    $("#login button[type='submit']"),
    signupBtn:   $("#signup button[type='submit']"),

    // 2-step signup elements
    signupStep1: $("#signup-step1"),
    signupStep2: $("#signup-step2"),
    signupNextBtn: $("#signup-next-btn"),
    signupBackBtn: $("#signup-back-btn"),
    signupVerificationCode: $("#su-verification-code"),
    signupName: $("#su-name"),
    signupBirthdate: $("#su-birthdate"),
    signupStep1Error: $("#signup-step1-error"),

    // Recovery forms
    findEmailForm: $("#find-email-form"),
    findPasswordForm: $("#find-password-form"),
    findEmailBackBtn: $("#find-email-back-btn"),
    findPasswordBackBtn: $("#find-password-back-btn"),

    // Find email fields
    feEmail: $("#fe-email"),
    feName: $("#fe-name"),
    feBirthdate: $("#fe-birthdate"),
    findEmailResult: $("#find-email-result"),
    findEmailValue: $("#find-email-value"),
    findEmailError: $("#find-email-error"),

    // Find password fields
    fpEmail: $("#fp-email"),
    fpErrEmail: $("#fp-err-email"),
    fpCode: $("#fp-code"),
    fpNewPw: $("#fp-new-pw"),
    sendCodeBtn: $("#send-code-btn"),
    resetStep1: $("#reset-step1"),
    resetStep2: $("#reset-step2"),
    fpError: $("#find-password-error"),

    // Recovery buttons in login form
    findEmailBtn: $("#find-email-btn"),
    findPasswordBtn: $("#find-password-btn"),
  };

  /* =============================================================
   *  1) TAB-SCOPED AUTH FLAG & NAV MARKING
   * ============================================================= */
  const setAuthedFlag = () => {
    try { sessionStorage.setItem(AUTH_FLAG_KEY, "1"); } catch {}
    try { localStorage.setItem(AUTH_FLAG_KEY,  "1"); }  catch {}
    // 탭 동기화 즉시 반영
    try {
      localStorage.setItem("auth:ping", String(Date.now()));
      localStorage.removeItem("auth:ping");
    } catch {}
  };
  const hasAuthedFlag = () =>
    (sessionStorage.getItem(AUTH_FLAG_KEY) === "1") ||
    (localStorage.getItem(AUTH_FLAG_KEY)  === "1");

  const clearAuthedFlag = () => {
    try { sessionStorage.removeItem(AUTH_FLAG_KEY); } catch {}
    try { localStorage.removeItem(AUTH_FLAG_KEY);  } catch {}
    try { localStorage.removeItem("auth:token");  } catch {}
  };

  function markNavigate(){
    try { window.auth.markNavigate(); } catch {}
    try { sessionStorage.setItem(NAV_MARK_KEY, String(Date.now())); } catch {}
  }

  // Keep the auth flag even when reloading with ?reset=1
  (function preserveAuthFlagOnReset(){
    try {
      const u = new URL(location.href);
      if (u.searchParams.get("reset") === "1" && hasAuthedFlag()) setAuthedFlag();
    } catch {}
  })();

  /* =============================================================
   *  2) CSRF TOKEN HELPER (with cache + resilient fallback)
   * ============================================================= */
  const csrf = {
    _cache: null,
    async ensure(force=false){
      if (!force && this._cache) return this._cache;
      try { const t = await window.auth.getCSRF(true); if (t) return (this._cache = t); } catch {}
      try {
        const j = await fetch(toAPI("/auth/csrf"), { credentials: "include" }).then(r => r.json());
        return (this._cache = j?.csrfToken || null);
      } catch { return null; }
    },
    clear(){ this._cache = null; }
  };

  async function postJSON(url, body = {}, retrying = false){
    const t = await csrf.ensure(true);
    const headers = new Headers({ "Content-Type": "application/json", "Accept": "application/json" });
    if (t) {
      headers.set("x-csrf-token", t); 
      headers.set("X-XSRF-Token", t);  
    }
    const u = new URL(url, location.href);
    if (t && !u.searchParams.has("_csrf")) u.searchParams.set("_csrf", t);

    const payload = { ...(body||{}) };
    if (t && payload._csrf == null) payload._csrf = t;

    const res = await fetch(toAPI(u.toString()), {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(payload)
    });

    if (res.status === 403 && !retrying) {
      csrf.clear();
      try { await window.auth.getCSRF(true); } catch {}
      return postJSON(url, body, true);
    }
    return res;
  }

  /* =============================================================
   *  3) SAFE NEXT URL RESOLUTION
   * ============================================================= */
  function resolveNextUrl(){
    const u = new URL(location.href);
    const n = u.searchParams.get("next") || "";
    // allow: same-origin & /.../(mine|home|collect|gallery|labelmine).html
    try {
      const t = new URL(n, location.href);       // relative or absolute both OK
      if (t.origin === location.origin) {
        const p = t.pathname;
        if (/\/(mine|home|collect|gallery|labelmine)\.html$/i.test(p)) {
          return p + t.search + t.hash;          // keep subpath (/aud-web/...)
        }
      }
    } catch {}
    return MINE_PATH;                             // fallback: ./mine.html
  }
  function gotoNext(){ markNavigate(); location.assign(resolveNextUrl()); }

  /* =============================================================
   *  4) UI HELPERS (busy states, field errors)
   * ============================================================= */

  // [ADD] 필드 아래에 .field-error span을 보장(없으면 생성)
  function ensureErrBelow(inputEl, id){
    if (!inputEl) return null;
    const exist = document.getElementById(id);
    if (exist) return exist;
    const span = document.createElement("div");
    span.className = "field-error";   // CSS에서 visibility로 제어
    span.id = id;
    // input의 바로 다음 형제 위치에 삽입(레이아웃 안정)
    inputEl.insertAdjacentElement("afterend", span);
    return span;
  }

  function setBusy(btn, on, txtBusy = "Signing in…"){
    if (!btn) return;
    btn.disabled = !!on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
    if (on) {
      btn.dataset.prev = btn.textContent || "";
      btn.textContent = txtBusy;
    } else {
      const p = btn.dataset.prev;
      if (p != null) btn.textContent = p;
      delete btn.dataset.prev;
    }
  }

  // display 토글 없이 클래스/visibility로만 제어
  function setFieldError(inputEl, errEl, msg){
    if (!inputEl || !errEl) return;
    const has = !!msg;
    inputEl.classList.toggle("is-invalid", has);
    inputEl.setAttribute("aria-invalid", has ? "true" : "false");
    errEl.textContent = has ? String(msg) : "";
    errEl.classList.toggle("is-on", has);
  }

  // enforce ASCII/Latin input + password visibility toggles
  const NON_LATIN_RX = /[^\x20-\x7E]/g;
  const sanitizeLatin = (value = "") => String(value).replace(NON_LATIN_RX, "");

  function enforceLatinInput(inputEl){
    if (!inputEl || inputEl.dataset.enforceLatin === "1") return;
    inputEl.dataset.enforceLatin = "1";
    const handler = () => {
      const value = inputEl.value ?? "";
      const cleaned = sanitizeLatin(value);
      if (cleaned === value) return;
      const selStart = inputEl.selectionStart ?? cleaned.length;
      const leftClean = sanitizeLatin(value.slice(0, selStart));
      inputEl.value = cleaned;
      requestAnimationFrame(() => {
        try { inputEl.setSelectionRange(leftClean.length, leftClean.length); } catch {}
      });
    };
    on(inputEl, "input", handler);
    on(inputEl, "blur", handler);
  }

  function setupPasswordField(root){
    if (!root || root.__pwBound) return;
    const input = root.querySelector('input');
    const toggle = root.querySelector('.pw-toggle');
    if (!input || !toggle) return;
    root.__pwBound = true;

    const applyState = (visible) => {
      input.type = visible ? "text" : "password";
      toggle.dataset.state = visible ? "visible" : "hidden";
      toggle.setAttribute("aria-pressed", visible ? "true" : "false");
      toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    };

    applyState(false);

    toggle.addEventListener("click", () => {
      const willShow = toggle.dataset.state !== "visible";
      applyState(willShow);
      if (willShow) {
        try {
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        } catch {}
      }
    });

    toggle.addEventListener("mousedown", (ev) => ev.preventDefault());
  }

  function initPasswordUtilities(){
    [els.loginPw, els.signupPw, els.signupPw2].forEach(enforceLatinInput);
    document.querySelectorAll('.pw-field').forEach(setupPasswordField);
  }

  function showError(errEl, msg){
    if (!errEl) return;
    const has = !!msg;
    errEl.textContent = has ? String(msg) : "";
    errEl.classList.toggle("is-on", has);
  }

  function clearFieldErrors(){
    // 로그인
    setFieldError(
      els.loginEmail,
      $("#err-email") || ensureErrBelow(els.loginEmail, "err-email"),
      ""
    );
    setFieldError(
      els.loginPw,
      $("#err-pw") || ensureErrBelow(els.loginPw, "err-pw"),
      ""
    );
    showError(els.loginErr, "");

    // 회원가입(필드별)
    const suEmailErr = $("#su-err-email") || ensureErrBelow(els.signupEmail, "su-err-email");
    const suPwErr    = $("#su-err-pw")    || ensureErrBelow(els.signupPw,    "su-err-pw");
    const suPw2Err   = $("#su-err-pw2")   || ensureErrBelow(els.signupPw2,   "su-err-pw2");

    setFieldError(els.signupEmail, suEmailErr, "");
    setFieldError(els.signupPw,    suPwErr,    "");
    setFieldError(els.signupPw2,   suPw2Err,   "");
    showError(els.signupErr, "");
  }

  function mountErrorPlaceholders(){
    // 로그인
    ensureErrBelow(els.loginEmail, "err-email");
    ensureErrBelow(els.loginPw,    "err-pw");

    // 회원가입
    ensureErrBelow(els.signupEmail, "su-err-email");
    ensureErrBelow(els.signupPw,    "su-err-pw");
    ensureErrBelow(els.signupPw2,   "su-err-pw2");
  }

  /* =============================================================
   *  5) ERROR TRANSLATION (server codes → user text)
   * ============================================================= */
  function translateError(codeLike){
    const code = String(codeLike || "").toUpperCase();
    const M = {
      "NO_USER":         { msg: "No account found for this email.",                       field: "email" },
      "BAD_CREDENTIALS": { msg: "Incorrect email or password.",                           field: "pw"    },
      "INVALID":         { msg: "Please check your inputs and try again.",                field: "pw"    },
      "LOCKED":          { msg: "This account is locked. Please try again later.",        field: "pw"    },
      "RATE_LIMIT":      { msg: "Too many attempts. Please wait a moment and try again.", field: "pw"    },
      "CSRF":            { msg: "Security token expired. Please refresh and try again.",  field: "pw"    },
      "EXPIRED_SESSION": { msg: "Session expired. Please sign in again.",                 field: "pw"    },
      "DUPLICATE_EMAIL": { msg: "This email is already registered." },
    };
    return M[code] || { msg: "Login failed. Please check your email and password.", field: "pw" };
  }

  /* =============================================================
   *  6) VALIDATORS
   * ============================================================= */
  function assertLoginInputs(){
    const email = (els.loginEmail?.value || "").trim();
    const pw    = (els.loginPw?.value   || "").trim();
    if (!EMAIL_RX.test(email)) return { ok:false, field:"email", msg:"Please enter a valid email address." };
    if (pw.length < 4)         return { ok:false, field:"pw",    msg:"Password must be at least 4 characters." };
    return { ok:true, email, pw };
  }
  function assertSignupInputs(){
    const email = (els.signupEmail?.value || "").trim();
    const pw1   = (els.signupPw?.value    || "").trim();
    const pw2   = (els.signupPw2?.value   || "").trim();
    if (!EMAIL_RX.test(email)) return { ok:false, field:"email", msg:"Please enter a valid email address." };
    if (pw1.length < 8)        return { ok:false, field:"pw",    msg:"Password must be at least 8 characters." };
    if (pw1 !== pw2)           return { ok:false, field:"pw2",   msg:"Passwords do not match." };
    return { ok:true, email, pw1, pw2 };
  }

  /* =============================================================
   *  7) SUCCESS HOOK
   * ============================================================= */
  function onLoginSuccess(user){
    const emailNs = String(user?.email || "").trim().toLowerCase();
    if (!emailNs) return; // 방어

    // Store JWT token if provided
    if (user?.token) {
      try {
        localStorage.setItem("auth:token", user.token);
      } catch (e) {
        console.error("Failed to store JWT token:", e);
      }
    }

    try { localStorage.setItem("auth:userns", emailNs); } catch {}
    try { window.setSessionUserNS?.(emailNs); } catch {}
    setAuthedFlag();

    // 탭 동기화 신호 (선택이지만 권장)
    try {
      localStorage.setItem("auth:ping", String(Date.now()));
      localStorage.removeItem("auth:ping");
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent("auth:state", {
        detail: { ready:true, authed:true, ns: emailNs, user }
      }));
    } catch {}

    // [ADD] 로그인 직후 이메일에서 이름 자동 생성 + 캐시 + 브로드캐스트
    try {
      const eml = String(user?.email || "").trim().toLowerCase();
      // '+' 태그 제거 후 @ 앞부분만 추출 (e.g., 'john.doe+test@x.com' -> 'john.doe')
      const localPart = eml ? eml.split("@")[0].split("+")[0] : "member";
      const detail = {
        id: (user?.id ?? null),
        displayName: localPart || "member",
        avatarUrl: "",
        rev: Date.now()
      };
      // mine.js는 legacy 키('me:profile') 스토리지 이벤트를 이미 구독함
      localStorage.setItem("me:profile", JSON.stringify(detail));
      // 즉시 반영을 원하는 현재 탭에도 이벤트 발행
      window.dispatchEvent(new CustomEvent("user:updated", { detail }));
    } catch {}

    gotoNext();
  }

  /* =============================================================
   *  8) ACTIONS: LOGIN / SIGNUP
   * ============================================================= */
  async function doLogin(email, password){
    log("doLogin via", window.auth?.login ? "window.auth" : "fallback");
    console.log("[LOGIN DEBUG] Starting login for:", email);
    console.log("[LOGIN DEBUG] Using method:", window.auth?.login ? "window.auth" : "fallback");
    try {
      if (window.auth?.login) {
        console.log("[LOGIN DEBUG] Calling window.auth.login...");
        const r = await window.auth.login(email, password); // { ok, error|code? }
        console.log("[LOGIN DEBUG] window.auth.login response:", r);
        if (!r || r.ok !== true) {
          const t = translateError(r?.error || r?.code || r?.message);
          console.log("[LOGIN DEBUG] Login failed via window.auth:", r?.error || r?.code);
          return { ok:false, msg:t.msg, field:t.field, code:r?.error || r?.code };
        }

        // Sync /auth/me (best-effort) and flush store snapshot if provided
        let uid = null, eml = email;
        try {
          const me = await (window.auth?.apiFetch
            ? window.auth.apiFetch("/auth/me", { credentials:"include", cache:"no-store" })
            : fetch(toAPI("/auth/me"), { credentials:"include", cache:"no-store" })
          ).then(r => (r.json ? r.json() : r));
          if (me?.authenticated && me?.user?.id != null) uid = me.user.id;
          if (me?.user?.email) eml = me.user.email;
          try { await window.__flushStoreSnapshot?.({ server:true }); } catch {}
          try {
            const emailNs = String(eml || "").trim().toLowerCase();
            localStorage.setItem("auth:userns", emailNs);
            window.dispatchEvent(new CustomEvent("auth:state", {
              detail: { authed:true, ready:true, ns: emailNs }
            }));
          } catch {}
        } catch {}

        onLoginSuccess({ id: uid, email: eml });
        return { ok:true };
      }

      // Fallback: POST /auth/login
      console.log("[LOGIN DEBUG] Using fallback POST /auth/login");
      const r = await postJSON("/auth/login", { email, password });
      console.log("[LOGIN DEBUG] Response status:", r.status, r.statusText);
      const out = await r.json().catch(() => ({}));
      console.log("[LOGIN DEBUG] Response body:", out);
      if (!r.ok || out?.ok === false) {
        const t = translateError(out?.error || out?.code);
        console.log("[LOGIN DEBUG] Login failed:", out?.error || out?.code);
        return { ok:false, msg:t.msg, field:t.field, code:out?.error || out?.code };
      }
      console.log("[LOGIN DEBUG] Login successful, calling onLoginSuccess");
      onLoginSuccess({ id: out.id, email, token: out.token });
      return { ok:true };
    } catch (e) {
      console.error("[LOGIN DEBUG] Exception caught:", e);
      const t = translateError(e?.code || e?.message);
      return { ok:false, msg:t.msg, field:t.field };
    }
  }

  async function doSignup(email, pw1){
    try {
      const r = await postJSON("/auth/signup", { email, password: pw1 });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        const code = String(out?.error || out?.code || "").toUpperCase();
        if (code === "DUPLICATE_EMAIL") {
          return { ok:false, field:"email", msg:"This email is already registered." };
        }
        if (code === "INVALID_EMAIL") {
          return { ok:false, field:"email", msg:"Please enter a valid email address." };
        }
        if (code === "WEAK_PASSWORD") {
          return { ok:false, field:"pw", msg:"Please choose a stronger password." };
        }
        return { ok:false, field:null, msg: out?.message || "Sign-up failed. Please try again." };
      }
      return { ok:true };
    } catch {
      return { ok:false, field:null, msg:"Sign-up failed. Please try again." };
    }
  }

  /* =============================================================
   *  9) TAB UI (Unified: buttons + panels + URL control)
   * ============================================================= */
  function activateTab(which = "login"){
    const isLogin = which === "login";

    // Buttons (if present)
    const tabLogin  = $("#tab-login")  || $('[data-tab="login"]');
    const tabSignup = $("#tab-signup") || $('[data-tab="signup"]');
    [tabLogin, tabSignup].forEach((el, i) => {
      if (!el) return;
      const on = isLogin ? i === 0 : i === 1;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
      el.setAttribute("tabindex", on ? "0" : "-1");
    });

    // Panels (id or data-panel)
    const panLogin  = $("#login")  || $("#panel-login")  || $('[data-panel="login"]');
    const panSignup = $("#signup") || $("#panel-signup") || $('[data-panel="signup"]');
    if (panLogin)  { panLogin.classList.toggle("active", isLogin);  panLogin.hidden  = !isLogin; }
    if (panSignup) { panSignup.classList.toggle("active", !isLogin); panSignup.hidden = isLogin; }
  }

  function bindTabDelegation(){
    // Single delegated handler supports id or data-tab on <a>/<button>
    document.addEventListener("click", (e) => {
      const t = e.target?.closest?.('#tab-login,[data-tab="login"],#tab-signup,[data-tab="signup"]');
      if (!t) return;
      e.preventDefault();
      activateTab(t.matches('#tab-signup,[data-tab="signup"]') ? "signup" : "login");
    }, { capture:true });

    // URL-driven default: ?tab=signup or #signup
    try {
      const u = new URL(location.href);
      const q = (u.searchParams.get("tab") || "").toLowerCase();
      if (q === "signup" || location.hash.toLowerCase() === "#signup") activateTab("signup");
      else activateTab("login");
    } catch { activateTab("login"); }

    // Expose for manual switching
    try { window.__loginForceTab = activateTab; } catch {}
  }

  /* =============================================================
   *  10) FORM TRANSITIONS & RECOVERY UI
   * ============================================================= */
  function showSignupStep1(){
    if (els.signupStep1) els.signupStep1.hidden = false;
    if (els.signupStep2) els.signupStep2.hidden = true;
    // Show tabs
    if (els.tabContainer) els.tabContainer.hidden = false;
  }
  function showSignupStep2(){
    if (els.signupStep1) els.signupStep1.hidden = true;
    if (els.signupStep2) els.signupStep2.hidden = false;
    // Hide tabs
    if (els.tabContainer) els.tabContainer.hidden = true;
  }

  function showLoginForm(){
    // Hide all recovery forms
    if (els.findEmailForm) els.findEmailForm.hidden = true;
    if (els.findPasswordForm) els.findPasswordForm.hidden = true;

    // Show page title and tabs
    if (els.pageTitle) els.pageTitle.hidden = false;
    if (els.tabContainer) els.tabContainer.hidden = false;

    // Show login/signup tabs and panels
    if (els.panelLogin) els.panelLogin.hidden = false;
    if (els.panelSignup) els.panelSignup.hidden = true;

    // Reset to login tab
    activateTab("login");
  }

  function showFindEmailForm(){
    // Hide page title and tabs
    if (els.pageTitle) els.pageTitle.hidden = true;
    if (els.tabContainer) els.tabContainer.hidden = true;

    // Hide login/signup panels
    if (els.panelLogin) els.panelLogin.hidden = true;
    if (els.panelSignup) els.panelSignup.hidden = true;

    // Show find email form
    if (els.findEmailForm) els.findEmailForm.hidden = false;
    if (els.findPasswordForm) els.findPasswordForm.hidden = true;

    // Clear previous results
    if (els.findEmailResult) els.findEmailResult.hidden = true;
    if (els.findEmailError) els.findEmailError.textContent = "";
  }

  function showFindPasswordForm(){
    // Hide page title and tabs
    if (els.pageTitle) els.pageTitle.hidden = true;
    if (els.tabContainer) els.tabContainer.hidden = true;

    // Hide login/signup panels
    if (els.panelLogin) els.panelLogin.hidden = true;
    if (els.panelSignup) els.panelSignup.hidden = true;

    // Show find password form
    if (els.findPasswordForm) els.findPasswordForm.hidden = false;
    if (els.findEmailForm) els.findEmailForm.hidden = true;

    // Reset to step 1
    if (els.resetStep1) els.resetStep1.hidden = false;
    if (els.resetStep2) els.resetStep2.hidden = true;

    // Clear fields
    if (els.fpEmail) els.fpEmail.value = "";
    if (els.fpCode) els.fpCode.value = "";
    if (els.fpNewPw) els.fpNewPw.value = "";
  }

  /* =============================================================
   *  11) EVENT HANDLERS
   * ============================================================= */
  async function onSubmitLogin(e){
    e.preventDefault();
    clearFieldErrors();

    const v = assertLoginInputs();
    if (!v.ok){
      if (v.field === "email") setFieldError(els.loginEmail, $("#err-email") || ensureErrBelow(els.loginEmail, "err-email"), v.msg);
      if (v.field === "pw")    setFieldError(els.loginPw,    $("#err-pw")    || ensureErrBelow(els.loginPw,    "err-pw"),    v.msg);
      return;
    }

    setBusy(els.loginBtn, true, "Signing in…");
    const res = await doLogin(v.email, v.pw);
    setBusy(els.loginBtn, false);

    if (!res.ok){
      const target = res.field === "email" ? "email" : "pw";
      if (target === "email") setFieldError(els.loginEmail, $("#err-email") || ensureErrBelow(els.loginEmail, "err-email"), res.msg);
      else                    setFieldError(els.loginPw,    $("#err-pw")    || ensureErrBelow(els.loginPw,    "err-pw"),    res.msg);
      return;
    }
  }

  async function onSubmitSignup(e){
    e.preventDefault();

    // Step 2에서 제출: verification code, name, birthdate 포함
    const verificationCode = (els.signupVerificationCode?.value || "").trim();
    const name = (els.signupName?.value || "").trim();
    const birthdate = (els.signupBirthdate?.value || "").trim();

    if (!verificationCode) {
      showError(els.signupErr, "Please enter the verification code.");
      return;
    }
    if (!name) {
      showError(els.signupErr, "Please enter your name.");
      return;
    }
    if (!birthdate) {
      showError(els.signupErr, "Please enter your birthdate.");
      return;
    }
    if (!isValidDate(birthdate)) {
      showError(els.signupErr, "Please enter a valid date in MM/DD/YYYY format.");
      return;
    }

    // 이미 step 1에서 검증된 email/password 가져오기
    const email = (els.signupEmail?.value || "").trim();
    const pw1 = (els.signupPw?.value || "").trim();

    setBusy(els.signupBtn, true, "Creating account…");
    try {
      // POST /auth/signup with verification code, name and birthdate
      const res = await postJSON("/auth/signup", {
        email,
        password: pw1,
        verificationCode,
        name,
        birthdate
      });
      const out = await res.json().catch(() => ({}));

      if (!res.ok || out?.ok === false) {
        const code = String(out?.error || out?.code || "").toUpperCase();
        if (code === "INVALID_VERIFICATION_CODE" || code === "VERIFICATION_CODE_EXPIRED") {
          showError(els.signupErr, "Invalid or expired verification code. Please try again.");
        } else if (code === "DUPLICATE_EMAIL") {
          showError(els.signupErr, "This email is already registered.");
          showSignupStep1(); // 다시 step1로
        } else if (code === "INVALID_EMAIL") {
          showError(els.signupErr, "Please enter a valid email address.");
          showSignupStep1();
        } else if (code === "WEAK_PASSWORD") {
          showError(els.signupErr, "Please choose a stronger password.");
          showSignupStep1();
        } else {
          showError(els.signupErr, out?.message || "Sign-up failed. Please try again.");
        }
        setBusy(els.signupBtn, false);
        return;
      }

      // 회원가입 성공 → 자동 로그인 시도
      setBusy(els.signupBtn, true, "Signing in…");
      const loginRes = await doLogin(email, pw1);
      setBusy(els.signupBtn, false);

      if (!loginRes.ok) {
        // 로그인 실패 시 로그인 화면으로 안내
        showError(els.signupErr, "Account created! Please sign in.");
        showLoginForm();
        showSignupStep1();
        return;
      }

      // 로그인 성공 시 onLoginSuccess가 이미 gotoNext() 호출함
    } catch (e) {
      showError(els.signupErr, "Network error. Please try again.");
      setBusy(els.signupBtn, false);
    }
  }

  // Signup Next 버튼 핸들러 (Step 1 → Step 2)
  async function onSignupNext(){
    // 필드/공통 에러 초기화
    const suEmailErr = $("#su-err-email") || ensureErrBelow(els.signupEmail, "su-err-email");
    const suPwErr    = $("#su-err-pw")    || ensureErrBelow(els.signupPw,    "su-err-pw");
    const suPw2Err   = $("#su-err-pw2")   || ensureErrBelow(els.signupPw2,   "su-err-pw2");
    setFieldError(els.signupEmail, suEmailErr, "");
    setFieldError(els.signupPw,    suPwErr,    "");
    setFieldError(els.signupPw2,   suPw2Err,   "");
    showError(els.signupStep1Error, "");

    // 클라이언트 검증
    const v = assertSignupInputs();
    if (!v.ok){
      if (v.field === "email") setFieldError(els.signupEmail, suEmailErr, v.msg);
      if (v.field === "pw")    setFieldError(els.signupPw,    suPwErr,    v.msg);
      if (v.field === "pw2")   setFieldError(els.signupPw2,   suPw2Err,   v.msg);
      return;
    }

    // 검증 통과 → verification code 전송
    setBusy(els.signupNextBtn, true, "Sending code…");
    try {
      const res = await postJSON("/auth/send-verification", { email: v.email });
      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        const code = String(out?.error || out?.code || "").toUpperCase();
        let msg = out.message || out.error || "Failed to send verification code.";

        if (code === "DUPLICATE_EMAIL" || code === "EMAIL_ALREADY_EXISTS") {
          msg = "This email is already registered. Please sign in instead.";
        }

        setFieldError(els.signupEmail, suEmailErr, msg);
        setBusy(els.signupNextBtn, false);
        return;
      }

      // 성공 → Step 2로 전환
      setBusy(els.signupNextBtn, false);
      showSignupStep2();
    } catch (e) {
      setFieldError(els.signupEmail, suEmailErr, "Network error. Please try again.");
      setBusy(els.signupNextBtn, false);
    }
  }

  // Find Email 제출
  async function onSubmitFindEmail(e){
    e.preventDefault();
    const name = (els.feName?.value || "").trim();
    const birthdate = (els.feBirthdate?.value || "").trim();

    // 초기화
    if (els.findEmailError) els.findEmailError.textContent = "";
    if (els.findEmailResult) els.findEmailResult.hidden = true;

    if (!name || !birthdate) {
      if (els.findEmailError) {
        els.findEmailError.textContent = "Please fill in all fields.";
      }
      return;
    }
    if (!isValidDate(birthdate)) {
      if (els.findEmailError) {
        els.findEmailError.textContent = "Please enter a valid date in MM/DD/YYYY format.";
      }
      return;
    }

    try {
      const res = await postJSON("/api/find-email", { name, birthdate });
      const out = await res.json().catch(() => ({}));

      if (!res.ok || out?.ok === false) {
        if (els.findEmailError) {
          els.findEmailError.textContent = out?.message || "No account found.";
        }
        return;
      }

      // 성공: 회색 박스에 이메일 표시
      if (els.findEmailValue && out.email) {
        els.findEmailValue.textContent = out.email;
        if (els.findEmailResult) els.findEmailResult.hidden = false;
      }
    } catch {
      if (els.findEmailError) {
        els.findEmailError.textContent = "Network error. Please try again.";
      }
    }
  }

  // Find Password: Send Code
  async function onSendCode(){
    const email = (els.fpEmail?.value || "").trim();
    // 에러 초기화
    if (els.fpErrEmail) {
      els.fpErrEmail.textContent = "";
      els.fpErrEmail.classList.remove("is-on");
    }
    els.fpEmail?.classList.remove("is-invalid");

    if (!EMAIL_RX.test(email)) {
      if (els.fpErrEmail) {
        els.fpErrEmail.textContent = "Please enter a valid email.";
        els.fpErrEmail.classList.add("is-on");
      }
      els.fpEmail?.classList.add("is-invalid");
      return;
    }

    setBusy(els.sendCodeBtn, true, "Sending code…");
    try {
      const res = await postJSON("/api/send-reset-code", { email });
      const out = await res.json().catch(() => ({}));

      if (!res.ok || out?.ok === false) {
        if (els.fpErrEmail) {
          els.fpErrEmail.textContent = out?.message || "Failed to send code.";
          els.fpErrEmail.classList.add("is-on");
        }
        els.fpEmail?.classList.add("is-invalid");
        setBusy(els.sendCodeBtn, false);
        return;
      }

      // 성공: Step 2로 전환
      if (els.resetStep1) els.resetStep1.hidden = true;
      if (els.resetStep2) els.resetStep2.hidden = false;
      setBusy(els.sendCodeBtn, false);
    } catch {
      if (els.fpErrEmail) {
        els.fpErrEmail.textContent = "Network error. Please try again.";
        els.fpErrEmail.classList.add("is-on");
      }
      setBusy(els.sendCodeBtn, false);
    }
  }

  // Find Password: Reset with Code
  async function onSubmitResetPassword(e){
    e.preventDefault();
    const email = (els.fpEmail?.value || "").trim();
    const code = (els.fpCode?.value || "").trim();
    const newPassword = (els.fpNewPw?.value || "").trim();

    if (!code || code.length !== 6) {
      if (els.fpError) {
        els.fpError.textContent = "Please enter the 6-digit code.";
        els.fpError.style.color = "var(--error)";
      }
      return;
    }

    if (newPassword.length < 8) {
      if (els.fpError) {
        els.fpError.textContent = "Password must be at least 8 characters.";
        els.fpError.style.color = "var(--error)";
      }
      return;
    }

    try {
      const res = await postJSON("/api/reset-password", { email, code, newPassword });
      const out = await res.json().catch(() => ({}));

      if (!res.ok || out?.ok === false) {
        if (els.fpError) {
          els.fpError.textContent = out?.message || "Failed to reset password.";
          els.fpError.style.color = "var(--error)";
        }
        return;
      }

      // 성공: 로그인 화면으로
      if (els.fpError) {
        els.fpError.textContent = "Password reset successful! Please sign in.";
        els.fpError.style.color = "#16a34a";
      }
      setTimeout(() => showLoginForm(), 2000);
    } catch {
      if (els.fpError) {
        els.fpError.textContent = "Network error. Please try again.";
        els.fpError.style.color = "var(--error)";
      }
    }
  }

  /* =============================================================
   *  12) INIT
   * ============================================================= */
  async function init(){
    try {
      if (!FORCE_LOGIN && window.auth.isAuthed()) { log("already authed → gotoNext()"); gotoNext(); return; }
    } catch {}

    mountErrorPlaceholders();
    initPasswordUtilities();

    // Form submits (if panels are forms)
    on(els.panelLogin,  "submit", onSubmitLogin);
    on(els.panelSignup, "submit", onSubmitSignup);

    // Clear field-level errors while typing (로그인)
    on(els.loginEmail, "input", () =>
      setFieldError(els.loginEmail, $("#err-email") || ensureErrBelow(els.loginEmail, "err-email"), "")
    );
    on(els.loginPw, "input", () =>
      setFieldError(els.loginPw, $("#err-pw") || ensureErrBelow(els.loginPw, "err-pw"), "")
    );

    // 회원가입 입력 시 필드별 에러 실시간 클리어
    on(els.signupEmail, "input", () => {
      const el = $("#su-err-email") || ensureErrBelow(els.signupEmail, "su-err-email");
      setFieldError(els.signupEmail, el, "");
    });
    on(els.signupPw, "input", () => {
      const el = $("#su-err-pw") || ensureErrBelow(els.signupPw, "su-err-pw");
      setFieldError(els.signupPw, el, "");
    });
    on(els.signupPw2, "input", () => {
      const el = $("#su-err-pw2") || ensureErrBelow(els.signupPw2, "su-err-pw2");
      setFieldError(els.signupPw2, el, "");
    });

    // 2-step signup: Next button (Step 1 → Step 2)
    on(els.signupNextBtn, "click", onSignupNext);

    // 2-step signup: Back button (Step 2 → Step 1)
    on(els.signupBackBtn, "click", () => {
      showSignupStep1();
      showError(els.signupErr, "");
    });

    // Recovery buttons in login form
    on(els.findEmailBtn, "click", (e) => {
      e.preventDefault();
      showFindEmailForm();
    });
    on(els.findPasswordBtn, "click", (e) => {
      e.preventDefault();
      showFindPasswordForm();
    });

    // Back buttons in recovery forms
    on(els.findEmailBackBtn, "click", (e) => {
      e.preventDefault();
      showLoginForm();
    });
    on(els.findPasswordBackBtn, "click", (e) => {
      e.preventDefault();
      showLoginForm();
    });

    // Find Email form submit
    on(els.findEmailForm, "submit", onSubmitFindEmail);

    // Find Password: Send Code button
    on(els.sendCodeBtn, "click", onSendCode);

    // Find Password form submit (reset password with code)
    on(els.findPasswordForm, "submit", onSubmitResetPassword);

    // Ensure signup starts at step 1
    showSignupStep1();

    bindTabDelegation();

    // Debug helpers for console
    window.__loginDbg = {
      async ping(){ return (window.auth?.apiFetch
        ? window.auth.apiFetch("/auth/me", { credentials:"include" })
        : fetch(toAPI("/auth/me"), { credentials:"include" })
      ).then(r => (r.json ? r.json() : r)); },
      async csrf(){ return csrf.ensure(true); },
      gotoNext, activateTab,
      showLoginForm, showFindEmailForm, showFindPasswordForm
    };

    log("init done");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
