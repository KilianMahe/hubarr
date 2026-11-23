// SPDX-License-Identifier: AGPL-3.0-or-later
// Enregistrement du service worker de la PWA (`public/sw.js`), en production
// seulement : en développement, Vite sert les modules à la volée et un cache
// gênerait le rechargement à chaud. Chemin relatif : il suit la balise `<base>`
// (préfixe de reverse proxy), et la portée du worker avec lui.
//
// La version de l'image Docker (`HUBARR_VERSION`, renvoyée par le bootstrap)
// fait partie de l'URL du worker : la PWA ne se met à jour qu'au déploiement
// d'une nouvelle image.

/** URL du worker pour une version de l'image. */
export function serviceWorkerUrl(version: string, base: string): URL {
  const url = new URL('sw.js', base);
  url.searchParams.set('v', version);
  return url;
}

export function registerServiceWorker(version: string | undefined): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || version === undefined) return;
  navigator.serviceWorker
    .register(serviceWorkerUrl(version, document.baseURI), {
      scope: new URL('./', document.baseURI).pathname,
    })
    .catch(() => {
      // Contexte non sécurisé (HTTP hors localhost) : l'application marche sans.
    });
}
