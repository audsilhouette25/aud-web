// /public/js/app-assets.js
// Single Source of Truth for ./asset paths (labels & jibbitz)
(function initAppAssets(){
  "use strict";

  const BASE = "./asset/"; // 변경은 여기 한 곳

  const LABELS =
    (window.APP_CONFIG && window.APP_CONFIG.LABELS) ||
    window.ALL_LABELS ||
    [];

  const JIBS =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS ||
    window.JIBS ||
    [];

  const LABEL_MAP = {};
  for (const lb of LABELS) {
    LABEL_MAP[lb] = {
      img:        `${BASE}${lb}.png`,
      imgBlack:   `${BASE}${lb}black.png`,
      video:      `${BASE}${lb}video.mp4`,
      videoBlack: `${BASE}black${lb}.mp4`,
    };
  }

  const JIB_MAP = {};
  for (const jb of JIBS) {
    JIB_MAP[jb] = {
      img:   `${BASE}${jb}.png`,
      video: `${BASE}${jb}video.mp4`,
    };
  }

  function getLabelImg(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.imgBlack : m.img;
  }
  function getLabelVideo(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.videoBlack : m.video;
  }
  function getJibImg(jib) {
    const m = JIB_MAP[jib]; return m ? m.img : "";
  }
  function getJibVideo(jib) {
    const m = JIB_MAP[jib]; return m ? m.video : "";
  }

  // why: 각 페이지에서 폴백/이벤트 처리 중복 방지
  function attachLabelImg(imgEl, label, opt = { prefer: "blackImage" }) {
    if (!imgEl || !label) return;
    const prefer = String(opt.prefer || "blackImage");
    const first  = (prefer === "blackImage") ? getLabelImg(label, { black:true }) : getLabelImg(label, { black:false });
    const alt    = (prefer === "blackImage") ? getLabelImg(label, { black:false }) : getLabelImg(label, { black:true });
    imgEl.src = first;
    const onerr = () => {
      if (imgEl.dataset.fallbackTried === "1") return;
      imgEl.dataset.fallbackTried = "1";
      imgEl.src = alt || "";
      imgEl.removeEventListener("error", onerr);
    };
    imgEl.addEventListener("error", onerr);
  }

  function mapForGallery(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = { orange: getLabelVideo(lb, { black:false }), black: getLabelVideo(lb, { black:true }) };
    }
    return ICONS;
  }
  function mapForMine(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = { orange: getLabelVideo(lb, { black:false }), black: getLabelImg(lb, { black:true }) };
    }
    const JMAP = {};
    for (const jb of JIBS) JMAP[jb] = getJibVideo(jb);
    return { ICONS, JIBS: JMAP };
  }

  const api = Object.freeze({
    base: BASE,
    labels: Object.freeze({ ...LABEL_MAP }),
    jibs:   Object.freeze({ ...JIB_MAP }),
    getLabelImg, getLabelVideo,
    getJibImg, getJibVideo,
    attachLabelImg,
    mapForGallery, mapForMine,
  });

  try { window.ASSETS = Object.freeze({ ...(window.ASSETS || {}), ...api }); }
  catch { window.ASSETS = api; }
})();