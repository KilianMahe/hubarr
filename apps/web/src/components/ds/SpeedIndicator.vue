<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vitesses ↓ / ↑ (clients de téléchargement, tableau de bord) : flèches en
// icônes, valeurs formatées ; `large` pour l'en-tête d'un client.
import { msArrowDownward, msArrowUpward } from '../symbols';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';

withDefaults(defineProps<{ down: number; up?: number | null; large?: boolean }>(), {
  up: null,
});
const format = useFormat();
const { t } = useI18n();
</script>

<template>
  <span class="speed" :class="{ 'speed--large': large }" data-test="speed-indicator">
    <span class="speed__item text-info" :title="t('dashboard.transmission.dl_speed')">
      <v-icon :icon="msArrowDownward" :size="large ? 22 : 14" />{{ format.speed(down) }}
    </span>
    <span
      v-if="up !== null"
      class="speed__item text-success"
      :title="t('dashboard.transmission.up_speed')"
    >
      <v-icon :icon="msArrowUpward" :size="large ? 22 : 14" />{{ format.speed(up) }}
    </span>
  </span>
</template>

<style scoped>
.speed {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.speed__item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.speed--large {
  font-size: 1.5rem;
  line-height: 1.2;
  column-gap: 20px;
}
@media (max-width: 599px) {
  .speed--large {
    font-size: 1.2rem;
    column-gap: 12px;
  }
}
</style>
