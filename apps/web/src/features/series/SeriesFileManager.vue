<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Gestionnaire des fichiers d'une série ou d'une saison (`openFileManager`,
// `renderFileManager`) : chemin, saison et épisode (réattribution), qualité,
// langues, groupe, type de release, drapeaux d'indexeur, taille, suppression.
// Les lignes modifiées sont enregistrées ensemble : métadonnées par la mise à
// jour complète, épisode par une réattribution ; une saison changée sans
// épisode est refusée. Actions groupées sur les lignes cochées : appliquer une
// valeur (saison, qualité, langue, groupe, type, drapeaux) ou attribuer des
// épisodes dans l'ordre.
import {
  FILE_LANGUAGE_CHOICES,
  INDEXER_FLAGS,
  RELEASE_TYPES,
  type ArrNamedItem,
  type Episode,
} from '@hubarr/shared';
import { mdiDelete } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import { seriesSize } from './library';
import { seriesApi, seriesKeys } from './series-api';
import { fileRowsOf, isRowDirty, rowChanges, type FileRow } from './series-detail';

const props = defineProps<{ slug: string; seriesId: number; season?: number | null }>();
const emit = defineEmits<{ saved: [] }>();
const { t } = useI18n();

const files = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.slug, props.seriesId, 'files')),
  queryFn: ({ signal }) => seriesApi.files(props.slug, props.seriesId, signal),
  staleTime: 0,
  retry: false,
});
const episodes = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.slug, props.seriesId, 'episodes')),
  queryFn: ({ signal }) => seriesApi.episodes(props.slug, props.seriesId, signal),
  retry: false,
});
const qualities = useQuery({
  queryKey: computed(() => seriesKeys.qualityDefinitions(props.slug)),
  queryFn: ({ signal }) => seriesApi.qualityDefinitions(props.slug, signal),
  staleTime: 300_000,
  retry: false,
});

const episodeList = computed<Episode[]>(() => episodes.data.value ?? []);
const originals = ref<FileRow[]>([]);
const rows = ref<FileRow[]>([]);
watch(
  [() => files.data.value, () => episodes.data.value],
  ([fileList, episodeData]) => {
    if (fileList === undefined || episodeData === undefined) return;
    const all = fileRowsOf(fileList, episodeData).filter(
      (row) =>
        props.season === undefined || props.season === null || row.seasonNumber === props.season,
    );
    originals.value = all.map((row) => ({ ...row, languages: [...row.languages] }));
    rows.value = all.map((row) => ({ ...row, languages: [...row.languages] }));
  },
  { immediate: true },
);
const loading = computed(() => files.isPending.value || episodes.isPending.value);
const originalOf = (row: FileRow) => originals.value.find((item) => item.fileId === row.fileId);
const dirty = computed(() =>
  rows.value.filter((row) => {
    const original = originalOf(row);
    return original !== undefined && isRowDirty(original, row, episodeList.value);
  }),
);

// ── Choix ───────────────────────────────────────────────────────────────────

const seasonNumbers = computed(() =>
  [...new Set(episodeList.value.map((episode) => episode.seasonNumber))].sort((a, b) => a - b),
);
const seasonItems = computed(() =>
  seasonNumbers.value.map((season) => ({
    value: season,
    title:
      season === 0
        ? t('media.series.filemanager.season_option_special')
        : `S${String(season).padStart(2, '0')}`,
  })),
);
function episodeItems(season: number) {
  return [
    { value: null, title: '—' },
    ...episodeList.value
      .filter((episode) => episode.seasonNumber === season)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((episode) => ({
        value: episode.episodeNumber,
        title: `E${String(episode.episodeNumber).padStart(2, '0')} — ${episode.title ?? ''}`,
      })),
  ];
}
const qualityItems = computed(() =>
  (qualities.data.value ?? []).map((quality) => ({ value: quality.id, title: quality.name })),
);
function languageItems(row: FileRow): ArrNamedItem[] {
  const extra = row.languages.filter(
    (language) => !FILE_LANGUAGE_CHOICES.some((choice) => choice.id === language.id),
  );
  return [...FILE_LANGUAGE_CHOICES, ...extra];
}
const RELEASE_TYPE_KEYS: Record<(typeof RELEASE_TYPES)[number], string> = {
  singleEpisode: 'media.series.filemanager.release_type_single',
  multiEpisode: 'media.series.filemanager.release_type_multi',
  seasonPack: 'media.series.filemanager.release_type_pack',
};
const releaseTypeItems = computed(() =>
  RELEASE_TYPES.map((value) => ({ value, title: t(RELEASE_TYPE_KEYS[value]) })),
);
const flagItems = computed(() =>
  INDEXER_FLAGS.map((flag) => ({
    value: flag.value,
    title: flag.label ?? t('media.series.filemanager.indexer_flag_none'),
  })),
);
function setSeason(row: FileRow, season: number): void {
  row.seasonNumber = season;
  row.episodeNumber = null;
}
function setLanguages(row: FileRow, ids: number[]): void {
  const choices = languageItems(row);
  row.languages = ids.flatMap((id) => {
    const language = choices.find((choice) => choice.id === id);
    return language === undefined ? [] : [{ ...language }];
  });
}

