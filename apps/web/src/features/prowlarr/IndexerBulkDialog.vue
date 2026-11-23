<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Modification groupée des indexeurs sélectionnés (Hubarr ; l'original
// n'exposait `/indexer/bulk` qu'en API) : profil d'application, priorité,
// étiquettes et leur mode. Un champ laissé vide n'est pas modifié.
import {
  APPLY_TAGS_MODES,
  type ApplyTagsMode,
  type ProwlarrIndexerBulkRequest,
} from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { prowlarrApi, prowlarrKeys } from './prowlarr-api';

const props = defineProps<{ ids: number[]; saving: boolean }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ save: [request: ProwlarrIndexerBulkRequest] }>();
const { t } = useI18n();

const profiles = useQuery({
  queryKey: prowlarrKeys.appProfiles,
  queryFn: ({ signal }) => prowlarrApi.appProfiles(signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});
const tags = useQuery({
  queryKey: prowlarrKeys.tags,
  queryFn: ({ signal }) => prowlarrApi.tags(signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});

const form = reactive<{
  appProfileId: number | null;
  priority: string;
  tags: number[];
  mode: ApplyTagsMode;
}>({ appProfileId: null, priority: '', tags: [], mode: 'add' });
watch(open, (value) => {
  if (value) Object.assign(form, { appProfileId: null, priority: '', tags: [], mode: 'add' });
});

const profileItems = computed(() => [
  { value: null, title: t('media.films.bulk.edit_keep') },
  ...(profiles.data.value ?? []).map((profile) => ({ value: profile.id, title: profile.name })),
]);
const tagItems = computed(() =>
  (tags.data.value ?? []).map((tag) => ({ value: tag.id, title: tag.label })),
);
const modeItems = computed(() =>
  APPLY_TAGS_MODES.map((value) => ({ value, title: t(`prowlarr.index.bulk.tags_${value}`) })),
);
const priority = computed(() => {
  const value = Number.parseInt(form.priority, 10);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : null;
});
const priorityInvalid = computed(() => form.priority.trim() !== '' && priority.value === null);

function save(): void {
  if (priorityInvalid.value) return;
  const request: ProwlarrIndexerBulkRequest = { ids: [...props.ids] };
  if (form.appProfileId !== null) request.appProfileId = form.appProfileId;
  if (priority.value !== null) request.priority = priority.value;
  // « Remplacer » sans étiquette retire toutes les étiquettes : envoyé aussi.
  if (form.tags.length > 0 || form.mode === 'replace') {
    request.tags = [...form.tags];
    request.applyTags = form.mode;
  }
  emit('save', request);
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('prowlarr.index.bulk.edit_title')" :max-width="480">
    <p class="text-body-small text-muted mb-3">
      {{ t('prowlarr.index.bulk.selected', { count: ids.length }) }}
    </p>
    <v-select
      v-model="form.appProfileId"
      :items="profileItems"
      :label="t('prowlarr.index.field_app_profile')"
      variant="outlined"
      density="compact"
      data-test="indexer-bulk-profile"
    />
    <v-text-field
      v-model="form.priority"
      :label="t('prowlarr.index.field_priority')"
      :placeholder="t('media.films.bulk.edit_keep')"
      :error="priorityInvalid"
      type="number"
      min="1"
      max="50"
      variant="outlined"
      density="compact"
      data-test="indexer-bulk-priority"
    />
    <v-select
      v-model="form.tags"
      :items="tagItems"
      :label="t('prowlarr.index.field_tags')"
      multiple
      chips
      closable-chips
      variant="outlined"
      density="compact"
      data-test="indexer-bulk-tags"
    />
    <v-select
      v-model="form.mode"
      :items="modeItems"
      :label="t('media.films.bulk.tags_action')"
      variant="outlined"
      density="compact"
      hide-details
    />
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('common.action.cancel') }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="saving"
        :disabled="priorityInvalid"
        data-test="indexer-bulk-save"
        @click="save"
        >{{ t('media.films.bulk.apply') }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
