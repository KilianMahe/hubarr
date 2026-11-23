<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Journaux de Prowlarr (`prowlarr/logs.html.twig`, n° 272, données n° 299) :
// 100 par page, niveau passé à Prowlarr et porté par l'URL (l'original
// filtrait la page affichée), recherche dans la page.
import { arrPaged, logRecordSchema } from '@hubarr/shared';
import { computed, ref } from 'vue';
import { useFormat } from '../../../app/format';
import { filterLogs } from '../../arr-admin/admin-format';
import { useRoutePage } from '../../movies/useRoutePage';
import ProwlarrPage from '../ProwlarrPage.vue';
import { useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const format = useFormat();
const { route, router, page, setPage } = useRoutePage();
const level = computed(() => (typeof route.query.level === 'string' ? route.query.level : ''));
const { query, error, t } = useProwlarrPage(
  () =>
    `/logs?page=${page.value}${level.value === '' ? '' : `&level=${encodeURIComponent(level.value)}`}`,
  arrPaged(logRecordSchema),
);
const search = ref('');
const records = computed(() => filterLogs(query.data.value?.records ?? [], search.value));
const levels = computed(() =>
  ['', 'info', 'debug', 'warn', 'error', 'fatal'].map((value) => ({
    value,
    title: t(`prowlarr.logs.level_${value === '' ? 'all' : value}`),
  })),
);
function setLevel(value: string | null): void {
  const next = { ...route.query };
  delete next.page;
  if (value) next.level = value;
  else delete next.level;
  void router.push({ query: next });
}
const hasNext = computed(() => {
  const data = query.data.value;
  return data !== undefined && data.page * data.pageSize < data.totalRecords;
});
const levelColor = (value: string) =>
  value === 'error' || value === 'fatal'
    ? 'error'
    : value === 'warn'
      ? 'warning'
      : value === 'debug'
        ? undefined
        : 'info';
</script>

<template>
  <ProwlarrPage :title="t('prowlarr.logs.title')" :loading="query.isPending.value" :error="error">
    <v-card variant="flat" border>
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-title-medium">
        {{ t('prowlarr.logs.card_title') }}
        <v-spacer />
        <v-filter-field
          v-model="search"
          :placeholder="t('prowlarr.logs.search_placeholder')"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 240px"
          data-test="logs-search"
        />
        <v-filter-select
          :model-value="level"
          :items="levels"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 140px"
          data-test="logs-level"
          @update:model-value="setLevel"
        />
      </v-card-title>
      <EmptyState v-if="records.length === 0" inline :title="t('prowlarr.logs.empty')" />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t('prowlarr.logs.col_date') }}</th>
            <th>{{ t('prowlarr.logs.col_level') }}</th>
            <th>{{ t('prowlarr.logs.col_message') }}</th>
            <th>{{ t('prowlarr.logs.col_logger') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(record, index) in records" :key="index" data-test="log-row">
            <td class="text-muted text-no-wrap">
              {{ record.time ? format.dateTime(record.time, true) : '—' }}
            </td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="levelColor(record.level)">{{
                record.level
              }}</v-chip>
            </td>
            <td class="prowlarr-logs__message">
              {{ record.message ?? '—' }}
              <pre v-if="record.exception" class="text-body-small text-muted mt-1">{{
                record.exception
              }}</pre>
            </td>
            <td class="text-muted">{{ record.logger ?? '—' }}</td>
          </tr>
        </tbody>
      </v-table>
      <v-card-actions v-if="page > 1 || hasNext">
        <v-btn variant="text" :disabled="page <= 1" @click="setPage(page - 1)">{{
          t('prowlarr.logs.page_prev')
        }}</v-btn>
        <v-spacer />
        <span class="text-body-small text-muted">{{ page }}</span>
        <v-spacer />
        <v-btn variant="text" :disabled="!hasNext" @click="setPage(page + 1)">{{
          t('prowlarr.logs.page_next')
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </ProwlarrPage>
</template>

<style scoped>
.prowlarr-logs__message {
  word-break: break-word;
}
.prowlarr-logs__message pre {
  white-space: pre-wrap;
}
</style>
