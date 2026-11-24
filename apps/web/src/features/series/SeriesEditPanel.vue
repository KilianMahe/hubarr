<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Édition d'une série dans la fiche (`btn-serie-edit`) : suivi, nouvelles
// saisons, dossiers par saison, profil de qualité, type, chemin (explorateur
// et mise à jour immédiate), étiquettes (création à la volée). « Supprimer »
// ouvre la suppression de la fiche.
import {
  MONITOR_NEW_ITEMS,
  SERIES_TYPES,
  type ArrTag,
  type SeriesDetail,
  type SeriesEditRequest,
  type SeriesType,
} from '@hubarr/shared';
import { msAdd } from '../../components/symbols';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FolderPathField from '../../components/FolderPathField.vue';
import { seriesApi, type SonarrConfig } from './series-api';

const props = defineProps<{
  slug: string;
  series: SeriesDetail;
  config: SonarrConfig | undefined;
  saving: boolean;
}>();
const emit = defineEmits<{
  save: [changes: SeriesEditRequest];
  updatePath: [path: string];
  delete: [];
  cancel: [];
}>();
const { t } = useI18n();

interface EditForm {
  monitored: boolean;
  monitorNewItems: (typeof MONITOR_NEW_ITEMS)[number];
  seasonFolder: boolean;
  qualityProfileId: number;
  seriesType: SeriesType;
  path: string;
  tags: number[];
}
const form = reactive<EditForm>({
  monitored: true,
  monitorNewItems: 'all',
  seasonFolder: true,
  qualityProfileId: 0,
  seriesType: 'standard',
  path: '',
  tags: [],
});
function reset(): void {
  Object.assign(form, {
    monitored: props.series.monitored,
    monitorNewItems: MONITOR_NEW_ITEMS.find((v) => v === props.series.monitorNewItems) ?? 'all',
    seasonFolder: props.series.seasonFolder,
    qualityProfileId: props.series.qualityProfileId ?? 0,
    seriesType: SERIES_TYPES.find((v) => v === props.series.seriesType) ?? 'standard',
    path: props.series.path ?? '',
    tags: [...props.series.tags],
  });
}
watch(() => props.series, reset, { immediate: true });

const monitorNewItems = computed(() => [
  { value: 'all', title: t('media.series.detail.edit_monitor_new_all') },
  { value: 'none', title: t('media.series.detail.edit_monitor_new_none') },
]);
const profileItems = computed(() =>
  (props.config?.qualityProfiles ?? []).map((profile) => ({
    value: profile.id,
    title: profile.name,
  })),
);
const typeItems = computed(() =>
  SERIES_TYPES.map((value) => ({ value, title: t(`media.series.modal.type_${value}`) })),
);

// ── Étiquettes ──────────────────────────────────────────────────────────────

const createdTags = ref<ArrTag[]>([]);
const allTags = computed(() => [...(props.config?.tags ?? []), ...createdTags.value]);
function toggleTag(id: number): void {
  form.tags = form.tags.includes(id) ? form.tags.filter((tag) => tag !== id) : [...form.tags, id];
}
const newTag = ref('');
const addingTag = ref(false);
async function addTag(): Promise<void> {
  const label = newTag.value.trim();
  if (label === '') return;
  newTag.value = '';
  addingTag.value = true;
  try {
    const { tag } = await seriesApi.createTag(props.slug, label);
    createdTags.value = [...createdTags.value, tag];
    form.tags = [...form.tags, tag.id];
  } catch {
    // L'original ignorait l'échec ; l'étiquette n'est simplement pas ajoutée.
  } finally {
    addingTag.value = false;
  }
}

const loadFolders = (path: string) => seriesApi.filesystem(props.slug, path);
const FOLDER_KEYS = {
  explorer: 'media.series.detail.edit_path_browse',
  update: 'media.series.detail.edit_path_update',
  empty: 'media.series.detail.edit_empty_folder',
  confirm: 'media.series.detail.confirm_move_tpl',
};

