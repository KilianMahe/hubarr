// SPDX-License-Identifier: AGPL-3.0-or-later
// Lien vers la fiche d'un film ou d'une série d'une instance : pages
// `/medias/:slug/films/:id` et `/medias/:slug/series/:id`.
// L'ancien lien profond `?open=<id>` des bibliothèques y redirige encore.

import type { RouteLocationRaw } from 'vue-router';

export function mediaDetailLocation(
  kind: 'radarr' | 'sonarr' | 'movie' | 'series' | 'tv',
  slug: string,
  id: number | string,
): RouteLocationRaw {
  const series = kind === 'sonarr' || kind === 'series' || kind === 'tv';
  return { name: series ? 'sonarr-series' : 'radarr-movie', params: { slug, id: String(id) } };
}
