<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Utilisateurs Seerr (`jellyseerr/users.html.twig`, routes n° 73, 75-77) :
// recherche, tableau (nom, e-mail, rôle, demandes, inscription), création
// d'un utilisateur local, import depuis Jellyfin (utilisateurs non encore
// importés), suppression confirmée (ni le propriétaire ni un admin), lien
// vers la fiche.
import type { SeerrUser } from '@hubarr/shared';
import { mdiAccountPlus, mdiDelete, mdiImport } from '@mdi/js';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../../app/api/error-text';
import { useFormat } from '../../../app/format';
import { fillLegacy } from '../../../app/legacy-template';
import { useNotifyStore } from '../../../app/stores/notify';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import ResponsiveDialog from '../../../components/ResponsiveDialog.vue';
import SeerrPage from '../SeerrPage.vue';
import { field, seerrApi, text } from '../seerr-api';

const { t } = useI18n();
const format = useFormat();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const users = useQuery({
  queryKey: ['seerr', 'users'],
  queryFn: ({ signal }) => seerrApi.users(signal),
  retry: false,
});
const search = ref('');
const shown = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return (users.data.value?.users ?? []).filter(
    (u) =>
      needle === '' || `${u.displayName ?? ''} ${u.email ?? ''}`.toLowerCase().includes(needle),
  );
});
const deletable = (u: SeerrUser) =>
  u.id !== 1 && u.role !== 'admin' && ((u.permissions ?? 0) & (4 | 8)) === 0;

async function run(task: () => Promise<unknown>): Promise<boolean> {
  try {
    await task();
    notify.success('jellyseerr.common.saved');
    await queryClient.invalidateQueries({ queryKey: ['seerr'] });
    return true;
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
    });
    return false;
  }
}

const deleteTarget = ref<SeerrUser | null>(null);
const deleteOpen = ref(false);

const createOpen = ref(false);
const email = ref('');
const password = ref('');
async function create(): Promise<void> {
  if (await run(() => seerrApi.createUser(email.value, password.value))) {
    createOpen.value = false;
    email.value = '';
    password.value = '';
  }
}

const importOpen = ref(false);
const selected = ref<string[]>([]);
const jellyfin = useQuery({
  queryKey: ['seerr', 'jellyfin-users'],
  queryFn: ({ signal }) => seerrApi.jellyfinUsers(signal),
  enabled: importOpen,
  retry: false,
});
async function importUsers(): Promise<void> {
  if (await run(() => seerrApi.importJellyfin(selected.value))) {
    importOpen.value = false;
    selected.value = [];
  }
}
</script>

<template>
  <SeerrPage
    :title="t('jellyseerr.users.page_title')"
    :loading="users.isPending.value"
    :error="users.isError.value"
  >
    <template #actions>
      <v-btn
        :prepend-icon="mdiAccountPlus"
        variant="tonal"
        data-test="seerr-user-create"
        @click="createOpen = true"
        >{{ t('jellyseerr.users.create_user') }}</v-btn
      >
      <v-btn
        :prepend-icon="mdiImport"
        variant="tonal"
        data-test="seerr-user-import"
        @click="importOpen = true"
        >{{ t('jellyseerr.users.import_jellyfin') }}</v-btn
      >
    </template>
    <v-filter-field
      v-model="search"
      :placeholder="t('jellyseerr.users.search_placeholder')"
      density="compact"
      hide-details
      clearable
      class="mb-3"
      style="max-width: 360px"
    />
    <v-card variant="flat" border>
      <v-table density="compact" hover>
        <thead>
          <tr>
            <th>{{ t('jellyseerr.users.col_user') }}</th>
            <th>{{ t('jellyseerr.users.col_perms') }}</th>
            <th>{{ t('jellyseerr.users.col_requests') }}</th>
            <th>{{ t('jellyseerr.users.col_registered') }}</th>
            <th class="text-end" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in shown" :key="user.id" data-test="seerr-user-row">
            <td>
              <router-link
                v-if="user.id !== 1"
                :to="{ name: 'seerr-user', params: { id: user.id } }"
                >{{ user.displayName || user.email }}</router-link
              >
              <span v-else>{{ user.displayName || user.email }}</span>
              <div class="text-caption text-muted">{{ user.email }}</div>
            </td>
            <td>
              <v-chip
                size="x-small"
                label
                :color="
                  user.role === 'admin' ? 'error' : user.role === 'manager' ? 'warning' : undefined
                "
                >{{
                  t(`jellyseerr.user_detail.role_${user.role === 'limited' ? 'user' : user.role}`)
                }}</v-chip
              >
            </td>
            <td>{{ field(user, 'requestCount', 0) }}</td>
            <td class="text-no-wrap">
              {{ field(user, 'createdAt', null) ? format.date(field(user, 'createdAt', '')) : '—' }}
            </td>
            <td class="text-end">
              <v-btn
                v-if="deletable(user)"
                :icon="mdiDelete"
                size="small"
                variant="text"
                color="error"
                :aria-label="t('jellyseerr.users.action_delete')"
                data-test="seerr-user-delete"
                @click="
                  deleteTarget = user;
                  deleteOpen = true;
                "
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <ConfirmDialog
      v-model="deleteOpen"
      :message="
        fillLegacy(t('jellyseerr.common.confirm_delete_user_tpl'), {
          NAME: deleteTarget?.displayName ?? '',
        })
      "
      :confirm-label="t('jellyseerr.common.delete')"
      danger
      @confirm="deleteTarget && run(() => seerrApi.userAction(deleteTarget!.id, 'delete'))"
    />

    <ResponsiveDialog
      v-model="createOpen"
      :title="t('jellyseerr.users.create_user_modal_title')"
      :max-width="460"
    >
      <v-text-field
        v-model="email"
        :label="t('jellyseerr.users.email_required_label')"
        :placeholder="t('jellyseerr.users.email_placeholder')"
        type="email"
        density="compact"
        data-test="seerr-create-email"
      />
      <v-text-field
        v-model="password"
        :label="t('jellyseerr.users.password_label')"
        type="password"
        density="compact"
        data-test="seerr-create-password"
      />
      <template #actions>
        <v-btn variant="text" @click="createOpen = false">{{
          t('jellyseerr.common.cancel')
        }}</v-btn>
        <v-btn color="service" variant="flat" data-test="seerr-create-submit" @click="create">{{
          t('jellyseerr.users.create_btn')
        }}</v-btn>
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog
      v-model="importOpen"
      :title="t('jellyseerr.users.import_modal_title')"
      :max-width="520"
    >
      <v-progress-linear v-if="jellyfin.isPending.value" indeterminate color="service" />
      <p v-else-if="(jellyfin.data.value?.users ?? []).length === 0" class="text-muted">
        {{ t('jellyseerr.users.all_jellyfin_imported') }}
      </p>
      <template v-else>
        <p class="text-body-small text-muted mb-2">
          {{ t('jellyseerr.users.select_users_to_import') }}
        </p>
        <v-checkbox
          v-for="user in jellyfin.data.value?.users ?? []"
          :key="text(user.id)"
          v-model="selected"
          :value="text(user.id)"
          :label="text(user.username, user.id)"
          density="compact"
          hide-details
          data-test="seerr-import-user"
        />
      </template>
      <template #actions>
        <v-btn variant="text" @click="importOpen = false">{{
          t('jellyseerr.common.cancel')
        }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          :disabled="selected.length === 0"
          data-test="seerr-import-submit"
          @click="importUsers"
          >{{ t('jellyseerr.users.import_btn') }}</v-btn
        >
      </template>
    </ResponsiveDialog>
  </SeerrPage>
</template>