function save(): void {
  emit('save', {
    monitored: form.monitored,
    monitorNewItems: form.monitorNewItems,
    seasonFolder: form.seasonFolder,
    ...(form.qualityProfileId > 0 ? { qualityProfileId: form.qualityProfileId } : {}),
    seriesType: form.seriesType,
    ...(form.path.trim() !== '' ? { path: form.path.trim() } : {}),
    tags: form.tags,
  });
}
</script>

<template>
  <div class="series-edit pa-3" data-test="series-edit">
    <v-checkbox
      v-model="form.monitored"
      :label="t('media.series.detail.edit_monitored_label')"
      :hint="t('media.series.detail.edit_monitored_help')"
      persistent-hint
      density="compact"
      color="service"
      class="mb-3"
    />
    <v-select
      v-model="form.monitorNewItems"
      :items="monitorNewItems"
      :label="t('media.series.detail.edit_monitor_new_seasons')"
      :hint="t('media.series.detail.edit_monitor_new_help')"
      persistent-hint
      density="compact"
      variant="outlined"
      class="mb-3"
    />
    <v-checkbox
      v-model="form.seasonFolder"
      :label="t('media.series.detail.edit_use_season_folder')"
      :hint="t('media.series.detail.edit_use_season_folder_help')"
      persistent-hint
      density="compact"
      color="service"
      class="mb-3"
    />
    <v-select
      v-model="form.qualityProfileId"
      :items="profileItems"
      :label="t('media.series.detail.edit_quality_profile')"
      :loading="config === undefined"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
    />
    <v-select
      v-model="form.seriesType"
      :items="typeItems"
      :label="t('media.series.detail.edit_series_type')"
      :hint="t('media.series.detail.edit_series_type_help')"
      persistent-hint
      density="compact"
      variant="outlined"
      class="mb-3"
      data-test="series-edit-type"
    />
    <FolderPathField
      v-model="form.path"
      :label="t('media.series.detail.edit_path')"
      :load="loadFolders"
      :fallback-path="series.path ?? '/'"
      :keys="FOLDER_KEYS"
      test-id="series-edit"
      @update-path="(path) => emit('updatePath', path)"
    />
    <div class="text-body-medium mt-4 mb-2">{{ t('media.series.detail.edit_tags') }}</div>
    <div class="d-flex flex-wrap ga-1 mb-2">
      <v-chip
        v-for="tag in allTags"
        :key="tag.id"
        size="small"
        :variant="form.tags.includes(tag.id) ? 'flat' : 'outlined'"
        :color="form.tags.includes(tag.id) ? 'service' : undefined"
        :aria-pressed="form.tags.includes(tag.id)"
        @click="toggleTag(tag.id)"
        >{{ tag.label }}</v-chip
      >
    </div>
    <v-text-field
      v-model="newTag"
      :placeholder="t('media.series.detail.edit_tag_placeholder')"
      density="compact"
      variant="outlined"
      hide-details
      :loading="addingTag"
      @keydown.enter.prevent="addTag"
    >
      <template #append-inner>
        <v-btn
          :icon="msAdd"
          size="small"
          variant="text"
          :aria-label="t('common.action.add')"
          @click="addTag"
        />
      </template>
    </v-text-field>
    <div class="d-flex flex-wrap align-center ga-2 mt-4">
      <v-btn
        color="error"
        variant="tonal"
        size="small"
        data-test="series-edit-delete"
        @click="emit('delete')"
        >{{ t('media.series.detail.edit_delete') }}</v-btn
      >
      <v-spacer />
      <v-btn variant="text" size="small" @click="(reset(), emit('cancel'))">{{
        t('media.series.detail.edit_cancel')
      }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        size="small"
        :loading="saving"
        data-test="series-edit-save"
        @click="save"
        >{{ t('media.series.detail.edit_save') }}</v-btn
      >
    </div>
  </div>
</template>

<style scoped>
.series-edit {
  max-width: 560px;
}
</style>
