<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Collections Radarr (`media/films_collections.html.twig`) : statistiques
// (collections, films, téléchargés), grille d'affiches (suivi, progression),
// suivre / ne plus suivre ; une collection s'ouvre sur ses films, avec l'ajout
// des films absents de la bibliothèque (profil et dossier de la collection,
// à défaut ceux de l'instance). Recherche et filtres (suivie, non suivie, avec
// films manquants) côté client, portés par l'URL (P5c.5, V6).
import type { CollectionMovie, MovieCollection } from '@hubarr/shared';
import { msAdd, msCheck, msSearch } from '../../components/symbols';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from './RadarrNav.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { posterUrl } from './movie-display';
import { moviesApi, moviesKeys } from './movies-api';
import { useRoutePage } from './useRoutePage';
import StatTile from '../../components/ds/StatTile.vue';
import FilterChips from '../../components/ds/FilterChips.vue';
import {
  COLLECTION_FILTERS,
  collectionFilterCounts,
  collectionFilterOf,
  filterCollections,
  type CollectionFilter,
} from './collections';

const { t } = useI18n();
const queryClient = useQueryClient();
const { slug, route, router } = useRoutePage();

const collections = useQuery({
  queryKey: computed(() => moviesKeys.page(slug.value, 'collections', '')),
  queryFn: ({ signal }) => moviesApi.collections(slug.value, signal),
  retry: false,
});
const all = computed(() => collections.data.value ?? []);

// ── Recherche et filtres (V6) ───────────────────────────────────────────────
const show = computed(() => collectionFilterOf(route.query.show));
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));
function setShow(value: CollectionFilter): void {
  const query = { ...route.query };
  if (value === 'all') delete query.show;
  else query.show = value;
  void router.push({ query });
}
const search = ref<string | null>(q.value);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const text = (value ?? '').trim();
    if (text === q.value) return;
    const query = { ...route.query };
    if (text === '') delete query.q;
    else query.q = text;
    void router.replace({ query });
  }, 300);
});
watch(q, (value) => {
  if (value !== (search.value ?? '').trim()) search.value = value;
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
});
const counts = computed(() => collectionFilterCounts(all.value, q.value));
const filterOptions = computed(() =>
  COLLECTION_FILTERS.map((value) => ({
    value,
    label: t(`media.arr_lists.filter_${value}`),
    count: counts.value[value],
  })),
);
/** Collections affichées (statistiques : toutes). */
const list = computed(() => filterCollections(all.value, q.value, show.value));
const stats = computed(() => {
  const films = all.value.flatMap((collection) => collection.movies);
  return {
    collections: all.value.length,
    films: films.length,
    downloaded: films.filter((movie) => movie.hasFile).length,
  };
});
const progress = (collection: MovieCollection) => {
  const total = collection.movies.length;
  const done = collection.movies.filter((movie) => movie.hasFile).length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
};

// ── Suivi ───────────────────────────────────────────────────────────────────
const toggling = reactive(new Set<number>());
async function toggleMonitor(collection: MovieCollection): Promise<void> {
  toggling.add(collection.id);
  try {
    const { monitored } = await moviesApi.collectionMonitor(
      slug.value,
      collection.id,
      !collection.monitored,
    );
    queryClient.setQueryData<MovieCollection[]>(
      moviesKeys.page(slug.value, 'collections', ''),
      (old) => old?.map((item) => (item.id === collection.id ? { ...item, monitored } : item)),
    );
  } finally {
    toggling.delete(collection.id);
  }
}

