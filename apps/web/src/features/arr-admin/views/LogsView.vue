<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Journaux de l'instance (`radarr/logs.html.twig`) : fichiers (noms), lignes
// récentes (100 par page, page dans l'URL), filtre de niveau (transmis à
// l'instance, dans l'URL) et recherche dans la page.
import { LOG_LEVELS, logsPageSchema } from '@hubarr/shared';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import { useRoutePage } from '../../movies/useRoutePage';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import { filterLogs } from '../admin-format';

const { t } = useI18n();
const format = useFormat();
const { route, router, page, setPage } = useRoutePage();
const level = computed(() => {
  const value = String(route.query.level ?? '');
  return (LOG_LEVELS as readonly string[]).includes(value) ? value : '';
});
const { ctx, query, feedback, error, title } = useAdminPage(
  'logs',
  () => `/logs?page=${page.value}${level.value ? `&level=${level.value}` : ''}`,
  logsPageSchema,
);
const search = ref('');
const records = computed(() => filterLogs(query.data.value?.records ?? [], search.value));
const pages = computed(() => Math.max(1, Math.ceil((query.data.value?.totalRecords ?? 0) / 100)));
const levels = computed(() => [
  { value: '', title: t(ctx.key('level_all')) },
  ...LOG_LEVELS.map((value) => ({ value, title: t(ctx.key(`level_${value}`)) })),
]);
function setLevel(value: string): void {
  const next = { ...route.query };
  delete next.page;
  if (value === '') delete next.level;
  else next.level = value;
  void router.push({ query: next });
}
const LEVEL_COLORS: Record<string, string> = {
  warn: 'warning',
  warning: 'warning',
  error: 'error',
  fatal: 'error',
  debug: 'info',
  trace: 'info',
};
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="query.data.value?.totalRecords ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card v-if="(query.data.value?.files ?? []).length > 0" variant="flat" border class="mb-4">
      <v-card-title class="text-title-medium">{{ t(ctx.key('files_title')) }}</v-card-title>
      <v-card-text class="d-flex flex-wrap ga-1">
        <v-chip
          v-for="file in query.data.value?.files ?? []"
          :key="file.filename"
          size="small"
          variant="tonal"
          >{{ file.filename }}</v-chip
        >
      </v-card-text>
    </v-card>
    <v-card variant="flat" border>
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-title-medium">
        {{ t(ctx.key('recent_title')) }}
        <v-spacer />
        <v-filter-field
          v-model="search"
          :placeholder="t(ctx.key('search_placeholder'))"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 220px"
          data-test="logs-search"
        />
        <v-filter-select
          :model-value="level"
          :items="levels"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 150px"
          data-test="logs-level"
          @update:model-value="setLevel"
        />
      </v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th style="width: 150px">{{ t(ctx.key('col_date')) }}</th>
            <th style="width: 90px">{{ t(ctx.key('col_level')) }}</th>
            <th style="width: 160px">{{ t(ctx.key('col_logger')) }}</th>
            <th>{{ t(ctx.key('col_message')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(log, index) in records" :key="index" data-test="log-row">
            <td class="text-muted text-no-wrap text-body-small">
              {{ log.time === null ? '—' : (format.dateTime(log.time) ?? '—') }}
            </td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="LEVEL_COLORS[log.level]">{{
                log.level
              }}</v-chip>
            </td>
            <td class="text-muted text-body-small">{{ log.logger ?? '' }}</td>
            <td class="text-body-small">
              {{ log.message ?? '' }}
              <pre v-if="log.exception" class="logs-exception">{{ log.exception }}</pre>
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="4" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-if="pages > 1" class="d-flex justify-center pa-2">
        <v-pagination
          :model-value="page"
          :length="pages"
          density="compact"
          total-visible="5"
          @update:model-value="setPage"
        />
      </div>
    </v-card>
  </AdminPage>
</template>

<style scoped>
.logs-exception {
  white-space: pre-wrap;
  font-size: 0.72rem;
  opacity: 0.75;
  max-height: 160px;
  overflow: auto;
}
</style>
