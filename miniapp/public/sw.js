// Обновляем версию кэша при каждом деплое - это очистит старый кэш
const CACHE_KEY = "nutrition-app-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_KEY).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_KEY).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  
  // НЕ кэшируем страницы приложения - только статические ресурсы
  // Это гарантирует, что изменения сразу видны
  const isPageRequest = url.pathname.startsWith('/profile') || 
                        url.pathname.startsWith('/report') || 
                        url.pathname.startsWith('/subscription') ||
                        url.pathname.startsWith('/registration') ||
                        url.pathname === '/' ||
                        (!url.pathname.includes('.') && !url.pathname.startsWith('/api'));
  
  if (isPageRequest) {
    // Для страниц - всегда используем network-first (без кэша)
    event.respondWith(
      fetch(event.request).catch(() => {
        // Fallback только если сеть недоступна
        return caches.match(event.request);
      })
    );
    return;
  }

  // Для статических ресурсов (изображения, иконки) - используем кэш
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          // Кэшируем только статические ресурсы
          const responseToCache = response.clone();
          caches.open(CACHE_KEY).then((cache) => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => cachedResponse);
    })
  );
});
