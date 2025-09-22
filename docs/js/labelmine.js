/* ==========================================================================
 * labelmine.js — avatar normalization v2 (2025-09-22)
 * - Force <img class="avatar"> usage (no background-image avatars)
 * - Fix labelmine avatar not rendering
 * - Keep scale identical via object-fit: cover inside circular mask
 * - Auto-heal future DOM mutations
 * ========================================================================== */

(() => {
  "use strict";

  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[labelmine]", ...a);

  /* SVG initials fallback */
  function svgAvatar(name = "member"){
    const initials = String(name).trim().split(/\s+/).map(s => s[0]?.toUpperCase() || "").join("").slice(0,2) || "U";
    let hash = 0;
    for (let i=0; i<name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const bg  = `hsl(${hue} 55% 85%)`;
    const fg  = `hsl(${hue} 40% 30%)`;
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
         <defs><clipPath id='r'><circle cx='32' cy='32' r='32'/></clipPath></defs>
         <g clip-path='url(#r)'>
           <rect width='64' height='64' fill='${bg}'/>
           <text x='50%' y='54%' text-anchor='middle'
             font-family='system-ui, -apple-system, Segoe UI, Roboto'
             font-size='28' font-weight='700' fill='${fg}'>${initials}</text>
         </g>
       </svg>`
    );
    return `data:image/svg+xml;charset=utf-8,${svg}`;
  }

  /* API resolver */
  const toAPI = (p) => {
    try { if (typeof window.toAPI === "function") return window.toAPI(p); } catch {}
    try { return new URL(p, location.origin).toString(); } catch { return String(p || ""); }
  };

  /* me/profile */
  async function getMe(){
    try {
      if (window.auth?.getUser) return await window.auth.getUser();
    } catch {}
    return {
      id: null,
      displayName: localStorage.getItem("me:displayName") || "member",
      avatarUrl: localStorage.getItem("me:avatarUrl") || ""
    };
  }

  /* cache-busting rev */
  function readProfileRev(){
    try {
      const ns = (localStorage.getItem("auth:userns") || "default").trim().toLowerCase();
      const snap = JSON.parse(sessionStorage.getItem(`me:profile:${ns}`)
        || localStorage.getItem(`me:profile:${ns}`) || "null") || {};
      const rev = Number(snap.rev ?? snap.updatedAt ?? snap.updated_at ?? snap.ts ?? 0);
      return rev || Date.now();
    } catch { return Date.now(); }
  }

  /* Ensure avatar <img> inside given container */
  function ensureAvatarIn(container, opts){
    if (!container) return null;
    const { src, name, size="sm", userId=null } = (opts || {});

    // Kill background-image usage
    container.style.backgroundImage = "none";
    container.style.background = "transparent";

    // Clear existing children & legacy classes
    container.querySelectorAll("img").forEach(img => {
      // Prefer to reuse one <img>, but normalize class
      img.classList.add("avatar");
      img.classList.add(`avatar--${size}`);
      img.alt = name || "member";
    });

    let img = container.querySelector("img.avatar");
    if (!img){
      // remove text nodes / legacy spans
      container.textContent = "";
      img = document.createElement("img");
      container.appendChild(img);
    }
    img.className = `avatar avatar--${size}`;
    img.alt = name || "member";
    img.decoding = "async";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.dataset.name = name || "member";
    img.src = src || svgAvatar(name);

    // Wire with global helper if present
    try { window.Avatar?.wire?.(img, img.src, name); } catch {}

    if (userId != null) {
      try { container.closest(".im-acct")?.setAttribute("data-user-id", String(userId)); } catch {}
    }

    return img;
  }

  /* Normalize all known avatar containers now */
  function normalizeNow(finalSrc, displayName, userId){
    const containers = document.querySelectorAll(".im-acct-avatar, [data-role='avatar']");
    if (containers.length === 0){
      // Create one if header exists (defensive)
      const hdr = document.querySelector(".im-acct") || document.querySelector(".labelmine-header") || null;
      if (hdr){
        const c = document.createElement("div");
        c.className = "im-acct-avatar";
        hdr.prepend(c);
        ensureAvatarIn(c, { src: finalSrc, name: displayName, size: "sm", userId });
      }
      return;
    }
    containers.forEach(c => ensureAvatarIn(c, { src: finalSrc, name: displayName, size: "sm", userId }));

    // Also sweep rows if present
    document.querySelectorAll(".im-acct").forEach(row => {
      const av = row.querySelector(".im-acct-avatar") || row.querySelector("[data-role='avatar']");
      if (!av) return;
      const img = av.querySelector("img.avatar");
      if (!img || !img.src){
        ensureAvatarIn(av, { src: finalSrc, name: displayName, size: "sm", userId });
      } else {
        img.classList.add("avatar","avatar--sm");
      }
    });
  }

  /* Observe future DOM changes to auto-heal late-rendered blocks */
  function observeMutations(finalSrc, displayName, userId){
    const mo = new MutationObserver((muts) => {
      for (const m of muts){
        if (m.type === "childList"){
          m.addedNodes.forEach(node => {
            if (!(node instanceof HTMLElement)) return;
            if (node.matches?.(".im-acct-avatar,[data-role='avatar']")){
              ensureAvatarIn(node, { src: finalSrc, name: displayName, size: "sm", userId });
            } else {
              node.querySelectorAll?.(".im-acct-avatar,[data-role='avatar']")
                .forEach(c => ensureAvatarIn(c, { src: finalSrc, name: displayName, size: "sm", userId }));
            }
          });
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    return mo;
  }

  async function boot(){
    const me = await getMe();
    const displayName = me.displayName || me.name || me.email || "member";
    const rawUrl = me.avatarUrl || me.avatar || me.picture || "";
    let finalSrc = "";

    if (rawUrl){
      try {
        const u = new URL(toAPI(rawUrl));
        u.searchParams.set("v", String(readProfileRev()));
        finalSrc = u.toString();
      } catch { finalSrc = rawUrl; }
    } else {
      finalSrc = svgAvatar(displayName);
    }

    normalizeNow(finalSrc, displayName, me.id ?? null);
    observeMutations(finalSrc, displayName, me.id ?? null);
    log("labelmine avatar normalized");
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    queueMicrotask(boot);
  }

  // expose minimal debug
  try { window.LabelmineAvatar = { boot }; } catch {}

})();
