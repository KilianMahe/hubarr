<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Explorateur (`decouverte/explorer.html.twig`, route n° 559 et n° 553, 560 à
// 563) : type, genres (plusieurs), décennie, tri, puis « Rechercher » et
// « Charger plus » ; recherche d'une collection ou d'un acteur, dont les
// titres s'ouvrent dans une feuille. Fiche par `?detail=…`.
import type { PersonHit, TmdbCard, TmdbMediaType } from '@hubarr/shared';
import { mdiArrowLeft, mdiCompassOutline } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import CollectionSheet from './CollectionSheet.vue';
import { discoverApi, type ExplorerParams } from './discover-api';
import MediaCard from './MediaCard.vue';
import PersonSheet from './PersonSheet.vue';
import TmdbDetailDialog from './TmdbDetailDialog.vue';
import { useRouteDetail } from './useRouteDetail';

const { t } = useI18n();
const detail = useRouteDetail();
const openCard = (card: TmdbCard) => {
  detail.value = { type: card.type, id: card.id };
};

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960] as const;
const SORTS = {
  popular: 'popularity.desc',
  top_rated: 'vote_average.desc',
  recent: 'release',
  box_office: 'revenue.desc',
} as const;
interface ExplorerFilters {
  type: TmdbMediaType;
  genres: number[];
  decade: number | null;
  sort: keyof typeof SORTS;
}
const filters = reactive<ExplorerFilters>({
  type: 'movie',
  genres: [],
  decade: null,
  sort: 'popular',
});
watch(
  () => filters.type,
  () => {
    filters.genres = [];
  },
);
const genres = useQuery({
  queryKey: computed(() => ['discover', 'genres', filters.type] as const),
  queryFn: ({ signal }) => discoverApi.genres(filters.type, signal),
  staleTime: 3_600_000,
  retry: false,
});

const results = ref<TmdbCard[]>([]);
const page = ref(0);
const totalPages = ref(0);
const totalResults = ref(0);
const loading = ref(false);
const error = ref(false);

function params(nextPage: number): ExplorerParams {
  const sort =
    filters.sort === 'recent'
      ? filters.type === 'movie'
        ? 'primary_release_date.desc'
        : 'first_air_date.desc'
      : filters.sort === 'box_office' && filters.type === 'tv'
        ? 'popularity.desc'
        : SORTS[filters.sort];
  return {
    type: filters.type,
    ...(filters.genres.length ? { genres: filters.genres.join(',') } : {}),
    ...(filters.decade !== null ? { year_min: filters.decade, year_max: filters.decade + 9 } : {}),
    ...(filters.sort === 'top_rated' ? { vote_count_min: 200 } : {}),
    sort,
    page: nextPage,
  };
}
async function run(append = false): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const next = append ? page.value + 1 : 1;
    const data = await discoverApi.filter(params(next));
    results.value = append ? [...results.value, ...data.results] : data.results;
    page.value = data.page;
    totalPages.value = data.totalPages;
    totalResults.value = data.totalResults;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

// Collections et acteurs : recherche différée.
const collectionQuery = ref<string | null>('');
const actorQuery = ref<string | null>('');
const debounced = reactive({ collection: '', actor: '' });
let timer: ReturnType<typeof setTimeout> | undefined;
watch([collectionQuery, actorQuery], ([c, a]) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    debounced.collection = (c ?? '').trim();
    debounced.actor = (a ?? '').trim();
  }, 300);
});
const collections = useQuery({
  queryKey: computed(() => ['discover', 'collection-search', debounced.collection] as const),
  queryFn: ({ signal }) => discoverApi.collectionSearch(debounced.collection, signal),
  enabled: computed(() => debounced.collection.length >= 2),
  retry: false,
});
const actors = useQuery({
  queryKey: computed(() => ['discover', 'person-search', debounced.actor] as const),
  queryFn: ({ signal }) => discoverApi.personSearch(debounced.actor, signal),
  enabled: computed(() => debounced.actor.length >= 2),
  retry: false,
});
const collectionId = ref<number | null>(null);
const actor = ref<PersonHit | null>(null);
const actorId = computed({
  get: () => actor.value?.id ?? null,
  set: (value) => {
    if (value === null) actor.value = null;
  },
});
</script>

