<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Santé des services (`_health.html.twig`) : une pastille par instance
// Radarr/Sonarr active puis par service configuré, relue toutes les 30 s
// (onglet visible). Puces compactes « nom + pastille » (état et latence en
// infobulle et pour les lecteurs d'écran) et résumé « n / total en ligne »
// (maquette P0, P5b.1 D2).
import { mdiHeartPulse } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../../../app/stores/session';
import { HEALTH_POLL_MS, dashboardApi } from '../dashboard-api';
import DashCard from './DashCard.vue';
import { useLiveQuery } from '../../../app/live';

const { t } = useI18n();
const session = useSessionStore();
const COLORS = {
  up: 'success',
  slow: 'warning',
  very_slow: 'warning',
  degraded: 'warning',
  down: 'error',
} as const;
const query = useQuery({
  queryKey: ['dashboard', 'health'],
  queryFn: ({ signal }) => dashboardApi.health(signal),
  refetchInterval: useLiveQuery({
    topic: 'health',
    queryKey: ['dashboard', 'health'],
    fallbackMs: HEALTH_POLL_MS,
  }),
  retry: false,
});
const chips = computed(() => query.data.value?.chips ?? []);
const upCount = computed(() => chips.value.filter((chip) => chip.status === 'up').length);
const chipLabel = (chip: (typeof chips.value)[number]) =>
  [
    chip.name,
    t(`dashboard.health.status_${chip.status}`),
    chip.latencyMs !== null ? `${chip.latencyMs} ms` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
</script>

<template>
  <DashCard
    :title="t('dashboard.health.title')"
    :icon="mdiHeartPulse"
    :to="session.isAdmin ? { name: 'settings', hash: '#section-services' } : undefined"
    :link-label="t('dashboard.health.settings_cta')"
    :loading="query.isPending.value"
    data-test="card-health"
  >
    <p
      v-if="query.data.value && query.data.value.chips.length === 0"
      class="text-body-medium text-muted"
    >
      {{ t('dashboard.health.none_configured') }}
    </p>
    <p v-if="chips.length > 0" class="text-body-medium mb-2" data-test="health-summary">
      {{ t('dashboard.health.summary', { up: upCount, total: chips.length }) }}
    </p>
    <div class="d-flex flex-wrap ga-1">
      <v-chip
        v-for="chip in chips"
        :key="`${chip.id}-${chip.name}`"
        size="small"
        :variant="chip.status === 'up' ? 'outlined' : 'tonal'"
        :color="chip.status === 'up' ? undefined : COLORS[chip.status]"
        :title="chipLabel(chip)"
        :aria-label="chipLabel(chip)"
        data-test="health-chip"
      >
        <v-badge dot inline :color="COLORS[chip.status]" class="me-1" />
        {{ chip.name }}
      </v-chip>
    </div>
  </DashCard>
</template>
