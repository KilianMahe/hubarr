<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête de colonne triable (P5c.5, V5) : bouton dans le `<th>`, flèche du
// sens courant, `aria-sort` sur la colonne triée.
import { msArrowDownward, msArrowUpward, msSwapVert } from './symbols';
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  /** Colonne de cet en-tête. */
  column: string;
  /** Colonne et sens du tri courant. */
  sort: string;
  dir: 'asc' | 'desc';
}>();
const emit = defineEmits<{ sort: [column: string] }>();
const active = computed(() => props.sort === props.column);
const ariaSort = computed(() =>
  active.value ? (props.dir === 'asc' ? 'ascending' : 'descending') : 'none',
);
const icon = computed(() =>
  active.value ? (props.dir === 'asc' ? msArrowUpward : msArrowDownward) : msSwapVert,
);
</script>

<template>
  <th :aria-sort="ariaSort">
    <button
      type="button"
      class="sortable-th"
      :class="{ 'sortable-th--active': active }"
      :data-test="`sort-${column}`"
      @click="emit('sort', column)"
    >
      {{ label }}
      <v-icon :icon="icon" size="14" aria-hidden="true" />
    </button>
  </th>
</template>

<style scoped>
.sortable-th {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sortable-th :deep(.v-icon) {
  opacity: 0.45;
}
.sortable-th--active {
  color: rgb(var(--v-theme-service-text, var(--v-theme-primary)));
}
.sortable-th--active :deep(.v-icon) {
  opacity: 1;
}
.sortable-th:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
