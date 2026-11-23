<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Système d'une instance Radarr ou Sonarr (`radarr_system.html.twig`,
// `sonarr_system.html.twig`) : statut, santé, espace disque, clients de
// téléchargement, indexeurs, journaux récents. Chaque section est
// indépendante : une section que l'instance n'a pas servie l'indique. La
// navigation de l'instance passe par le slot `nav`.
import type { ArrSystemResponse } from '@hubarr/shared';
import { mdiCheckCircle } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../app/format';
import { diskUsage, healthColor, logColor } from '../features/movies/system';
import { useRoutePage } from '../features/movies/useRoutePage';
import ServiceDownBanner from './ServiceDownBanner.vue';

const props = defineProps<{
  service: 'radarr' | 'sonarr';
  titleKey: string;
  load: (slug: string, signal?: AbortSignal) => Promise<ArrSystemResponse>;
}>();

const { t } = useI18n();
const format = useFormat();
const { slug } = useRoutePage();

const system = useQuery({
  queryKey: computed(() => [props.service, slug.value, 'page', 'system']),
  queryFn: ({ signal }) => props.load(slug.value, signal),
  retry: false,
});
const data = computed(() => system.data.value);
const yesNo = (value: boolean) =>
  t(value ? 'media.arr_system.status.yes' : 'media.arr_system.status.no');
const HEALTH_KEYS: Record<string, string> = {
  error: 'media.arr_system.health.error',
  warning: 'media.arr_system.health.warning',
};
</script>

