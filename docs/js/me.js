/* me.js — cache-busted SW registration, toggle sync, and flat subscription upsert */

(() => {
  const API_BASE = (window.API_BASE || '');
  const toAPI = (p) => (/^https?:\/\//.test(p) ? p : (API_BASE.replace(/\/?$/,'') + (p.startsWith('/')? p : '/'+p)));

  const LS_TOGGLE = 'me:notify-enabled';
  const getToggle = () => localStorage.getItem(LS_TOGGLE) === '1';
  const setToggle = (on) => localStorage.setItem(LS_TOGGLE, on ? '1' : '0');

  const postSW = (type, payload={}) => {
    if (!navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({ type, ...payload });
  };

  function syncSessionToSW() {
    const baseAt = Date.now();
    postSW('NOTIFY_SESSION', { baseAt, on: getToggle() }); // send 'on' explicitly
  }
  function syncToggleToSW() {
    postSW('NOTIFY_TOGGLE', { on: getToggle(), at: Date.now() });
  }

  const b64UrlToUint8 = (b64) => {
    const p = (b64 + '==='.slice((b64.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(p);
    const out = new Uint8Array(raw.length);
    for (let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  async function ensureSubscriptionAndUpsert() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      if (Notification.permission !== 'granted') {
        const r = await Notification.requestPermission();
        if (r !== 'granted') return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyRes = await fetch(toAPI('/api/push/public-key')).then(r=>r.json()).catch(()=>({ok:false}));
        if (!keyRes?.vapidPublicKey) return;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64UrlToUint8(keyRes.vapidPublicKey)
        });
      }
      const ns = (localStorage.getItem('auth:userns') || '').trim().toLowerCase();
      const flat = sub.toJSON();
      await fetch(toAPI('/api/push/subscribe'), {
        method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
        body: JSON.stringify({ ns, ...flat })
      }).catch(()=>{});
    } catch {}
  }

  window.addEventListener('load', async () => {
    try {
      if ('serviceWorker' in navigator) {
        // Cache-busted registration so the newest SW controls this page
        await navigator.serviceWorker.register('sw.js?v=' + Date.now(), { scope: './' });
        if (localStorage.getItem(LS_TOGGLE) === null) setToggle(true); // default ON
        syncSessionToSW();
        syncToggleToSW();
        setTimeout(ensureSubscriptionAndUpsert, 500); // debounce
      }
    } catch {}
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el && el.matches && el.matches('[data-notify-toggle]')) {
      setToggle(!!el.checked);
      syncToggleToSW();
      if (getToggle()) ensureSubscriptionAndUpsert();
    }
  });

  window.__notify = {
    pingSW: () => new Promise((res) => {
      if (!navigator.serviceWorker?.controller) return res({ ok:false, note:'no-controller' });
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => res(ev.data || { ok:false });
      navigator.serviceWorker.controller.postMessage({ type:'PING', at:Date.now() }, [ch.port2]);
      setTimeout(()=>res({ ok:false, note:'timeout' }), 1500);
    }),
    toggle: (on) => { setToggle(!!on); syncToggleToSW(); },
    upsert: ensureSubscriptionAndUpsert,
  };
})();

// 인앱 알림 미러(토스트)
(() => {
  const LIST_ID = 'notify-list';
  const ensureList = () => {
    let ul = document.getElementById(LIST_ID);
    if (!ul) {
      ul = document.createElement('ul');
      ul.id = LIST_ID;
      ul.className = 'notify-list';
      // 페이지 어딘가 알림 패널이 있으면 그 안에 넣고,
      // 없으면 body 끝에 달자(임시)
      (document.querySelector('.panel.notify') || document.body).appendChild(ul);
    }
    return ul;
  };
  window.addEventListener('message', (ev) => {
    const d = ev?.data || {};
    if (d.__fromSW === 'push') {
      const ul = ensureList();
      const li = document.createElement('li');
      li.className = 'notice';
      li.innerHTML = `
        <div><b>${d.title || '알림'}</b><span class="time">just now</span>
          <div class="sub">${(d.body || '').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        </div>`;
      ul.prepend(li);
    }
  }, { passive: true });
})();