// ── Actions groupées ────────────────────────────────────────────────────────

const selected = ref<number[]>([]);
const selectedRows = computed(() =>
  rows.value.filter((row) => selected.value.includes(row.fileId)),
);
type BulkField = 'season' | 'episode' | 'quality' | 'language' | 'group' | 'releaseType' | 'flags';
const bulk = reactive<{
  field: BulkField | null;
  season: number;
  quality: number | null;
  language: number | null;
  group: string;
  releaseType: (typeof RELEASE_TYPES)[number];
  flags: number;
  episodes: number[];
}>({
  field: null,
  season: 1,
  quality: null,
  language: null,
  group: '',
  releaseType: 'singleEpisode',
  flags: 0,
  episodes: [],
});
const bulkFields = computed(() =>
  (
    [
      ['season', 'bulk_season'],
      ['episode', 'bulk_episode'],
      ['quality', 'bulk_quality'],
      ['language', 'bulk_language'],
      ['group', 'bulk_group'],
      ['releaseType', 'bulk_release_type'],
      ['flags', 'bulk_indexer_flags'],
    ] as const
  ).map(([value, key]) => ({ value, title: t(`media.series.filemanager.${key}`) })),
);
const bulkEpisodeItems = computed(() => episodeItems(bulk.season).slice(1));

function applyBulk(): void {
  const targets = selectedRows.value;
  if (targets.length === 0) {
    showFeedback('warning', t('media.series.filemanager.save_bulk_none_selected'));
    return;
  }
  switch (bulk.field) {
    case 'season':
      for (const row of targets) setSeason(row, bulk.season);
      break;
    case 'episode': {
      if (bulk.episodes.length > targets.length) {
        showFeedback(
          'warning',
          t('media.series.filemanager.save_bulk_too_many_tpl', {
            picked: bulk.episodes.length,
            selected: targets.length,
          }),
        );
        return;
      }
      const picked = [...bulk.episodes].sort((a, b) => a - b);
      targets.forEach((row, index) => {
        const episode = picked[index];
        if (episode === undefined) return;
        row.seasonNumber = bulk.season;
        row.episodeNumber = episode;
      });
      break;
    }
    case 'quality':
      if (bulk.quality !== null) for (const row of targets) row.qualityId = bulk.quality;
      break;
    case 'language':
      if (bulk.language !== null) for (const row of targets) setLanguages(row, [bulk.language]);
      break;
    case 'group':
      for (const row of targets) row.releaseGroup = bulk.group;
      break;
    case 'releaseType':
      for (const row of targets) row.releaseType = bulk.releaseType;
      break;
    case 'flags':
      for (const row of targets) row.indexerFlags = bulk.flags;
      break;
    case null:
      break;
  }
}

// ── Enregistrement, suppression ─────────────────────────────────────────────

const feedback = ref<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
function showFeedback(type: 'success' | 'warning' | 'error', text: string): void {
  feedback.value = { type, text };
}
const saving = ref(false);

