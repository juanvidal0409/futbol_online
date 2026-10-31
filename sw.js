/* Service worker: guarda los archivos de la página para que abra rápido
   y funcione como app instalada. Los datos de partidos no pasan por aquí:
   los guarda la propia página (js/almacen.js). Cambia VERSION al publicar. */
const VERSION = 'fo-v3';
const ARCHIVOS = [
  './',
  'index.html',
  'css/styles.css',
  'js/ligas.js',
  'js/almacen.js',
  'js/util.js',
  'js/api.js',
  'js/partido.js',
  'js/app.js',
  'manifest.webmanifest',
  'iconos/icono-192.png',
  'iconos/icono-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Archivos propios: se sirve la copia guardada y se actualiza en segundo plano.
   Todo lo demás (API de ESPN, escudos, fuentes) va directo a la red. */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardado = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; })
        .catch(() => guardado);
      return guardado || red;
    })
  );
});
