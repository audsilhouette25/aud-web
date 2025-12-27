// /public/js/custom.js (전체 대체본)
// JS가 SSOT(ASSETS)로 비디오 타일을 렌더링
(function () {
  "use strict";

  const DEST_URL = "./jibbitz.html";
  // why: 현재 파일에 JIBS 폴백이 window.JIBS_JIBS로 잘못되어 있었음 → 표준 폴백으로 수정. :contentReference[oaicite:2]{index=2}
  const JIBS =
    (window.APP_CONFIG && window.APP_CONFIG.JIBBITZ) ||
    window.ALL_JIBS ||
    window.JIBS ||
    [];

  if (!Array.isArray(JIBS) || !JIBS.length) {
    throw new Error("APP_CONFIG.JIBBITZ missing");
  }

  const isKind = (v) => typeof v === "string" && JIBS.includes(v);

  // why: 사용자/네임스페이스별 동기화 보존
  function isAuthed() {
    try { return !!(window.auth?.isAuthed?.()) || sessionStorage.getItem("auth:flag") === "1"; }
    catch { return false; }
  }
  function currentNS() {
    if (!isAuthed()) return "default";
    try {
      const ns = (localStorage.getItem("auth:userns") || "").trim().toLowerCase();
      return ns || "default";
    } catch { return "default"; }
  }
  function plane() { return currentNS() === "default" ? sessionStorage : localStorage; }
  const KEY_SELECTED = () => `jib:selected:${currentNS()}`;

  function setSelected(kind){
    if (window.jib?.setSelected) { window.jib.setSelected(kind); return; }
    try {
      plane().setItem(KEY_SELECTED(), kind);
      window.dispatchEvent(new Event("jib:selected-changed"));
      const SYNC = `jib:sync:${currentNS()}`;
      localStorage.setItem(SYNC, JSON.stringify({ type:"select", k:kind, t:Date.now() }));
      try { new BroadcastChannel(`aud:sync:${currentNS()}`).postMessage({ kind:"jib:sync", payload:{ type:"select", k:kind, t:Date.now() } }); } catch {}
    } catch {}
  }

  function mkTile(kind) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', kind);

    const wrap = document.createElement('div');
    wrap.className = 'tile__content';

    const video = document.createElement('video');
    video.muted = true; video.loop = true; video.playsInline = true;
    video.preload = 'none'; // lazy loading: 처음엔 로드 안함
    video.dataset.src = window.ASSETS?.getJibVideo?.(kind) || "";

    // 실패 시 텍스트 폴백
    video.addEventListener('error', () => {
      if (!btn.querySelector('.fallback')) {
        const fb = document.createElement('span');
        fb.className = 'fallback';
        fb.textContent = kind;
        wrap.appendChild(fb);
      }
    }, { once: true });

    // IntersectionObserver로 화면에 보일 때만 로드
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(entries => {
        for (const ent of entries) {
          const v = ent.target;
          if (ent.isIntersecting) {
            // 아직 로드 안됐으면 로드
            if (!v.querySelector("source")) {
              const src = document.createElement('source');
              src.type = 'video/mp4';
              src.src = v.dataset.src;
              v.appendChild(src);
              v.load();
            }
            v.play().catch(()=>{});
          } else {
            v.pause();
          }
        }
      }, { threshold: 0.1, rootMargin: "50px" });
      io.observe(video);
    } else {
      // fallback: IntersectionObserver 없으면 바로 로드
      const src = document.createElement('source');
      src.type = 'video/mp4';
      src.src = video.dataset.src;
      video.appendChild(src);
      video.play().catch(()=>{});
    }

    wrap.appendChild(video);
    btn.appendChild(wrap);

    btn.addEventListener('click', () => {
      if (!isKind(kind)) return;
      setSelected(kind);
      btn.style.pointerEvents = 'none';
      window.auth?.markNavigate?.();
      window.location.href = `${DEST_URL}?jib=${encodeURIComponent(kind)}`;
    }, { passive: true });

    return btn;
  }

  let gridShown = false;
  function showGrid() {
    if (gridShown) return;
    gridShown = true;
    const container = document.getElementById('custom-jib-list') ||
      document.querySelector('.custom .custom-grid');
    if (container) container.style.opacity = "1";
  }

  function renderTiles() {
    const container =
      document.getElementById('custom-jib-list') ||
      document.querySelector('.custom .custom-grid') ||
      document.querySelector('.custom [role="list"]');

    if (!container) return;

    // 기존 수동 타일 제거(HTML에서 ./asset를 뺐기 때문에 비어있게 유지하는 게 목표)
    container.innerHTML = "";

    // DocumentFragment로 배치 DOM 업데이트 (reflow 최소화)
    const frag = document.createDocumentFragment();
    JIBS.forEach(kind => frag.appendChild(mkTile(kind)));
    container.appendChild(frag);

    // 그리드 표시
    showGrid();
  }

  function heroIn() {
    const hero = document.querySelector(".custom .hero");
    if (!hero) return;
    requestAnimationFrame(() => setTimeout(() => hero.classList.add("is-in"), 0));
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => { renderTiles(); heroIn(); });
})();
