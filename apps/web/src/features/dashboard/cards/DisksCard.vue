<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Espace disque (lot 13, admins) : une barre d'occupation par disque portant
// un dossier racine de Radarr ou Sonarr, alerte au-delà de 90 %, dossiers du
// disque et instances qui n'ont pas répondu.
import { msDatabase, msWarning } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import { dashboardApi } from '../dashboard-api';
import DashCard from './DashCard.vue';

const { t, locale } = useI18n();
const format = useFormat();
const query = useQuery({
  queryKey: ['dashboard', 'disks'],
  queryFn: ({ signal }) => dashboardApi.disks(signal),
  staleTime: 300_000,
  retry: false,
});
const data = computed(() => query.data.value);
const percent = (value: number) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
</script>

<template>
  <DashCard
    v-if="data?.available !== false"
    :title="t('dashboard.disks.title')"
    :icon="msDatabase"
    :loading="query.isFetching.value && !data"
    data-test="card-disks"
  >
    <template v-if="data">
      <v-alert
        v-if="data.failed.length"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-test="disks-failed"
        >{{ t('dashboard.disks.failed', { instances: data.failed.join(', ') }) }}</v-alert
      >
      <p v-if="data.disks.length === 0" class="text-body-medium text-muted">
        {{ t('dashboard.disks.empty') }}
      </p>
      <div v-for="disk in data.disks" :key="disk.path" class="mb-4" data-test="disk">
        <div class="d-flex align-center ga-2 mb-1">
          <span class="text-title-small text-truncate" :title="disk.path">{{ disk.path }}</span>
          <v-chip
            v-if="disk.alert"
            size="x-small"
            color="error"
            label
            :prepend-icon="msWarning"
            data-test="disk-alert"
            >{{ t('dashboard.disks.alert') }}</v-chip
          >
          <v-spacer />
          <span class="text-body-small text-no-wrap">{{
            t('dashboard.disks.used', { percent: percent(disk.usedPercent) })
          }}</span>
        </div>
        <v-progress-linear
          :model-value="disk.usedPercent"
          :color="disk.alert ? 'error' : 'primary'"
          height="8"
          rounded
          :aria-label="disk.path"
        />
        <div class="d-flex flex-wrap align-center ga-1 mt-1 text-body-small text-muted">
          <span class="me-2">{{
            t('dashboard.disks.free', {
              free: format.bytes(disk.freeSpace),
              total: format.bytes(disk.totalSpace),
            })
          }}</span>
          <v-chip
            v-for="root in disk.roots"
            :key="`${root.service}-${root.instance}-${root.path}`"
            size="x-small"
            variant="tonal"
            :title="root.instance"
            >{{ root.path }}</v-chip
          >
        </div>
      </div>
    </template>
  </DashCard>
</template>
