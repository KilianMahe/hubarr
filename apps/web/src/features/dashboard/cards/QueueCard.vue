<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Files d'attente Radarr et Sonarr (P5d.1, V21) : téléchargements de toutes
// les instances activées, problèmes d'abord, relus toutes les 10 s ; titre
// vers la fiche, progression et état, puis un lien vers l'onglet « File
// d'attente » de chaque instance. Réservée aux admins, comme les files.
import { msDownload } from '../../../components/symbols';
import { useQueries } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../../../app/stores/session';
import { moviesApi, moviesKeys } from '../../movies/movies-api';
import { seriesApi, seriesKeys } from '../../series/series-api';
import { LIVE_POLL_MS } from '../dashboard-api';
import { QUEUE_STATE_COLORS, dashboardQueueRows, type QueueSource } from '../dashboard-queue';
import DashCard from './DashCard.vue';

const { t } = useI18n();
const session = useSessionStore();
const MAX_SHOWN = 8;

const instances = computed(() => [
  ...session.services.instances.radarr
    .filter((row) => row.enabled)
    .map((row) => ({ service: 'radarr' as const, slug: row.slug, instance: row.name })),
  ...session.services.instances.sonarr
    .filter((row) => row.enabled)
    .map((row) => ({ service: 'sonarr' as const, slug: row.slug, instance: row.name })),
]);
const queries = useQueries({
  queries: computed(() =>
    instances.value.map((source) => ({
      // Même clé que l'onglet « File d'attente » : cache partagé.
      queryKey:
        source.service === 'radarr' ? moviesKeys.queue(source.slug) : seriesKeys.queue(source.slug),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        source.service === 'radarr'
          ? moviesApi.queue(source.slug, signal)
          : seriesApi.queue(source.slug, signal),
      refetchInterval: LIVE_POLL_MS,
      retry: false,
    })),
  ),
});
const loading = computed(() => queries.value.some((query) => query.isPending));
const rows = computed(() =>
  dashboardQueueRows(
    instances.value.map((source, index): QueueSource => ({
      ...source,
      items: queries.value[index]?.data ?? [],
    })),
  ),
);
const multiple = computed(() => instances.value.length > 1);
</script>

<template>
  <DashCard
    :title="t('dashboard.queue.title')"
    :icon="msDownload"
    :loading="loading"
    data-test="card-queue"
  >
    <template v-if="rows.length > 0" #append>
      <v-chip size="small" color="service" variant="tonal" data-test="queue-total">{{
        rows.length
      }}</v-chip>
    </template>
    <p v-if="!loading && rows.length === 0" class="text-body-medium text-muted py-2">
      {{ t('dashboard.queue.empty') }}
    </p>
    <v-list v-else density="compact" class="py-0 bg-transparent">
      <v-list-item
        v-for="row in rows.slice(0, MAX_SHOWN)"
        :key="row.key"
        :to="row.to ?? undefined"
        class="px-0"
        data-test="dashboard-queue-row"
      >
        <v-list-item-title class="font-weight-medium">{{ row.title }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ [row.detail, multiple ? row.instance : null].filter(Boolean).join(' · ') }}
        </v-list-item-subtitle>
        <div class="d-flex align-center ga-2 mt-1">
          <v-progress-linear
            :model-value="row.progress"
            :color="QUEUE_STATE_COLORS[row.state]"
            :indeterminate="row.state === 'importing'"
            height="5"
            rounded
            :aria-label="t('dashboard.queue.progress', { title: row.title })"
          />
          <span class="text-body-small text-no-wrap">{{ row.progress }} %</span>
        </div>
        <template #append>
          <v-chip
            size="x-small"
            variant="tonal"
            :color="QUEUE_STATE_COLORS[row.state]"
            class="ms-2"
            >{{ t(`dashboard.queue.state.${row.state}`) }}</v-chip
          >
        </template>
      </v-list-item>
    </v-list>
    <p v-if="rows.length > MAX_SHOWN" class="text-body-small text-muted mt-1">
      {{ t('dashboard.queue.more', { count: rows.length - MAX_SHOWN }) }}
    </p>
    <div class="d-flex flex-wrap ga-1 mt-2">
      <v-btn
        v-for="source in instances"
        :key="`${source.service}-${source.slug}`"
        :to="{
          name: source.service === 'radarr' ? 'radarr-queue' : 'sonarr-queue',
          params: { slug: source.slug },
        }"
        variant="text"
        size="small"
        data-test="dashboard-queue-link"
        >{{ t('dashboard.queue.open', { instance: source.instance }) }}</v-btn
      >
    </div>
  </DashCard>
</template>
