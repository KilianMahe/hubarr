<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Menus de filtre (qualité, genre, langue) et de tri. Les choix viennent des
// facettes de toute la bibliothèque : un filtre ne vide jamais les menus.
import { MOVIE_LIBRARY_SORTS, type MovieLibraryQuery, type MovieLibrarySort } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  query: MovieLibraryQuery;
  facets: { genres: string[]; qualities: string[]; languages: string[] };
  /** Empilés (panneau mobile) plutôt qu'en ligne. */
  stacked?: boolean;
}>();
const emit = defineEmits<{ change: [patch: Partial<MovieLibraryQuery>] }>();
const { t } = useI18n();

const options = (values: string[], allKey: string) => [
  { value: '', title: t(allKey) },
  ...values.map((value) => ({ value, title: value })),
];
const qualities = computed(() => options(props.facets.qualities, 'media.films.filters.quality'));
const genres = computed(() => options(props.facets.genres, 'media.films.filters.genre'));
const languages = computed(() => options(props.facets.languages, 'media.films.filters.language'));
const sorts = computed(() =>
  MOVIE_LIBRARY_SORTS.map((value) => ({
    value,
    title: t(`media.films.filters.sort.${value.replace('-', '_')}`),
  })),
);
const fieldProps = { density: 'compact', variant: 'outlined', hideDetails: true } as const;
</script>

<template>
  <div class="movie-filters" :class="{ 'movie-filters--stacked': stacked }">
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.quality"
      :items="qualities"
      :label="t('media.films.filters.quality')"
      data-test="filter-quality"
      @update:model-value="(value: string) => emit('change', { quality: value })"
    />
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.genre"
      :items="genres"
      :label="t('media.films.filters.genre')"
      data-test="filter-genre"
      @update:model-value="(value: string) => emit('change', { genre: value })"
    />
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.language"
      :items="languages"
      :label="t('media.films.filters.language')"
      data-test="filter-language"
      @update:model-value="(value: string) => emit('change', { language: value })"
    />
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.sort"
      :items="sorts"
      :label="t('decouverte.filters.sort')"
      data-test="filter-sort"
      @update:model-value="(value: MovieLibrarySort) => emit('change', { sort: value })"
    />
  </div>
</template>

<style scoped>
.movie-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 8px;
}
.movie-filters--stacked {
  grid-template-columns: 1fr;
}
</style>
