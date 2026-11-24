<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Recherche multi-indexeurs de la page Prowlarr (`pw-search-*` de
// `prowlarr/index.html.twig`, route n° 246) : 2 caractères au moins, résultats
// (titre lié à la page de l'indexeur si elle est en http(s), indexeur,
// taille, seeds, âge) triables, grab par Prowlarr (route n° 247). Hubarr
// ajoute le choix d'un indexeur (paramètre `indexerId` de l'original).
import {
  PROWLARR_SEARCH_MIN_LENGTH,
  type ProwlarrIndexer,
  type ProwlarrRelease,
} from '@hubarr/shared';
import { msCheck, msDownload, msSearch } from '../../components/symbols';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { apiErrorText } from '../../app/api/error-text';
import { useFormat } from '../../app/format';
import { fillLegacy } from '../../app/legacy-template';
import { useNotifyStore } from '../../app/stores/notify';
import { sortReleases, type ReleaseSort } from './search';
import { prowlarrApi } from './prowlarr-api';

const props = defineProps<{ indexers: ProwlarrIndexer[] }>();
const { t } = useI18n();
const format = useFormat();
const { mdAndUp } = useDisplay();
const notify = useNotifyStore();
const grabError = ref<string | null>(null);

const query = ref('');
const indexerId = ref<number | null>(null);
const searching = ref(false);
const failed = ref<string | null>(null);
const results = ref<ProwlarrRelease[] | null>(null);
const sort = reactive<ReleaseSort>({ key: null, ascending: false });
const grabs = reactive(new Map<string, 'pending' | 'done'>());

const indexerItems = computed(() => [
  { value: null, title: t('prowlarr.index.filter_all') },
  ...props.indexers
    .filter((indexer) => indexer.enabled)
    .map((indexer) => ({ value: indexer.id, title: indexer.name })),
]);
const sorted = computed(() => sortReleases(results.value ?? [], sort));

let controller: AbortController | null = null;
async function search(): Promise<void> {
  const q = query.value.trim();
  if (q.length < PROWLARR_SEARCH_MIN_LENGTH) return;
  controller?.abort();
  controller = new AbortController();
  searching.value = true;
  failed.value = null;
  results.value = null;
  grabs.clear();
  try {
    results.value = await prowlarrApi.search(q, indexerId.value, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return;
    failed.value = apiErrorText(error, t, 'prowlarr.common.error');
  } finally {
    searching.value = false;
  }
}

function sortBy(key: ReleaseSort['key']): void {
  if (sort.key === key) sort.ascending = !sort.ascending;
  else
    Object.assign(sort, { key, ascending: key === 'title' || key === 'indexer' || key === 'age' });
}

async function grab(release: ProwlarrRelease): Promise<void> {
  if (release.indexerId === null) return;
  grabs.set(release.guid, 'pending');
  grabError.value = null;
  try {
    await prowlarrApi.grab(release.guid, release.indexerId);
    grabs.set(release.guid, 'done');
    notify.success('prowlarr.search.grab_sent');
  } catch (error) {
    grabs.delete(release.guid);
    grabError.value = fillLegacy(t('prowlarr.search.grab_failed_tpl'), {
      ERROR: apiErrorText(error, t, 'prowlarr.common.error'),
    });
  }
}

const age = (release: ProwlarrRelease) =>
  fillLegacy(t('prowlarr.index.age_days_tpl'), { D: release.age });
const size = (release: ProwlarrRelease) => (release.size > 0 ? format.bytes(release.size) : '—');
const COLUMNS = [
  { key: 'title', label: 'prowlarr.index.search_col_title' },
  { key: 'indexer', label: 'prowlarr.index.search_col_indexer' },
  { key: 'size', label: 'prowlarr.index.search_col_size' },
  { key: 'seeders', label: 'prowlarr.index.search_col_seeds' },
  { key: 'age', label: 'prowlarr.index.search_col_age' },
] as const;
</script>

<template>
  <v-card variant="flat" border class="mb-4" data-test="prowlarr-search">
    <v-card-title class="text-title-medium">{{
      t('prowlarr.index.search_card_title')
    }}</v-card-title>
    <v-card-text>
      <form class="d-flex flex-wrap ga-2 mb-3" @submit.prevent="search">
        <v-filter-field
          v-model="query"
          :placeholder="t('prowlarr.index.search_placeholder')"
          :prepend-inner-icon="msSearch"
          variant="outlined"
          density="compact"
          hide-details
          autocomplete="off"
          class="flex-grow-1"
          style="min-width: 220px"
          data-test="prowlarr-search-input"
        />
        <v-filter-select
          v-model="indexerId"
          :items="indexerItems"
          :label="t('prowlarr.index.search_col_indexer')"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 220px; min-width: 160px"
          data-test="prowlarr-search-indexer"
        />
        <v-btn
          type="submit"
          color="service"
          :loading="searching"
          :disabled="query.trim().length < PROWLARR_SEARCH_MIN_LENGTH"
          data-test="prowlarr-search-submit"
          >{{ t('prowlarr.index.search_btn') }}</v-btn
        >
      </form>

      <div v-if="searching" class="text-center text-muted py-2">
        <v-progress-circular indeterminate size="18" color="service" class="me-2" />
        {{ t('prowlarr.index.searching') }}
      </div>
      <v-alert v-else-if="failed" type="error" variant="tonal" density="compact">{{
        failed
      }}</v-alert>
      <template v-else-if="results !== null">
        <p
          v-if="results.length === 0"
          class="text-center text-muted py-2"
          data-test="prowlarr-search-empty"
        >
          {{ t('prowlarr.index.search_no_results') }}
        </p>
        <template v-else>
          <v-alert
            v-if="grabError"
            type="error"
            variant="tonal"
            density="compact"
            closable
            class="mb-2"
            data-test="prowlarr-grab-error"
            @click:close="grabError = null"
            >{{ grabError }}</v-alert
          >
          <p class="text-body-small text-muted mb-2" data-test="prowlarr-search-count">
            {{ t('prowlarr.index.search_results_count_tpl', { count: results.length }) }}
          </p>
          <div class="prowlarr-search__results">
            <v-table v-if="mdAndUp" density="compact">
              <thead>
                <tr>
                  <th
                    v-for="column in COLUMNS"
                    :key="column.key"
                    class="prowlarr-search__sortable"
                    :aria-sort="
                      sort.key === column.key
                        ? sort.ascending
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    "
                    @click="sortBy(column.key)"
                  >
                    {{ t(column.label) }}
                  </th>
                  <th class="text-end">{{ t('prowlarr.common.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="release in sorted" :key="release.guid" data-test="prowlarr-release">
                  <td class="prowlarr-search__title" :title="release.title">
                    <a
                      v-if="release.infoUrl"
                      :href="release.infoUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      >{{ release.title }}</a
                    >
                    <span v-else>{{ release.title }}</span>
                  </td>
                  <td>
                    <v-chip size="x-small" label variant="tonal">{{ release.indexer }}</v-chip>
                  </td>
                  <td class="text-no-wrap text-muted">{{ size(release) }}</td>
                  <td :class="release.seeders !== null ? 'text-success' : 'text-muted'">
                    {{ release.seeders ?? '—' }}
                  </td>
                  <td class="text-no-wrap text-muted">{{ age(release) }}</td>
                  <td class="text-end">
                    <v-btn
                      size="small"
                      variant="tonal"
                      color="service-text"
                      :prepend-icon="grabs.get(release.guid) === 'done' ? msCheck : msDownload"
                      :loading="grabs.get(release.guid) === 'pending'"
                      :disabled="grabs.has(release.guid) || release.indexerId === null"
                      data-test="prowlarr-grab"
                      @click="grab(release)"
                      >{{ t('prowlarr.search.grab') }}</v-btn
                    >
                  </td>
                </tr>
              </tbody>
            </v-table>
            <v-list v-else density="compact" class="pa-0">
              <v-list-item
                v-for="release in sorted"
                :key="release.guid"
                class="px-0"
                data-test="prowlarr-release"
              >
                <div class="text-body-medium prowlarr-search__mobile-title">
                  <a
                    v-if="release.infoUrl"
                    :href="release.infoUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ release.title }}</a
                  >
                  <span v-else>{{ release.title }}</span>
                </div>
                <div class="text-body-small text-muted">
                  {{ release.indexer }} · {{ size(release) }} ·
                  {{ t('prowlarr.index.search_col_seeds') }} {{ release.seeders ?? '—' }} ·
                  {{ age(release) }}
                </div>
                <template #append>
                  <v-btn
                    :icon="grabs.get(release.guid) === 'done' ? msCheck : msDownload"
                    size="small"
                    variant="text"
                    color="service-text"
                    :loading="grabs.get(release.guid) === 'pending'"
                    :disabled="grabs.has(release.guid) || release.indexerId === null"
                    :aria-label="t('prowlarr.search.grab')"
                    data-test="prowlarr-grab"
                    @click="grab(release)"
                  />
                </template>
              </v-list-item>
            </v-list>
          </div>
        </template>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.prowlarr-search__results {
  max-height: 520px;
  overflow-y: auto;
}
.prowlarr-search__sortable {
  cursor: pointer;
  user-select: none;
}
.prowlarr-search__title {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prowlarr-search__mobile-title {
  word-break: break-word;
}
</style>
