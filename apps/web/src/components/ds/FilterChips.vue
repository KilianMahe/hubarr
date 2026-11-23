<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts" generic="T extends string | number">
// Puces de filtre exclusives, défilant horizontalement sur mobile (une seule
// ligne), avec compteur facultatif. Couleur de sélection : accent du service.
import type { FilterChipOption } from './types';

const model = defineModel<T>({ required: true });
defineProps<{ options: FilterChipOption<T>[]; testPrefix?: string }>();
</script>

<template>
  <v-chip-group
    v-model="model"
    selected-class="text-on-service-container bg-service-container"
    mandatory
    class="filter-chips"
    data-test="filter-chips"
  >
    <v-chip
      v-for="option in options"
      :key="String(option.value)"
      :value="option.value"
      :prepend-icon="option.icon"
      variant="outlined"
      size="small"
      filter
      :data-test="testPrefix ? `${testPrefix}-${option.value}` : undefined"
    >
      {{ option.label }}
      <span
        v-if="option.count !== undefined && option.count !== null"
        class="filter-chips__count"
        >{{ option.count }}</span
      >
    </v-chip>
  </v-chip-group>
</template>

<style scoped>
.filter-chips {
  min-width: 0;
}
.filter-chips :deep(.v-slide-group__content) {
  flex-wrap: nowrap;
}
.filter-chips__count {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
</style>
