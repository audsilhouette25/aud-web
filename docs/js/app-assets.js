/* =========================
 * /public/js/app-assets.js  (완전 대체)
 * Single Source of Truth for ./asset paths (labels & jibbitz)
 * ========================= */
(function initAppAssets(){
  "use strict";

  // === 1) BASE 경로 한 곳에서만 관리 ===
  const BASE = "./asset/";

  // === 2) 라벨/지빗 목록은 APP_CONFIG/글로벌에서 수집 ===
  const LABELS =
    (window.APP_CONFIG && window.APP_CONFIG.LABELS) ||
    window.ALL_LABELS ||
    [];
  const JIBS =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS ||
    window.JIBS ||
    [];

  // === 3) 라벨/지빗 경로 맵 생성 ===
  const LABEL_MAP = {};
  for (const lb of LABELS) {
    LABEL_MAP[lb] = {
      img:        `${BASE}${lb}.png`,
      imgBlack:   `${BASE}${lb}black.png`,     // e.g. thumpblack.png
      video:      `${BASE}${lb}.mp4`,          // e.g. thump.mp4
      videoBlack: `${BASE}${lb}black.mp4`,     // e.g. thumpblack.mp4
      audio:      `${BASE}${lb}.mp3`,          // e.g. thump.mp3
    };
  }

  const JIB_MAP = {};
  for (const jb of JIBS) {
    JIB_MAP[jb] = {
      img:   `${BASE}${jb}.png`,
      video: `${BASE}${jb}.mp4`,               // e.g. bloom.mp4
    };
  }

  // === 4) SSOT API ===
  function getLabelImg(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.imgBlack : m.img;
  }
  function getLabelVideo(label, opt = {}) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return opt.black ? m.videoBlack : m.video;
  }
  function getLabelAudio(label) {
    const m = LABEL_MAP[label]; if (!m) return "";
    return m.audio;
  }
  function getJibImg(jib)   { return JIB_MAP[jib]?.img   || ""; }
  function getJibVideo(jib) { return JIB_MAP[jib]?.video || ""; }

  // why: <img>에 안전 폴백(검정/오렌지 이미지 자동 전환)
  function attachLabelImg(imgEl, label, opt = { prefer: "colorImage" }) {
    if (!imgEl || !label) return;
    const prefer = String(opt.prefer || "colorImage");
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

  // gallery는 현재 코드가 video만 붙이므로, 블랙도 video로 통일(오렌지 비디오 재사용)
  function mapForGallery(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = {
        // 등록: 오렌지 비디오
        orange: getLabelVideo(lb, { black:false }),
        // 미등록: 블랙 이미지를 사용
        black:  getLabelVideo(lb, { black:true }),
      };
    }
    return ICONS;
    }

  // mine는 오렌지=video, 블랙=image (createMedia가 둘 다 처리)
  function mapForMine(){
    const ICONS = {};
    for (const lb of LABELS) {
      ICONS[lb] = { orange: getLabelVideo(lb, { black:false }), black: getLabelImg(lb, { black:true }) };
    }
    const JMAP = {};
    for (const jb of JIBS) JMAP[jb] = getJibVideo(jb);
    return { ICONS, JIBS: JMAP };
  }

  // === 5) 홈 랜덤 이미지 ===
  const HOME_RANDOMS = [
    `${BASE}black-01.png`,
    `${BASE}black-02.png`,
    `${BASE}black-03.png`,
    `${BASE}black-04.png`,
    `${BASE}black-05.png`,
    `${BASE}black-06.png`,
  ];
  function getHomeRandomImages() { return HOME_RANDOMS.slice(); }

  const api = Object.freeze({
    base: BASE,
    labels: Object.freeze({ ...LABEL_MAP }),
    jibs:   Object.freeze({ ...JIB_MAP }),
    getLabelImg, getLabelVideo, getLabelAudio,
    getJibImg, getJibVideo,
    attachLabelImg,
    mapForGallery, mapForMine,
    getHomeRandomImages,
  });

  try { window.ASSETS = Object.freeze({ ...(window.ASSETS || {}), ...api }); }
  catch { window.ASSETS = api; }

  // ✅ 준비 완료 신호 (필수: gallery.js/mine.js가 대기 중)
  try { window.dispatchEvent(new Event("ASSETS:ready")); } catch {}
})();
