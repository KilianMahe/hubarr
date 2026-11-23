<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique de l'instance (`media/films_history.html.twig`) : filtre par type
// d'évènement (dans l'URL), 50 par page ; date, film, évènement, qualité,
// release ou chemin et indexeur, protocole. Tri par date (décroissante par
// défaut) ou par film, recherche par titre (P5c.5, V5).
import { HISTORY_EVENT_FILTERS, type MovieHistoryItem } from '@hubarr/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import SortableTh from '../../components/SortableTh.vue';
import { mdiMagnify } from '@mdi/js';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from './RadarrNav.vue';
import { historyTone } from './movie-detail';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrList } from './useArrList';
import EmptyState from '../../components/EmptyState.vue';

const { t } = useI18n();
const format = useFormat();
const { route, router, slug, query, params, sortBy, setPage, search } = useArrList('history');

const eventType = computed(() => {
  const value = String(route.query.eventType ?? '');
  return HISTORY_EVENT_FILTERS.some((filter) => filter.value === value) ? value : '';
});
function setEventType(value: string | null): void {
  const query = { ...route.query };
  delete query.page;
  if (value) query.eventType = value;
  else delete query.eventType;
  void router.push({ query });
}

const history = useQuery({
  queryKey: computed(() =>
    moviesKeys.page(slug.value, 'history', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => moviesApi.instanceHistory(slug.value, params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => history.data.value?.records ?? []);

const EVENT_KEYS: Record<string, string> = {
  grabbed: 'media.films_history.ev_grabbed',
  downloadFolderImported: 'media.films_history.ev_imported',
  downloadFailed: 'media.films_history.ev_download_failed',
  movieFileDeleted: 'media.films_history.ev_file_deleted',
  movieFolderImported: 'media.films_history.ev_film_imported',
  movieImported: 'media.films_history.ev_film_imported',
  movieFileRenamed: 'media.films_history.ev_file_renamed',
};
const eventLabel = (item: MovieHistoryItem) => {
  const key = EVENT_KEYS[item.eventType];
  return key === undefined ? item.eventType : t(key);
};
const TONE_COLORS = {
  info: 'info',
  success: 'success',
  error: 'error',
  warning: 'warning',
  muted: 'muted',
};
const source = (item: MovieHistoryItem) =>
  item.releaseTitle ?? item.importedPath ?? item.sourceTitle ?? '—';
</script>

<template>
  <v-container fluid class="radarr-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <h2 class="text-title-medium mb-2">{{ t('media.films_history.title') }}</h2>
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <span class="text-body-small text-muted">{{ t('media.films_history.filter_label') }}</span>
      <v-chip-group
        :model-value="eventType"
        mandatory
        selected-class="text-on-service-container bg-service-container"
        @update:model-value="setEventType"
      >
        <v-chip
          v-for="filter in HISTORY_EVENT_FILTERS"
          :key="filter.value"
          :value="filter.value"
          size="small"
          variant="outlined"
          :data-test="`history-filter-${filter.value || 'all'}`"
          >{{ t(filter.key) }}</v-chip
        >
      </v-chip-group>
    </div>
    <v-filter-field
      v-model="search"
      :prepend-inner-icon="mdiMagnify"
      :placeholder="t('media.arr_lists.search_movie')"
      :aria-label="t('media.arr_lists.search_movie')"
      density="compact"
      variant="outlined"
      clearable
      class="arr-list-search mb-3"
      data-test="history-search"
    />
    <v-progress-linear v-if="history.isPending.value" indeterminate color="service" />
    <v-card v-else-if="history.data.value" variant="flat" border>
      <EmptyState
        v-if="records.length === 0"
        inline
        :title="
          query.q ? t('media.arr_lists.no_match', { q: query.q }) : t('media.films_history.empty')
        "
      />
      <v-table v-else density="compact" class="radarr-table">
        <thead>
          <tr>
            <SortableTh
              :label="t('media.films_history.col_date')"
              column="date"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('date')"
            />
            <SortableTh
              :label="t('media.films_history.col_film')"
              column="title"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('title')"
            />
            <th>{{ t('media.films_history.col_event') }}</th>
            <th>{{ t('media.films_history.col_quality') }}</th>
            <th>{{ t('media.films_history.col_source') }}</th>
            <th class="d-none d-md-table-cell">{{ t('media.films_history.col_protocol') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id" data-test="history-row">
            <td class="text-no-wrap text-muted">
              {{ item.date ? format.dateTime(item.date) : '—' }}
            </td>
            <td>
              <template v-if="item.movie">
                <span class="font-weight-medium">{{ item.movie.title }}</span>
                <span v-if="item.movie.year" class="text-muted"> ({{ item.movie.year }})</span>
              </template>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="TONE_COLORS[historyTone(item.eventType)]"
                >{{ eventLabel(item) }}</v-chip
              >
            </td>
            <td>
              <v-chip v-if="item.quality" size="x-small" variant="tonal" color="info">{{
                item.quality
              }}</v-chip>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="text-muted radarr-table__source">
              <div class="text-truncate" :title="source(item)">{{ source(item) }}</div>
              <div v-if="item.indexer" class="text-label-small">{{ item.indexer }}</div>
            </td>
            <td class="text-muted d-none d-md-table-cell">
              {{ item.protocol ?? item.downloadClient ?? '—' }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="history.data.value.totalRecords"
        :page-size="history.data.value.pageSize"
        i18n-prefix="media.films_history"
        @update:page="setPage"
      />
    </v-card>
  </v-container>
</template>

<style scoped>
.arr-list-search {
  max-width: 420px;
}
.radarr-table {
  font-size: 0.85rem;
}
.radarr-table__source {
  max-width: 320px;
}
</style>