<template>
  <v-container fluid class="arr-system-page">
    <ServiceDownBanner :service="service" :instance="slug" />
    <slot name="nav" />
    <h1 class="text-title-large mb-3">{{ t(titleKey) }}</h1>
    <v-progress-linear v-if="system.isPending.value" indeterminate color="service" />
    <div v-else-if="data" class="system-grid">
      <v-card variant="flat" border data-test="system-status">
        <v-card-title class="text-title-medium">{{
          t('media.arr_system.section.status')
        }}</v-card-title>
        <v-card-text>
          <dl v-if="data.status" class="system-dl">
            <dt>{{ t('media.arr_system.status.version') }}</dt>
            <dd class="font-weight-medium">{{ data.status.version ?? '—' }}</dd>
            <dt>{{ t('media.arr_system.status.os') }}</dt>
            <dd>
              {{ [data.status.osName, data.status.osVersion].filter(Boolean).join(' ') || '—' }}
            </dd>
            <dt>{{ t('media.arr_system.status.net') }}</dt>
            <dd>{{ data.status.runtimeVersion ?? '—' }}</dd>
            <dt>{{ t('media.arr_system.status.db') }}</dt>
            <dd>{{ data.status.databaseVersion ?? '—' }}</dd>
            <template v-if="data.status.startTime">
              <dt>{{ t('media.arr_system.status.started') }}</dt>
              <dd>{{ format.dateTime(data.status.startTime) }}</dd>
            </template>
            <dt>{{ t('media.arr_system.status.url_base') }}</dt>
            <dd>{{ data.status.urlBase || '/' }}</dd>
            <template v-if="data.status.isDocker !== null">
              <dt>{{ t('media.arr_system.status.docker') }}</dt>
              <dd>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  :color="data.status.isDocker ? 'info' : undefined"
                  >{{ yesNo(data.status.isDocker) }}</v-chip
                >
              </dd>
            </template>
          </dl>
          <p v-else class="text-muted">{{ t('media.arr_system.status.unavailable') }}</p>
        </v-card-text>
      </v-card>

      <v-card variant="flat" border data-test="system-health">
        <v-card-title class="d-flex align-center ga-2 text-title-medium">
          {{ t('media.arr_system.section.health') }}
          <v-chip
            v-if="data.health && data.health.length > 0"
            size="x-small"
            color="warning"
            variant="tonal"
            >{{ t('media.arr_system.health.alerts_tpl', { count: data.health.length }) }}</v-chip
          >
          <v-chip v-else-if="data.health" size="x-small" color="success" variant="tonal">{{
            t('media.arr_system.health.ok')
          }}</v-chip>
        </v-card-title>
        <v-card-text>
          <p v-if="data.health === null" class="text-muted">
            {{ t('media.arr_system.status.unavailable') }}
          </p>
          <p v-else-if="data.health.length === 0" class="text-success d-flex align-center ga-2">
            <v-icon :icon="mdiCheckCircle" size="18" /> {{ t('media.arr_system.health.empty') }}
          </p>
          <div v-for="(check, index) in data.health ?? []" :key="index" class="d-flex ga-2 mb-2">
            <v-chip
              size="x-small"
              variant="tonal"
              :color="healthColor(check.type)"
              class="flex-shrink-0"
              >{{ t(HEALTH_KEYS[check.type] ?? 'media.arr_system.health.info') }}</v-chip
            >
            <span class="text-body-small">{{ check.message ?? check.source ?? '—' }}</span>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="flat" border class="system-wide" data-test="system-disks">
        <v-card-title class="text-title-medium">{{
          t('media.arr_system.section.disk')
        }}</v-card-title>
        <v-card-text>
          <p v-if="(data.diskSpace ?? []).length === 0" class="text-muted">
            {{ t('media.arr_system.disk.empty') }}
          </p>
          <div v-for="(disk, index) in data.diskSpace ?? []" :key="index" class="mb-3">
            <div class="d-flex justify-space-between text-body-small mb-1">
              <span class="font-weight-medium">{{ disk.path ?? disk.label ?? '/' }}</span>
              <span class="text-muted">{{
                t('media.arr_system.disk.free_total_sizes', {
                  free: format.bytes(disk.freeSpace),
                  total: format.bytes(disk.totalSpace),
                })
              }}</span>
            </div>
            <v-progress-linear
              :model-value="diskUsage(disk).pct"
              :color="diskUsage(disk).color"
              height="6"
              rounded
            />
            <div class="text-label-small text-muted mt-1">
              {{ t('media.arr_system.disk.used_pct_tpl', { pct: diskUsage(disk).pct }) }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="flat" border>
        <v-card-title class="text-title-medium">{{
          t('media.arr_system.section.download_clients')
        }}</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('media.arr_system.download_clients.name') }}</th>
              <th>{{ t('media.arr_system.download_clients.type') }}</th>
              <th>{{ t('media.arr_system.download_clients.enabled') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(client, index) in data.downloadClients ?? []" :key="index">
              <td class="font-weight-medium">{{ client.name }}</td>
              <td class="text-muted">{{ client.implementation ?? '—' }}</td>
              <td>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  :color="client.enable ? 'success' : undefined"
                  >{{ yesNo(client.enable) }}</v-chip
                >
              </td>
            </tr>
            <tr v-if="(data.downloadClients ?? []).length === 0">
              <td colspan="3" class="text-center text-muted">
                {{ t('media.arr_system.download_clients.empty') }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card variant="flat" border>
        <v-card-title class="text-title-medium">{{
          t('media.arr_system.section.indexers')
        }}</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('media.arr_system.indexers.name') }}</th>
              <th>{{ t('media.arr_system.indexers.enabled') }}</th>
              <th>{{ t('media.arr_system.indexers.rss') }}</th>
              <th>{{ t('media.arr_system.indexers.search') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(indexer, index) in data.indexers ?? []" :key="index">
              <td class="font-weight-medium">{{ indexer.name }}</td>
              <td>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  :color="
                    indexer.enableRss ||
                    indexer.enableAutomaticSearch ||
                    indexer.enableInteractiveSearch
                      ? 'success'
                      : undefined
                  "
                  >{{
                    yesNo(
                      indexer.enableRss ||
                        indexer.enableAutomaticSearch ||
                        indexer.enableInteractiveSearch,
                    )
                  }}</v-chip
                >
              </td>
              <td :class="indexer.enableRss ? 'text-success' : 'text-muted'">
                {{ indexer.enableRss ? '✓' : '—' }}
              </td>
              <td :class="indexer.enableAutomaticSearch ? 'text-success' : 'text-muted'">
                {{ indexer.enableAutomaticSearch ? '✓' : '—' }}
              </td>
            </tr>
            <tr v-if="(data.indexers ?? []).length === 0">
              <td colspan="4" class="text-center text-muted">
                {{ t('media.arr_system.indexers.empty') }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card variant="flat" border class="system-wide" data-test="system-logs">
        <v-card-title class="text-title-medium">{{
          t('media.arr_system.section.logs')
        }}</v-card-title>
        <v-table density="compact" class="system-logs">
          <thead>
            <tr>
              <th>{{ t('media.arr_system.logs.date') }}</th>
              <th>{{ t('media.arr_system.logs.level') }}</th>
              <th>{{ t('media.arr_system.logs.message') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(log, index) in data.logs ?? []" :key="index">
              <td class="text-no-wrap text-muted">
                {{ log.time ? format.dateTime(log.time, true) : '—' }}
              </td>
              <td>
                <v-chip size="x-small" variant="tonal" :color="logColor(log.level)">{{
                  log.level || t('media.arr_system.logs.level_info')
                }}</v-chip>
              </td>
              <td class="system-logs__message">
                {{ log.message ?? '—' }}
                <div v-if="log.exception" class="text-label-small text-muted">
                  {{ log.exception }}
                </div>
              </td>
            </tr>
            <tr v-if="(data.logs ?? []).length === 0">
              <td colspan="3" class="text-center text-muted">
                {{ t('media.arr_system.logs.empty') }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.system-wide {
  grid-column: 1 / -1;
}
.system-dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 16px;
  font-size: 0.875rem;
}
.system-dl dt {
  color: rgb(var(--v-theme-muted));
}
.system-dl dd {
  margin: 0;
}
.system-logs {
  font-size: 0.8rem;
}
.system-logs__message {
  word-break: break-all;
}
@media (max-width: 959px) {
  .system-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
