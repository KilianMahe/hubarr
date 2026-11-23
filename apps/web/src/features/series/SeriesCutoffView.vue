<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Épisodes sous le seuil de qualité (`media/series_cutoff.html.twig`) : série
// (lien vers sa fiche), épisode, titre, qualité actuelle, date ; 50 par page.
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ArrPager from '../../components/ArrPager.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useCutoffList } from '../movies/useArrList';
import CutoffFilters from '../movies/CutoffFilters.vue';
import SonarrNav from './SonarrNav.vue';
import { episodeCode } from './library';
import { seriesApi, seriesKeys } from './series-api';
import { mediaDetailLocation } from '../../app/media-links';

const { t } = useI18n();
const { slug, query, params, setPage, setProfile, search } = useCutoffList();

const cutoff = useQuery({
  queryKey: computed(() =>
    seriesKeys.page(slug.value, 'cutoff', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => seriesApi.cutoff(slug.value, params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => cutoff.data.value?.records ?? []);
// Profils de qualité de l'instance (filtre, P5c.5).
const config = useQuery({
  queryKey: computed(() => seriesKeys.config(slug.value)),
  queryFn: ({ signal }) => seriesApi.config(slug.value, signal),
  staleTime: 60_000,
  retry: false,
});
const profiles = computed(() => config.data.value?.qualityProfiles ?? []);
const filtered = computed(() => query.value.q !== '' || query.value.profile > 0);
</script>

<template>
  <v-container fluid class="sonarr-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.series_cutoff.title') }}</h2>
      <v-chip v-if="cutoff.data.value" size="small" variant="tonal" color="info">{{
        cutoff.data.value.totalRecords
      }}</v-chip>
    </div>
    <CutoffFilters
      v-model:search="search"
      :profiles="profiles"
      :profile="query.profile"
      :placeholder="t('media.arr_lists.search_series')"
      @update:profile="setProfile"
    />
    <v-progress-linear v-if="cutoff.isPending.value" indeterminate color="service" />
    <v-card v-else variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('media.series_cutoff.col_series') }}</th>
            <th>{{ t('media.series_cutoff.col_episode') }}</th>
            <th>{{ t('media.series_cutoff.col_title') }}</th>
            <th>{{ t('media.series_cutoff.col_current_quality') }}</th>
            <th>{{ t('media.series_cutoff.col_air_date') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="episode in records" :key="episode.id" data-test="cutoff-row">
            <td class="font-weight-medium">
              <router-link
                v-if="episode.seriesId !== null"
                :to="mediaDetailLocation('sonarr', slug, episode.seriesId)"
                class="sonarr-page__link"
                >{{ episode.seriesTitle }}</router-link
              >
              <template v-else>{{ episode.seriesTitle }}</template>
            </td>
            <td>
              <v-chip size="x-small" label variant="tonal">{{
                episodeCode(episode.seasonNumber, episode.episodeNumber)
              }}</v-chip>
            </td>
            <td class="text-muted">{{ episode.title ?? '—' }}</td>
            <td>
              <v-chip v-if="episode.quality" size="x-small" label variant="tonal" color="info">{{
                episode.quality
              }}</v-chip>
              <span v-else>—</span>
            </td>
            <td class="text-muted">{{ episode.airDate ?? '—' }}</td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="5" class="text-center text-muted py-6">
              {{
                query.q
                  ? t('media.arr_lists.no_match', { q: query.q })
                  : filtered
                    ? t('media.arr_lists.no_match_filters')
                    : t('media.series_cutoff.empty')
              }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="cutoff.data.value?.totalRecords ?? 0"
        :page-size="cutoff.data.value?.pageSize ?? 50"
        i18n-prefix="media.series_cutoff"
        pages-summary
        @update:page="setPage"
      />
    </v-card>
  </v-container>
</template>

<style scoped>
.sonarr-page__link {
  color: inherit;
  text-decoration: none;
}
.sonarr-page__link:hover {
  text-decoration: underline;
}
</style>
