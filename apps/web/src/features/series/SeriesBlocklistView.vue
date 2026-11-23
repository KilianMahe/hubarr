<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Liste de blocage de l'instance (`media/series_blocklist.html.twig`) : série,
// source, qualité, date ; supprimer une entrée ou la sélection (cases, « tout
// cocher »), avec confirmation ; 50 par page.
import { mdiDelete, mdiMagnify } from '@mdi/js';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useArrList } from '../movies/useArrList';
import SortableTh from '../../components/SortableTh.vue';
import SonarrNav from './SonarrNav.vue';
import { seriesApi, seriesKeys } from './series-api';

const { t } = useI18n();
const format = useFormat();
const { slug, query, params, sortBy, setPage, search } = useArrList('blocklist');

const blocklist = useQuery({
  queryKey: computed(() =>
    seriesKeys.page(slug.value, 'blocklist', new URLSearchParams(params.value).toString()),
  ),
  queryFn: ({ signal }) => seriesApi.blocklist(slug.value, params.value, signal),
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

const error = ref(false);
const confirm = ref<{ ids: number[]; bulk: boolean } | null>(null);
const confirmOpen = ref(false);
function askDelete(ids: number[], bulk: boolean): void {
  confirm.value = { ids, bulk };
  confirmOpen.value = true;
}
const confirmMessage = computed(() =>
  confirm.value?.bulk
    ? t('media.series_blocklist.confirm_bulk_delete_tpl', { count: confirm.value.ids.length })
    : t('media.series_blocklist.confirm_delete'),
);
async function remove(): Promise<void> {
  const target = confirm.value;
  if (target === null) return;
  error.value = false;
  try {
    if (target.bulk) await seriesApi.blocklistBulkDelete(slug.value, target.ids);
    else if (target.ids[0] !== undefined)
      await seriesApi.blocklistDelete(slug.value, target.ids[0]);
    selected.value = selected.value.filter((id) => !target.ids.includes(id));
    await blocklist.refetch();
  } catch {
    error.value = true;
  }
}
</script>

<template>
  <v-container fluid class="sonarr-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.series_blocklist.title') }}</h2>
      <v-chip v-if="blocklist.data.value" size="small" variant="tonal">{{
        blocklist.data.value.totalRecords
      }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="selected.length > 0"
        :prepend-icon="mdiDelete"
        color="error"
        variant="tonal"
        size="small"
        data-test="blocklist-bulk-delete"
        @click="askDelete([...selected], true)"
        >{{ t('media.series_blocklist.bulk_delete_tpl', { count: selected.length }) }}</v-btn
      >
    </div>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{
      t('media.series.warnings.generic_error')
    }}</v-alert>
    <v-filter-field
      v-model="search"
      :prepend-inner-icon="mdiMagnify"
      :placeholder="t('media.arr_lists.search_series')"
      :aria-label="t('media.arr_lists.search_series')"
      density="compact"
      variant="outlined"
      clearable
      class="arr-list-search mb-3"
      data-test="blocklist-search"
    />
    <v-progress-linear v-if="blocklist.isPending.value" indeterminate color="service" />
    <v-card v-else variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th style="width: 40px">
              <v-checkbox-btn
                :model-value="allSelected"
                color="service"
                :aria-label="t('media.series.bulk.select_all')"
                data-test="blocklist-check-all"
                @update:model-value="toggleAll"
              />
            </th>
            <SortableTh
              :label="t('media.series_blocklist.col_series')"
              column="title"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('title')"
            />
            <SortableTh
              :label="t('media.series_blocklist.col_source')"
              column="source"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('source')"
            />
            <th>{{ t('media.series_blocklist.col_quality') }}</th>
            <SortableTh
              :label="t('media.series_blocklist.col_date')"
              column="date"
              :sort="query.sort"
              :dir="query.dir"
              @sort="sortBy('date')"
            />
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id" data-test="blocklist-row">
            <td>
              <v-checkbox-btn v-model="selected" :value="item.id" color="service" />
            </td>
            <td class="font-weight-medium">{{ item.seriesTitle ?? item.seriesId ?? '—' }}</td>
            <td class="text-muted sonarr-page__source" :title="item.sourceTitle ?? ''">
              {{ item.sourceTitle ?? '—' }}
            </td>
            <td>
              <v-chip v-if="item.quality" size="x-small" label variant="tonal" color="info">{{
                item.quality
              }}</v-chip>
              <span v-else>—</span>
            </td>
            <td class="text-muted text-no-wrap">
              {{ item.date === null ? '—' : (format.dateTime(item.date) ?? '—') }}
            </td>
            <td class="text-end">
              <v-btn
                :icon="mdiDelete"
                color="error"
                variant="text"
                size="small"
                :aria-label="t('media.series_blocklist.delete')"
                :title="t('media.series_blocklist.delete')"
                data-test="blocklist-delete"
                @click="askDelete([item.id], false)"
              />
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="6" class="text-center text-muted py-6">
              {{
                query.q
                  ? t('media.arr_lists.no_match', { q: query.q })
                  : t('media.series_blocklist.empty')
              }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <ArrPager
        :page="query.page"
        :count="records.length"
        :total="blocklist.data.value?.totalRecords ?? 0"
        :page-size="blocklist.data.value?.pageSize ?? 50"
        i18n-prefix="media.series_blocklist"
        pages-summary
        @update:page="setPage"
      />
    </v-card>
    <ConfirmDialog v-model="confirmOpen" :message="confirmMessage" @confirm="remove" />
  </v-container>
</template>

<style scoped>
.arr-list-search {
  max-width: 420px;
}
.sonarr-page__source {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
