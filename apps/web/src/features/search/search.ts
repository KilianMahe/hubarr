// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche globale de la barre du haut (P4.5) : appels (`/api/medias/:slug/
// search` et `/search/online`), recherches récentes (navigateur) et
// construction d'un ajout rapide sans TMDB pour un résultat en ligne.

import {
  localSearchResponseSchema,
  onlineSearchResponseSchema,
  type BootstrapServices,
  type OnlineSearchHit,
  type ResolvedMedia,
} from '@hubarr/shared';
import { api } from '../../app/api/client';

export const searchApi = {
  local: (slug: string, q: string, signal?: AbortSignal) =>
    api.get(
      `/api/medias/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(q)}`,
      localSearchResponseSchema,
      signal,
    ),
  online: (slug: string, q: string, signal?: AbortSignal) =>
    api.get(
      `/api/medias/${encodeURIComponent(slug)}/search/online?q=${encodeURIComponent(q)}`,
      onlineSearchResponseSchema,
      signal,
    ),
};

export const RECENT_SEARCH_KEY = 'hubarr.search-recent';
export const RECENT_SEARCH_MAX = 5;
export const SEARCH_DEBOUNCE_MS = 300;

export function loadRecentSearches(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECENT_SEARCH_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Ajoute une recherche récente (`saveRecent` d'origine) : doublons et
 * préfixes retirés dans les deux sens (« d », « du », « dun » → « dune »).
 */
export function addRecentSearch(list: readonly string[], q: string): string[] {
  if (q.length < 2) return [...list];
  const lower = q.toLowerCase();
  const kept = list.filter((r) => {
    const rl = r.toLowerCase();
    return rl !== lower && !lower.startsWith(rl) && !rl.startsWith(lower);
  });
  return [q, ...kept].slice(0, RECENT_SEARCH_MAX);
}

/** Ajout rapide d'un résultat en ligne sans passer par TMDB (série sans id TMDB, TMDB absent). */
export function resolvedFromHit(hit: OnlineSearchHit, services: BootstrapServices): ResolvedMedia {
  const type = hit.type === 'film' ? 'radarr' : 'sonarr';
  const candidates = services.instances[type]
    .filter((row) => row.enabled)
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      isDefault: row.isDefault,
      defaultQualityProfileId: null,
    }));
  const base = {
    title: hit.title,
    year: hit.year ?? 0,
    poster: hit.poster,
    inLibrary: hit.inLibrary,
    instances: [],
    candidates,
  };
  return hit.type === 'film'
    ? { ...base, type: 'film', id: hit.tmdbId ?? hit.id, tmdbId: hit.tmdbId ?? hit.id }
    : {
        ...base,
        type: 'serie',
        id: hit.tvdbId ?? hit.id,
        tvdbId: hit.tvdbId ?? hit.id,
        tmdbId: hit.tmdbId ?? 0,
        seriesType: 'standard',
      };
}
