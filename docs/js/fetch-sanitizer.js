// docs/js/fetch-sanitizer.js
// CORS-safe: plain "csrf-token" â†’ "X-CSRF-Token" ìŠ¹ê²© + í¬ë¡œìŠ¤ì‚¬ì´íŠ¸ ì¿ í‚¤ ë™ë´‰
(() => {
  // URL ë‚´ ID ì ‘ë‘ì‚¬ ì •ë¦¬ (ì˜ˆ: /api/gallery/g_123 â†’ /api/gallery/123)
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

  // === [ì¶”ê°€] API ì˜¤ë¦¬ì§„ ë¦¬ë¼ì´íŠ¸ ===========================================
  // - window.PROD_BACKEND > window.API_BASE > ê·¸ëŒ€ë¡œ
  // - /api/... ìƒëŒ€ê²½ë¡œë§Œ ëŒ€ìƒ, ì ˆëŒ€ URLì´ë‚˜ ë‹¤ë¥¸ ê²½ë¡œëŠ” ê±´ë“œë¦¬ì§€ ì•ŠìŒ
  function rewriteApiOrigin(u) {                // â¬… ì¶”ê°€
    try {
      const api = (window.PROD_BACKEND || window.API_BASE || "").trim();
      if (!api) return u;

      const inUrl = new URL(u, location.href);
      const path  = inUrl.pathname.replace(/^\//, "");
      const looksApi = /^(api|auth)\//.test(path); // "/api/..." ì™€ "/auth/..." ëª¨ë‘ ë¦¬ë¼ì´íŠ¸

      if (!looksApi) return u;

      const base = api.replace(/\/+$/, "");     // ë ìŠ¬ëž˜ì‹œ ì œê±°
      const out  = new URL(base, inUrl);        // ì˜¤ë¦¬ì§„ë§Œ êµì²´
      out.pathname = inUrl.pathname;
      out.search   = inUrl.search;
      out.hash     = inUrl.hash;
      return out.toString();
    } catch {
      return u;
    }
  }
  // ========================================================================

  // â”€â”€ fetch íŒ¨ì¹˜
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    init = init || {};

    // URL ì •ê·œí™” + ì˜¤ë¦¬ì§„ ë¦¬ë¼ì´íŠ¸
    if (typeof input === "string") {
      input = rewriteApiOrigin(normalizeIdInUrl(input));      // â¬… ì¶”ê°€: ë¦¬ë¼ì´íŠ¸
    } else if (input instanceof Request) {
      const nu = rewriteApiOrigin(normalizeIdInUrl(input.url)); // â¬… ì¶”ê°€: ë¦¬ë¼ì´íŠ¸
      input = new Request(nu, input);
    }

    // í—¤ë” ìŠ¹ê²©
    if (init.headers) init = { ...init, headers: promote(init.headers) };
    if (input instanceof Request) {
      const ph = promote(input.headers);
      input = new Request(input, { headers: ph });
    }

    // í¬ë¡œìŠ¤ì‚¬ì´íŠ¸ ì¿ í‚¤/ì„¸ì…˜ ë™ë´‰ + CORS ëª¨ë“œ
    if (!init.credentials) init.credentials = "include";
    if (!init.mode) init.mode = "cors";

    return _fetch(input, init);
  };

  // â”€â”€ XHR íŒ¨ì¹˜
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