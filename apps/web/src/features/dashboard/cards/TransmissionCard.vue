<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Transferts Transmission (`_transmission.html.twig`) : vitesses globales,
// compteurs, 5 téléchargements actifs les plus rapides ; relu toutes les 10 s.
import { msDownload } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import { useSessionStore } from '../../../app/stores/session';
import { LIVE_POLL_MS, dashboardApi } from '../dashboard-api';
import DashCard from './DashCard.vue';
import { useLiveQuery } from '../../../app/live';

const { t } = useI18n();
const format = useFormat();
const session = useSessionStore();
const query = useQuery({
  queryKey: ['dashboard', 'transmission'],
  queryFn: ({ signal }) => dashboardApi.transmission(signal),
  refetchInterval: useLiveQuery({
    topic: () => (session.can('transmission', null, 'read') ? 'downloads.transmission' : null),
    queryKey: ['dashboard', 'transmission'],
    fallbackMs: LIVE_POLL_MS,
  }),
  retry: false,
});
</script>

<template>
  <DashCard
    v-if="query.data.value?.available !== false"
    :title="t('dashboard.transmission.title')"
    :icon="msDownload"
    :to="session.can('transmission', null, 'read') ? { name: 'transmission' } : undefined"
    :link-label="t('dashboard.transmission.open_cta')"
    data-test="card-transmission"
  >
    <v-alert v-if="query.data.value?.error" type="warning" variant="tonal" density="compact">{{
      t('dashboard.transmission.unreachable')
    }}</v-alert>
    <template v-else-if="query.data.value?.stats">
      <div class="d-flex flex-wrap ga-2 mb-3">
        <v-chip size="small" label>↓ {{ format.speed(query.data.value.stats.dlSpeed) }}</v-chip>
        <v-chip size="small" label>↑ {{ format.speed(query.data.value.stats.upSpeed) }}</v-chip>
        <v-chip size="small" label color="info"
          >{{ query.data.value.stats.downloading }}
          {{ t('dashboard.transmission.downloading') }}</v-chip
        >
        <v-chip size="small" label color="success"
          >{{ query.data.value.stats.seeding }} {{ t('dashboard.transmission.seeding') }}</v-chip
        >
        <v-chip size="small" label
          >{{ query.data.value.stats.paused }} {{ t('dashboard.transmission.paused') }}</v-chip
        >
      </div>
      <p v-if="query.data.value.active.length === 0" class="text-body-medium text-muted">
        {{ t('dashboard.transmission.empty') }}
      </p>
      <div v-for="item in query.data.value.active" :key="item.hash" class="mb-2">
        <div class="d-flex text-body-small ga-2">
          <span class="text-truncate flex-grow-1" :title="item.name">{{ item.name }}</span>
          <span class="text-no-wrap">{{ format.speed(item.dlSpeed) }}</span>
        </div>
        <v-progress-linear :model-value="item.progress" color="primary" height="6" rounded />
      </div>
    </template>
  </DashCard>
</template>
