const CACHE_NAME = 'leaf-app-v1';
const urlsToCache = [
  '/',
  '/static/css/style.css', // Update with your actual CSS path if any
  '/supported-crops'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});