// ── Détail d'une collection ─────────────────────────────────────────────────
const current = ref<MovieCollection | null>(null);
const detailOpen = ref(false);
function openCollection(collection: MovieCollection): void {
  current.value = collection;
  detailOpen.value = true;
}
const hasMissing = computed(() => current.value?.movies.some((movie) => !movie.inLibrary) ?? false);
const config = useQuery({
  queryKey: computed(() => moviesKeys.config(slug.value)),
  queryFn: ({ signal }) => moviesApi.config(slug.value, signal),
  enabled: computed(() => detailOpen.value && hasMissing.value),
  staleTime: 60_000,
});
const form = reactive({ qualityProfileId: 0, rootFolderPath: '' });
watch([current, () => config.data.value], ([collection, value]) => {
  if (collection === null || value === undefined) return;
  const profile =
    value.qualityProfiles.find((p) => p.id === collection.qualityProfileId) ??
    value.qualityProfiles.find((p) => p.id === value.defaultQualityProfileId) ??
    value.qualityProfiles[0];
  form.qualityProfileId = profile?.id ?? 0;
  form.rootFolderPath =
    value.rootFolders.find((f) => f.path === collection.rootFolderPath)?.path ??
    value.rootFolders[0]?.path ??
    '';
});
const adds = reactive(new Map<number, 'running' | 'added' | 'error'>());
const formWarning = ref(false);
async function addMovie(movie: CollectionMovie): Promise<void> {
  if (movie.tmdbId === null) return;
  if (form.qualityProfileId === 0 || form.rootFolderPath === '') {
    formWarning.value = true;
    setTimeout(() => (formWarning.value = false), 2_000);
    return;
  }
  const tmdbId = movie.tmdbId;
  adds.set(tmdbId, 'running');
  try {
    await moviesApi.add(slug.value, {
      tmdbId,
      title: movie.title,
      year: movie.year ?? 0,
      qualityProfileId: form.qualityProfileId,
      rootFolderPath: form.rootFolderPath,
      monitored: true,
      searchForMovie: true,
    });
    adds.set(tmdbId, 'added');
  } catch {
    adds.set(tmdbId, 'error');
  }
}
</script>