async function saveAll(): Promise<void> {
  const targets = dirty.value;
  if (targets.length === 0) return;
  saving.value = true;
  feedback.value = null;
  let ok = 0;
  let errors = 0;
  let warnedMissing = false;
  for (const row of targets) {
    const original = originalOf(row);
    if (original === undefined) continue;
    const changes = rowChanges(original, row, episodeList.value);
    if (changes.reassign === 'missing') {
      errors += 1;
      warnedMissing = true;
      showFeedback(
        'warning',
        t('media.series.filemanager.no_ep_for_file_tpl', { name: row.path.slice(0, 40) }),
      );
      continue;
    }
    try {
      if (changes.update !== null) await seriesApi.updateFile(props.slug, changes.update);
      if (changes.reassign !== null) {
        await seriesApi.reassignFile(props.slug, row.fileId, {
          seriesId: props.seriesId,
          episodeIds: [changes.reassign.episodeId],
        });
      }
      ok += 1;
      Object.assign(original, { ...row, languages: [...row.languages] });
    } catch {
      errors += 1;
    }
  }
  saving.value = false;
  if (errors > 0) {
    if (ok > 0 || !warnedMissing) {
      showFeedback('warning', t('media.series.filemanager.save_partial_tpl', { ok, errors }));
    }
  } else {
    showFeedback('success', t('media.series.filemanager.save_success_tpl', { count: ok }));
    emit('saved');
  }
}

// La cible survit à la fermeture du dialogue, qui précède l'émission de `confirm`.
const deleteTarget = ref<number | null>(null);
const deleteOpen = ref(false);
function askDelete(fileId: number): void {
  deleteTarget.value = fileId;
  deleteOpen.value = true;
}
async function confirmDelete(): Promise<void> {
  const fileId = deleteTarget.value;
  if (fileId === null) return;
  try {
    await seriesApi.deleteFile(props.slug, fileId);
    rows.value = rows.value.filter((row) => row.fileId !== fileId);
    originals.value = originals.value.filter((row) => row.fileId !== fileId);
    showFeedback('success', t('media.series.detail.file_deleted'));
    emit('saved');
  } catch {
    showFeedback('error', t('media.series.detail.file_delete_error'));
  }
}

const field = { density: 'compact', variant: 'outlined', hideDetails: true } as const;
</script>

