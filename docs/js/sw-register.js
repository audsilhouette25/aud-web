// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Unregister all service workers for debugging
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister();
        console.log('[SW] Unregistered:', registration.scope);
      }
    });

    // Uncomment to re-enable service worker
    /*
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('[SW] Registration successful:', registration.scope);
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });
    */
  });
}
