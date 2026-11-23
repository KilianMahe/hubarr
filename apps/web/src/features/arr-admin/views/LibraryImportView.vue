<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Import de bibliothèque (`radarr/library_import.html.twig`,
// `sonarr/library_import`) : scan d'un dossier, sous-dossiers absents de la
// bibliothèque, recherche automatique par nom puis manuelle, options par ligne
// (suivi, disponibilité ou type, dossiers de saison, profil) et communes à
// toutes, import des lignes cochées avec leur état.
import { libraryImportPageSchema, libraryImportScanSchema } from '@hubarr/shared';
import { mdiMagnify } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { mapLimit } from '../../movies/library';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import {
  defaultOptions,
  importRow,
  importRows,
  lookup,
  searchTerm,
  type ImportMatch,
  type ImportRow,
} from '../library-import';

const { t } = useI18n();
const { ctx, query, feedback, error, title } = useAdminPage(
  'library_import',
  '/import-bibliotheque',
  libraryImportPageSchema,
);
const isRadarr = computed(() => ctx.kind.value === 'radarr');
const folder = ref('');
watch(
  () => query.data.value?.rootFolders,
  (folders) => {
    if (folder.value === '' && folders?.[0]) folder.value = folders[0].path;
  },
  { immediate: true },
);
const profiles = computed(() =>
  (query.data.value?.qualityProfiles ?? []).map((profile) => ({
    value: profile.id,
    title: profile.name,
  })),
);
const defaults = ref(defaultOptions(ctx.kind.value, null));
watch(
  () => query.data.value?.qualityProfiles,
  (list) => {
    if (defaults.value.qualityProfileId === null && list?.[0])
      defaults.value.qualityProfileId = list[0].id;
  },
  { immediate: true },
);

const key = (suffix: string) => ctx.key(suffix);
const monitorItems = computed(() =>
  isRadarr.value
    ? [
        { value: 'movieOnly', title: t(key('monitor_movie_only')) },
        { value: 'none', title: t(key('monitor_none')) },
      ]
    : [
        { value: 'all', title: t(key('monitor_all_episodes')) },
        { value: 'future', title: t(key('monitor_future')) },
        { value: 'missing', title: t(key('monitor_missing')) },
        { value: 'firstSeason', title: t(key('monitor_first_season')) },
        { value: 'lastSeason', title: t(key('monitor_last_season')) },
        { value: 'none', title: t(key('monitor_none_episodes')) },
      ],
);
const availabilityItems = computed(() => [
  { value: 'announced', title: t(key('availability_announced')) },
  { value: 'inCinemas', title: t(key('availability_in_cinemas')) },
  { value: 'released', title: t(key('availability_released')) },
]);
const typeItems = computed(() => [
  { value: 'standard', title: t(key('type_standard')) },
  { value: 'daily', title: t(key('type_daily')) },
  { value: 'anime', title: t(key('type_anime')) },
]);

const rows = ref<ImportRow[]>([]);
const scanned = ref(false);
const scanning = ref(false);
async function scan(): Promise<void> {
  if (folder.value.trim() === '') return;
  scanning.value = true;
  feedback.value = null;
  try {
    const result = await ctx.post(
      '/import-bibliotheque/scan',
      { folder: folder.value.trim() },
      libraryImportScanSchema,
    );
    rows.value = importRows(result.folders, defaults.value);
    scanned.value = true;
    await mapLimit(rows.value, 4, async (row) => {
      try {
        const found = await lookup(
          ctx.kind.value,
          ctx.slug.value,
          searchTerm(ctx.kind.value, row.name),
        );
        row.candidates = found;
        row.match = found[0] ?? null;
        row.checked = row.match !== null && !row.match.existing;
      } catch {
        row.match = null;
      }
      row.status = 'pending';
    });
  } catch (failure) {
    feedback.value = { type: 'error', text: ctx.errorMessage(failure, key('generic_error')) };
  } finally {
    scanning.value = false;
  }
}

const timers = new Map<ImportRow, ReturnType<typeof setTimeout>>();
function searchRow(row: ImportRow, term: string | null): void {
  const value = (term ?? '').trim();
  const current = row.match
    ? `${row.match.title}${row.match.year ? ` (${row.match.year})` : ''}`
    : '';
  if (value.length < 2 || value === current) return;
  clearTimeout(timers.get(row));
  timers.set(
    row,
    setTimeout(() => {
      void lookup(ctx.kind.value, ctx.slug.value, value)
        .then((found) => (row.candidates = found))
        .catch(() => (row.candidates = []));
    }, 400),
  );
}
function choose(row: ImportRow, match: ImportMatch | null): void {
  row.match = match;
  row.checked = match !== null && !match.existing;
}
const matchTitle = (match: ImportMatch) => `${match.title}${match.year ? ` (${match.year})` : ''}`;

function applyAll(
  field: 'monitor' | 'availability' | 'seriesType' | 'seasonFolder' | 'qualityProfileId',
  value: unknown,
): void {
  (defaults.value as Record<string, unknown>)[field] = value;
  for (const row of rows.value) (row as unknown as Record<string, unknown>)[field] = value;
}

const selected = computed(() =>
  rows.value.filter((row) => row.checked && row.match !== null && row.status !== 'imported'),
);
const allChecked = computed(
  () => rows.value.length > 0 && rows.value.every((row) => row.checked || row.match === null),
);
function checkAll(value: boolean | null): void {
  for (const row of rows.value)
    if (row.match !== null && row.status !== 'imported') row.checked = value === true;
}

const importing = ref(false);
async function importSelected(): Promise<void> {
  const targets = [...selected.value];
  if (targets.length === 0) return;
  importing.value = true;
  await mapLimit(targets, 4, async (row) => {
    row.status = await importRow(ctx.kind.value, ctx.slug.value, row, folder.value.trim());
    if (row.status === 'imported') row.checked = false;
  });
  const ok = targets.filter((row) => row.status === 'imported').length;
  const fail = targets.length - ok;
  feedback.value =
    ok === 0
      ? { type: 'error', text: t(key('import_error')) }
      : isRadarr.value
        ? {
            type: fail > 0 ? 'warning' : 'success',
            text:
              fail > 0
                ? t(key('import_success_with_fail_tpl'), { ok, fail })
                : t(key('import_success_tpl'), { count: ok }),
          }
        : {
            type: fail > 0 ? 'warning' : 'success',
            text: t(key('import_processed_tpl'), { count: targets.length }),
          };
  importing.value = false;
}
const statusText = (row: ImportRow) =>
  row.status === 'imported'
    ? t(key('status_imported'))
    : row.status === 'error'
      ? t(key('status_error'))
      : row.match?.existing
        ? t(key('status_existing'))
        : '';
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card variant="flat" border class="mb-4">
      <v-card-text>
        <form class="d-flex flex-wrap ga-2 align-center" @submit.prevent="scan">
          <v-combobox
            v-model="folder"
            :items="(query.data.value?.rootFolders ?? []).map((root) => root.path)"
            :label="t(key('folder_label'))"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 280px"
            data-test="import-folder"
          />
          <v-btn
            type="submit"
            color="service"
            :prepend-icon="mdiMagnify"
            :loading="scanning"
            data-test="import-scan"
            >{{ t(key('btn_scan')) }}</v-btn
          >
        </form>
      </v-card-text>
    </v-card>

    <v-card v-if="scanned" variant="flat" border>
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-title-medium">
        {{ t(key('not_imported_title')) }}
        <v-chip size="x-small" variant="tonal">{{ rows.length }}</v-chip>
        <v-spacer />
        <v-btn
          color="service"
          size="small"
          :disabled="selected.length === 0"
          :loading="importing"
          data-test="import-run"
          @click="importSelected"
          >{{
            isRadarr
              ? t(key('btn_import_movies_tpl'), { count: selected.length })
              : t(key('btn_import_series_tpl'), { count: selected.length })
          }}</v-btn
        >
      </v-card-title>
      <v-card-text
        v-if="rows.length === 0"
        class="text-center text-muted"
        data-test="import-all-done"
        >{{ t(key('all_imported')) }}</v-card-text
      >
      <template v-else>
        <div class="d-flex flex-wrap ga-2 px-4 pb-2">
          <v-select
            :model-value="defaults.monitor"
            :items="monitorItems"
            :label="t(key('col_monitor'))"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 200px"
            @update:model-value="applyAll('monitor', $event)"
          />
          <v-select
            v-if="isRadarr"
            :model-value="defaults.availability"
            :items="availabilityItems"
            :label="t(key('col_availability'))"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 180px"
            @update:model-value="applyAll('availability', $event)"
          />
          <v-select
            v-else
            :model-value="defaults.seriesType"
            :items="typeItems"
            :label="t(key('col_series_type'))"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 180px"
            @update:model-value="applyAll('seriesType', $event)"
          />
          <v-select
            :model-value="defaults.qualityProfileId"
            :items="profiles"
            :label="t(key('col_quality_profile'))"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 200px"
            @update:model-value="applyAll('qualityProfileId', $event)"
          />
          <v-checkbox
            v-if="!isRadarr"
            :model-value="defaults.seasonFolder"
            :label="t(key('season_folders'))"
            color="service"
            density="compact"
            hide-details
            @update:model-value="applyAll('seasonFolder', $event === true)"
          />
        </div>
        <v-table density="compact">
          <thead>
            <tr>
              <th style="width: 40px">
                <v-checkbox-btn
                  :model-value="allChecked"
                  color="service"
                  :title="t(key('col_check_all_title'))"
                  data-test="import-check-all"
                  @update:model-value="checkAll"
                />
              </th>
              <th>{{ t(key('col_folder')) }}</th>
              <th>{{ t(key(isRadarr ? 'col_movie' : 'col_serie')) }}</th>
              <th>{{ t(key('col_monitor')) }}</th>
              <th>{{ t(key(isRadarr ? 'col_availability' : 'col_series_type')) }}</th>
              <th v-if="!isRadarr">{{ t(key('col_season_folder_short')) }}</th>
              <th>{{ t(key('col_quality_profile')) }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.path"
              data-test="import-row"
              :class="{ 'text-disabled': row.status === 'imported' }"
            >
              <td>
                <v-checkbox-btn
                  v-model="row.checked"
                  color="service"
                  :disabled="row.match === null || row.status === 'imported'"
                />
              </td>
              <td class="text-body-small font-weight-medium" :title="row.path">{{ row.name }}</td>
              <td style="min-width: 240px">
                <v-autocomplete
                  :model-value="row.match"
                  :items="row.candidates"
                  :item-title="matchTitle"
                  return-object
                  no-filter
                  :loading="row.status === 'searching'"
                  :placeholder="
                    row.status === 'searching'
                      ? t(key('searching'))
                      : t(key('no_result_search_manual'))
                  "
                  variant="outlined"
                  density="compact"
                  hide-details
                  data-test="import-match"
                  @update:search="searchRow(row, $event)"
                  @update:model-value="choose(row, $event)"
                />
              </td>
              <td>
                <v-select
                  v-model="row.monitor"
                  :items="monitorItems"
                  variant="plain"
                  density="compact"
                  hide-details
                />
              </td>
              <td>
                <v-select
                  v-if="isRadarr"
                  v-model="row.availability"
                  :items="availabilityItems"
                  variant="plain"
                  density="compact"
                  hide-details
                />
                <v-select
                  v-else
                  v-model="row.seriesType"
                  :items="typeItems"
                  variant="plain"
                  density="compact"
                  hide-details
                />
              </td>
              <td v-if="!isRadarr">
                <v-checkbox-btn v-model="row.seasonFolder" color="service" />
              </td>
              <td>
                <v-select
                  v-model="row.qualityProfileId"
                  :items="profiles"
                  variant="plain"
                  density="compact"
                  hide-details
                />
              </td>
              <td class="text-no-wrap">
                <v-chip
                  v-if="statusText(row)"
                  size="x-small"
                  variant="tonal"
                  :color="
                    row.status === 'imported'
                      ? 'success'
                      : row.status === 'error'
                        ? 'error'
                        : undefined
                  "
                  data-test="import-status"
                  >{{ statusText(row) }}</v-chip
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>
    </v-card>
  </AdminPage>
</template>
