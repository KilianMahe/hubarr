// SPDX-License-Identifier: AGPL-3.0-or-later
// Origine de l'API TMDB. Fixe en production (`https://api.themoviedb.org`) ;
// `HUBARR_TMDB_API_URL` la remplace pour les tests de bout en bout, qui
// servent un faux TMDB (le conteneur E2E n'a pas accès à Internet).

export const DEFAULT_TMDB_API_ORIGIN = 'https://api.themoviedb.org';

let origin = DEFAULT_TMDB_API_ORIGIN;

export function tmdbApiOrigin(): string {
  return origin;
}

/** Remplace l'origine (démarrage du serveur) ; `undefined` rétablit la valeur par défaut. */
export function setTmdbApiOrigin(url: string | undefined): void {
  origin = (url ?? DEFAULT_TMDB_API_ORIGIN).replace(/\/+$/, '');
}
