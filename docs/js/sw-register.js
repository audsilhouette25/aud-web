// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('[SW] Registration successful:', registration.scope);
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });
  });
}
