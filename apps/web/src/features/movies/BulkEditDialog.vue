<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Modification en masse (`modal-bulk-edit`) : suivi, profil de qualité,
// disponibilité minimale, dossier racine ; « Ne pas modifier » par défaut,
// seuls les champs choisis partent à Radarr.
import {
  MINIMUM_AVAILABILITIES,
  type ArrConfigResponse,
  type MoviesBulkEditRequest,
} from '@hubarr/shared';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  count: number;
  config: ArrConfigResponse | undefined;
  loading: boolean;
}>();
const emit = defineEmits<{ save: [changes: Omit<MoviesBulkEditRequest, 'movieIds'>] }>();
const { t } = useI18n();

const form = reactive({ monitored: '', quality: '', availability: '', root: '' });
watch(open, (value) => {
  if (value) Object.assign(form, { monitored: '', quality: '', availability: '', root: '' });
});

const keep = computed(() => ({ value: '', title: t('media.films.bulk.edit_keep') }));
const monitoredItems = computed(() => [
  keep.value,
  { value: 'true', title: t('media.films.bulk.edit_follow') },
  { value: 'false', title: t('media.films.bulk.edit_unfollow') },
]);
const qualityItems = computed(() => [
  keep.value,
  ...(props.config?.qualityProfiles ?? []).map((p) => ({ value: String(p.id), title: p.name })),
]);
const AVAILABILITY_KEYS = {
  announced: 'availability_announced',
  inCinemas: 'availability_in_cinemas',
  released: 'availability_released',
} as const;
const availabilityItems = computed(() => [
  keep.value,
  ...MINIMUM_AVAILABILITIES.map((value) => ({
    value,
    title: t(`media.films.bulk.${AVAILABILITY_KEYS[value]}`),
  })),
]);
const rootItems = computed(() => [
  keep.value,
  ...(props.config?.rootFolders ?? []).map((folder) => ({
    value: folder.path,
    title: folder.path,
  })),
]);

function save(): void {
  const changes: Omit<MoviesBulkEditRequest, 'movieIds'> = {};
  if (form.monitored !== '') changes.monitored = form.monitored === 'true';
  if (form.quality !== '') changes.qualityProfileId = Number(form.quality);
  const availability = MINIMUM_AVAILABILITIES.find((value) => value === form.availability);
  if (availability !== undefined) changes.minimumAvailability = availability;
  if (form.root !== '') changes.rootFolderPath = form.root;
  emit('save', changes);
}
const field = { density: 'compact', variant: 'outlined', hideDetails: true } as const;
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('media.films.bulk.edit_title')">
    <div class="bulk-edit-grid">
      <v-select
        v-bind="field"
        v-model="form.monitored"
        :items="monitoredItems"
        :label="t('media.films.bulk.edit_monitored')"
        data-test="bulk-edit-monitored"
      />
      <v-select
        v-bind="field"
        v-model="form.quality"
        :items="qualityItems"
        :label="t('media.films.bulk.edit_quality')"
      />
      <v-select
        v-bind="field"
        v-model="form.availability"
        :items="availabilityItems"
        :label="t('media.films.bulk.edit_availability')"
      />
      <v-select
        v-bind="field"
        v-model="form.root"
        :items="rootItems"
        :label="t('media.films.bulk.edit_root')"
      />
    </div>
    <p class="text-body-small text-muted mt-3">
      {{ t('media.films.bulk.selected_hint', { count }) }}
    </p>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('media.films.bulk.cancel') }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="loading"
        data-test="bulk-edit-save"
        @click="save"
        >{{ t('media.films.bulk.save') }}</v-btn
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
