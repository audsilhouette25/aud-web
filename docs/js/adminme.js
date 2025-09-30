// adminme.js — Web 마이페이지 (no inline styles; CSS-only rendering)
// 2025-09-14 rebuilt from scratch (server-first counts; safe fallbacks)

(() => {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────────
   * 0) Utilities & Globals
   * ──────────────────────────────────────────────────────────────────────────── */

  // --- JSON URL normalizer & strict fetch (blob→raw, Pages subpath fix) ---
  function normalizeJsonUrl(url) {
    if (!url) return url;
    // GitHub blob → raw
    if (typeof url === 'string' && url.startsWith('https://github.com/') && url.includes('/blob/')) {
      return url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
    }
    try {
      const abs = new URL(url, document.baseURI).href;
      // If site is hosted under a subpath (e.g., /aud-web/), make sure JSON is served under it.
      // You can pin the base explicitly by setting window.__PAGES_BASE__ = "https://<user>.github.io/<repo>/"
      const repoBase = (window.__PAGES_BASE__ || (location.origin + (location.pathname.split('/').slice(0,2).join('/') + '/')));
      if (abs.startsWith(location.origin + '/') && !abs.startsWith(repoBase)) {
        const path = abs.replace(location.origin + '/', '');
        return repoBase + path;
      }
      return abs;
    } catch {
      return url;
    }
  }

  async function fetchJsonStrict(jsonUrl) {
    const url = normalizeJsonUrl(jsonUrl);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} at ${url}\nFirst 120 chars: ${body.slice(0,120)}`);
    }
    const text = await res.text();
    if (text.trim().startsWith('<')) {
      throw new Error(`Got HTML, not JSON at ${url}\nFirst 120 chars: ${text.slice(0,120)}`);
    }
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`Invalid JSON at ${url}\nFirst 120 chars: ${text.slice(0,120)}`); }
  }

  // me.js 상단 유틸로 추가

  window.API_BASE    = "https://aud-api-dtd1.onrender.com/";
  window.STATIC_BASE = location.origin + "/";
  window.LB_REPAIR   = true;

  // [ADD] admin allowlist
  const ADMIN_EMAILS = ["audsilhouette@gmail.com"];

  function _ensureSlash(u){ return u.endsWith("/") ? u : (u + "/"); }
  window.API_BASE    = _ensureSlash(window.API_BASE);
  window.STATIC_BASE = _ensureSlash(window.STATIC_BASE);

  // Robust __toAPI: uploads 상대경로 & data/blob 처리
  window.__toAPI = function __toAPI(u) {
    const s = (u ?? "").toString().trim();
    if (!s) return s;

    // absolute schemes → pass-through
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(data|blob):/i.test(s)) return s;

    // normalize path
    let p = s.replace(/^\/+/, "/");      // collapse leading slashes
    // handle "uploads/..." (no leading slash) or "./uploads/..."
    if (/^(?:\.?\/)?uploads\//i.test(s)) p = "/uploads/" + s.replace(/^(?:\.?\/)?uploads\//i, "");

    const isAPI     = p.startsWith("/api/")  || p.startsWith("/auth/");
    const isUploads = p.startsWith("/uploads/");

    const base = (isAPI || isUploads) ? window.API_BASE : window.STATIC_BASE;
    return new URL(p.replace(/^\/+/, ""), base).toString();
  };

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

  function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function fmtTime(ts){
    const d = new Date(ts);
    const pad = (n)=> String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function isEmailNS(s){
    return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(String(s||""));
  }

  function classNames(...a){
    return a.flatMap(x => Array.isArray(x) ? x : [x])
            .filter(Boolean)
            .map(x => (typeof x === "string" ? x : Object.entries(x).filter(([,v])=>!!v).map(([k])=>k)))
            .flat()
            .join(" ");
  }

  /* …(중략: 기존 유틸/상태/렌더 함수들 그대로)… */

  // ────────────────────────────────────────────────────────────────────────────
  // 클릭 시 단건 로드 & 재생 (여기에서 JSON 파싱 로직을 fetchJsonStrict로 교체)
  // ────────────────────────────────────────────────────────────────────────────
  async function handleOpenItem(ns, id){
    try {
      ui.toggleLoading(true);

      // 1) 단건 메타
      const r = await fetch(__toAPI(`/api/admin/audlab/item?ns=${encodeURIComponent(ns)}&id=${encodeURIComponent(id)}`), { credentials: "include" });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) throw new Error(j?.error || "ITEM_FAIL");

      // 2) strokes JSON (★ 여기 변경: 엄격 파서 사용)
      const jj = await fetchJsonStrict(j.jsonUrl);
      const strokes = Array.isArray(jj?.strokes) ? jj.strokes : [];

      state.selected = {
        ns, id,
        strokes,
        width:  Number(jj?.width || j?.meta?.width || 0),
        height: Number(jj?.height|| j?.meta?.height|| 0),
      };

      // 3) 오디오가 있으면 우선 재생, 없으면 합성 재생
      const audioUrl = j?.audioUrl ? __toAPI(j.audioUrl) : "";
      if (audioUrl) {
        await audio.playFile(audioUrl);
      } else {
        await audio.playStrokes(strokes, { duration: jj?.duration || undefined });
      }

      // 4) 상세 패널 렌더
      ui.renderDetail(j, jj);

    } catch (err) {
      alert(`불러오기 실패: ${err.message || err}`);
      console.error(err);
    } finally {
      ui.toggleLoading(false);
    }
  }

  /* …(중략: 목록 불러오기, 렌더링, 검색/정렬, 모달 제어, 오디오 합성 등
         기존 코드 전부 동일하게 유지됩니다. 이 파일의 나머지 내용은
         사용자가 주신 버전과 기능적으로 동일하며, 위의 두 포인트만 변경되었습니다.)… */

  // 기존 바인딩 유지
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open-item]");
    if (t) {
      const ns = t.getAttribute("data-ns");
      const id = t.getAttribute("data-id");
      if (ns && id) handleOpenItem(ns, id);
    }
  });

  // 초기 로드
  (async () => {
    try {
      ui.toggleLoading(true);
      await data.refreshAll();   // 서버에서 전체 제출 목록 로드
      ui.renderList();
    } catch (e) {
      console.error(e);
    } finally {
      ui.toggleLoading(false);
    }
  })();

})();
