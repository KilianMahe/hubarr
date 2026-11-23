<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Liste de blocage de l'instance (`media/films_blocklist.html.twig`) : 50 par
// page ; supprimer une entrée ou la sélection (cases, « tout cocher »).
import type { MovieBlocklistItem } from '@hubarr/shared';
import { mdiDelete, mdiMagnify } from '@mdi/js';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from './RadarrNav.vue';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrList } from './useArrList';
import SortableTh from '../../components/SortableTh.vue';
import EmptyState from '../../components/EmptyState.vue';

const { t } = useI18n();
const format = useFormat();
const { slug, query, params, sortBy, setPage, search } = useArrList('blocklist');

const blocklist = useQuery({
  queryKey: computed(() =>
    moviesKeys.page(slug.value, 'blocklist', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => moviesApi.blocklist(slug.value, params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => blocklist.data.value?.records ?? []);

const selected = ref<number[]>([]);
watch(params, () => (selected.value = []));
const allSelected = computed(
  () => records.value.length > 0 && selected.value.length === records.value.length,
);
function toggleAll(value: boolean | null): void {
  selected.value = value ? records.value.map((item) => item.id) : [];
}

const error = ref<string | null>(null);
const confirm = ref<{ ids: number[]; bulk: boolean } | null>(null);
const confirmOpen = ref(false);
function askDelete(ids: number[], bulk: boolean): void {
  confirm.value = { ids, bulk };
  confirmOpen.value = true;
}
async function remove(): Promise<void> {
  const target = confirm.value;
  if (target === null) return;
  error.value = null;
  try {
    if (target.bulk) await moviesApi.blocklistBulkDelete(slug.value, target.ids);
    else if (target.ids[0] !== undefined)
      await moviesApi.blocklistDelete(slug.value, target.ids[0]);
    selected.value = selected.value.filter((id) => !target.ids.includes(id));
    await blocklist.refetch();
  } catch {
    error.value = t(
      target.bulk ? 'media.films_blocklist.error_bulk_delete' : 'media.films_blocklist.error',
    );
  }
}
const reason = (item: MovieBlocklistItem) =>
  item.message === null
    ? '—'
    : item.message.length > 40
      ? `${item.message.slice(0, 40)}…`
      : item.message;
</script>

<template>
  <v-container fluid class="radarr-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.films_blocklist.title') }}</h2>
      <v-chip v-if="blocklist.data.value" size="small" variant="tonal">{{
        blocklist.data.value.totalRecords
      }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="selected.length > 0"
        :prepend-icon="mdiDelete"
        color="error"
        size="small"
        variant="flat"
        data-test="blocklist-bulk-delete"
        @click="askDelete(selected, true)"
        >{{ t('media.films_blocklist.bulk_delete', { count: selected.length }) }}</v-btn
      >
    </div>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{
      error
    }}</v-alert>
    <v-filter-field
      v-model="search"
      :prepend-inner-icon="mdiMagnify"
      :placeholder="t('media.arr_lists.search_movie')"
      :aria-label="t('media.arr_lists.search_movie')"
      density="compact"
      variant="outlined"
      clearable
      class="arr-list-search mb-3"
      data-test="blocklist-search"
    />
    <v-progress-linear v-if="blocklist.isPending.value" indeterminate color="service" />
    <v-card v-else-if="blocklist.data.value" variant="flat" border>
      <EmptyState
        v-if="records.length === 0"
        inline
        :title="
          query.q ? t('media.arr_lists.no_match', { q: query.q }) : t('media.films_blocklist.empty')
        "
      />
      <v-table v-else density="compact" class="radarr-table">
        <thead>
          <tr>
            <th style="width: 40px">
              <v-checkbox-btn
                :model-value="allSelected"
                :indeterminate="selected.length > 0 && !allSelected"
                color="service"
                :aria-label="t('media.films_blocklist.bulk_delete_label')"
                data-test="blocklist-check-all"
                @update:model-value="toggleAll"
              />
            </th>
            <SortableTh
              :label="t('media.films_blocklist.col_date')"
              column="date"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('date')"
            />
            <SortableTh
              :label="t('media.films_blocklist.col_film')"
              column="title"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('title')"
            />
            <SortableTh
              :label="t('media.films_blocklist.col_source')"
              column="source"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('source')"
            />
            <th>{{ t('media.films_blocklist.col_quality') }}</th>
            <th class="d-none d-md-table-cell">{{ t('media.films_blocklist.col_protocol') }}</th>
            <SortableTh
              class="d-none d-md-table-cell"
              :label="t('media.films_blocklist.col_indexer')"
              column="indexer"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('indexer')"
            />
            <th class="d-none d-lg-table-cell">{{ t('media.films_blocklist.col_reason') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id" data-test="blocklist-row">
            <td>
              <v-checkbox-btn
                v-model="selected"
                :value="item.id"
                color="service"
                :aria-label="item.sourceTitle ?? ''"
              />
            </td>
            <td class="text-no-wrap text-muted">
              {{ item.date ? format.dateTime(item.date) : '—' }}
            </td>
            <td>
              <template v-if="item.movie">
                <span class="font-weight-medium">{{ item.movie.title }}</span>
                <span v-if="item.movie.year" class="text-muted"> ({{ item.movie.year }})</span>
              </template>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="text-muted radarr-table__source">
              <div class="text-truncate" :title="item.sourceTitle ?? ''">
                {{ item.sourceTitle ?? '—' }}
              </div>
            </td>
            <td>
              <v-chip v-if="item.quality" size="x-small" variant="tonal" color="info">{{
                item.quality
              }}</v-chip>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="text-muted d-none d-md-table-cell">{{ item.protocol ?? '—' }}</td>
            <td class="text-muted d-none d-md-table-cell">{{ item.indexer ?? '—' }}</td>
            <td class="text-muted d-none d-lg-table-cell" :title="item.message ?? ''">
              {{ reason(item) }}
            </td>
            <td>
              <v-btn
                :icon="mdiDelete"
                size="small"
                variant="text"
                color="error"
                :title="t('media.films_blocklist.delete')"
                :aria-label="t('media.films_blocklist.delete')"
                data-test="blocklist-delete"
                @click="askDelete([item.id], false)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="blocklist.data.value.totalRecords"
        :page-size="blocklist.data.value.pageSize"
        i18n-prefix="media.films_blocklist"
        @update:page="setPage"
      />
    </v-card>
    <ConfirmDialog
      v-model="confirmOpen"
      :message="
        confirm?.bulk
          ? t('media.films_blocklist.confirm_bulk_delete', { count: confirm.ids.length })
          : t('media.films_blocklist.confirm_delete')
      "
      :confirm-label="t('media.films_blocklist.delete')"
      danger
      @confirm="remove"
    />
  </v-container>
</template>

<style scoped>
.arr-list-search {
  max-width: 420px;
}
.radarr-table {
  font-size: 0.85rem;
}
.radarr-table__source {
  max-width: 260px;
}
</style>
