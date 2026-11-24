<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Sauvegarde » (`section-backup`) : export de la configuration (sans
// clé ni mot de passe) et import d'un export de Hubarr (64 Ko au plus, après
// confirmation). Après un import, thème, préférences et services sont relus.
import { IMPORT_MAX_BYTES, importResultSchema, type SettingsResponse } from '@hubarr/shared';
import { msDownload, msUpload } from '../../components/symbols';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, api, validationMessages } from '../../app/api/client';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import { useHubarrTheme } from '../../app/theme/controller';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import { SETTINGS_KEY, fetchSettings } from './settings-api';

defineProps<{ settings: SettingsResponse }>();
const { t } = useI18n();
const notify = useNotifyStore();
const session = useSessionStore();
const theme = useHubarrTheme();
const queryClient = useQueryClient();

const input = ref<HTMLInputElement | null>(null);
const pending = ref<File | null>(null);
const confirmOpen = ref(false);
const error = ref<string | null>(null);

function choose(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  (event.target as HTMLInputElement).value = '';
  error.value = null;
  if (file === null) return;
  if (file.size > IMPORT_MAX_BYTES) {
    error.value = 'admin.import.too_big';
    return;
  }
  pending.value = file;
  confirmOpen.value = true;
}

const upload = useMutation({
  mutationFn: (file: File) => api.post('/api/admin/settings/import', file, importResultSchema),
  onSuccess: async (result) => {
    notify.success('admin.import.result', {
      applied: result.applied,
      skipped: result.skipped,
      instances_applied: result.instancesApplied,
      instances_skipped: result.instancesSkipped,
    });
    const next = await queryClient.query({
      queryKey: SETTINGS_KEY,
      queryFn: () => fetchSettings(),
    });
    theme.apply(next.theme);
    session.setPreferences({
      ...next.display,
      display_timezone:
        next.display.display_timezone === '' ? next.systemTimezone : next.display.display_timezone,
    });
  },
  onError: (failure) => {
    if (failure instanceof ApiError && failure.status === 413) error.value = 'admin.import.too_big';
    else error.value = validationMessages(failure)[0] ?? 'admin.flash.import_failed';
  },
});

function confirmImport(): void {
  if (pending.value !== null) upload.mutate(pending.value);
}
</script>

<template>
  <section id="section-backup" data-section="backup">
    <h2 class="text-title-large mb-1">{{ t('admin.backup.title') }}</h2>
    <p class="text-body-medium text-muted mb-4">{{ t('admin.backup.description') }}</p>

    <v-card variant="outlined" class="mb-4">
      <v-card-title class="text-title-medium">{{ t('admin.backup.export.title') }}</v-card-title>
      <v-card-subtitle data-test="export-count">
        {{
          t('admin.backup.export.count', {
            safe: settings.backup.exportable,
            skipped: settings.backup.skipped,
          })
        }}
      </v-card-subtitle>
      <v-card-actions>
        <v-btn
          :prepend-icon="msDownload"
          href="api/admin/settings/export"
          download
          variant="tonal"
          data-test="export"
        >
          {{ t('admin.backup.export.cta') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card variant="outlined">
      <v-card-title class="text-title-medium">{{ t('admin.backup.import.title') }}</v-card-title>
      <v-card-subtitle class="text-wrap">{{ t('admin.backup.import.subtitle') }}</v-card-subtitle>
      <v-card-text v-if="error" class="pb-0">
        <v-alert type="error" variant="tonal" density="compact" data-test="import-error">{{
          t(error)
        }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <input
          ref="input"
          type="file"
          accept="application/json,.json"
          class="d-none"
          data-test="import-file"
          @change="choose"
        />
        <v-btn
          :prepend-icon="msUpload"
          variant="tonal"
          :loading="upload.isPending.value"
          @click="input?.click()"
        >
          {{ t('admin.backup.import.cta') }}
        </v-btn>
      </v-card-actions>
    </v-card>
    <ConfirmDialog
      v-model="confirmOpen"
      :message="t('admin.backup.import.confirm')"
      @confirm="confirmImport"
    />
  </section>
</template>
