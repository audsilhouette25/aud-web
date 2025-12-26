// /public/js/logo-guard.js — logo click routing (2025-12)
(() => {
  "use strict";

  const AUTH_FLAG_KEY = "auth:flag";

  const SELECTOR_LIST = [
    "#site-logo", "#logo",
    ".logo", ".logo a",
    ".logo-cta", ".logo-cta a",
    'a[rel="home"]', '[data-role="logo"]',
    "header.nav .logo-cta a"
  ];
  const SELECTOR = SELECTOR_LIST.join(", ");

  const absURL = (rel) => {
    try { return new URL(rel, location.href).toString(); }
    catch { return rel; }
  };

  // 로고 클릭 시 이동할 경로 계산
  function computeLogoDest() {
    const me = absURL("me.html");
    const login = absURL("login.html");

    // ★ 핵심: localStorage의 auth:flag로 인증 상태 판단
    const authApi = window.auth?.isAuthed?.();
    const lsFlag = localStorage.getItem(AUTH_FLAG_KEY) === "1";
    const authed = !!(authApi || lsFlag);

    if (authed) {
      return me; // admin이든 일반 유저든 항상 me.html로 이동
    }

    const u = new URL(login);
    u.searchParams.set("next", me);
    return u.toString();
  }

  function attachClickGuard(a) {
    if (!a || a.dataset.logoGuard === "1") return;
    a.dataset.logoGuard = "1";

    a.setAttribute("target", "_self");

    // 비-앵커 요소 지원
    if (a.tagName !== "A") {
      a.setAttribute("role", "link");
      if (!a.hasAttribute("tabindex")) a.tabIndex = 0;
      a.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); a.click(); }
      }, { capture: true });
    }

    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();

      try { window.auth?.markNavigate?.(); } catch {}
      location.assign(computeLogoDest());
    }, { capture: true });
  }

  function updateLogoHref() {
    const links = document.querySelectorAll(SELECTOR);
    if (!links.length) return;
    const dest = computeLogoDest();
    links.forEach((a) => {
      if (a.getAttribute("href") !== dest) a.setAttribute("href", dest);
      attachClickGuard(a);
    });
  }

  function observeLogoContainer() {
    try {
      const mo = new MutationObserver(updateLogoHref);
      mo.observe(document.body, { subtree: true, childList: true });
      window.addEventListener("pagehide", () => { try { mo.disconnect(); } catch {} }, { once: true });
    } catch {}
  }

  // Boot
  function boot() { updateLogoHref(); observeLogoContainer(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // 이벤트 리스너
  window.addEventListener("auth:state", updateLogoHref, { passive: true });
  window.addEventListener("auth:logout", updateLogoHref, { passive: true });
  window.addEventListener("storage", (ev) => {
    if (ev.key === AUTH_FLAG_KEY) updateLogoHref();
  }, { passive: true });

  try { window.dispatchEvent(new Event("logo-guard:ready")); } catch {}
})();
