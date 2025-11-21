/**
 * Service Worker OFFLINE v1
 * Carga archivos locales en lugar de CDNs
 */
const CACHE_NAME = 'mysic-offline-v1';

// Archivos a cachear (Asegúrate de que existan en Kodular Assets)
const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './jsmediatags.min.js',
  './color-thief.js',     // Archivo local obligatorio
  './tailwindcss.js',     // Archivo local obligatorio
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (evt) => {
  console.log('[SW] Instalando...');
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // No cachear streams de radio ni urls externas
  if (evt.request.url.includes('http')) {
     if (!evt.request.url.includes(self.location.origin)) {
         return; // Dejar que el navegador maneje externos (fallará offline)
     }
  }

  evt.respondWith(
    caches.match(evt.request).then((response) => {
      return response || fetch(evt.request);
    })
  );
});