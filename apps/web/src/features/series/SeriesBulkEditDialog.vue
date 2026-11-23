<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Modification en masse (`modal-bulk-edit-series`) : suivi, profil de qualité,
// type de série, dossier racine, dossiers par saison ; « Ne pas modifier » par
// défaut, seuls les champs choisis partent à Sonarr.
import { SERIES_TYPES, type SeriesBulkEditRequest } from '@hubarr/shared';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import type { SonarrConfig } from './series-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  count: number;
  config: SonarrConfig | undefined;
  loading: boolean;
}>();
const emit = defineEmits<{ save: [changes: Omit<SeriesBulkEditRequest, 'seriesIds'>] }>();
const { t } = useI18n();

const empty = { monitored: '', quality: '', type: '', root: '', seasonFolder: '' };
const form = reactive({ ...empty });
watch(open, (value) => {
  if (value) Object.assign(form, empty);
});

const keep = computed(() => ({ value: '', title: t('media.series.bulk.edit_keep') }));
const monitoredItems = computed(() => [
  keep.value,
  { value: 'true', title: t('media.series.bulk.edit_follow') },
  { value: 'false', title: t('media.series.bulk.edit_unfollow') },
]);
const qualityItems = computed(() => [
  keep.value,
  ...(props.config?.qualityProfiles ?? []).map((p) => ({ value: String(p.id), title: p.name })),
]);
const typeItems = computed(() => [
  keep.value,
  ...SERIES_TYPES.map((value) => ({ value, title: t(`media.series.bulk.type_${value}`) })),
]);
const rootItems = computed(() => [
  keep.value,
  ...(props.config?.rootFolders ?? []).map((folder) => ({
    value: folder.path,
    title: folder.path,
  })),
]);
const seasonFolderItems = computed(() => [
  keep.value,
  { value: 'true', title: t('media.series.bulk.yes') },
  { value: 'false', title: t('media.series.bulk.no') },
]);

function save(): void {
  const changes: Omit<SeriesBulkEditRequest, 'seriesIds'> = {};
  if (form.monitored !== '') changes.monitored = form.monitored === 'true';
  if (form.quality !== '') changes.qualityProfileId = Number(form.quality);
  const type = SERIES_TYPES.find((value) => value === form.type);
  if (type !== undefined) changes.seriesType = type;
  if (form.root !== '') changes.rootFolderPath = form.root;
  if (form.seasonFolder !== '') changes.seasonFolder = form.seasonFolder === 'true';
  emit('save', changes);
}

const field = { density: 'compact', variant: 'outlined', hideDetails: true } as const;
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('media.series.bulk.edit_title')">
    <div class="bulk-edit-grid">
      <v-select
        v-bind="field"
        v-model="form.monitored"
        :items="monitoredItems"
        :label="t('media.series.bulk.edit_monitored')"
        data-test="bulk-edit-monitored"
      />
      <v-select
        v-bind="field"
        v-model="form.quality"
        :items="qualityItems"
        :label="t('media.series.bulk.edit_quality')"
      />
      <v-select
        v-bind="field"
        v-model="form.type"
        :items="typeItems"
        :label="t('media.series.bulk.edit_type')"
        data-test="bulk-edit-type"
      />
      <v-select
        v-bind="field"
        v-model="form.root"
        :items="rootItems"
        :label="t('media.series.bulk.edit_root')"
      />
      <v-select
        v-bind="field"
        v-model="form.seasonFolder"
        :items="seasonFolderItems"
        :label="t('media.series.bulk.edit_season_folder')"
      />
    </div>
    <p class="text-body-small text-muted mt-3">
      {{ t('media.series.bulk.selected_info_tpl', { count }) }}
    </p>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('media.series.bulk.cancel') }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="loading"
        data-test="bulk-edit-save"
        @click="save"
        >{{ t('media.series.bulk.save') }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.bulk-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
</style>
