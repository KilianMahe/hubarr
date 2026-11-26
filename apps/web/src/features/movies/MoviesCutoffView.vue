<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Films sous le seuil de qualité (`media/films_cutoff.html.twig`) : 50 par
// page ; « Améliorer » lance la recherche du film.
import type { CutoffMovie } from '@hubarr/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from './RadarrNav.vue';
import { posterUrl } from './movie-display';
import { moviesApi, moviesKeys } from './movies-api';
import { useCutoffList } from './useArrList';
import CutoffFilters from './CutoffFilters.vue';
import EmptyState from '../../components/EmptyState.vue';
import { vWrite } from '../../app/access';

const { t } = useI18n();
const format = useFormat();
const { slug, query, params, setPage, setProfile, search } = useCutoffList();

const cutoff = useQuery({
  queryKey: computed(() =>
    moviesKeys.page(slug.value, 'cutoff', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => moviesApi.cutoff(slug.value, params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => cutoff.data.value?.records ?? []);
// Profils de qualité de l'instance (filtre, P5c.5).
const config = useQuery({
  queryKey: computed(() => moviesKeys.config(slug.value)),
  queryFn: ({ signal }) => moviesApi.config(slug.value, signal),
  staleTime: 60_000,
  retry: false,
});
const profiles = computed(() => config.data.value?.qualityProfiles ?? []);
const filtered = computed(() => query.value.q !== '' || query.value.profile > 0);

const upgrades = reactive(new Map<number, 'running' | 'launched' | 'error'>());
async function upgrade(movie: CutoffMovie): Promise<void> {
  upgrades.set(movie.id, 'running');
  try {
    await moviesApi.search(slug.value, movie.id);
    upgrades.set(movie.id, 'launched');
  } catch {
    upgrades.set(movie.id, 'error');
  }
}
</script>

<template>
  <v-container fluid class="radarr-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <div class="d-flex align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.films_cutoff.title') }}</h2>
      <v-chip v-if="cutoff.data.value" size="small" color="info" variant="tonal">{{
        cutoff.data.value.totalRecords
      }}</v-chip>
    </div>
    <CutoffFilters
      v-model:search="search"
      :profiles="profiles"
      :profile="query.profile"
      :placeholder="t('media.arr_lists.search_movie')"
      @update:profile="setProfile"
    />
    <v-progress-linear v-if="cutoff.isPending.value" indeterminate color="service" />
    <v-card v-else-if="cutoff.data.value" variant="flat" border>
      <EmptyState
        v-if="records.length === 0"
        inline
        :title="
          query.q
            ? t('media.arr_lists.no_match', { q: query.q })
            : filtered
              ? t('media.arr_lists.no_match_filters')
              : t('media.films_cutoff.empty')
        "
      />
      <v-list v-else lines="two" class="py-0">
        <v-list-item v-for="movie in records" :key="movie.id" data-test="cutoff-row">
          <template #prepend>
            <img
              v-if="posterUrl(movie.poster, 'w92')"
              :src="posterUrl(movie.poster, 'w92')!"
              :alt="movie.title"
              class="radarr-poster"
              loading="lazy"
            />
            <div v-else class="radarr-poster" />
          </template>
          <v-list-item-title class="font-weight-medium">
            {{ movie.title }}
            <span class="text-muted text-body-small">{{ movie.year ?? '—' }}</span>
          </v-list-item-title>
          <v-list-item-subtitle class="d-flex flex-wrap align-center ga-1">
            <v-chip v-if="movie.quality" size="x-small" variant="tonal" color="warning">{{
              movie.quality
            }}</v-chip>
            <span>{{ movie.inCinemas ? format.date(movie.inCinemas) : '—' }}</span>
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              v-write
              size="small"
              :variant="upgrades.get(movie.id) === 'launched' ? 'tonal' : 'flat'"
              :color="
                upgrades.get(movie.id) === 'launched'
                  ? 'success'
                  : upgrades.get(movie.id) === 'error'
                    ? 'error'
                    : 'service'
              "
              :loading="upgrades.get(movie.id) === 'running'"
              :disabled="upgrades.get(movie.id) === 'launched'"
              :title="t('media.films_cutoff.upgrade_title')"
              data-test="cutoff-upgrade"
              @click="upgrade(movie)"
              >{{
                upgrades.get(movie.id) === 'launched'
                  ? t('media.films_cutoff.launched')
                  : upgrades.get(movie.id) === 'error'
                    ? t('media.films_cutoff.error')
                    : t('media.films_cutoff.upgrade')
              }}</v-btn
            >
          </template>
        </v-list-item>
      </v-list>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="cutoff.data.value.totalRecords"
        :page-size="cutoff.data.value.pageSize"
        i18n-prefix="media.films_cutoff"
        @update:page="setPage"
      />
    </v-card>
  </v-container>
</template>

<style scoped>
.radarr-poster {
  width: 36px;
  height: 54px;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>
