// docs/js/fetch-sanitizer.js
(() => {
  // 문자열 → Headers
  function headersFromString(s) {
    const H = new Headers();
    if (typeof s !== "string") return H;
    s.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^:]+)\s*:\s*(.*)\s*$/);
      if (m) H.append(m[1], m[2]);
    });
    return H;
  }

  // g_ 접두사 정리
  function normalizeIdInUrl(u) {
    try {
      const url = new URL(u, location.href);
      url.pathname = url.pathname
        .replace(/(\/api\/gallery\/)g_([A-Za-z0-9]+)/, "$1$2")
        .replace(/(\/api\/items\/)g_([A-Za-z0-9]+)/, "$1$2");
      return url.toString();
    } catch { return u; }
  }

  // "csrf-token" → "X-CSRF-Token"
  function promote(headersLike) {
    try {
      const H = (typeof headersLike === "string")
        ? headersFromString(headersLike)
        : new Headers(headersLike || {});
      const v = H.get("csrf-token");
      if (v != null) {
        if (!H.has("X-CSRF-Token") && !H.has("x-csrf-token")) H.set("X-CSRF-Token", v);
        H.delete("csrf-token");
      }
      return H;
    } catch { return new Headers(); }
  }

  // ⬇⬇⬇ 핵심 수정: "상대 경로 /api|/auth" 만 API_ORIGIN으로 교체
  function rewriteApiOrigin(u) {
    try {
      const apiBase = (window.PROD_BACKEND || window.API_BASE || "").trim();
      if (!apiBase) return u;

      const inUrl  = new URL(u, location.href);
      const apiUrl = new URL(apiBase, location.href);

      // 절대 URL인데 이미 API 오리진이면 그대로
      if (inUrl.origin === apiUrl.origin) return inUrl.toString();

      // 상대경로 또는 현재 오리진으로 향하는 /api|/auth 만 리라이트
      const path = inUrl.pathname.replace(/^\//, "");
      if (!/^(api|auth)\//.test(path)) return u;

      return new URL(inUrl.pathname + inUrl.search + inUrl.hash, apiUrl).toString();
    } catch { return u; }
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    init = init || {};

    // URL 정규화 + 리라이트 (문자열/Request 모두)
    if (typeof input === "string") {
      input = rewriteApiOrigin(normalizeIdInUrl(input));
    } else if (input instanceof Request) {
      const nu = rewriteApiOrigin(normalizeIdInUrl(input.url));
      // ⚠ Request 복제 시 사파리/크로미움 크로스-쿠키 이슈 회피: init에만 헤더/옵션을 합칩니다.
      if (nu !== input.url) input = new Request(nu, { method: input.method, headers: input.headers, body: input.body, mode: input.mode, credentials: input.credentials, cache: input.cache, redirect: input.redirect, referrer: input.referrer, integrity: input.integrity, keepalive: input.keepalive, signal: input.signal });
    }

    // 헤더 승격
    if (init.headers) init.headers = promote(init.headers);
    if (input instanceof Request) {
      // 기존 Request 헤더 + init 헤더 병합
      const merged = new Headers(input.headers);
      const add = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
      add.forEach((v, k) => merged.set(k, v));
      init.headers = merged;
    }

    // ✅ 쿠키/세션 항상 동봉 + CORS
    if (!init.credentials) init.credentials = "include";
    if (!init.mode) init.mode = "cors";

    return _fetch(input, init);
  };

  // XHR도 헤더 승격
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