<template>
  <v-container fluid class="py-4" data-test="explorer-view">
    <ServiceDownBanner service="tmdb" />
    <div class="d-flex align-center ga-2 mb-2">
      <v-btn :to="{ name: 'tmdb' }" variant="text" :prepend-icon="mdiArrowLeft">{{
        t('decouverte.explorer.back_to_discover')
      }}</v-btn>
    </div>
    <p class="text-body-medium text-muted mb-4">{{ t('decouverte.explorer.subtitle') }}</p>

    <v-row>
      <v-col cols="12" md="4" lg="3">
        <v-card variant="tonal" class="pa-3">
          <div class="text-label-large mb-1">{{ t('decouverte.explorer.section.type') }}</div>
          <v-btn-toggle
            v-model="filters.type"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="mb-3"
          >
            <v-btn value="movie">{{ t('decouverte.filters.movies') }}</v-btn>
            <v-btn value="tv">{{ t('decouverte.filters.series') }}</v-btn>
          </v-btn-toggle>

          <div class="text-label-large mb-1">{{ t('decouverte.explorer.section.genre') }}</div>
          <v-chip-group v-model="filters.genres" multiple column class="mb-2">
            <v-chip
              v-for="g in genres.data.value?.genres ?? []"
              :key="g.id"
              :value="g.id"
              filter
              size="small"
              >{{ g.name }}</v-chip
            >
          </v-chip-group>

          <div class="text-label-large mb-1">{{ t('decouverte.explorer.section.decade') }}</div>
          <v-chip-group v-model="filters.decade" column class="mb-2">
            <v-chip v-for="d in DECADES" :key="d" :value="d" filter size="small">{{
              t('decouverte.explorer.decade_label', { decade: d })
            }}</v-chip>
          </v-chip-group>

          <div class="text-label-large mb-1">{{ t('decouverte.explorer.section.sort') }}</div>
          <v-chip-group v-model="filters.sort" mandatory column class="mb-3">
            <v-chip v-for="(_, key) in SORTS" :key="key" :value="key" filter size="small">{{
              t(`decouverte.explorer.sort_options.${key}`)
            }}</v-chip>
          </v-chip-group>
          <v-btn
            block
            color="primary"
            :loading="loading"
            data-test="explorer-search"
            @click="run()"
            >{{ t('decouverte.explorer.search') }}</v-btn
          >

          <v-divider class="my-4" />
          <div class="text-label-large mb-1">
            {{ t('decouverte.explorer.section.collections') }}
          </div>
          <v-filter-field
            v-model="collectionQuery"
            :placeholder="t('decouverte.explorer.collection_search')"
            density="compact"
            hide-details
            variant="outlined"
            clearable
          />
          <v-list density="compact" class="bg-transparent">
            <v-list-item
              v-for="c in collections.data.value?.results ?? []"
              :key="c.id"
              :title="c.name"
              @click="collectionId = c.id"
            >
              <template #prepend>
                <v-avatar rounded="sm" size="32" color="surface-alt"
                  ><v-img v-if="c.poster" :src="c.poster" cover
                /></v-avatar>
              </template>
            </v-list-item>
          </v-list>

          <div class="text-label-large mb-1 mt-2">
            {{ t('decouverte.explorer.section.by_actor') }}
          </div>
          <v-filter-field
            v-model="actorQuery"
            :placeholder="t('decouverte.explorer.actor_search')"
            density="compact"
            hide-details
            variant="outlined"
            clearable
          />
          <v-list density="compact" class="bg-transparent">
            <v-list-item
              v-for="p in actors.data.value?.results ?? []"
              :key="p.id"
              :title="p.name"
              :subtitle="p.known"
              @click="actor = p"
            >
              <template #prepend>
                <v-avatar size="32" color="surface-alt"
                  ><v-img v-if="p.profile" :src="p.profile" cover
                /></v-avatar>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="8" lg="9">
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          t('decouverte.explorer.network_error')
        }}</v-alert>
        <div v-if="page > 0" class="d-flex text-body-small text-muted mb-2">
          {{ t('decouverte.explorer.results_count', { count: totalResults }) }}
          <v-spacer />
          {{ t('decouverte.explorer.page', { current: page, total: totalPages }) }}
        </div>
        <div class="media-grid" data-test="explorer-results">
          <MediaCard
            v-for="card in results"
            :key="`${card.type}-${card.id}`"
            :card="card"
            @open="openCard"
          />
        </div>
        <EmptyState
          v-if="page === 0 && !loading"
          :icon="mdiCompassOutline"
          :title="t('decouverte.explorer.title')"
          :text="t('decouverte.explorer.empty_hint')"
        />
        <EmptyState
          v-else-if="page > 0 && results.length === 0 && !loading"
          :icon="mdiCompassOutline"
          :title="t('decouverte.explorer.no_results')"
        />
        <div v-if="page > 0 && page < totalPages" class="text-center mt-4">
          <v-btn variant="tonal" :loading="loading" @click="run(true)">{{
            t('decouverte.explorer.load_more')
          }}</v-btn>
        </div>
      </v-col>
    </v-row>

    <TmdbDetailDialog v-model="detail" />
    <CollectionSheet v-model="collectionId" @open="openCard" />
    <PersonSheet v-model="actorId" :name="actor?.name ?? ''" @open="openCard" />
  </v-container>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
</style>
