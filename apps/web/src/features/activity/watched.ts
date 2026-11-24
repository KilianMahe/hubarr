// SPDX-License-Identifier: AGPL-3.0-or-later
// « Vu » via Tracearr (lot 7) : titres vus par l'utilisateur connecté
// (`GET /api/tracearr/watched`), indexés pour les cartes de la bibliothèque et
// les fiches. Rien n'est demandé tant que Tracearr n'est pas configuré ; sans
// compte associé, l'index est vide et aucun badge n'apparaît.

import {
  tracearrLinkSchema,
  tracearrWatchedSchema,
  type TracearrLinkRequest,
  type TracearrWatched,
} from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { api } from '../../app/api/client';
import { isConfigured } from '../../app/services';
import { useSessionStore } from '../../app/stores/session';

export const WATCHED_KEY = ['tracearr', 'watched'] as const;
export const TRACEARR_LINK_KEY = ['profile', 'tracearr'] as const;
/** La synchronisation tourne toutes les 15 min : inutile de relire plus souvent. */
const WATCHED_STALE_MS = 5 * 60_000;

export const watchedApi = {
  watched: (signal?: AbortSignal) =>
    api.get('/api/tracearr/watched', tracearrWatchedSchema, signal),
  link: (signal?: AbortSignal) => api.get('/api/profil/tracearr', tracearrLinkSchema, signal),
  setLink: (body: TracearrLinkRequest) =>
    api.post('/api/profil/tracearr', body, tracearrLinkSchema),
  resync: () => api.post('/api/admin/tracearr/resync', undefined, tracearrLinkSchema),
};

/** Épisodes vus d'une série, clés `saison:épisode`. */
export type WatchedEpisodes = ReadonlySet<string>;

export interface WatchedIndex {
  movies: ReadonlySet<number>;
  /** Séries par `tvdb:<id>` et `tmdb:<id>`. */
  shows: ReadonlyMap<string, WatchedEpisodes>;
}

export const EMPTY_WATCHED: WatchedIndex = { movies: new Set(), shows: new Map() };

export const episodeKey = (season: number, episode: number) => `${season}:${episode}`;

export function indexWatched(data: TracearrWatched | undefined): WatchedIndex {
  if (!data?.linked) return EMPTY_WATCHED;
  const shows = new Map<string, Set<string>>();
  const add = (key: string, episodes: Set<string>) => {
    const current = shows.get(key);
    if (current === undefined) shows.set(key, new Set(episodes));
    else for (const episode of episodes) current.add(episode);
  };
  for (const show of data.shows) {
    const episodes = new Set(show.episodes.map(([s, e]) => episodeKey(s, e)));
    if (show.tvdbId !== null) add(`tvdb:${show.tvdbId}`, episodes);
    if (show.tmdbId !== null) add(`tmdb:${show.tmdbId}`, episodes);
  }
  return { movies: new Set(data.movies), shows };
}

/** Épisodes vus d'une série (par TVDB d'abord, l'ID de Sonarr, puis TMDB). */
export function showEpisodes(
  index: WatchedIndex,
  ids: { tvdbId?: number | null; tmdbId?: number | null },
): WatchedEpisodes | null {
  const tvdb = ids.tvdbId ? index.shows.get(`tvdb:${ids.tvdbId}`) : undefined;
  const tmdb = ids.tmdbId ? index.shows.get(`tmdb:${ids.tmdbId}`) : undefined;
  if (tvdb === undefined) return tmdb ?? null;
  if (tmdb === undefined) return tvdb;
  return new Set([...tvdb, ...tmdb]);
}

/** Épisodes vus hors spéciaux, éventuellement d'une seule saison. */
export function watchedCount(episodes: WatchedEpisodes | null, season?: number): number {
  if (episodes === null) return 0;
  let count = 0;
  for (const key of episodes) {
    const s = Number(key.split(':')[0]);
    if (season === undefined ? s > 0 : s === season) count += 1;
  }
  return count;
}

/**
 * Contenu d'un badge « Vu » : tout est vu, une fraction, ou un nombre
 * d'épisodes quand le total est inconnu (série hors bibliothèque).
 */
export type WatchedProgress =
  | { kind: 'all' }
  | { kind: 'some'; watched: number; total: number }
  | { kind: 'count'; watched: number };

/**
 * Badge d'une série ou d'une saison : `null` si rien n'est vu, `all` si tout
 * est vu (`watched ≥ total`), sinon la fraction ; sans total connu (`null`),
 * le nombre d'épisodes vus.
 */
export function watchedProgress(watched: number, total: number | null): WatchedProgress | null {
  if (watched <= 0) return null;
  if (total === null) return { kind: 'count', watched };
  if (total > 0 && watched >= total) return { kind: 'all' };
  return { kind: 'some', watched, total };
}

/** Index des titres vus, partagé par toutes les vues (une seule requête). */
export function useWatched() {
  const session = useSessionStore();
  const enabled = computed(() => isConfigured(session.services, 'tracearr'));
  const query = useQuery({
    queryKey: WATCHED_KEY,
    queryFn: ({ signal }) => watchedApi.watched(signal),
    enabled,
    staleTime: WATCHED_STALE_MS,
  });
  return computed<WatchedIndex>(() =>
    enabled.value ? indexWatched(query.data.value) : EMPTY_WATCHED,
  );
}
