<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Profils de synchronisation (`sync-profiles-body` et `pw-modal-profile` de
// `prowlarr/apps.html.twig`) : liste, ajout, modification, suppression
// confirmée (refusée par Prowlarr si un indexeur l'utilise).
import {
  prowlarrAppProfileSchema,
  type ProwlarrAppProfile,
  type ProwlarrAppProfileRequest,
} from '@hubarr/shared';
import { msAdd, msEdit } from '../../components/symbols';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import { fillLegacy } from '../../app/legacy-template';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import AdminDialog from '../arr-admin/AdminDialog.vue';
import { useConfirmAction } from '../arr-admin/admin-api';
import { PROWLARR_API, prowlarrApi, prowlarrKeys } from './prowlarr-api';
import EmptyState from '../../components/EmptyState.vue';

const { t } = useI18n();
const queryClient = useQueryClient();
const confirm = useConfirmAction();
const profiles = useQuery({
  queryKey: prowlarrKeys.appProfiles,
  queryFn: ({ signal }) => prowlarrApi.appProfiles(signal),
  retry: false,
});

const dialog = reactive<{
  open: boolean;
  id: number | null;
  saving: boolean;
  error: string | null;
}>({
  open: false,
  id: null,
  saving: false,
  error: null,
});
const form = ref<ProwlarrAppProfileRequest>({
  name: '',
  enableRss: true,
  enableAutomaticSearch: true,
  enableInteractiveSearch: true,
  minimumSeeders: 1,
});

function edit(profile: ProwlarrAppProfile | null): void {
  dialog.id = profile?.id ?? null;
  dialog.error = null;
  form.value = profile
    ? {
        name: profile.name,
        enableRss: profile.enableRss,
        enableAutomaticSearch: profile.enableAutomaticSearch,
        enableInteractiveSearch: profile.enableInteractiveSearch,
        minimumSeeders: profile.minimumSeeders,
      }
    : {
        name: '',
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        minimumSeeders: 1,
      };
  dialog.open = true;
}

async function refresh(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: prowlarrKeys.appProfiles });
}

async function save(): Promise<void> {
  if (form.value.name.trim() === '') {
    dialog.error = t('media.arr_admin.schema_modal.error_name_required');
    return;
  }
  dialog.saving = true;
  try {
    const path = dialog.id === null ? '/app-profile/add' : `/app-profile/${dialog.id}/update`;
    await api.post(`${PROWLARR_API}${path}`, form.value, prowlarrAppProfileSchema);
    dialog.open = false;
    await refresh();
  } catch (failure) {
    dialog.error = apiErrorText(failure, t, 'prowlarr.apps.profile_save_error');
  } finally {
    dialog.saving = false;
  }
}

function askDelete(): void {
  const id = dialog.id;
  if (id === null) return;
  confirm.ask(t('prowlarr.apps.confirm_delete_profile'), async () => {
    try {
      await api.post(`${PROWLARR_API}/app-profile/${id}/delete`, {});
      dialog.open = false;
      await refresh();
    } catch (failure) {
      dialog.error = apiErrorText(failure, t, 'prowlarr.apps.profile_save_error');
    }
  });
}
</script>

<template>
  <v-card variant="flat" border data-test="app-profiles">
    <v-card-title class="d-flex align-center text-title-medium">
      {{ t('prowlarr.apps.profiles_title') }}
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        :prepend-icon="msAdd"
        data-test="app-profile-add"
        @click="edit(null)"
        >{{ t('prowlarr.common.add') }}</v-btn
      >
    </v-card-title>
    <v-progress-linear v-if="profiles.isPending.value" indeterminate color="service" />
    <EmptyState
      v-else-if="(profiles.data.value ?? []).length === 0"
      inline
      :title="t('prowlarr.apps.profile_empty')"
    />
    <v-table v-else density="compact">
      <thead>
        <tr>
          <th>{{ t('prowlarr.common.name') }}</th>
          <th>{{ t('prowlarr.apps.profile_col_rss') }}</th>
          <th>{{ t('prowlarr.apps.profile_col_auto') }}</th>
          <th>{{ t('prowlarr.apps.profile_col_interactive') }}</th>
          <th>{{ t('prowlarr.apps.profile_col_seeders') }}</th>
          <th class="text-end">{{ t('prowlarr.common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="profile in profiles.data.value" :key="profile.id" data-test="app-profile-row">
          <td class="font-weight-medium">{{ profile.name }}</td>
          <td
            v-for="(flag, index) in [
              profile.enableRss,
              profile.enableAutomaticSearch,
              profile.enableInteractiveSearch,
            ]"
            :key="index"
          >
            <v-chip size="x-small" variant="tonal" :color="flag ? 'success' : undefined">{{
              t(flag ? 'prowlarr.common.on' : 'prowlarr.common.off')
            }}</v-chip>
          </td>
          <td class="text-muted">{{ profile.minimumSeeders }}</td>
          <td class="text-end">
            <v-btn
              :icon="msEdit"
              size="small"
              variant="text"
              :aria-label="t('prowlarr.common.edit')"
              data-test="app-profile-edit"
              @click="edit(profile)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>

  <AdminDialog
    v-model="dialog.open"
    :title="
      dialog.id === null
        ? t('prowlarr.apps.profile_new_title')
        : fillLegacy(t('prowlarr.apps.profile_edit_title_tpl'), { NAME: form.name })
    "
    :error="dialog.error"
    :saving="dialog.saving"
    :max-width="480"
    @save="save"
  >
    <template v-if="dialog.id !== null" #extra>
      <v-btn color="error" variant="text" data-test="app-profile-delete" @click="askDelete">{{
        t('prowlarr.common.delete')
      }}</v-btn>
    </template>
    <v-text-field
      v-model="form.name"
      :label="t('prowlarr.apps.profile_name')"
      variant="outlined"
      density="compact"
      data-test="app-profile-name"
    />
    <v-switch
      v-model="form.enableRss"
      :label="t('prowlarr.apps.profile_rss')"
      color="service"
      density="compact"
      hide-details
    />
    <v-switch
      v-model="form.enableAutomaticSearch"
      :label="t('prowlarr.apps.profile_auto_search')"
      color="service"
      density="compact"
      hide-details
    />
    <v-switch
      v-model="form.enableInteractiveSearch"
      :label="t('prowlarr.apps.profile_interactive_search')"
      color="service"
      density="compact"
      hide-details
      class="mb-3"
    />
    <v-text-field
      :model-value="form.minimumSeeders"
      :label="t('prowlarr.apps.profile_min_seeders')"
      type="number"
      min="0"
      variant="outlined"
      density="compact"
      @update:model-value="
        form.minimumSeeders = Math.max(0, Number.parseInt(String($event), 10) || 0)
      "
    />
  </AdminDialog>
  <ConfirmDialog
    v-model="confirm.open.value"
    :message="confirm.message.value"
    danger
    @confirm="confirm.confirm"
  />
</template>
