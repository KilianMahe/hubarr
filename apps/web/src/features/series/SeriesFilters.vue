<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Menus de filtre (genre, chaîne) et de tri. Les choix viennent des facettes
// de toute la bibliothèque : un filtre ne vide jamais les menus.
import {
  SERIES_LIBRARY_SORTS,
  type SeriesLibraryQuery,
  type SeriesLibrarySort,
} from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  query: SeriesLibraryQuery;
  facets: { genres: string[]; networks: string[] };
  /** Empilés (panneau mobile) plutôt qu'en ligne. */
  stacked?: boolean;
}>();
const emit = defineEmits<{ change: [patch: Partial<SeriesLibraryQuery>] }>();
const { t } = useI18n();

const options = (values: string[], allKey: string) => [
  { value: '', title: t(allKey) },
  ...values.map((value) => ({ value, title: value })),
];
const genres = computed(() => options(props.facets.genres, 'media.series.filters.genre'));
const networks = computed(() => options(props.facets.networks, 'media.series.filters.network'));
const sorts = computed(() =>
  SERIES_LIBRARY_SORTS.map((value) => ({
    value,
    title: t(`media.series.filters.sort.${value.replace('-', '_')}`),
  })),
);
const fieldProps = { density: 'compact', variant: 'outlined', hideDetails: true } as const;
</script>

<template>
  <div class="series-filters" :class="{ 'series-filters--stacked': stacked }">
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.genre"
      :items="genres"
      :label="t('media.series.filters.genre')"
      data-test="filter-genre"
      @update:model-value="(value: string) => emit('change', { genre: value })"
    />
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.network"
      :items="networks"
      :label="t('media.series.filters.network')"
      data-test="filter-network"
      @update:model-value="(value: string) => emit('change', { network: value })"
    />
    <v-filter-select
      v-bind="fieldProps"
      :model-value="query.sort"
      :items="sorts"
      :label="t('decouverte.filters.sort')"
      data-test="filter-sort"
      @update:model-value="(value: SeriesLibrarySort) => emit('change', { sort: value })"
    />
  </div>
</template>

<style scoped>
.series-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 8px;
}
.series-filters--stacked {
  grid-template-columns: 1fr;
}
</style>
