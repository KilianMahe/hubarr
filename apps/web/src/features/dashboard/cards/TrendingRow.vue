<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tendances de la semaine (`_recommendations.html.twig`, TMDB) ; masquée sans
// TMDB ou si vide.
import { useQuery } from '@tanstack/vue-query';
import type { DashboardTrending } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import {
  showEpisodes,
  useWatched,
  watchedCount,
  watchedProgress,
  type WatchedProgress,
} from '../../activity/watched';
import MediaRow from '../../discover/MediaRow.vue';
import { dashboardApi } from '../dashboard-api';
import PosterTile from './PosterTile.vue';

const { t } = useI18n();
const query = useQuery({
  queryKey: ['dashboard', 'trending'],
  queryFn: ({ signal }) => dashboardApi.trending(signal),
  staleTime: 300_000,
  retry: false,
});
// « Vu » (Tracearr) par l'ID TMDB ; le nombre d'épisodes d'une série
// tendance n'est pas connu : seul le nombre d'épisodes vus s'affiche.
const watched = useWatched();
function watchedOf(item: DashboardTrending['items'][number]): WatchedProgress | null {
  if (item.type === 'movie') return watched.value.movies.has(item.id) ? { kind: 'all' } : null;
  return watchedProgress(watchedCount(showEpisodes(watched.value, { tmdbId: item.id })), null);
}
</script>

<template>
  <MediaRow
    v-if="query.isPending.value || (query.data.value?.available && query.data.value.items.length)"
    :title="t('dashboard.trending.title')"
    :to="{ name: 'tmdb' }"
    :link-label="t('dashboard.trending.discover_cta')"
    :loading="query.isPending.value"
    data-test="card-trending"
  >
    <PosterTile
      v-for="item in query.data.value?.items ?? []"
      :key="`${item.type}-${item.id}`"
      :title="item.title"
      :subtitle="`${t(item.type === 'tv' ? 'dashboard.type.series' : 'dashboard.type.film')}${item.year ? ` · ${item.year}` : ''}`"
      :poster="item.poster"
      :tv="item.type === 'tv'"
      :vote="item.vote"
      :watched="watchedOf(item)"
      @open="openQuickLook({ kind: 'tmdb', type: item.type, id: item.id })"
    />
  </MediaRow>
</template>