<template>
  <v-container fluid class="radarr-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <div class="d-flex align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.films_collections.title') }}</h2>
      <v-chip v-if="collections.data.value" size="small" variant="tonal">{{ list.length }}</v-chip>
    </div>
    <v-progress-linear v-if="collections.isPending.value" indeterminate color="service" />
    <EmptyState
      v-else-if="collections.data.value && all.length === 0"
      :title="t('media.films_collections.empty')"
    />
    <template v-else-if="collections.data.value">
      <div class="collections-stats mb-4" data-test="collections-stats">
        <StatTile :value="stats.collections" :label="t('media.films_collections.stats_total')" />
        <StatTile :value="stats.films" :label="t('media.films_collections.stats_films')" />
        <StatTile
          :value="stats.downloaded"
          :unit="`/ ${stats.films}`"
          :label="t('media.films_collections.stats_downloaded')"
          color="success"
        />
      </div>
      <div class="collections-filters mb-3">
        <v-filter-field
          v-model="search"
          :prepend-inner-icon="msSearch"
          :placeholder="t('media.arr_lists.search_movie')"
          :aria-label="t('media.arr_lists.search_movie')"
          density="compact"
          variant="outlined"
          clearable
          class="collections-filters__search"
          data-test="collections-search"
        />
        <FilterChips
          :model-value="show"
          :options="filterOptions"
          test-prefix="collections-filter"
          :aria-label="t('media.arr_lists.filter_label')"
          @update:model-value="setShow"
        />
      </div>
      <EmptyState
        v-if="list.length === 0"
        inline
        :title="q ? t('media.arr_lists.no_match', { q }) : t('media.arr_lists.no_match_filters')"
      />
      <div v-else class="collections-grid">
        <div
          v-for="collection in list"
          :key="collection.id"
          class="collection-card"
          data-test="collection-card"
        >
          <button
            type="button"
            class="collection-card__hit"
            :title="collection.title"
            @click="openCollection(collection)"
          >
            <img
              v-if="posterUrl(collection.poster, 'w342')"
              :src="posterUrl(collection.poster, 'w342')!"
              :alt="collection.title"
              loading="lazy"
            />
            <div v-else class="collection-card__no-poster">{{ collection.title }}</div>
            <v-chip
              v-if="collection.monitored"
              size="x-small"
              color="success"
              variant="flat"
              class="collection-card__badge"
              >{{ t('media.films_collections.monitored_badge') }}</v-chip
            >
            <div class="collection-card__overlay">
              <div class="text-body-small font-weight-medium text-truncate">
                {{ collection.title }}
              </div>
              <div class="text-label-small">
                {{ progress(collection).done }}/{{ progress(collection).total }}
                {{ t('media.films_collections.films_count_suffix') }}
              </div>
              <v-progress-linear
                :model-value="progress(collection).pct"
                :color="progress(collection).pct === 100 ? 'success' : 'service'"
                height="3"
                rounded
                class="mt-1"
              />
            </div>
          </button>
          <v-btn
            block
            size="x-small"
            :variant="collection.monitored ? 'tonal' : 'flat'"
            :color="collection.monitored ? undefined : 'service'"
            :loading="toggling.has(collection.id)"
            class="mt-1"
            data-test="collection-monitor"
            @click="toggleMonitor(collection)"
            >{{
              t(
                collection.monitored
                  ? 'media.films_collections.unfollow'
                  : 'media.films_collections.follow',
              )
            }}</v-btn
          >
        </div>
      </div>
    </template>

    <ResponsiveDialog v-model="detailOpen" :title="current?.title ?? ''" :max-width="720">
      <template v-if="current">
        <p v-if="current.overview" class="text-body-small text-muted mb-3">
          {{ current.overview }}
        </p>
        <v-row
          v-if="hasMissing"
          density="compact"
          class="mb-2 collection-config"
          :class="{ 'collection-config--warn': formWarning }"
        >
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.qualityProfileId"
              :items="
                (config.data.value?.qualityProfiles ?? []).map((p) => ({
                  value: p.id,
                  title: p.name,
                }))
              "
              :label="t('media.films_collections.modal.quality_profile')"
              :loading="config.isPending.value"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.rootFolderPath"
              :items="(config.data.value?.rootFolders ?? []).map((f) => f.path)"
              :label="t('media.films_collections.modal.root_folder')"
              :loading="config.isPending.value"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
        </v-row>
        <div class="text-body-small text-muted mb-2">
          {{ t('media.films_collections.modal.film_count', { count: current.movies.length }) }}
        </div>
        <v-list density="compact" class="py-0">
          <v-list-item
            v-for="movie in current.movies"
            :key="movie.tmdbId ?? movie.title"
            data-test="collection-movie"
          >
            <template #prepend>
              <img
                v-if="posterUrl(movie.poster, 'w92')"
                :src="posterUrl(movie.poster, 'w92')!"
                alt=""
                class="collection-thumb"
                loading="lazy"
              />
              <div v-else class="collection-thumb" />
            </template>
            <v-list-item-title>{{ movie.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ movie.year ?? '—' }}</v-list-item-subtitle>
            <template #append>
              <v-chip v-if="movie.hasFile" size="small" variant="tonal" color="success">{{
                t('media.films_collections.modal.downloaded')
              }}</v-chip>
              <v-chip v-else-if="movie.inLibrary" size="small" variant="tonal" color="warning">{{
                t('media.films_collections.modal.missing')
              }}</v-chip>
              <v-chip
                v-else-if="movie.tmdbId !== null && adds.get(movie.tmdbId) === 'added'"
                size="small"
                variant="tonal"
                color="success"
              >
                <v-icon :icon="msCheck" start size="14" />{{
                  t('media.films_collections.modal.added')
                }}
              </v-chip>
              <v-btn
                v-else
                :prepend-icon="msAdd"
                size="small"
                :color="
                  movie.tmdbId !== null && adds.get(movie.tmdbId) === 'error' ? 'error' : 'service'
                "
                variant="flat"
                :loading="movie.tmdbId !== null && adds.get(movie.tmdbId) === 'running'"
                data-test="collection-add"
                @click="addMovie(movie)"
                >{{
                  movie.tmdbId !== null && adds.get(movie.tmdbId) === 'error'
                    ? t('media.films_collections.modal.error')
                    : t('media.films_collections.modal.add')
                }}</v-btn
              >
            </template>
          </v-list-item>
        </v-list>
      </template>
      <template #actions>
        <v-btn
          v-if="current"
          :color="current.monitored ? undefined : 'service'"
          :variant="current.monitored ? 'text' : 'flat'"
          @click="
            (toggleMonitor(current), (current = { ...current, monitored: !current.monitored }))
          "
          >{{
            t(
              current.monitored
                ? 'media.films_collections.unfollow'
                : 'media.films_collections.follow',
            )
          }}</v-btn
        >
        <v-btn variant="text" @click="detailOpen = false">{{
          t('media.films_collections.modal.close')
        }}</v-btn>
      </template>
    </ResponsiveDialog>
  </v-container>
</template>

<style scoped>
.collections-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.collections-filters__search {
  flex: 1 1 260px;
  max-width: 420px;
}
.collections-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.collections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.collection-card__hit {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: inherit;
  font: inherit;
  text-align: left;
}
.collection-card__hit img,
.collection-card__no-poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
}
.collection-card__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  font-weight: 600;
}
.collection-card__badge {
  position: absolute;
  top: 6px;
  right: 6px;
}
.collection-card__overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: 24px 8px 8px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
}
.collection-thumb {
  width: 32px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.collection-config {
  border-radius: 8px;
  outline: 2px solid transparent;
  transition: outline-color 0.2s;
}
.collection-config--warn {
  outline-color: rgb(var(--v-theme-error));
}
@media (max-width: 599px) {
  .collections-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }
}
</style>
