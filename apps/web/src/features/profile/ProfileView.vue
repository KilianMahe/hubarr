<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Profil (`profile/index.html.twig`) : avatar (envoi, suppression, initiales à
// défaut), informations, nom affiché et mot de passe (un seul envoi, tout ou
// rien : MEMOIRE D45), statistiques et aperçu de la watchlist.
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  DISPLAY_NAME_MAX_LENGTH,
  profileResponseSchema,
  type ProfileResponse,
} from '@hubarr/shared';
import { mdiCamera, mdiDelete } from '@mdi/js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, api, validationMessages } from '../../app/api/client';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import PasswordField from '../../components/PasswordField.vue';
import UserAvatar from '../../components/UserAvatar.vue';
import { avatarProblem, membershipOf } from './membership';

const PROFILE_KEY = ['profile'] as const;
const TMDB_POSTER = 'https://image.tmdb.org/t/p/w185';

const { t, locale } = useI18n();
const session = useSessionStore();
const notify = useNotifyStore();
const queryClient = useQueryClient();

const profile = useQuery({
  queryKey: PROFILE_KEY,
  queryFn: ({ signal }) => api.get('/api/profil', profileResponseSchema, signal),
});

const form = reactive({
  displayName: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const errors = ref<string[]>([]);
watch(
  () => profile.data.value?.displayNameRaw,
  (value) => {
    if (value !== undefined) form.displayName = value;
  },
  { immediate: true },
);

function received(next: ProfileResponse): void {
  queryClient.setQueryData(PROFILE_KEY, next);
  session.setUser(next.user);
}

const save = useMutation({
  mutationFn: () => api.post('/api/profil', { ...form }, profileResponseSchema),
  onMutate: () => (errors.value = []),
  onSuccess: (next) => {
    received(next);
    Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' });
    notify.success('flash.profile.updated');
  },
  onError: (error) => {
    const messages = validationMessages(error);
    errors.value = messages.length > 0 ? messages : ['error.generic.message'];
  },
});

const fileInput = ref<HTMLInputElement | null>(null);
const upload = useMutation({
  mutationFn: (file: File) => api.post('/api/profil/avatar', file, profileResponseSchema),
  onSuccess: (next) => {
    received(next);
    notify.success('flash.profile.avatar_updated');
  },
  onError: (error) => {
    const code = error instanceof ApiError ? error.code : null;
    notify.error(
      code === 'PAYLOAD_TOO_LARGE'
        ? 'flash.profile.avatar_too_big'
        : code === 'AVATAR_INVALID_TYPE'
          ? 'flash.profile.avatar_invalid_mime'
          : 'flash.profile.avatar_upload_failed',
    );
  },
});
const removeAvatar = useMutation({
  mutationFn: () => api.post('/api/profil/avatar/delete', undefined, profileResponseSchema),
  onSuccess: (next) => {
    received(next);
    notify.success('flash.profile.avatar_deleted');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});
const confirmDelete = ref(false);

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const problem = avatarProblem(file, AVATAR_MAX_BYTES, AVATAR_MIME_TYPES);
  if (problem !== null) {
    notify.error(problem);
    return;
  }
  upload.mutate(file);
}

const roleKey = computed(() =>
  profile.data.value?.user.role === 'admin'
    ? 'profile.stats.role_admin'
    : 'profile.stats.role_user',
);
const membership = computed(() =>
  profile.data.value ? membershipOf(profile.data.value.createdAt) : null,
);
const dateOf = (iso: string | null) =>
  iso === null
    ? '—'
    : new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso));
</script>

