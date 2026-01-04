// /js/gallery.js (수정본: 안전한 ASSETS 대기 + 아이콘 지연 로딩)
(() => {
  // ====== 설정 ======
  const LABELS = (window.APP_CONFIG && window.APP_CONFIG.LABELS) || window.ALL_LABELS;
  if (!Array.isArray(LABELS) || !LABELS.length) throw new Error("APP_CONFIG.LABELS missing");
  const SELECTED_KEY = "aud:selectedLabel";
  const MIRROR_KEY   = "aud:selectedLabel:mirror"; 
  const LABEL_SYNC_KEY = (window.LABEL_SYNC_KEY || "label:sync"); 
  const ROUTE_ON_REGISTERED   = "./label.html";
  const ROUTE_ON_UNREGISTERED = "./aud.html";

  const LABEL_COLLECTED_EVT = window.LABEL_COLLECTED_EVT || "collectedLabels:changed";

  // ====== ASSETS 준비 대기/지연 로딩 ======
  // why: ASSETS가 아직 로드/초기화 되지 않았을 수 있음
  function waitForAssets(fn) {
    if (window.ASSETS) return fn();
    window.addEventListener("ASSETS:ready", fn, { once: true });
  }
  let ICONS = null;
  function getIcons() {
    if (!ICONS) {
      if (!window.ASSETS || typeof window.ASSETS.mapForGallery !== "function") return {};
      ICONS = window.ASSETS.mapForGallery();
    }
    return ICONS;
  }
  
  // ====== 헬퍼 ======
  function setSelectedLabel(label){
    if (!LABELS.includes(label)) return;
    try{
      sessionStorage.setItem(SELECTED_KEY, label);
      window.dispatchEvent(new Event("aud:selectedLabel-changed"));
      if (isAuthed()) {
        localStorage.setItem(MIRROR_KEY, JSON.stringify({ label, t: Date.now() }));
      } else {
        try { localStorage.removeItem(MIRROR_KEY); } catch {}
      }
    }catch{}
  }

  function gotoPage(label, isRegistered){
    const url = new URL(isRegistered ? ROUTE_ON_REGISTERED : ROUTE_ON_UNREGISTERED, location.href);
    url.searchParams.set("label", label);
    try { window.auth?.markNavigate?.(); } catch {}
    location.assign(url.toString());
  }

  function isAuthed() {
    try {
      return !!(window.auth?.isAuthed?.() || window.auth?.state?.authed);
    } catch { return false; }
  }

  // ====== 관리자 확인 (빠른 경로) ======
  function isAdmin() {
    try {
      // 1) 전역 캐시
      if (typeof window.__IS_ADMIN === "boolean") return window.__IS_ADMIN;
      // 2) sessionStorage 캐시
      try { if (sessionStorage.getItem("auth:isAdmin") === "1") return true; } catch {}
      // 3) localStorage userns + ADMIN_EMAILS 비교 (서버 응답 불필요)
      try {
        const storedNs = (localStorage.getItem("auth:userns") || "").toLowerCase();
        const allow = Array.isArray(window.ADMIN_EMAILS) ? window.ADMIN_EMAILS
                     : Array.isArray(window.ADMIN_ALLOWLIST) ? window.ADMIN_ALLOWLIST
                     : [];
        if (storedNs && allow.map(s => String(s).trim().toLowerCase()).includes(storedNs)) {
          return true;
        }
      } catch {}
      // 4) auth API 확인
      const a = window.auth || {};
      if (typeof a.isAdmin === "function" && a.isAdmin()) return true;
      if (a.isAdmin === true) return true;
      return false;
    } catch { return false; }
  }

  // ====== 비디오 생성 공통 함수 (lazy loading + 포스터 이미지로 깜빡임 방지) ======
  let observer = null; // 싱글톤 observer 재사용

  function createVideo(src, speed = 1, posterSrc = "") {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none"; // lazy loading: 처음엔 로드 안함
    video.style.width = "190%";
    video.style.height = "190%";
    video.style.objectFit = "contain";
    video.dataset.src = src; // 실제 src는 나중에 설정
    video.dataset.speed = speed;
    video.dataset.loaded = "false"; // 로드 상태 추적

    // 포스터 이미지 설정 (비디오 로드 전 깜빡임 방지)
    if (posterSrc) {
      video.poster = posterSrc;
    }

    // IntersectionObserver로 화면에 보일 때만 로드
    if ("IntersectionObserver" in window) {
      // 싱글톤 observer 생성 (모든 비디오에 재사용)
      if (!observer) {
        observer = new IntersectionObserver(entries => {
          for (const ent of entries) {
            const v = ent.target;
            if (ent.isIntersecting) {
              // 아직 로드 안됐으면 로드
              if (v.dataset.loaded === "false") {
                v.dataset.loaded = "true";
                const source = document.createElement("source");
                source.src = v.dataset.src;
                source.type = "video/mp4";
                v.appendChild(source);
                v.playbackRate = parseFloat(v.dataset.speed) || 1;
                v.load();
              }
              // 재생
              v.play().catch(()=>{});
            } else {
              // 화면 밖으로 나가면 일시정지 (메모리 절약)
              v.pause();
            }
          }
        }, { threshold: 0.1, rootMargin: "100px" }); // 100px 전에 미리 로드 시작 (더 부드러운 경험)
      }
      observer.observe(video);
    } else {
      // fallback: IntersectionObserver 없으면 바로 로드
      const source = document.createElement("source");
      source.src = src;
      source.type = "video/mp4";
      video.appendChild(source);
      video.playbackRate = speed;
      video.play().catch(()=>{});
    }
    return video;
  }

  // ====== 타일 생성 ======
  function makeTile(label, isOn){
    // ★ 관리자는 항상 컬러(orange) 영상을 보여줌
    const effectiveOn = isAdmin() || isOn;

    const el = document.createElement("button");
    el.type = "button";
    el.className = `tile ${effectiveOn ? "registered" : "unregistered"}`;
    el.setAttribute("role","listitem");
    el.setAttribute("aria-label", label);
    el.setAttribute("aria-pressed", String(effectiveOn));
    el.style.backgroundColor = "#F5F5F5";

    const wrap = document.createElement("div");
    wrap.className = "tile__content";

    const iconMap = getIcons();
    const icon = iconMap[label];
    const src = icon ? (effectiveOn ? icon.orange : icon.black) : "";

    if (src && src.endsWith(".mp4")) {
      // 포스터 이미지: 비디오와 같은 이름의 PNG 파일 사용
      const posterSrc = src.replace('.mp4', '.png');
      wrap.appendChild(createVideo(src, 0.6, posterSrc));
    }

    el.appendChild(wrap);

    el.addEventListener("click", ()=>{
      setSelectedLabel(label);
      const isReg = typeof window.store?.isCollected === "function"
        ? window.store.isCollected(label)
        : Array.isArray(window.store?.registered) && window.store.registered.includes(label);
      gotoPage(label, !!isReg);
    });

    return el;
  }

  // ====== 렌더링 ======
  let gridShown = false;
  function showGrid() {
    if (gridShown) return;
    gridShown = true;
    const grid = document.querySelector(".gallery-grid");
    if (grid) grid.style.opacity = "1";
  }

  function renderGrid(){
    const grid = document.querySelector(".gallery-grid");
    if(!grid) return;
    grid.innerHTML = "";

    // 1) 우선 store 우선
    let collected = [];
    if (typeof window.store?.getCollected === "function") {
      collected = window.store.getCollected() || [];
    } else if (Array.isArray(window.store?.registered)) {
      collected = window.store.registered || [];
    }

    // 2) 게스트 fallback: collectedLabels:<ns> (session + local) 병합
    try {
      const ns = (window.__STORE_NS || "default").toLowerCase();
      const KEY_COL = `collectedLabels:${ns}`;
      const gSess = JSON.parse(sessionStorage.getItem(KEY_COL) || "[]");
      const gLoc  = JSON.parse(localStorage.getItem(KEY_COL)    || "[]");
      const merged = Array.from(new Set([...(collected||[]), ...(Array.isArray(gSess)?gSess:[]), ...(Array.isArray(gLoc)?gLoc:[])]));
      collected = merged;
    } catch {}

    const regSet = new Set(collected);
    // DocumentFragment로 배치 DOM 업데이트 (reflow 최소화)
    const frag = document.createDocumentFragment();
    LABELS.forEach(label => frag.appendChild(makeTile(label, regSet.has(label))));
    grid.appendChild(frag);

    // 그리드 표시
    showGrid();
  }
  window.renderGrid = renderGrid;

  // ====== 이벤트 바인딩 ======
  function bindStoreEvents(){
    window.addEventListener(LABEL_COLLECTED_EVT, renderGrid);
    window.addEventListener("label:collected-changed", renderGrid);

    document.addEventListener("visibilitychange", ()=>{ 
      if(document.visibilityState==="visible") renderGrid(); 
    });

    window.addEventListener("storage", (e)=>{
      if (e.key === MIRROR_KEY && e.newValue) {
        if (!isAuthed()) return;
        try{
          const payload = JSON.parse(e.newValue || "null");
          if (payload?.label && LABELS.includes(payload.label)) {
            sessionStorage.setItem(SELECTED_KEY, payload.label);
            window.dispatchEvent(new Event("aud:selectedLabel-changed"));
          }
        }catch{}
      }

      if (e.key === LABEL_SYNC_KEY && e.newValue) {
        try {
          const { arr } = JSON.parse(e.newValue);
          if (Array.isArray(arr)) {
            const filtered = arr.filter(l => LABELS.includes(l));
            sessionStorage.setItem("collectedLabels", JSON.stringify(filtered));
            window.dispatchEvent(new Event(LABEL_COLLECTED_EVT));
          }
        } catch {}
      }
    });
  }

  // ====== Hero 애니메이션 ======
  function heroIn() {
    const hero = document.querySelector(".gallery .hero");
    if (!hero) return;
    requestAnimationFrame(() => {
      setTimeout(() => hero.classList.add("is-in"), 0);
    });
  }

  // ====== Bootstrap ======
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    try {
      const q = new URLSearchParams(location.search);
      const label = q.get("label");
      if (label && LABELS.includes(label)) setSelectedLabel(label);
    } catch {}

    // ASSETS 준비 후에만 렌더/바인딩
    waitForAssets(() => {
      renderGrid();
      bindStoreEvents();
    });
    heroIn();
  });
})();

// 렌더러가 makeTile/renderGrid 형태라면, 부트 코드 끝에:
(function bindGalleryRefresh(){
  if (window.__galleryBound) return; window.__galleryBound = true;

  const rerender = ()=> { try { renderGrid(); } catch {} };

  window.addEventListener("auth:state", rerender);
  window.addEventListener("storage", (e)=> {
    if (e?.key === (window.LABEL_SYNC_KEY || "label:sync")) rerender();
  });
  window.addEventListener(window.LABEL_COLLECTED_EVT || "collectedLabels:changed", rerender);
})();
