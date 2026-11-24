<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique de l'instance (`media/series_history.html.twig`) : série, épisode,
// action, source, qualité, date ; 50 par page.
import { msSearch } from '../../components/symbols';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useArrList } from '../movies/useArrList';
import SortableTh from '../../components/SortableTh.vue';
import SonarrNav from './SonarrNav.vue';
import { episodeCode } from './library';
import { seriesApi, seriesKeys } from './series-api';
import { historyEventColor, historyEventLabel } from './series-detail';

const { t } = useI18n();
const format = useFormat();
const { slug, query, params, sortBy, setPage, search } = useArrList('history');

const history = useQuery({
  queryKey: computed(() =>
    seriesKeys.page(slug.value, 'history', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => seriesApi.instanceHistory(slug.value, params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => history.data.value?.records ?? []);
</script>

<template>
  <v-container fluid class="sonarr-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <h2 class="text-title-medium mb-3">{{ t('media.series_history.title') }}</h2>
    <v-filter-field
      v-model="search"
      :prepend-inner-icon="msSearch"
      :placeholder="t('media.arr_lists.search_series')"
      :aria-label="t('media.arr_lists.search_series')"
      density="compact"
      variant="outlined"
      clearable
      class="arr-list-search mb-3"
      data-test="history-search"
    />
    <v-progress-linear v-if="history.isPending.value" indeterminate color="service" />
    <v-card v-else variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <SortableTh
              :label="t('media.series_history.col_series')"
              column="title"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('title')"
            />
            <th>{{ t('media.series_history.col_episode') }}</th>
            <th>{{ t('media.series_history.col_action') }}</th>
            <th>{{ t('media.series_history.col_source') }}</th>
            <th>{{ t('media.series_history.col_quality') }}</th>
            <SortableTh
              :label="t('media.series_history.col_date')"
              column="date"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('date')"
            />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id" data-test="history-row">
            <td class="font-weight-medium">{{ item.series?.title ?? '—' }}</td>
            <td>
              <v-chip v-if="item.episode" size="x-small" label variant="tonal">{{
                episodeCode(item.episode.seasonNumber, item.episode.episodeNumber)
              }}</v-chip>
              <span v-else>—</span>
            </td>
            <td>
              <v-chip
                size="x-small"
                label
                variant="tonal"
                :color="historyEventColor(item.eventType)"
                >{{ historyEventLabel(t, item.eventType) }}</v-chip
              >
            </td>
            <td class="text-muted sonarr-page__source" :title="item.sourceTitle ?? ''">
              {{ item.sourceTitle ?? '—' }}
            </td>
            <td>
              <v-chip v-if="item.quality" size="x-small" label variant="tonal" color="info">{{
                item.quality
              }}</v-chip>
              <span v-else>—</span>
            </td>
            <td class="text-muted text-no-wrap">
              {{ item.date === null ? '—' : (format.dateTime(item.date) ?? '—') }}
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="6" class="text-center text-muted py-6">
              {{
                query.q
                  ? t('media.arr_lists.no_match', { q: query.q })
                  : t('media.series_history.empty')
              }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="history.data.value?.totalRecords ?? 0"
        :page-size="history.data.value?.pageSize ?? 50"
        i18n-prefix="media.series_history"
        pages-summary
        @update:page="setPage"
      />
    </v-card>
  </v-container>
</template>

<style scoped>
.arr-list-search {
  max-width: 420px;
}
.sonarr-page__source {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
