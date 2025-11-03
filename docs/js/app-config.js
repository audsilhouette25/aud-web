// /public/js/app-config.js
// 단일 소스: 여기만 수정하면 전체 반영됨.
(function initAppConfig(){
  const DEFAULT_LABELS = ["thump","miro","whee","track","echo","portal"];
  const DEFAULT_JIBBITZ = ["bloom","tail","cap","keyring","duck","twinkle","xmas","bunny"];
  const DEFAULT_ADMIN_EMAILS = ["audsilhouette25@gmail.com"];

  // why: 오타/빈 배열 방지
  function sanitizeStringArray(arr, fallback){
    if (!Array.isArray(arr)) return fallback.slice();
    const out = [];
    for (const v of arr) {
      const s = String(v || "").trim();
      if (s) out.push(s);
    }
    return out.length ? out : fallback.slice();
  }

  const cfg = (function(){
    const w = (typeof window !== "undefined") ? window : {};
    // 이미 다른 스크립트에서 구성해둔 경우(서버 주입 등) 병합 보존
    const pre = (w.APP_CONFIG && typeof w.APP_CONFIG === "object") ? w.APP_CONFIG : {};
    const labels  = sanitizeStringArray(pre.LABELS,  DEFAULT_LABELS);
    const jibbitz = sanitizeStringArray(pre.JIBBITZ, DEFAULT_JIBBITZ);
    const adminEmails = sanitizeStringArray(pre.ADMIN_EMAILS, DEFAULT_ADMIN_EMAILS);
    return { LABELS: labels, JIBBITZ: jibbitz, ADMIN_EMAILS: adminEmails };
  })();

  // 전역 노출(SSOT)
  try { window.APP_CONFIG = cfg; } catch {}

  // 유틸(앱 전역 공용)
  try {
    window.isLabel   = (x) => typeof x === "string" && cfg.LABELS.includes(x);
    window.isJibKind = (x) => typeof x === "string" && cfg.JIBBITZ.includes(x);
  } catch {}

  // 선택: 레거시 alias 제공(기존 코드 호환)
  try {
    window.ALL_LABELS = cfg.LABELS;
    window.ALL_JIBS   = cfg.JIBBITZ;
    window.ADMIN_EMAILS = cfg.ADMIN_EMAILS;
  } catch {}
})();
