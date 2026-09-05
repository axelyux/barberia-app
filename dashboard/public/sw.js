// Service worker mínimo: su único trabajo es mostrar public/offline.html cuando el
// navegador no puede llegar al servidor, en vez de la página de error nativa del
// navegador ("net::ERR_INTERNET_DISCONNECTED"). No cachea nada más de la app —
// deliberadamente simple, esto no es una app 100% offline, solo una pantalla de aviso
// decente cuando no hay red.
const CACHE = "mibarber-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-512.png"])).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // Solo nos interesan las navegaciones de página completa (recargar/entrar a una
    // URL) — todo lo demás (fetch de datos, imágenes, etc.) sigue su camino normal.
    if (event.request.mode !== "navigate") return;

    event.respondWith(
        fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
});
