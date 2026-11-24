<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Statut de Prowlarr (`prowlarr/system.html.twig`, n° 271) : informations
// (n° 298) et santé (n° 297), chargées indépendamment.
import { prowlarrHealthSchema, prowlarrStatusSchema } from '@hubarr/shared';
import { msCheckCircleFill } from '../../../components/symbols';
import { computed } from 'vue';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import ProwlarrPage from '../ProwlarrPage.vue';
import { useProwlarrPage } from '../prowlarr-api';

const status = useProwlarrPage('/status', prowlarrStatusSchema);
const health = useProwlarrPage('/health', z.array(prowlarrHealthSchema));
const { t } = status;
const format = useFormat();
const info = computed(() => {
  const data = status.query.data.value;
  if (!data) return [];
  const join = (...parts: (string | null)[]) =>
    parts.filter((part) => part !== null).join(' ') || '—';
  return [
    ['info_version', data.version ?? '—'],
    ['info_branch', data.branch ?? '—'],
    ['info_os', join(data.osName, data.osVersion)],
    ['info_runtime', join(data.runtimeName, data.runtimeVersion)],
    ['info_started', data.startTime ? format.dateTime(data.startTime) : '—'],
    ['info_appdata', data.appData ?? '—'],
    ['info_migration', data.migrationVersion === null ? '—' : String(data.migrationVersion)],
    ['info_authentication', data.authentication ?? '—'],
  ] as const;
});
</script>

<template>
  <ProwlarrPage
    :title="t('prowlarr.system.title')"
    :loading="status.query.isPending.value && health.query.isPending.value"
    :error="status.error.value !== null && health.error.value !== null ? status.error.value : null"
  >
    <v-row density="compact">
      <v-col cols="12" md="6">
        <v-card variant="flat" border class="h-100" data-test="prowlarr-system-info">
          <v-card-title class="text-title-medium">{{
            t('prowlarr.system.info_card')
          }}</v-card-title>
          <v-card-text>
            <dl class="prowlarr-system__info">
              <template v-for="[key, value] in info" :key="key">
                <dt class="text-muted">{{ t(`prowlarr.system.${key}`) }}</dt>
                <dd>{{ value }}</dd>
              </template>
            </dl>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="flat" border class="h-100" data-test="prowlarr-system-health">
          <v-card-title class="text-title-medium d-flex align-center ga-2">
            {{ t('prowlarr.system.health_card') }}
            <v-chip
              v-if="(health.query.data.value ?? []).length === 0 && health.query.isSuccess.value"
              size="x-small"
              color="success"
              variant="tonal"
              >{{ t('prowlarr.system.health_ok_badge') }}</v-chip
            >
          </v-card-title>
          <v-card-text>
            <p
              v-if="(health.query.data.value ?? []).length === 0 && health.query.isSuccess.value"
              class="d-flex align-center ga-2 text-success"
            >
              <v-icon :icon="msCheckCircleFill" size="small" /> {{ t('prowlarr.system.health_ok') }}
            </p>
            <v-alert
              v-for="(item, index) in health.query.data.value ?? []"
              :key="index"
              :type="item.type === 'error' ? 'error' : 'warning'"
              variant="tonal"
              density="compact"
              class="mb-2"
            >
              <div>{{ item.message }}</div>
              <div v-if="item.source" class="text-body-small text-muted">{{ item.source }}</div>
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </ProwlarrPage>
</template>

<style scoped>
.prowlarr-system__info {
  display: grid;
  grid-template-columns: minmax(110px, 180px) 1fr;
  gap: 6px 12px;
  word-break: break-word;
}
</style>
