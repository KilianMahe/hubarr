<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue étagères : séries de la page groupées (en cours, animés, terminées, à
// venir, non suivies), en rangées défilantes ; chaque étagère se déplie en grille.
import type { SeriesLibraryItem } from '@hubarr/shared';
import {
  mdiCheck,
  mdiChevronRight,
  mdiCrystalBall,
  mdiEye,
  mdiFlower,
  mdiTelevision,
} from '@mdi/js';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
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
const expanded = reactive<Record<SeriesShelfKey, boolean>>({
  continuing: false,
  anime: false,
  ended: false,
  upcoming: false,
  unmonitored: false,
});
const ICONS: Record<SeriesShelfKey, string> = {
  continuing: mdiTelevision,
  anime: mdiFlower,
  ended: mdiCheck,
  upcoming: mdiCrystalBall,
  unmonitored: mdiEye,
};
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <section v-for="shelf in shelves" :key="shelf.key" :data-shelf="shelf.key">
      <h2 class="d-flex align-center ga-2 text-title-medium mb-2">
        <v-btn
          :icon="mdiChevronRight"
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
      <div :class="expanded[shelf.key] ? 'shelf-grid' : 'shelf-row'">
        <SeriesCard
          v-for="entry in shelf.items"
          :key="`${shelf.key}-${entry.id}`"
          :series="entry"
          :select-mode="selectMode"
          :selected="selected.has(entry.id)"
          compact
          @select="emit('select', entry.id, $event)"
          @open="emit('open', entry.id)"
          @monitor="emit('monitor', entry.id)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.shelf-row {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 120px;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}
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
