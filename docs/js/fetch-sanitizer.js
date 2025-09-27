// docs/js/fetch-sanitizer.js
// CORS-safe: plain "csrf-token" → "X-CSRF-Token" 승격 + 크로스사이트 쿠키 동봉
(() => {
  // "Key: Value" 줄들의 문자열을 안전하게 Headers로 변환
  function headersFromString(s) {
    const H = new Headers();
    if (typeof s !== "string") return H;
    s.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^:]+)\s*:\s*(.*)\s*$/);
      if (m) H.append(m[1], m[2]);
    });
    return H;
  }
  // URL 내 ID 접두사 정리 (예: /api/gallery/g_123 → /api/gallery/123)
  function normalizeIdInUrl(u) {
    try {
      const url = new URL(u, location.href);
      url.pathname = url.pathname
        .replace(/(\/api\/gallery\/)g_([A-Za-z0-9]+)/, "$1$2")
        .replace(/(\/api\/items\/)g_([A-Za-z0-9]+)/, "$1$2");
      return url.toString();
    } catch { return u; }
  }

  function promote(headersLike) {
    try {
      const H = (typeof headersLike === "string")
        ? headersFromString(headersLike)
        : new Headers(headersLike || {});
      const v = H.get("csrf-token");
      if (v != null) {
        if (!H.has("X-CSRF-Token") && !H.has("x-csrf-token")) {
          H.set("X-CSRF-Token", v);
        }
        H.delete("csrf-token");
      }
      return H;
    } catch { return new Headers(); }
  }

  // === API 오리진 리라이트 ===========================================
  // - window.PROD_BACKEND > window.API_BASE > 그대로
  // - /api/... 과 /auth/... 상대경로만 대상
  function rewriteApiOrigin(u) {
    try {
      const api = (window.PROD_BACKEND || window.API_BASE || "").trim();
      if (!api) return u;
      const inUrl = new URL(u, location.href);
      const path  = inUrl.pathname.replace(/^\//, "");
      const looksApi = /^(api|auth)\//.test(path);
      if (!looksApi) return u;
      const base = api.replace(/\/+$/, "");
      const out  = new URL(base, inUrl); // 오리진만 교체
      out.pathname = inUrl.pathname; out.search = inUrl.search; out.hash = inUrl.hash;
      return out.toString();
    } catch { return u; }
  }
  // ===================================================================

  const SAFE_METHOD = /^(GET|HEAD|OPTIONS)$/i;
  const _fetch = window.fetch.bind(window);

  // CSRF 토큰 캐시 (5분)
  let __csrf = null, __csrfAt = 0;
  async function fetchCsrf(base) {
    const now = Date.now();
    if (__csrf && (now - __csrfAt) < 5 * 60 * 1000) return __csrf;
    const u = new URL("/auth/csrf", base || location.origin).toString();
    const res = await _fetch(u, { credentials: "include" });
    const j = await res.json().catch(() => ({}));
    __csrf = j.csrfToken || null; __csrfAt = now;
    return __csrf;
  }

  // init+input을 바탕으로 매번 새 Request를 안전하게 구성(재시도 시 바디 재사용 가능)
  function makeRequest(input, init) {
    // URL 정규화 + 오리진 리라이트
    let url, baseForCsrf;
    if (typeof input === "string") {
      const nu = rewriteApiOrigin(normalizeIdInUrl(input));
      url = new URL(nu, location.href).toString();
      baseForCsrf = new URL(url).origin;
    } else if (input instanceof Request) {
      const nu = rewriteApiOrigin(normalizeIdInUrl(input.url));
      url = nu;
      baseForCsrf = new URL(url).origin;
      // init가 없으면 Request의 설정을 복제
      if (!init) init = {
        method: input.method,
        headers: input.headers,
        body: input.method && !SAFE_METHOD.test(input.method) ? input.clone().body : undefined,
        credentials: input.credentials,
        mode: input.mode
      };
    } else {
      url = String(input || "");
      baseForCsrf = new URL(url, location.href).origin;
    }

    // 헤더 승격 + 기본값
    const headers = promote(init?.headers);
    const method  = (init?.method || "GET").toUpperCase();
    const opts = {
      method,
      headers,
      body: init?.body,
      credentials: init?.credentials || "include",
      mode: init?.mode || "cors",
      cache: init?.cache,
      redirect: init?.redirect,
      referrerPolicy: init?.referrerPolicy,
      integrity: init?.integrity,
      keepalive: init?.keepalive,
      signal: init?.signal
    };

    return { url, opts, headers, method, baseForCsrf };
  }

  async function addCsrfIfNeeded(ctx) {
    if (SAFE_METHOD.test(ctx.method)) return;
    // 이미 붙어 있으면 스킵
    if (ctx.headers.has("X-CSRF-Token") || ctx.headers.has("x-csrf-token")) return;
    const tok = await fetchCsrf(ctx.baseForCsrf);
    if (tok) ctx.headers.set("X-CSRF-Token", tok);
  }

  window.fetch = async function(input, init) {
    // 1차 요청 준비
    let ctx = makeRequest(input, init);
    await addCsrfIfNeeded(ctx);

    // 1차 시도
    let res = await _fetch(ctx.url, ctx.opts);

    // 403 → CSRF 갱신 후 1회 재시도
    if (res.status === 403 && !SAFE_METHOD.test(ctx.method)) {
      // 강제 갱신
      __csrf = null;
      // 재구성(바디가 소모됐을 수 있으므로 새 컨텍스트)
      ctx = makeRequest(input, init);
      ctx.headers = promote(ctx.headers); // 새 Headers
      await addCsrfIfNeeded(ctx);         // 새 토큰 부착
      res = await _fetch(ctx.url, ctx.opts);
    }
    return res;
  };

  // ── XHR 패치 (헤더 승격만)
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