<template>
  <v-container class="py-6" style="max-width: 1100px">
    <div v-if="profile.isPending.value" class="d-flex justify-center pa-12">
      <v-progress-circular indeterminate color="service" :aria-label="t('common.status.loading')" />
    </div>
    <EmptyState
      v-else-if="profile.isError.value || !profile.data.value"
      :title="t('error.generic.title')"
      :text="t('error.generic.message')"
    >
      <v-btn color="service" variant="flat" @click="profile.refetch()">{{
        t('error.action.retry')
      }}</v-btn>
    </EmptyState>

    <v-row v-else>
      <v-col cols="12" md="4">
        <v-card rounded="xl" class="pa-4 text-center">
          <UserAvatar :user="profile.data.value.user" :size="112" class="mb-3" />
          <div class="text-title-large">{{ profile.data.value.user.displayName }}</div>
          <div class="text-body-medium text-muted mb-3">{{ profile.data.value.user.email }}</div>
          <v-chip color="service-text" variant="tonal" size="small" class="mb-4">{{
            t(
              profile.data.value.user.role === 'admin'
                ? 'profile.stats.role_admin_short'
                : 'profile.stats.role_user_short',
            )
          }}</v-chip>
          <input
            ref="fileInput"
            type="file"
            :accept="AVATAR_MIME_TYPES.join(',')"
            class="d-none"
            data-test="avatar-input"
            @change="onFileChosen"
          />
          <div class="d-flex flex-wrap justify-center ga-2">
            <v-btn
              :prepend-icon="mdiCamera"
              :loading="upload.isPending.value"
              color="service-text"
              variant="tonal"
              @click="fileInput?.click()"
              >{{ t('profile.avatar.upload_button') }}</v-btn
            >
            <v-btn
              v-if="profile.data.value.user.avatarUrl"
              :prepend-icon="mdiDelete"
              :loading="removeAvatar.isPending.value"
              color="error"
              variant="text"
              @click="confirmDelete = true"
              >{{ t('profile.avatar.delete') }}</v-btn
            >
          </div>
          <div class="text-body-small text-muted mt-2">{{ t('profile.avatar.hint') }}</div>
        </v-card>

        <v-card rounded="xl" class="pa-2 mt-4">
          <v-card-title class="text-title-medium">{{ t('profile.stats.section') }}</v-card-title>
          <v-list density="comfortable" bg-color="transparent">
            <v-list-item
              :title="
                t('profile.stats.watchlist_label', { count: profile.data.value.watchlist.count })
              "
            />
            <v-list-item v-if="membership" :subtitle="t('profile.stats.member_since')">
              <v-list-item-title>{{
                t(membership.key, { count: membership.count })
              }}</v-list-item-title>
            </v-list-item>
            <v-list-item :subtitle="t('profile.stats.role')" :title="t(roleKey)" />
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-card rounded="xl" class="pa-2">
          <v-form @submit.prevent="save.mutate()">
            <v-card-title class="text-title-medium">{{
              t('profile.identity.section')
            }}</v-card-title>
            <v-card-text>
              <v-alert
                v-if="errors.length"
                type="error"
                variant="tonal"
                class="mb-4"
                data-test="profile-errors"
              >
                <ul class="ps-4">
                  <li v-for="message in errors" :key="message">{{ t(message) }}</li>
                </ul>
              </v-alert>
              <v-text-field
                v-model="form.displayName"
                :label="t('profile.identity.display_name')"
                :hint="t('profile.identity.display_name_help')"
                :counter="DISPLAY_NAME_MAX_LENGTH"
                :maxlength="DISPLAY_NAME_MAX_LENGTH"
                persistent-hint
                autocomplete="name"
                data-test="profile-display-name"
              />
              <v-row density="compact" class="mt-4 text-body-medium">
                <v-col cols="12" sm="6">
                  <div class="text-muted text-label-medium">{{ t('profile.identity.email') }}</div>
                  {{ profile.data.value.user.email }}
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-muted text-label-medium">{{ t('profile.identity.role') }}</div>
                  {{ t(roleKey) }}
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-muted text-label-medium">
                    {{ t('profile.identity.registered_on') }}
                  </div>
                  {{ dateOf(profile.data.value.createdAt) }}
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-muted text-label-medium">
                    {{ t('profile.identity.last_login') }}
                  </div>
                  {{ dateOf(profile.data.value.lastLoginAt) }}
                </v-col>
              </v-row>
            </v-card-text>

            <v-card-title class="text-title-medium">{{
              t('profile.password.section')
            }}</v-card-title>
            <v-card-text>
              <p class="text-body-small text-muted mb-4">{{ t('profile.password.hint') }}</p>
              <PasswordField
                v-model="form.currentPassword"
                :label="t('profile.password.current')"
                autocomplete="current-password"
                data-test="profile-current-password"
              />
              <v-row density="compact">
                <v-col cols="12" sm="6">
                  <PasswordField
                    v-model="form.newPassword"
                    :label="t('profile.password.new')"
                    autocomplete="new-password"
                    data-test="profile-new-password"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <PasswordField
                    v-model="form.confirmPassword"
                    :label="t('profile.password.confirm')"
                    autocomplete="new-password"
                    data-test="profile-confirm-password"
                  />
                </v-col>
              </v-row>
            </v-card-text>
            <v-card-actions class="justify-end px-4 pb-4">
              <v-btn
                type="submit"
                color="service"
                variant="flat"
                :loading="save.isPending.value"
                data-test="profile-save"
                >{{ t('profile.identity.save') }}</v-btn
              >
            </v-card-actions>
          </v-form>
        </v-card>

        <v-card v-if="profile.data.value.watchlist.recent.length" rounded="xl" class="pa-2 mt-4">
          <v-card-title class="text-title-medium">{{
            t('profile.watchlist_preview.title')
          }}</v-card-title>
          <v-card-text>
            <v-row density="compact">
              <v-col
                v-for="item in profile.data.value.watchlist.recent"
                :key="`${item.mediaType}-${item.tmdbId}`"
                cols="6"
                sm="3"
              >
                <v-img
                  v-if="item.posterPath"
                  :src="`${TMDB_POSTER}${item.posterPath}`"
                  :aspect-ratio="2 / 3"
                  cover
                  rounded="lg"
                  class="bg-surface-alt"
                  alt=""
                />
                <v-sheet
                  v-else
                  color="surface-alt"
                  rounded="lg"
                  :style="{ aspectRatio: '2 / 3' }"
                />
                <div class="text-body-medium mt-1 text-truncate">{{ item.title }}</div>
                <div class="text-body-small text-muted">
                  {{
                    t(
                      item.mediaType === 'movie'
                        ? 'profile.watchlist_preview.type_film'
                        : 'profile.watchlist_preview.type_tv',
                    )
                  }}
                  <template v-if="item.year"> · {{ item.year }}</template>
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <ConfirmDialog
      v-model="confirmDelete"
      :message="t('profile.avatar.delete_confirm')"
      :confirm-label="t('profile.avatar.delete')"
      danger
      @confirm="removeAvatar.mutate()"
    />
  </v-container>
</template>
