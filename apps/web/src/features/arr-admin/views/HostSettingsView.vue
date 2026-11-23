<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// « Général » de l'instance (`radarr/settings.html.twig`) : hôte, sécurité,
// proxy, journaux, statistiques anonymes, mises à jour, sauvegardes
// (enregistrés ensemble), puis réglages des indexeurs, clients et listes en
// lecture. Écarts : la clé d'API n'est ni affichée ni
// régénérée (aucun secret au navigateur) ; un mot de passe vide garde l'actuel.
import { arrConfigSchema, hostSettingsPageSchema } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdminPage from '../AdminPage.vue';
import ConfigForm from '../ConfigForm.vue';
import { useAdminPage } from '../admin-api';
import { HOST_SECTIONS, configPatch, formValues, sectionsFor } from '../config-forms';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'settings',
  '/parametres',
  hostSettingsPageSchema,
);
const sections = computed(() => sectionsFor(HOST_SECTIONS, ctx.kind.value));
const fields = computed(() => sections.value.flatMap((section) => section.fields));
const values = ref<Record<string, unknown>>({});
watch(
  () => query.data.value?.host,
  (host) => (values.value = formValues(host, fields.value)),
  { immediate: true },
);
const page = computed(() => query.data.value);

const saving = ref(false);
async function save(): Promise<void> {
  const patch = configPatch(values.value, fields.value);
  if ((patch.password ?? '') !== (patch.passwordConfirmation ?? '')) {
    feedback.value = { type: 'error', text: t('setup.error.password_mismatch') };
    return;
  }
  saving.value = true;
  await run(
    () => ctx.post('/parametres/host/sauvegarder', patch, arrConfigSchema),
    ctx.key('error_save'),
    t(ctx.key('saved')),
  );
  saving.value = false;
}

function show(value: unknown, suffix = ''): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return t(ctx.key(value ? 'yes' : 'no'));
  return typeof value === 'string' || typeof value === 'number' ? `${value}${suffix}` : '—';
}
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
    <template #actions>
      <v-btn color="service" size="small" :loading="saving" data-test="config-save" @click="save">{{
        t(ctx.key('save'))
      }}</v-btn>
    </template>
    <ConfigForm v-model="values" :sections="sections" :kind="ctx.kind.value">
      <template #after-updates>
        <p class="text-body-small text-muted">
          {{ t(ctx.key('updates.mechanism_label'))
          }}<strong>{{ show(page?.host?.updateMechanism) }}</strong>
        </p>
      </template>
    </ConfigForm>
    <v-row v-if="page" density="compact" class="mt-1">
      <v-col cols="12" md="4">
        <v-card variant="flat" border class="h-100">
          <v-card-title class="text-title-medium">{{
            t(ctx.key('indexer_config.title'))
          }}</v-card-title>
          <v-table density="compact">
            <tbody>
              <tr>
                <td>{{ t(ctx.key('indexer_config.minimum_age')) }}</td>
                <td>{{ show(page.indexer?.minimumAge) }}</td>
              </tr>
              <tr>
                <td>{{ t(ctx.key('indexer_config.retention')) }}</td>
                <td>{{ show(page.indexer?.retention) }}</td>
              </tr>
              <tr>
                <td>{{ t(ctx.key('indexer_config.rss_sync')) }}</td>
                <td>{{ show(page.indexer?.rssSyncInterval) }}</td>
              </tr>
              <tr v-if="ctx.kind.value === 'radarr'">
                <td>{{ t(ctx.key('indexer_config.prefer_flags')) }}</td>
                <td>{{ show(page.indexer?.preferIndexerFlags === true) }}</td>
              </tr>
              <tr v-if="ctx.kind.value === 'radarr'">
                <td>{{ t(ctx.key('indexer_config.availability_delay')) }}</td>
                <td>{{ show(page.indexer?.availabilityDelay) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="flat" border class="h-100">
          <v-card-title class="text-title-medium">{{
            t(ctx.key('download_client_config.title'))
          }}</v-card-title>
          <v-table density="compact">
            <tbody>
              <tr>
                <td>{{ t(ctx.key('download_client_config.working_folders')) }}</td>
                <td>{{ show(page.downloadClient?.downloadClientWorkingFolders) }}</td>
              </tr>
              <tr>
                <td>{{ t(ctx.key('download_client_config.completed_handling')) }}</td>
                <td>{{ show(page.downloadClient?.enableCompletedDownloadHandling === true) }}</td>
              </tr>
              <tr>
                <td>{{ t(ctx.key('download_client_config.auto_redownload')) }}</td>
                <td>{{ show(page.downloadClient?.autoRedownloadFailed === true) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="flat" border class="h-100">
          <v-card-title class="text-title-medium">{{
            t(ctx.key('import_list_config.title'))
          }}</v-card-title>
          <v-table density="compact">
            <tbody>
              <tr>
                <td>{{ t(ctx.key('import_list_config.sync_level')) }}</td>
                <td>{{ show(page.importList?.listSyncLevel) }}</td>
              </tr>
              <tr>
                <td>{{ t(ctx.key('import_list_config.min_refresh')) }}</td>
                <td>
                  {{
                    show(
                      page.importList?.importListSyncInterval ??
                        page.importList?.importListMinRefreshInterval,
                      ' min',
                    )
                  }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>
  </AdminPage>
</template>
