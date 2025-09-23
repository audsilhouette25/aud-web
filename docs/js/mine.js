
/* mine.js — only forwards *real* feed changes to me.js via BroadcastChannel
 * No changes to UI here; we just ensure we don't emit synthetic 'initial' events on page load.
 */

(function(){
  const CH = (window.FEED_EVENT_KIND || "feed:event");
  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CH) : null;

  // These helpers should be replaced with the app's real-time hooks.
  // We add a tiny "initialSyncDone" guard so first snapshot won't emit.
  let initialSyncDone = false;

  // Suppose your existing code calls handleLikeUpdate/handleVoteUpdate when data arrives.
  // Wrap them so before initial sync is done, they don't postMessage.
  function post(kind, data) {
    if (!initialSyncDone) return;
    try { bc?.postMessage({ type: kind, data }); } catch {}
  }

  // Expose wrappers to the rest of the app
  window.__mineEmitLike = (payload) => post("item:like", payload);
  window.__mineEmitVote = (payload) => post("vote:update", payload);

  // Call this once the first list/detail fetch finished.
  window.__mineMarkInitialDone = () => { initialSyncDone = true; };

  // If you already have internal emit paths, you can change them to call the wrappers above.
})();
