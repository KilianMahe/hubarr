// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker de la PWA : rend l'application installable et garde la
// coquille (page, scripts, styles, icônes) pour un démarrage rapide ou hors
// ligne. Les données ne sont jamais mises en cache : l'API, le flux temps réel
// et la documentation passent toujours par le réseau.
//
// - navigation : réseau d'abord, coquille en cache à défaut ;
// - `assets/*` (noms hachés par Vite) : cache d'abord, ils ne changent jamais ;
// - le reste : réseau seul.
// Mises à jour : uniquement par l'image Docker. Le worker est enregistré avec
// la version de l'image (`sw.js?v=<HUBARR_VERSION>`, lue dans
// `/api/bootstrap`) : tant que l'image ne change pas, rien ne change ; une
// nouvelle image donne une nouvelle URL, donc un nouveau worker, un nouveau
// cache, et l'ancien est effacé. Aucune source extérieure (dépôt git, registre)
// n'est consultée.

const VERSION = new URL(self.location.href).searchParams.get('v') ?? 'dev';
const CACHE = `hubarr-shell-${VERSION}`;
const SCOPE = new URL(self.registration.scope);
const SHELL = new URL('./', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isAppPath(url, prefix) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(new URL(prefix, SCOPE).pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  if (isAppPath(url, 'api/') || isAppPath(url, 'docs/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (isAppPath(url, 'assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
