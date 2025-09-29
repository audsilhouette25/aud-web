// /js/label-meta.js
// Single Source of Truth for label meta (category & stars)
(function initLabelMeta(){
  "use strict";

  // 현재 쓰이는 기본 맵(필요 시 여기만 수정)
  const DEFAULT = {
    miro:   { category: "play", stars: 3 },
    whee:   { category: "asmr", stars: 1 },
    thump:  { category: "asmr", stars: 1 },
    track:  { category: "play", stars: 2 },
    echo:   { category: "asmr", stars: 2 },
    portal: { category: "play", stars: 2 },
  };

  // 라벨 목록(SSOT) 기준으로만 허용
  const LABELS = (window.APP_CONFIG && window.APP_CONFIG.LABELS) || window.ALL_LABELS || [];
  const CLEAN = {};
  const allowAll = !Array.isArray(LABELS) || LABELS.length === 0;
  Object.keys(DEFAULT).forEach((k) => {
    if (allowAll || LABELS.includes(k)) CLEAN[k] = { ...DEFAULT[k] };
  });

  const MAX_STARS = 3;

  const API = Object.freeze({
    MAX_STARS,
    get(label){
      const key = String(label || "").trim().toLowerCase();
      // 알 수 없는 라벨은 안전한 기본값으로
      return CLEAN[key] || { category: "play", stars: 0 };
    },
    all(){ return { ...CLEAN }; }
  });

  try { window.LABEL_META = API; } catch { /* no-op */ }
})();
