// SPDX-License-Identifier: AGPL-3.0-or-later
// Watchlist partagée entre les écrans (étoiles des cartes, aperçu rapide,
// fiche) : statut lu une fois (`/watchlist/status`), bascule avec message.
// Ne fait rien si TMDB n'est pas configuré (garde des routes `tmdb_*`).

import type { TmdbMediaType } from '@hubarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';
import { isConfigured } from '../../app/services';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import { discoverApi, discoverKeys } from './discover-api';

export interface WatchlistCandidate {
  id: number;
  type: TmdbMediaType;
  title: string;
  posterPath?: string | null;
  vote?: number | null;
  year?: number | null;
}

/** Chemin TMDB d'une URL d'image (`…/t/p/w342/abc.jpg` → `/abc.jpg`). */
export function posterPathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/t\/p\/[^/]+(\/.+)$/.exec(url);
  return match?.[1] ?? null;
}

export function useWatchlist() {
  const session = useSessionStore();
  const notify = useNotifyStore();
  const client = useQueryClient();
  const enabled = computed(() => isConfigured(session.services, 'tmdb'));
  const status = useQuery({
    queryKey: discoverKeys.watchlistStatus,
    queryFn: ({ signal }) => discoverApi.watchlistStatus(signal),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  const keys = computed(() => new Set(status.data.value?.keys ?? []));
  const toggle = useMutation({
    mutationFn: (item: WatchlistCandidate) =>
      discoverApi.watchlistToggle({
        tmdbId: item.id,
        type: item.type,
        title: item.title,
        posterPath: item.posterPath ?? null,
        vote: item.vote ?? null,
        year: item.year ?? null,
      }),
    onSuccess: (result) => {
      notify.success(
        result.action === 'added'
          ? 'decouverte.watchlist.added_toast'
          : 'decouverte.watchlist.removed_toast',
      );
      void client.invalidateQueries({ queryKey: discoverKeys.watchlistStatus });
      void client.invalidateQueries({ queryKey: discoverKeys.watchlist });
      void client.invalidateQueries({ queryKey: ['dashboard', 'page'] });
    },
    onError: () => {
      notify.error('decouverte.modal.network_error');
    },
  });
  return {
    enabled,
    has: (type: TmdbMediaType, id: number) => keys.value.has(`${type}_${id}`),
    toggle: (item: WatchlistCandidate) => {
      toggle.mutate(item);
    },
    pending: computed(() => toggle.isPending.value),
  };
}
