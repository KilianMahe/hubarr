<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Progression d'un élément (téléchargement, saison) : barre fine puis ligne de
// métadonnées (slot, rendu par `MetaLine`) ; pourcentage à droite.
import MetaLine from './MetaLine.vue';

withDefaults(defineProps<{ value: number; color?: string; showValue?: boolean }>(), {
  color: 'service',
  showValue: true,
});
</script>

<template>
  <div class="progress-row" data-test="progress-row">
    <div class="d-flex align-center ga-2">
      <v-progress-linear
        :model-value="value"
        :color="color"
        height="4"
        rounded
        class="flex-grow-1"
        :aria-valuenow="value"
      />
      <span v-if="showValue" class="text-caption text-no-wrap">{{ Math.round(value) }}%</span>
    </div>
    <MetaLine v-if="$slots.default" class="mt-1"><slot /></MetaLine>
  </div>
</template>
