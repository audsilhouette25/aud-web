// docs/js/fetch-sanitizer.js
// CORS-safe: plain "csrf-token" → "X-CSRF-Token" 승격 + 크로스사이트 쿠키 동봉
(() => {
  // URL 내 ID 접두사 정리 (예: /api/gallery/g_123 → /api/gallery/123)
  function normalizeIdInUrl(u) {
    try {
      const url = new URL(u, location.href);
      url.pathname = url.pathname
        .replace(/(\/api\/gallery\/)g_([A-Za-z0-9]+)/, "$1$2")
        .replace(/(\/api\/items\/)g_([A-Za-z0-9]+)/, "$1$2");
      return url.toString();
    } catch {
      return u;
    }
  }

  function promote(headersLike) {
    try {
      const H = new Headers(headersLike || {});

      // Add JWT token to Authorization header if available
      const token = localStorage.getItem("auth:token");
      if (token && !H.has("Authorization")) {
        console.log("[DEBUG] Adding JWT to request:", token.substring(0, 20) + "...");
        H.set("Authorization", `Bearer ${token}`);
      } else if (!token) {
        console.log("[DEBUG] No JWT token found in localStorage");
      }

      const v = H.get("csrf-token");
      if (v != null) {
        if (!H.has("X-CSRF-Token") && !H.has("x-csrf-token")) {
          H.set("X-CSRF-Token", v);
        }
        H.delete("csrf-token");
      }
      return H;
    } catch {
      return headersLike;
    }
  }

  // === [추가] API 오리진 리라이트 ===========================================
  // - window.PROD_BACKEND > window.API_BASE > 그대로
  // - /api/... 상대경로만 대상, 절대 URL이나 다른 경로는 건드리지 않음
  function rewriteApiOrigin(u) {                // ⬅ 추가
    try {
      const api = (window.PROD_BACKEND || window.API_BASE || "").trim();
      if (!api) return u;

      const inUrl = new URL(u, location.href);
      const path  = inUrl.pathname.replace(/^\//, "");
      const looksApi = /^(api|auth)\//.test(path); // "/api/..." 와 "/auth/..." 모두 리라이트

      if (!looksApi) return u;

      const base = api.replace(/\/+$/, "");     // 끝 슬래시 제거
      const out  = new URL(base, inUrl);        // 오리진만 교체
      out.pathname = inUrl.pathname;
      out.search   = inUrl.search;
      out.hash     = inUrl.hash;
      return out.toString();
    } catch {
      return u;
    }
  }
  // ========================================================================

  // ── fetch 패치
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    init = init || {};

    // URL 정규화 + 오리진 리라이트
    if (typeof input === "string") {
      input = rewriteApiOrigin(normalizeIdInUrl(input));      // ⬅ 추가: 리라이트
    } else if (input instanceof Request) {
      const nu = rewriteApiOrigin(normalizeIdInUrl(input.url)); // ⬅ 추가: 리라이트
      input = new Request(nu, input);
    }

    // 헤더 승격
    if (init.headers) init = { ...init, headers: promote(init.headers) };
    if (input instanceof Request) {
      const ph = promote(input.headers);
      input = new Request(input, { headers: ph });
    }

    // 크로스사이트 쿠키/세션 동봉 + CORS 모드
    if (!init.credentials) init.credentials = "include";
    if (!init.mode) init.mode = "cors";

    return _fetch(input, init);
  };

  // ── XHR 패치
  const X = XMLHttpRequest.prototype;
  const _set = X.setRequestHeader;
  X.setRequestHeader = function(name, value) {
    if (String(name).toLowerCase() === "csrf-token") {
      try { _set.call(this, "X-CSRF-Token", value); } catch {}
      return;
    }
    return _set.call(this, name, value);
  };
})();
