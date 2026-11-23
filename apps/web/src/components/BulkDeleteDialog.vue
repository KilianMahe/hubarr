<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Suppression en masse (`modal-bulk-delete`) : titres concernés, suppression
// des fichiers, ajout aux exclusions d'import ; action irréversible. Partagé
// par les films et les séries.
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from './ResponsiveDialog.vue';

const open = defineModel<boolean>({ required: true });
withDefaults(
  defineProps<{
    titles: string[];
    loading: boolean;
    /** Préfixe des clés de traduction (`media.films.bulk`, `media.series.bulk`). */
    i18nPrefix?: string;
  }>(),
  { i18nPrefix: 'media.films.bulk' },
);
const emit = defineEmits<{ confirm: [deleteFiles: boolean, addImportExclusion: boolean] }>();
const { t } = useI18n();

const deleteFiles = ref(false);
const exclude = ref(false);
watch(open, (value) => {
  if (value) {
    deleteFiles.value = false;
    exclude.value = false;
  }
});
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="t(`${i18nPrefix}.delete_title`)"
    title-color="error"
    :max-width="480"
  >
    <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
      {{ t(`${i18nPrefix}.delete_warning_count`, { count: titles.length }) }}
    </v-alert>
    <v-checkbox
      v-model="deleteFiles"
      :label="t(`${i18nPrefix}.delete_files`)"
      density="compact"
      hide-details
      color="error"
      data-test="bulk-delete-files"
    />
    <v-checkbox
      v-model="exclude"
      :label="t(`${i18nPrefix}.delete_exclude`)"
      density="compact"
      hide-details
      color="error"
    />
    <ul class="bulk-delete-list text-body-small text-muted mt-2">
      <li v-for="(title, index) in titles" :key="index">{{ title }}</li>
    </ul>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t(`${i18nPrefix}.cancel`) }}</v-btn>
      <v-btn
        color="error"
        variant="flat"
        :loading="loading"
        data-test="bulk-delete-confirm"
        @click="emit('confirm', deleteFiles, exclude)"
        >{{ t(`${i18nPrefix}.delete_confirm`) }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.bulk-delete-list {
  max-height: 150px;
  overflow-y: auto;
  padding-left: 20px;
}
</style>
