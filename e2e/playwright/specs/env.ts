// SPDX-License-Identifier: AGPL-3.0-or-later
// Constantes partagées des E2E.

export const ADMIN = { email: 'admin@hubarr.test', password: 'e2e-password-123' };
export const MOCKS_URL = process.env.E2E_MOCKS_URL ?? 'http://e2e-mocks:7171';
/** Clé attendue par le faux Radarr (`e2e/mocks/src/radarr/routes.ts`). */
export const RADARR_KEY = 'e2e-radarr-key';
/** Slug de l'instance « Films ». */
export const LIBRARY = '/medias/films/films';
/** Clé attendue par le faux Sonarr (`e2e/mocks/src/sonarr/routes.ts`). */
export const SONARR_KEY = 'e2e-sonarr-key';
/** Bibliothèque de l'instance « Séries ». */
export const SERIES_LIBRARY = '/medias/series/series';
/** Clé attendue par le faux Prowlarr (`e2e/mocks/src/prowlarr/routes.ts`). */
export const PROWLARR_KEY = 'e2e-prowlarr-key';
/** Clé attendue par le faux Bazarr (`e2e/mocks/src/bazarr/routes.ts`). */
export const BAZARR_KEY = 'e2e-bazarr-key';
/** Identifiants des faux clients de téléchargement (`e2e/mocks/src/downloads/routes.ts`). */
export const DOWNLOADS = {
  qbittorrent: { user: 'e2e', password: 'e2e-qbit-pass' },
  transmission: { user: 'e2e', password: 'e2e-tr-pass' },
  deluge: { password: 'e2e-deluge-pass' },
  sabnzbd: { apiKey: 'e2e-sab-key' },
  nzbget: { user: 'e2e', password: 'e2e-nzb-pass' },
  gluetun: { apiKey: 'e2e-gluetun-key' },
} as const;
/** Clés des faux serveurs d'activité (`e2e/mocks/src/activity/routes.ts`). */
export const ACTIVITY = {
  tautulli: { apiKey: 'e2e-tautulli-key' },
  tracearr: { apiKey: 'trr_pub_e2e' },
  emby: { apiKey: 'e2e-emby-key' },
} as const;
/** Clé du faux Seerr (`e2e/mocks/src/seerr/routes.ts`). */
export const SEERR_KEY = 'e2e-seerr-key';
/** Clé du faux TMDB (`e2e/mocks/src/tmdb/routes.ts`). */
export const TMDB_KEY = 'e2e-tmdb-key';
