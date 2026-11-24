<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue étagères : séries de la page groupées (en cours, animés, terminées, à
// venir, non suivies), en rangées défilantes ; chaque étagère se déplie en grille.
import type { SeriesLibraryItem } from '@hubarr/shared';
import {
  msCheck,
  msChevronRight,
  msLocalFlorist,
  msOnlinePrediction,
  msTv,
  msVisibility,
} from '../../components/symbols';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { showEpisodes, useWatched, watchedCount } from '../activity/watched';
import ScrollRow from '../../components/ScrollRow.vue';
import SeriesCard from './SeriesCard.vue';
import { SERIES_SHELF_LABELS, seriesShelvesOf, type SeriesShelfKey } from './library';

const props = defineProps<{
  series: SeriesLibraryItem[];
  selectMode: boolean;
  selected: ReadonlySet<number>;
}>();
const emit = defineEmits<{
  select: [id: number, event: MouseEvent | KeyboardEvent];
  open: [id: number];
  monitor: [id: number];
}>();
const { t } = useI18n();

const shelves = computed(() => seriesShelvesOf(props.series));
const watched = useWatched();
const watchedOf = (entry: SeriesLibraryItem) =>
  watchedCount(showEpisodes(watched.value, { tvdbId: entry.tvdbId }));
const expanded = reactive<Record<SeriesShelfKey, boolean>>({
  continuing: false,
  anime: false,
  ended: false,
  upcoming: false,
  unmonitored: false,
});
const ICONS: Record<SeriesShelfKey, string> = {
  continuing: msTv,
  anime: msLocalFlorist,
  ended: msCheck,
  upcoming: msOnlinePrediction,
  unmonitored: msVisibility,
};
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <section v-for="shelf in shelves" :key="shelf.key" :data-shelf="shelf.key">
      <h2 class="d-flex align-center ga-2 text-title-medium mb-2">
        <v-btn
          :icon="msChevronRight"
          size="small"
          variant="text"
          :class="{ 'shelf-chevron--open': expanded[shelf.key] }"
          class="shelf-chevron"
          :aria-expanded="expanded[shelf.key]"
          :aria-label="t(SERIES_SHELF_LABELS[shelf.key])"
          @click="expanded[shelf.key] = !expanded[shelf.key]"
        />
        <v-icon :icon="ICONS[shelf.key]" size="18" />
        {{ t(SERIES_SHELF_LABELS[shelf.key]) }}
        <span class="text-body-small text-muted">({{ shelf.items.length }})</span>
      </h2>
      <component
        :is="expanded[shelf.key] ? 'div' : ScrollRow"
        :class="{ 'shelf-grid': expanded[shelf.key] }"
        v-bind="expanded[shelf.key] ? {} : { itemWidth: '120px' }"
      >
        <SeriesCard
          v-for="entry in shelf.items"
          :key="`${shelf.key}-${entry.id}`"
          :series="entry"
          :select-mode="selectMode"
          :selected="selected.has(entry.id)"
          compact
          :watched-episodes="watchedOf(entry)"
          @select="emit('select', entry.id, $event)"
          @open="emit('open', entry.id)"
          @monitor="emit('monitor', entry.id)"
        />
      </component>
    </section>
  </div>
</template>

<style scoped>
.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.shelf-chevron {
  transition: transform 0.2s;
}
.shelf-chevron--open {
  transform: rotate(90deg);
}
</style>
