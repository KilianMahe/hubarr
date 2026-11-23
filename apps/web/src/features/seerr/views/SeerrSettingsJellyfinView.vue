<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Réglages Jellyfin de Seerr (`settings/jellyfin.html.twig`, routes n° 86,
// 113) : en lecture seule comme l'original (bibliothèques, adresse, TLS, URL
// de base et externe, identifiant du serveur ; clé masquée par le serveur),
// et analyse manuelle des bibliothèques.
import { mdiRefresh } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../../app/api/error-text';
import { useNotifyStore } from '../../../app/stores/notify';
import SeerrPage from '../SeerrPage.vue';
import { field, seerrApi, text } from '../seerr-api';

const { t } = useI18n();
const notify = useNotifyStore();
const jellyfin = useQuery({
  queryKey: ['seerr', 'jellyfin'],
  queryFn: ({ signal }) => seerrApi.jellyfin(signal),
  retry: false,
});
const syncing = ref(false);
const rows = computed(() => {
  const j = jellyfin.data.value;
  if (!j) return [];
  return [
    ['internal_name', field(j, 'name', '—')],
    ['ip_hostname', `${field(j, 'ip', '—')}:${field(j, 'port', '')}`],
    ['tls_label', j.useSsl === true ? t('jellyseerr.common.yes') : t('jellyseerr.common.no')],
    ['base_url', field(j, 'urlBase', '—')],
    [
      'external_url',
      field(j, 'externalHostname', t('jellyseerr.settings.jellyfin.not_configured')),
    ],
    [
      'forgot_password_url',
      field(j, 'jellyfinForgotPasswordUrl', t('jellyseerr.settings.jellyfin.not_configured')),
    ],
    ['server_id', field(j, 'serverId', '—')],
  ] as const;
});
const libraries = computed(
  () => field<unknown[]>(jellyfin.data.value, 'libraries', []) as Record<string, unknown>[],
);
async function sync(): Promise<void> {
  syncing.value = true;
  try {
    await seerrApi.jellyfinSync();
    notify.success('jellyseerr.common.saved');
  } catch (error) {
    notify.error('common.labels.text', { text: apiErrorText(error, t, 'jellyseerr.common.error') });
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <SeerrPage
    :title="t('jellyseerr.settings.jellyfin.title')"
    :loading="jellyfin.isPending.value"
    :error="jellyfin.isError.value"
  >
    <v-row density="compact">
      <v-col cols="12" md="6">
        <v-card variant="flat" border data-test="seerr-jellyfin">
          <v-card-title class="text-title-small">{{
            t('jellyseerr.settings.jellyfin.settings_title')
          }}</v-card-title>
          <v-table density="compact">
            <tbody>
              <tr v-for="[key, value] in rows" :key="key">
                <th>{{ t(`jellyseerr.settings.jellyfin.${key}`) }}</th>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="flat" border>
          <v-card-title class="text-title-small">{{
            t('jellyseerr.settings.jellyfin.libraries_title')
          }}</v-card-title>
          <p v-if="libraries.length === 0" class="text-muted px-4">
            {{ t('jellyseerr.settings.jellyfin.no_library') }}
          </p>
          <v-list v-else density="compact">
            <v-list-item
              v-for="lib in libraries"
              :key="text(lib.id)"
              :title="text(lib.name)"
              :subtitle="
                t(
                  lib.type === 'show'
                    ? 'jellyseerr.settings.jellyfin.lib_tv'
                    : 'jellyseerr.settings.jellyfin.lib_movies',
                )
              "
            >
              <template #append>
                <v-icon :icon="lib.enabled ? '$checkboxOn' : '$checkboxOff'" />
              </template>
            </v-list-item>
          </v-list>
          <v-card-text>
            <div class="text-body-small text-muted mb-2">
              {{ t('jellyseerr.settings.jellyfin.manual_scan_desc') }}
            </div>
            <v-btn
              :prepend-icon="mdiRefresh"
              variant="tonal"
              :loading="syncing"
              data-test="seerr-jellyfin-sync"
              @click="sync"
              >{{ t('jellyseerr.settings.jellyfin.run_scan') }}</v-btn
            >
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </SeerrPage>
</template>