<template>
  <div data-test="series-files">
    <v-progress-linear v-if="loading" indeterminate color="service" />
    <p v-else-if="files.isError.value" class="text-error text-body-small pa-3">
      {{ t('media.series.detail.load_files_error') }}
    </p>
    <p v-else-if="rows.length === 0" class="text-body-small text-muted pa-3">
      {{
        season === undefined || season === null
          ? t('media.series.detail.no_files_for_series')
          : t('media.series.detail.no_files_for_season')
      }}
    </p>
    <template v-else>
      <!-- Actions groupées -->
      <div v-if="selected.length > 0" class="series-files__bulk" data-test="series-files-bulk">
        <span class="text-body-small">{{
          t('media.series.filemanager.selected_count_tpl', { count: selected.length })
        }}</span>
        <v-select
          v-bind="field"
          v-model="bulk.field"
          :items="bulkFields"
          :label="t('media.series.filemanager.bulk_modify')"
          class="series-files__bulk-field"
          data-test="series-files-bulk-field"
        />
        <v-select
          v-if="bulk.field === 'season' || bulk.field === 'episode'"
          v-bind="field"
          v-model="bulk.season"
          :items="seasonItems"
          :label="t('media.series.filemanager.bulk_season')"
          class="series-files__bulk-field"
        />
        <v-select
          v-if="bulk.field === 'episode'"
          v-bind="field"
          v-model="bulk.episodes"
          :items="bulkEpisodeItems"
          :label="t('media.series.filemanager.bulk_pick_eps')"
          multiple
          class="series-files__bulk-field"
        />
        <v-select
          v-if="bulk.field === 'quality'"
          v-bind="field"
          v-model="bulk.quality"
          :items="qualityItems"
          :label="t('media.series.filemanager.bulk_quality')"
          class="series-files__bulk-field"
        />
        <v-select
          v-if="bulk.field === 'language'"
          v-bind="field"
          v-model="bulk.language"
          :items="FILE_LANGUAGE_CHOICES"
          item-title="name"
          item-value="id"
          :label="t('media.series.filemanager.bulk_language')"
          class="series-files__bulk-field"
        />
        <v-text-field
          v-if="bulk.field === 'group'"
          v-bind="field"
          v-model="bulk.group"
          :placeholder="t('media.series.filemanager.bulk_group_placeholder')"
          class="series-files__bulk-field"
        />
        <v-select
          v-if="bulk.field === 'releaseType'"
          v-bind="field"
          v-model="bulk.releaseType"
          :items="releaseTypeItems"
          class="series-files__bulk-field"
        />
        <v-select
          v-if="bulk.field === 'flags'"
          v-bind="field"
          v-model="bulk.flags"
          :items="flagItems"
          class="series-files__bulk-field"
        />
        <v-btn
          size="small"
          variant="tonal"
          :disabled="bulk.field === null"
          data-test="series-files-bulk-apply"
          @click="applyBulk"
          >{{ t('media.series.filemanager.bulk_apply') }}</v-btn
        >
      </div>

      <div class="series-files__scroll">
        <v-table density="compact" class="series-files">
          <thead>
            <tr>
              <th style="width: 36px" />
              <th>{{ t('media.series.filemanager.col_path') }}</th>
              <th>{{ t('media.series.filemanager.col_season') }}</th>
              <th>{{ t('media.series.filemanager.col_episode') }}</th>
              <th>{{ t('media.series.filemanager.col_quality') }}</th>
              <th>{{ t('media.series.filemanager.col_languages') }}</th>
              <th>{{ t('media.series.filemanager.col_group') }}</th>
              <th>{{ t('media.series.filemanager.col_version') }}</th>
              <th>{{ t('media.series.filemanager.col_flags') }}</th>
              <th>{{ t('media.series.filemanager.col_size') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.fileId"
              :class="{ 'series-files__row--dirty': dirty.includes(row) }"
              data-test="series-file-row"
            >
              <td>
                <v-checkbox-btn v-model="selected" :value="row.fileId" color="service" />
              </td>
              <td class="series-files__path" :title="row.path">{{ row.path }}</td>
              <td>
                <v-select
                  v-bind="field"
                  :model-value="row.seasonNumber"
                  :items="seasonItems"
                  class="series-files__narrow"
                  @update:model-value="(value: number) => setSeason(row, value)"
                />
              </td>
              <td>
                <v-select
                  v-bind="field"
                  v-model="row.episodeNumber"
                  :items="episodeItems(row.seasonNumber)"
                  class="series-files__wide"
                  data-test="series-file-episode"
                />
              </td>
              <td>
                <v-select
                  v-bind="field"
                  v-model="row.qualityId"
                  :items="qualityItems"
                  class="series-files__wide"
                  data-test="series-file-quality"
                />
              </td>
              <td>
                <v-select
                  v-bind="field"
                  :model-value="row.languages.map((language) => language.id)"
                  :items="languageItems(row)"
                  item-title="name"
                  item-value="id"
                  multiple
                  chips
                  class="series-files__wide"
                  @update:model-value="(ids: number[]) => setLanguages(row, ids)"
                />
              </td>
              <td>
                <v-text-field
                  v-bind="field"
                  v-model="row.releaseGroup"
                  class="series-files__narrow"
                />
              </td>
              <td>
                <v-select
                  v-bind="field"
                  v-model="row.releaseType"
                  :items="releaseTypeItems"
                  class="series-files__wide"
                />
              </td>
              <td>
                <v-select
                  v-bind="field"
                  v-model="row.indexerFlags"
                  :items="flagItems"
                  class="series-files__wide"
                />
              </td>
              <td class="text-no-wrap text-muted">{{ seriesSize(t, row.size) }}</td>
              <td>
                <v-btn
                  :icon="mdiDelete"
                  size="x-small"
                  variant="text"
                  color="error"
                  :aria-label="t('media.series.detail.delete_file')"
                  :title="t('media.series.detail.delete_file')"
                  data-test="series-file-delete"
                  @click="askDelete(row.fileId)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
      <div class="d-flex justify-end pa-3">
        <v-btn
          color="service"
          variant="flat"
          size="small"
          :disabled="dirty.length === 0"
          :loading="saving"
          data-test="series-files-save"
          @click="saveAll"
          >{{ t('media.series.filemanager.save_all') }}</v-btn
        >
      </div>
    </template>
    <v-alert
      v-if="feedback"
      :type="feedback.type"
      variant="tonal"
      density="compact"
      class="ma-3"
      data-test="series-files-feedback"
      >{{ feedback.text }}</v-alert
    >
    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('media.series.detail.confirm_delete_file')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.series-files__scroll {
  overflow-x: auto;
}
.series-files {
  font-size: 0.8rem;
  min-width: 1100px;
}
.series-files__path {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-files__narrow {
  min-width: 90px;
}
.series-files__wide {
  min-width: 150px;
}
.series-files__row--dirty {
  background: rgba(var(--v-theme-warning), 0.08);
}
.series-files__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--v-theme-service), 0.08);
}
.series-files__bulk-field {
  max-width: 220px;
}
</style>
