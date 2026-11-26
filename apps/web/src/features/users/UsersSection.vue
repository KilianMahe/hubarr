<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Utilisateurs » des paramètres (`section-users`) : comptes de
// Hubarr, rôle, résumé des droits, dernière connexion ; ajout, modification
// (droits, mot de passe provisoire) et suppression. Le compte connecté ne
// peut pas se supprimer ; le serveur garde toujours un admin.
import type { ManagedUser } from '@hubarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../../app/api/client';
import { useFormat } from '../../app/format';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import UserAvatar from '../../components/UserAvatar.vue';
import { msDelete, msEdit, msPersonAdd } from '../../components/symbols';
import UserDialog from './UserDialog.vue';
import { USERS_KEY, usersApi } from './users-api';

const { t } = useI18n();
const format = useFormat();
const notify = useNotifyStore();
const session = useSessionStore();
const queryClient = useQueryClient();

const users = useQuery({ queryKey: USERS_KEY, queryFn: ({ signal }) => usersApi.list(signal) });

const dialogOpen = ref(false);
const editing = ref<ManagedUser | null>(null);
const removing = ref<ManagedUser | null>(null);
const confirmOpen = ref(false);

function askRemove(user: ManagedUser): void {
  removing.value = user;
  confirmOpen.value = true;
}

function openDialog(user: ManagedUser | null): void {
  editing.value = user;
  dialogOpen.value = true;
}

async function onSaved(user: ManagedUser): Promise<void> {
  notify.success(editing.value === null ? 'users.flash.created' : 'users.flash.saved', {
    name: user.displayName,
  });
  await queryClient.invalidateQueries({ queryKey: USERS_KEY });
  // Son propre compte : nom et e-mail du shell à jour.
  if (session.user?.id === user.id) await session.refreshServices();
}

const remove = useMutation({
  mutationFn: (user: ManagedUser) => usersApi.remove(user.id),
  onSuccess: async (_result, user) => {
    notify.success('users.flash.deleted', { name: user.displayName });
    await queryClient.invalidateQueries({ queryKey: USERS_KEY });
  },
  onError: (error) => {
    notify.error(
      error instanceof ApiError && error.code === 'LAST_ADMIN'
        ? 'users.error.last_admin'
        : 'error.generic.message',
    );
  },
});

/** Résumé des droits : tous (admin), sinon services en écriture et en lecture. */
function summary(user: ManagedUser): string {
  if (user.role === 'admin') return t('users.summary.all');
  const levels = Object.values(user.permissions);
  if (levels.length === 0) return t('users.summary.none');
  return t('users.summary.counts', {
    write: levels.filter((level) => level === 'write').length,
    read: levels.filter((level) => level === 'read').length,
  });
}
</script>

<template>
  <section id="section-users" data-section="users">
    <div class="d-flex flex-wrap align-center ga-2 mb-1">
      <h2 class="text-title-large flex-grow-1">{{ t('users.title') }}</h2>
      <v-btn
        color="primary"
        variant="flat"
        :prepend-icon="msPersonAdd"
        data-test="user-add"
        @click="openDialog(null)"
        >{{ t('users.action.add') }}</v-btn
      >
    </div>
    <p class="text-body-medium text-muted mb-4">{{ t('users.description') }}</p>

    <v-progress-linear v-if="users.isPending.value" indeterminate color="primary" />
    <v-alert v-else-if="users.isError.value" type="error" variant="tonal">{{
      t('error.generic.message')
    }}</v-alert>
    <v-card v-else-if="users.data.value" variant="outlined">
      <v-list lines="two" class="py-0">
        <template v-for="(user, index) in users.data.value.users" :key="user.id">
          <v-divider v-if="index > 0" />
          <v-list-item :data-test="`user-row-${user.id}`">
            <template #prepend>
              <UserAvatar :user="user" class="me-3" />
            </template>
            <v-list-item-title class="d-flex flex-wrap align-center ga-2">
              <span class="text-truncate">{{ user.displayName }}</span>
              <v-chip
                size="x-small"
                :color="user.role === 'admin' ? 'primary' : undefined"
                variant="tonal"
                >{{ t(`users.role.${user.role}`) }}</v-chip
              >
              <v-chip v-if="user.id === session.user?.id" size="x-small" variant="outlined">{{
                t('users.you')
              }}</v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              <span>{{ user.email }}</span>
              <span class="d-block" data-test="user-summary">{{ summary(user) }}</span>
              <span class="d-block">{{
                user.lastLoginAt === null
                  ? t('users.last_login.never')
                  : t('users.last_login.at', { date: format.dateTime(user.lastLoginAt) })
              }}</span>
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                :icon="msEdit"
                variant="text"
                :aria-label="t('users.action.edit', { name: user.displayName })"
                :data-test="`user-edit-${user.id}`"
                @click="openDialog(user)"
              />
              <v-btn
                v-if="user.id !== session.user?.id"
                :icon="msDelete"
                variant="text"
                color="error"
                :aria-label="t('users.action.delete', { name: user.displayName })"
                :data-test="`user-delete-${user.id}`"
                @click="askRemove(user)"
              />
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-card>

    <UserDialog v-model="dialogOpen" :user="editing" @saved="onSaved" />
    <ConfirmDialog
      v-model="confirmOpen"
      danger
      :message="removing === null ? '' : t('users.delete_confirm', { name: removing.displayName })"
      :confirm-label="t('common.action.delete')"
      @confirm="removing && remove.mutate(removing)"
    />
  </section>
</template>
