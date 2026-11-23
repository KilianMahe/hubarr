<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique de Prowlarr (`prowlarr/history.html.twig`, n° 270) : évènements
// paginés (n° 248, page dans l'URL) ou depuis une date (`?since=`, n° 295) :
// date, type, source, requête, catégories, résultats, temps, statut.
import {
  prowlarrHistoryPageSchema,
  prowlarrHistoryRecordSchema,
  type ProwlarrHistoryRecord,
} from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import { fillLegacy } from '../../../app/legacy-template';
import { useRoutePage } from '../../movies/useRoutePage';
import ProwlarrPage from '../ProwlarrPage.vue';
import { useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const format = useFormat();
const { route, router, page, setPage } = useRoutePage();
const since = computed(() =>
  typeof route.query.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.since)
    ? route.query.since
    : '',
);
const paged = useProwlarrPage(() => `/history?page=${page.value}`, prowlarrHistoryPageSchema, {
  enabled: () => since.value === '',
});
const sinceQuery = useProwlarrPage(
  () => `/history/since?date=${since.value}`,
  z.array(prowlarrHistoryRecordSchema),
  { enabled: () => since.value !== '' },
);
const { t } = paged;
const active = computed(() => (since.value === '' ? paged : sinceQuery));
const records = computed<ProwlarrHistoryRecord[]>(() =>
  since.value === ''
    ? (paged.query.data.value?.records ?? [])
    : (sinceQuery.query.data.value ?? []),
);
const draft = ref(since.value);
watch(since, (value) => (draft.value = value));
function filter(): void {
  const next = { ...route.query };
  delete next.page;
  if (draft.value) next.since = draft.value;
  else delete next.since;
  void router.push({ query: next });
}
const hasNext = computed(() => {
  const data = paged.query.data.value;
  return since.value === '' && data !== undefined && data.page * data.pageSize < data.totalRecords;
});
const EVENTS: Record<string, [string, string | undefined]> = {
  indexerRss: ['prowlarr.history.event_rss', 'info'],
  indexerQuery: ['prowlarr.history.event_query', 'primary'],
  releaseGrabbed: ['prowlarr.history.event_grab', 'success'],
  indexerAuth: ['prowlarr.history.event_auth', 'warning'],
};
</script>

<template>
  <ProwlarrPage
    :title="t('prowlarr.history.title')"
    :count="since === '' ? (paged.query.data.value?.totalRecords ?? null) : records.length"
    :loading="active.query.isPending.value"
    :error="active.error.value"
  >
    <template #actions>
      <form class="d-flex align-center ga-2" @submit.prevent="filter">
        <span class="text-body-small text-muted">{{ t('prowlarr.history.since_label') }}</span>
        <v-filter-field
          v-model="draft"
          type="date"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 180px"
          data-test="history-since"
        />
        <v-btn type="submit" size="small" variant="tonal" data-test="history-filter">{{
          t('prowlarr.history.filter_btn')
        }}</v-btn>
      </form>
    </template>
    <v-card variant="flat" border>
      <EmptyState v-if="records.length === 0" inline :title="t('prowlarr.history.empty')" />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t('prowlarr.history.col_date') }}</th>
            <th>{{ t('prowlarr.history.col_type') }}</th>
            <th>{{ t('prowlarr.history.col_source') }}</th>
            <th>{{ t('prowlarr.history.col_query') }}</th>
            <th>{{ t('prowlarr.history.col_category') }}</th>
            <th>{{ t('prowlarr.history.col_results') }}</th>
            <th>{{ t('prowlarr.history.col_time') }}</th>
            <th>{{ t('prowlarr.history.col_status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id" data-test="history-row">
            <td class="text-muted text-no-wrap">
              {{ record.date ? format.dateTime(record.date) : '—' }}
            </td>
            <td>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="record.eventType ? EVENTS[record.eventType]?.[1] : undefined"
                >{{
                  record.eventType
                    ? EVENTS[record.eventType]
                      ? t(EVENTS[record.eventType]?.[0] ?? '')
                      : record.eventType
                    : '—'
                }}</v-chip
              >
            </td>
            <td class="font-weight-medium">{{ record.source ?? '—' }}</td>
            <td class="prowlarr-history__query" :title="record.query ?? ''">
              <template v-if="record.query">{{ record.query }}</template>
              <span v-else-if="record.queryType" class="text-muted font-italic">{{
                record.queryType
              }}</span>
              <template v-else>—</template>
            </td>
            <td class="text-muted">{{ record.categories ?? '—' }}</td>
            <td>
              <v-chip v-if="record.queryResults" size="x-small" color="success" variant="tonal">{{
                record.queryResults
              }}</v-chip>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="text-muted">
              {{
                record.elapsedTime
                  ? fillLegacy(t('prowlarr.history.elapsed_ms_tpl'), { MS: record.elapsedTime })
                  : '—'
              }}
            </td>
            <td :class="record.successful ? 'text-success' : 'text-error'">
              {{
                t(
                  record.successful
                    ? 'prowlarr.history.status_ok'
                    : 'prowlarr.history.status_failed',
                )
              }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <v-card-actions v-if="since === '' && (page > 1 || hasNext)">
        <v-btn variant="text" :disabled="page <= 1" @click="setPage(page - 1)">{{
          t('common.action.previous')
        }}</v-btn>
        <v-spacer />
        <span class="text-body-small text-muted">{{ page }}</span>
        <v-spacer />
        <v-btn variant="text" :disabled="!hasNext" @click="setPage(page + 1)">{{
          t('common.action.next')
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </ProwlarrPage>
</template>

<style scoped>
.prowlarr-history__query {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
