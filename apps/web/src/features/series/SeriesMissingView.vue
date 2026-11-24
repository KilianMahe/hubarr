<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Épisodes manquants de l'instance (`media/series_missing.html.twig`) : série
// (lien vers sa fiche), épisode, titre, date de diffusion ; recherche d'un
// épisode (état sur la ligne) ; « Rechercher tous les manquants »
// (`MissingEpisodeSearch`) suivie dans la bannière ; 50 par page.
import type { WantedEpisode } from '@hubarr/shared';
import { msCheck, msClose, msSearch } from '../../components/symbols';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ArrPager from '../../components/ArrPager.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useRoutePage } from '../movies/useRoutePage';
import SonarrNav from './SonarrNav.vue';
import { episodeCode } from './library';
import { seriesApi, seriesKeys } from './series-api';
import { mediaDetailLocation } from '../../app/media-links';

const { t } = useI18n();
const { slug, page, setPage } = useRoutePage();

const missing = useQuery({
  queryKey: computed(() => seriesKeys.page(slug.value, 'missing', String(page.value))),
  queryFn: ({ signal }) => seriesApi.missing(slug.value, page.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => missing.data.value?.records ?? []);

type RowState = 'running' | 'done' | 'failed';
const states = ref<Record<number, RowState>>({});
async function searchEpisode(episode: WantedEpisode): Promise<void> {
  states.value = { ...states.value, [episode.id]: 'running' };
  try {
    await seriesApi.episodeSearch(slug.value, [episode.id]);
    states.value = { ...states.value, [episode.id]: 'done' };
  } catch {
    states.value = { ...states.value, [episode.id]: 'failed' };
  }
}
const STATE_ICONS: Record<RowState, string> = {
  running: msSearch,
  done: msCheck,
  failed: msClose,
};

const banner = ref<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
const searchingAll = ref(false);
async function searchAll(): Promise<void> {
  searchingAll.value = true;
  banner.value = { type: 'info', text: t('media.series_missing.searching_label') };
  try {
    await seriesApi.missingSearch(slug.value);
    banner.value = { type: 'success', text: t('media.series_missing.search_launched') };
  } catch {
    banner.value = { type: 'error', text: t('media.series_missing.error') };
  } finally {
    searchingAll.value = false;
  }
}
</script>

<template>
  <v-container fluid class="sonarr-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.series_missing.title') }}</h2>
      <v-chip v-if="missing.data.value" size="small" variant="tonal" color="warning">{{
        missing.data.value.totalRecords
      }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="records.length > 0"
        :prepend-icon="msSearch"
        color="service"
        variant="flat"
        size="small"
        :loading="searchingAll"
        data-test="search-all-missing"
        @click="searchAll"
        >{{ t('media.series_missing.search_all') }}</v-btn
      >
    </div>
    <v-alert
      v-if="banner"
      :type="banner.type"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="missing-banner"
      >{{ banner.text }}</v-alert
    >
    <v-progress-linear v-if="missing.isPending.value" indeterminate color="service" />
    <v-card v-else variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('media.series_missing.col_series') }}</th>
            <th>{{ t('media.series_missing.col_episode') }}</th>
            <th>{{ t('media.series_missing.col_title') }}</th>
            <th>{{ t('media.series_missing.col_air_date') }}</th>
            <th class="text-end">{{ t('media.series_missing.col_actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="episode in records" :key="episode.id" data-test="missing-row">
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
            <td class="text-muted">{{ episode.airDate ?? '—' }}</td>
            <td class="text-end">
              <v-btn
                :icon="STATE_ICONS[states[episode.id] ?? 'running']"
                :loading="states[episode.id] === 'running'"
                :color="
                  states[episode.id] === 'failed'
                    ? 'error'
                    : states[episode.id] === 'done'
                      ? 'success'
                      : 'service-text'
                "
                variant="text"
                size="small"
                :aria-label="t('media.series_missing.search_title')"
                :title="t('media.series_missing.search_title')"
                data-test="missing-search"
                @click="searchEpisode(episode)"
              />
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="5" class="text-center text-muted py-6">
              {{ t('media.series_missing.empty') }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="page"
        :count="records.length"
        :total="missing.data.value?.totalRecords ?? 0"
        :page-size="missing.data.value?.pageSize ?? 50"
        i18n-prefix="media.series_missing"
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
