<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Téléchargés par jour sur 30 jours (lot 13, admins) : total et moyenne,
// graphique en barres SVG (une barre par jour, détail au survol), clients qui
// n'ont pas répondu. Calculé d'après les éléments encore présents dans les
// clients : rien n'est stocké.
import { SERVICE_SETTINGS } from '@hubarr/shared';
import { msBarChart } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import { dashboardApi, downloadBars, shortDay } from '../dashboard-api';
import DashCard from './DashCard.vue';

const { t, locale } = useI18n();
const format = useFormat();
const query = useQuery({
  queryKey: ['dashboard', 'downloads'],
  queryFn: ({ signal }) => dashboardApi.downloads(signal),
  staleTime: 300_000,
  retry: false,
});
const data = computed(() => query.data.value);
const bars = computed(() => downloadBars(data.value?.days ?? []));
const failed = computed(() =>
  (data.value?.clients ?? [])
    .filter((c) => !c.ok)
    .map((c) => SERVICE_SETTINGS[c.id].label)
    .join(', '),
);
// Grille du graphique : 10 unités par jour, barre de 8 ; hauteur 100.
const BAR_STEP = 10;
const height = (ratio: number, bytes: number) => (bytes > 0 ? Math.max(ratio * 96, 1.5) : 0);
const label = (day: string, bytes: number) =>
  t('dashboard.downloads.bar', { day: shortDay(day, locale.value), size: format.bytes(bytes) });
</script>

<template>
  <DashCard
    v-if="data?.available !== false"
    :title="t('dashboard.downloads.title')"
    :icon="msBarChart"
    :loading="query.isFetching.value && !data"
    data-test="card-downloads"
  >
    <template v-if="data">
      <div class="d-flex flex-wrap ga-6 mb-3">
        <div>
          <div class="text-label-medium text-muted">{{ t('dashboard.downloads.total') }}</div>
          <div class="text-title-large" data-test="downloads-total">
            {{ format.bytes(data.total) }}
          </div>
        </div>
        <div>
          <div class="text-label-medium text-muted">{{ t('dashboard.downloads.average') }}</div>
          <div class="text-title-large" data-test="downloads-average">
            {{ format.bytes(data.average) }}
          </div>
        </div>
      </div>
      <v-alert
        v-if="failed"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-test="downloads-failed"
        >{{ t('dashboard.downloads.failed', { clients: failed }) }}</v-alert
      >
      <svg
        class="downloads-chart"
        :viewBox="`0 0 ${bars.length * BAR_STEP} 100`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="
          t('dashboard.downloads.chart_label', {
            total: format.bytes(data.total),
            days: bars.length,
          })
        "
        data-test="downloads-chart"
      >
        <line x1="0" :x2="bars.length * BAR_STEP" y1="99.5" y2="99.5" class="downloads-axis" />
        <g v-for="(bar, i) in bars" :key="bar.day" class="downloads-day">
          <!-- Zone de survol sur toute la hauteur, même pour un jour vide. -->
          <rect :x="i * BAR_STEP" y="0" :width="BAR_STEP" height="100" fill="transparent">
            <title>{{ label(bar.day, bar.bytes) }}</title>
          </rect>
          <rect
            :x="i * BAR_STEP + 1"
            :y="100 - height(bar.ratio, bar.bytes)"
            :width="BAR_STEP - 2"
            :height="height(bar.ratio, bar.bytes)"
            rx="1"
            class="downloads-bar"
            data-test="downloads-bar"
          >
            <title>{{ label(bar.day, bar.bytes) }}</title>
          </rect>
        </g>
      </svg>
      <div v-if="bars.length" class="d-flex text-body-small text-muted mt-1">
        <span>{{ shortDay(bars[0]?.day ?? '', locale) }}</span>
        <v-spacer />
        <span>{{ shortDay(bars.at(-1)?.day ?? '', locale) }}</span>
      </div>
      <p class="text-body-small text-muted mt-2 mb-0">{{ t('dashboard.downloads.hint') }}</p>
    </template>
  </DashCard>
</template>

<style scoped>
.downloads-chart {
  display: block;
  width: 100%;
  height: 140px;
}
.downloads-axis {
  stroke: rgba(var(--v-border-color), var(--v-border-opacity));
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.downloads-bar {
  fill: rgb(var(--v-theme-primary));
  opacity: 0.8;
}
.downloads-day:hover .downloads-bar {
  opacity: 1;
}
</style>
