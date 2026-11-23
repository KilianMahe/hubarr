<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Grille des films ou des séries de Bazarr (`bazarr/_grid.html.twig`, routes
// n° 16 et 17) : recherche, segments (tous, complet, manquant, non suivi),
// langue manquante, tri, affichage par fenêtres de 60. Un film ouvre la
// recherche de sous-titres ; une série mène à ses épisodes.
import type { BazarrCard } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { posterUrl } from '../movies/movie-display';
import BazarrPage from './BazarrPage.vue';
import SubtitleSearchDialog from './SubtitleSearchDialog.vue';
import { bazarrApi, bazarrKeys } from './bazarr-api';
import { GRID_WINDOW, filterCards, type GridFilters, type GridSegment } from './grid';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps<{ kind: 'movie' | 'series' }>();
const { t } = useI18n();
const router = useRouter();
const grid = useQuery({
  queryKey: computed(() => bazarrKeys.grid(props.kind)),
  queryFn: ({ signal }) => bazarrApi.grid(props.kind, signal),
  retry: false,
});
const filters = reactive<GridFilters>({ q: '', segment: 'all', lang: '', sort: 'title-asc' });
const shown = ref(GRID_WINDOW);
watch(filters, () => (shown.value = GRID_WINDOW));
const filtered = computed(() => filterCards(grid.data.value?.cards ?? [], filters));
const visible = computed(() => filtered.value.slice(0, shown.value));
const SEGMENTS: { value: GridSegment; key: string }[] = [
  { value: 'all', key: 'status_all' },
  { value: 'complete', key: 'status_complete' },
  { value: 'missing', key: 'status_missing' },
  { value: 'not-tracked', key: 'status_not_tracked' },
];
const languageItems = computed(() => [
  { value: '', title: t('bazarr.filter.all_languages') },
  ...(grid.data.value?.languages ?? []).map((code) => ({ value: code, title: code.toUpperCase() })),
]);
const sortItems = computed(() => [
  { value: 'title-asc', title: t('bazarr.filter.sort_title_asc') },
  { value: 'missing-desc', title: t('bazarr.filter.sort_missing_desc') },
]);

const search = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });
function openCard(card: BazarrCard): void {
  if (props.kind === 'series' && card.seriesId !== null) {
    void router.push({ name: 'bazarr-series-detail', params: { seriesId: card.seriesId } });
  } else if (props.kind === 'movie' && card.movieId !== null) {
    search.id = card.movieId;
    search.open = true;
  }
}
const chip = (card: BazarrCard) =>
  card.substate === 'complete'
    ? t('bazarr.grid.complete')
    : card.substate === 'missing'
      ? `${t('bazarr.badge.missing')} ${card.count}`
      : t('bazarr.grid.not_tracked');
</script>

<template>
  <BazarrPage
    :title="t(kind === 'movie' ? 'bazarr.movies.title' : 'bazarr.series.title')"
    :loading="grid.isPending.value"
    :error="grid.isError.value"
    :warming="grid.data.value?.state === 'warming'"
    @reload="grid.refetch()"
  >
    <v-card v-if="grid.data.value" variant="flat" border>
      <EmptyState
        v-if="grid.data.value.cards.length === 0"
        inline
        :title="t(kind === 'movie' ? 'bazarr.movies.empty' : 'bazarr.series.empty')"
      />
      <template v-else>
        <v-card-text class="d-flex flex-wrap align-center ga-2">
          <v-filter-field
            v-model="filters.q"
            :placeholder="t('bazarr.filter.search_placeholder')"
            type="search"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 240px"
            data-test="bazarr-grid-search"
          />
          <v-btn-toggle
            v-model="filters.segment"
            mandatory
            density="compact"
            variant="outlined"
            divided
            color="service-text"
          >
            <v-btn
              v-for="segment in SEGMENTS"
              :key="segment.value"
              :value="segment.value"
              size="small"
              :data-test="`bazarr-segment-${segment.value}`"
              >{{ t(`bazarr.filter.${segment.key}`) }}</v-btn
            >
          </v-btn-toggle>
          <v-filter-select
            v-if="grid.data.value.languages.length > 0"
            v-model="filters.lang"
            :items="languageItems"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 180px"
          />
          <v-filter-select
            v-model="filters.sort"
            :items="sortItems"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 240px"
          />
        </v-card-text>
        <v-divider />
        <v-card-text>
          <EmptyState
            v-if="filtered.length === 0"
            inline
            :title="t('bazarr.grid.empty_filtered')"
          />
          <div class="bazarr-grid">
            <button
              v-for="(card, index) in visible"
              :key="`${card.movieId ?? card.seriesId}-${index}`"
              type="button"
              class="bazarr-card"
              :title="card.title"
              data-test="bazarr-card"
              @click="openCard(card)"
            >
              <div class="bazarr-card__poster">
                <img
                  v-if="posterUrl(card.poster, 'w185')"
                  :src="posterUrl(card.poster, 'w185') ?? ''"
                  :alt="card.title"
                  loading="lazy"
                />
                <div v-else class="bazarr-card__no-poster text-body-small">{{ card.title }}</div>
                <span class="bazarr-card__chip" :class="`bazarr-card__chip--${card.substate}`">{{
                  chip(card)
                }}</span>
              </div>
              <div class="text-body-medium font-weight-medium text-truncate mt-1">
                {{ card.title }}
              </div>
              <div class="text-body-small text-muted">{{ card.year ?? '' }}</div>
            </button>
          </div>
          <div v-if="shown < filtered.length" class="text-center mt-4">
            <v-btn variant="tonal" data-test="bazarr-grid-more" @click="shown += GRID_WINDOW">{{
              t('common.action.view_more')
            }}</v-btn>
          </div>
        </v-card-text>
      </template>
    </v-card>
    <SubtitleSearchDialog
      v-model="search.open"
      kind="movie"
      :item-id="search.id"
      @downloaded="grid.refetch()"
    />
  </BazarrPage>
</template>

<style scoped>
.bazarr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
.bazarr-card {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bazarr-card__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt));
}
.bazarr-card__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bazarr-card__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  text-align: center;
}
.bazarr-card__chip {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
}
.bazarr-card__chip--missing {
  color: rgb(var(--v-theme-warning));
}
.bazarr-card__chip--complete {
  color: rgb(var(--v-theme-success));
}
</style>
