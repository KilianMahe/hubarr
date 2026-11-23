<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue étagères : films de la page groupés par statut (téléchargés, manquants,
// non suivis), en rangées défilantes ; chaque étagère se déplie en grille.
import type { MovieLibraryItem } from '@hubarr/shared';
import { mdiAlert, mdiCheck, mdiChevronRight, mdiEye } from '@mdi/js';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import MovieCard from './MovieCard.vue';
import { shelvesOf, type ShelfKey } from './library';

const props = defineProps<{
  movies: MovieLibraryItem[];
  selectMode: boolean;
  selected: ReadonlySet<number>;
}>();
const emit = defineEmits<{
  select: [id: number, event: MouseEvent | KeyboardEvent];
  open: [id: number];
  monitor: [id: number];
}>();
const { t } = useI18n();

const shelves = computed(() => shelvesOf(props.movies));
const expanded = reactive<Record<ShelfKey, boolean>>({
  downloaded: false,
  missing: false,
  unmonitored: false,
});
const ICONS: Record<ShelfKey, string> = {
  downloaded: mdiCheck,
  missing: mdiAlert,
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
          :aria-label="t(`media.films.status.${shelf.key}`)"
          @click="expanded[shelf.key] = !expanded[shelf.key]"
        />
        <v-icon :icon="ICONS[shelf.key]" size="18" />
        {{ t(`media.films.status.${shelf.key}`) }}
        <span class="text-body-small text-muted">({{ shelf.items.length }})</span>
      </h2>
      <div :class="expanded[shelf.key] ? 'shelf-grid' : 'shelf-row'">
        <MovieCard
          v-for="movie in shelf.items"
          :key="movie.id"
          :movie="movie"
          :select-mode="selectMode"
          :selected="selected.has(movie.id)"
          compact
          @select="emit('select', movie.id, $event)"
          @open="emit('open', movie.id)"
          @monitor="emit('monitor', movie.id)"
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
