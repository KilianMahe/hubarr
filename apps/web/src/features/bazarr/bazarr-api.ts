// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API Bazarr (`/api/bazarr/…`, P3c.4), clés TanStack Query et
// badges de sous-titres des bibliothèques.

import {
  arrOkSchema,
  bazarrGridSchema,
  bazarrHistorySchema,
  bazarrMovieSubtitlesSchema,
  bazarrOverviewSchema,
  bazarrRefreshSchema,
  bazarrSearchResponseSchema,
  bazarrSeriesDetailSchema,
  bazarrStatusMapSchema,
  type BazarrDownloadEpisodeRequest,
  type BazarrDownloadMovieRequest,
  type BazarrStatus,
} from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { api } from '../../app/api/client';
import { isConfigured } from '../../app/services';
import { useSessionStore } from '../../app/stores/session';

export const BAZARR_API = '/api/bazarr';

export const bazarrKeys = {
  all: ['bazarr'] as const,
  overview: ['bazarr', 'overview'] as const,
  grid: (kind: 'movie' | 'series') => ['bazarr', 'grid', kind] as const,
  history: ['bazarr', 'history'] as const,
  series: (id: number) => ['bazarr', 'series', id] as const,
  status: (kind: 'movie' | 'series') => ['bazarr', 'status', kind] as const,
  movieSubtitles: (id: number) => ['bazarr', 'subtitles', 'movie', id] as const,
};

export const bazarrApi = {
  overview: (signal?: AbortSignal) => api.get(BAZARR_API, bazarrOverviewSchema, signal),
  grid: (kind: 'movie' | 'series', signal?: AbortSignal) =>
    api.get(`${BAZARR_API}/${kind === 'movie' ? 'movies' : 'series'}`, bazarrGridSchema, signal),
  history: (signal?: AbortSignal) => api.get(`${BAZARR_API}/history`, bazarrHistorySchema, signal),
  series: (id: number, signal?: AbortSignal) =>
    api.get(`${BAZARR_API}/series/${id}`, bazarrSeriesDetailSchema, signal),
  search: (kind: 'movie' | 'episode', id: number, signal?: AbortSignal) =>
    api.get(`${BAZARR_API}/search/${kind}/${id}`, bazarrSearchResponseSchema, signal),
  downloadMovie: (body: BazarrDownloadMovieRequest) =>
    api.post(`${BAZARR_API}/download/movie`, body, arrOkSchema),
  downloadEpisode: (body: BazarrDownloadEpisodeRequest) =>
    api.post(`${BAZARR_API}/download/episode`, body, arrOkSchema),
  auto: (kind: 'movie' | 'series', id: number) =>
    api.post(`${BAZARR_API}/auto/${kind}/${id}`, {}, arrOkSchema),
  refresh: () => api.post(`${BAZARR_API}/refresh`, {}, bazarrRefreshSchema),
  status: (kind: 'movie' | 'series', signal?: AbortSignal) =>
    api.get(
      `${BAZARR_API}/status/${kind === 'movie' ? 'movies' : 'series'}`,
      bazarrStatusMapSchema,
      signal,
    ),
  movieSubtitles: (id: number, signal?: AbortSignal) =>
    api.get(`${BAZARR_API}/subtitles/movie/${id}`, bazarrMovieSubtitlesSchema, signal),
};

/** Bazarr utilisable par l'utilisateur (configuré, admin). */
export function useBazarrAvailable() {
  const session = useSessionStore();
  return computed(() => session.isAdmin && isConfigured(session.services, 'bazarr'));
}

/** Statut affiché par un badge : `pending` tant que l'index n'est pas chargé. */
export type SubtitleBadgeStatus = BazarrStatus | 'pending' | null;

/**
 * Badges d'une bibliothèque : carte des statuts de l'index (relue toutes les
 * minutes, comme la fenêtre souple de l'index), `null` hors Bazarr.
 */
export function useSubtitleStatuses(kind: 'movie' | 'series') {
  const available = useBazarrAvailable();
  const query = useQuery({
    queryKey: bazarrKeys.status(kind),
    queryFn: ({ signal }) => bazarrApi.status(kind, signal),
    enabled: available,
    staleTime: 30_000,
    refetchInterval: (state) => (state.state.data?.state === 'pending' ? 10_000 : 60_000),
    retry: false,
  });
  function statusOf(id: number): SubtitleBadgeStatus {
    const data = query.data.value;
    if (!available.value || data === undefined || data.state === 'hidden') return null;
    if (data.state === 'pending') return 'pending';
    const status = data.items[String(id)];
    return status === undefined || status.state === 'hidden' ? null : status;
  }
  return { query, statusOf };
}
