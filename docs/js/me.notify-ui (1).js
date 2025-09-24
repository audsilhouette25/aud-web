
/* me.notify-ui.js — Clean alarm UI (in-app toast list) 
   - Pure UI: mounts #notify-list and mirrors SW push messages
   - Reads only localStorage 'me:notify-enabled' (ON: '1')
   - No debug code, no network calls, no other module mutations
   - Safe to include after me.js; idempotent across reloads
*/
(() => {
  "use strict";

  if (window.__NotifyUIMounted__) return;
  window.__NotifyUIMounted__ = true;

  const KEY_TOGGLE = "me:notify-enabled";
  const isOn = () => (localStorage.getItem(KEY_TOGGLE) === "1");

  // ---------- DOM helpers ----------
  function ensureList() {
    // 1) Preferred host: a panel that already exists for alarm/notifications
    let host =
      document.querySelector(".panel.notify") ||
      document.querySelector('[data-panel="alarm"]') ||
      document.getElementById("alarm-panel");

    // 2) Create floating container if panel is absent
    let ul = document.getElementById("notify-list");
    if (!ul) {
      ul = document.createElement("ul");
      ul.id = "notify-list";
      ul.className = "notify-list";
      if (host) {
        host.appendChild(ul);
      } else {
        // minimal floating placement
        ul.style.position = "fixed";
        ul.style.right = "16px";
        ul.style.bottom = "16px";
        ul.style.maxWidth = "360px";
        ul.style.maxHeight = "50vh";
        ul.style.overflow = "auto";
        ul.style.zIndex = "99999";
        document.body.appendChild(ul);
      }
    }

    // empty-state
    if (!document.getElementById("notify-empty")) {
      const empty = document.createElement("div");
      empty.id = "notify-empty";
      empty.className = "notify-empty";
      empty.textContent = "No alarm";
      ul.parentElement.insertBefore(empty, ul);
    }

    return ul;
  }

  function esc(s) {
    return String(s || "").replace(/[<>&]/g, m => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]));
  }

  function renderCard(title, body, ts) {
    const ul = ensureList();
    const li = document.createElement("li");
    li.className = "notice";

    const row = document.createElement("div");
    row.className = "row between";

    const strong = document.createElement("strong");
    strong.textContent = title || "알림";

    const t = document.createElement("time");
    t.className = "time";
    const d = ts ? new Date(ts) : new Date();
    t.dateTime = d.toISOString();
    t.textContent = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");

    row.append(strong, t);
    li.appendChild(row);

    if (body) {
      const p = document.createElement("p");
      p.className = "sub";
      p.innerHTML = esc(body);
      li.appendChild(p);
    }

    ul.prepend(li);
    // cap length
    while (ul.children.length > 20) ul.removeChild(ul.lastChild);

    const empty = document.getElementById("notify-empty");
    if (empty) empty.style.display = "none";
  }

  // ---------- Public API (optional) ----------
  const API = {
    push({ title, body, ts }) {
      if (!isOn()) return;  // UI respects toggle
      renderCard(title, body, ts);
    },
    clear() {
      const ul = document.getElementById("notify-list");
      if (ul) ul.innerHTML = "";
      const empty = document.getElementById("notify-empty");
      if (empty) empty.style.display = "";
    }
  };
  Object.defineProperty(window, "notifyUI", { value: API, configurable: false });

  // ---------- SW → PAGE mirror ----------
  function onWindowMessage(ev) {
    const d = ev && ev.data;
    if (!d || d.__fromSW !== "push") return;
    if (!isOn()) return; // UI respects toggle OFF
    const title = d.title || "알림";
    const body  = d.body  || "";
    const ts    = d.ts    || Date.now();
    renderCard(title, body, ts);
  }

  function onSWMessage(ev) {
    const d = ev && ev.data;
    if (!d || d.__fromSW !== "push") return;
    if (!isOn()) return;
    renderCard(d.title || "알림", d.body || "", d.ts || Date.now());
  }

  // avoid duplicate registration across HMR/partial reloads
  if (window.__NotifyUIWinLsnr) window.removeEventListener("message", window.__NotifyUIWinLsnr);
  window.__NotifyUIWinLsnr = onWindowMessage;
  window.addEventListener("message", onWindowMessage, { passive: true });

  if (navigator.serviceWorker) {
    if (navigator.serviceWorker.__NotifyUISWLsnr)
      navigator.serviceWorker.removeEventListener("message", navigator.serviceWorker.__NotifyUISWLsnr);
    navigator.serviceWorker.__NotifyUISWLsnr = onSWMessage;
    navigator.serviceWorker.addEventListener("message", onSWMessage, { passive: true });
  }
})();
