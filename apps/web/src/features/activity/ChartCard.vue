<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'un graphique : titre, actions (slot), chargement, état vide.
import type { Chart } from '@hubarr/shared';
import BarChart from './BarChart.vue';
import { chartIsEmpty } from './activity-api';

defineProps<{
  title: string;
  chart: Chart | undefined;
  loading: boolean;
  emptyText: string;
  format?: ((v: number) => string) | undefined;
}>();
</script>

<template>
  <v-card variant="flat" border class="h-100" data-test="chart-card">
    <v-card-title class="d-flex flex-wrap align-center ga-2 text-title-small">
      {{ title }}
      <v-spacer />
      <slot name="actions" />
    </v-card-title>
    <v-card-text>
      <v-progress-linear v-if="loading" indeterminate color="service" />
      <p v-else-if="chartIsEmpty(chart)" class="text-center text-muted py-6">{{ emptyText }}</p>
      <BarChart v-else-if="chart" :chart="chart" v-bind="format ? { format } : {}" />
    </v-card-text>
  </v-card>
</template>
