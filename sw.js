// ═══════════════════════════════════════════
// sw.js — EcoTRACK: SELF-DESTRUCT (perbaikan SW rusak)
// Otomatis menghapus cache lama & unregister diri sendiri
// ═══════════════════════════════════════════

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});

// TANPA fetch handler → semua request lewat langsung ke network
