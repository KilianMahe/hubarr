<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'un utilisateur Seerr (`jellyseerr/user_detail.html.twig`, routes
// n° 74, 77-82) : onglets paramètres généraux (nom, e-mail, Discord, langue,
// régions, quotas), mot de passe (8 caractères, confirmation), permissions
// (arbre de l'original : parents, prérequis, 4K), notifications (Discord,
// Telegram, Pushbullet, Pushover), demandes récentes ; suppression.
import { SEERR_PERMISSION_TREE } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { apiErrorText } from '../../../app/api/error-text';
import { useNotifyStore } from '../../../app/stores/notify';
import { fillLegacy } from '../../../app/legacy-template';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import SeerrPage from '../SeerrPage.vue';
import {
  STATUS_COLORS,
  STATUS_KEYS,
  field,
  permissionState,
  seerrApi,
  togglePermission,
  text,
} from '../seerr-api';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const id = computed(() => Number(route.params.id));
const detail = useQuery({
  queryKey: computed(() => ['seerr', 'user', id.value]),
  queryFn: ({ signal }) => seerrApi.user(id.value, signal),
  retry: false,
});
const tab = ref('general');
interface GeneralForm {
  username: string | null;
  email: string | null;
  discordId: string | null;
  locale: string | null;
  discoverRegion: string | null;
  originalLanguage: string | null;
  streamingRegion: string | null;
  movieQuotaLimit: number | string | null;
  movieQuotaDays: number | string | null;
  tvQuotaLimit: number | string | null;
  tvQuotaDays: number | string | null;
}
interface NotifForm {
  discordId: string | null;
  telegramChatId: string | null;
  telegramSendSilently: boolean;
  pushbulletAccessToken: string | null;
  pushoverApplicationToken: string | null;
  pushoverUserKey: string | null;
}
const general = reactive<GeneralForm>({
  username: null,
  email: null,
  discordId: null,
  locale: null,
  discoverRegion: null,
  originalLanguage: null,
  streamingRegion: null,
  movieQuotaLimit: null,
  movieQuotaDays: null,
  tvQuotaLimit: null,
  tvQuotaDays: null,
});
const notifs = reactive<NotifForm>({
  discordId: null,
  telegramChatId: null,
  telegramSendSilently: false,
  pushbulletAccessToken: null,
  pushoverApplicationToken: null,
  pushoverUserKey: null,
});
const permissions = ref(0);
const password = ref('');
const confirm = ref('');
const deleteOpen = ref(false);
watch(
  () => detail.data.value,
  (data) => {
    if (!data) return;
    const s = data.settings;
    Object.assign(general, {
      username: field<string | null>(s, 'username', null),
      email: field<string | null>(s, 'email', null),
      discordId: field<string | null>(s, 'discordId', null),
      locale: field<string | null>(s, 'locale', null),
      discoverRegion: field<string | null>(s, 'discoverRegion', null),
      originalLanguage: field<string | null>(s, 'originalLanguage', null),
      streamingRegion: field<string | null>(s, 'streamingRegion', null),
      movieQuotaLimit: field<number | null>(s, 'movieQuotaLimit', null),
      movieQuotaDays: field<number | null>(s, 'movieQuotaDays', null),
      tvQuotaLimit: field<number | null>(s, 'tvQuotaLimit', null),
      tvQuotaDays: field<number | null>(s, 'tvQuotaDays', null),
    });
    const n = data.notifications;
    Object.assign(notifs, {
      discordId: field<string | null>(n, 'discordId', null),
      telegramChatId: field<string | null>(n, 'telegramChatId', null),
      telegramSendSilently: field<boolean>(n, 'telegramSendSilently', false),
      pushbulletAccessToken: field<string | null>(n, 'pushbulletAccessToken', null),
      pushoverApplicationToken: field<string | null>(n, 'pushoverApplicationToken', null),
      pushoverUserKey: field<string | null>(n, 'pushoverUserKey', null),
    });
    permissions.value = data.user.permissions ?? 0;
  },
  { immediate: true },
);
const regions = computed(() =>
  (detail.data.value?.regions ?? []).map((r) => ({
    value: text(r.iso_3166_1),
    title: text(r.english_name, r.name, r.iso_3166_1),
  })),
);
const languages = computed(() =>
  (detail.data.value?.languages ?? []).map((l) => ({
    value: text(l.iso_639_1),
    title: text(l.english_name, l.name, l.iso_639_1),
  })),
);

async function run(task: () => Promise<unknown>, after?: () => void): Promise<void> {
  try {
    await task();
    notify.success('jellyseerr.common.saved');
    after?.();
    await queryClient.invalidateQueries({ queryKey: ['seerr', 'user', id.value] });
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
    });
  }
}
const quotaNumber = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? null : Number(value);
const saveGeneral = () =>
  run(() =>
    seerrApi.userAction(id.value, 'settings', {
      ...general,
      movieQuotaLimit: quotaNumber(general.movieQuotaLimit),
      movieQuotaDays: quotaNumber(general.movieQuotaDays),
      tvQuotaLimit: quotaNumber(general.tvQuotaLimit),
      tvQuotaDays: quotaNumber(general.tvQuotaDays),
    }),
  );
const passwordError = computed(() =>
  password.value === ''
    ? null
    : password.value.length < 8
      ? 'jellyseerr.user_detail.password_min_length'
      : password.value !== confirm.value
        ? 'jellyseerr.user_detail.password_mismatch'
        : null,
);
</script>

<template>
  <SeerrPage
    :title="
      detail.data.value
        ? text(detail.data.value.user.displayName, detail.data.value.user.email)
        : t('jellyseerr.users.page_title')
    "
    :loading="detail.isPending.value"
    :error="detail.isError.value"
  >
    <template v-if="detail.data.value" #actions>
      <v-btn
        color="error"
        variant="tonal"
        data-test="seerr-user-delete"
        @click="deleteOpen = true"
        >{{ t('jellyseerr.common.delete') }}</v-btn
      >
    </template>
    <template v-if="detail.data.value">
      <v-tabs v-model="tab" density="compact" class="mb-3">
        <v-tab value="general">{{ t('jellyseerr.user_detail.tab_general') }}</v-tab>
        <v-tab value="password">{{ t('jellyseerr.user_detail.tab_password') }}</v-tab>
        <v-tab value="perms" data-test="seerr-tab-perms">{{
          t('jellyseerr.user_detail.tab_perms')
        }}</v-tab>
        <v-tab value="notifs">{{ t('jellyseerr.user_detail.tab_notifs') }}</v-tab>
        <v-tab value="requests">{{ t('jellyseerr.user_detail.tab_requests') }}</v-tab>
      </v-tabs>
      <v-window v-model="tab">
        <v-window-item value="general">
          <v-card variant="flat" border class="pa-4" style="max-width: 720px">
            <div class="text-title-small mb-2">
              {{ t('jellyseerr.user_detail.section_profile') }}
            </div>
            <v-text-field
              v-model="general.username"
              :label="t('jellyseerr.user_detail.field_display_name')"
              density="compact"
            />
            <v-text-field
              v-model="general.email"
              :label="t('jellyseerr.user_detail.field_email')"
              density="compact"
            />
            <v-text-field
              v-model="general.discordId"
              :label="t('jellyseerr.user_detail.field_discord_id')"
              density="compact"
            />
            <div class="text-title-small my-2">
              {{ t('jellyseerr.user_detail.section_regions_languages') }}
            </div>
            <v-select
              v-model="general.discoverRegion"
              :items="regions"
              :label="t('jellyseerr.user_detail.discover_country')"
              clearable
              density="compact"
            />
            <v-select
              v-model="general.originalLanguage"
              :items="languages"
              :label="t('jellyseerr.user_detail.discover_language')"
              clearable
              density="compact"
            />
            <v-select
              v-model="general.streamingRegion"
              :items="regions"
              :label="t('jellyseerr.user_detail.streaming_country')"
              clearable
              density="compact"
            />
            <div class="text-title-small my-2">
              {{ t('jellyseerr.user_detail.section_quotas') }}
            </div>
            <v-row density="compact">
              <v-col cols="6"
                ><v-text-field
                  v-model="general.movieQuotaLimit"
                  :label="t('jellyseerr.user_detail.movie_request_limit')"
                  type="number"
                  density="compact"
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  v-model="general.movieQuotaDays"
                  :label="t('jellyseerr.user_detail.days')"
                  type="number"
                  density="compact"
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  v-model="general.tvQuotaLimit"
                  :label="t('jellyseerr.user_detail.tv_request_limit')"
                  type="number"
                  density="compact"
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  v-model="general.tvQuotaDays"
                  :label="t('jellyseerr.user_detail.days')"
                  type="number"
                  density="compact"
              /></v-col>
            </v-row>
            <v-btn
              color="service"
              variant="flat"
              data-test="seerr-user-save"
              @click="saveGeneral"
              >{{ t('jellyseerr.common.save_changes') }}</v-btn
            >
          </v-card>
        </v-window-item>
        <v-window-item value="password">
          <v-card variant="flat" border class="pa-4" style="max-width: 480px">
            <p class="text-body-small text-muted mb-3">
              {{ t('jellyseerr.user_detail.password_warning') }}
            </p>
            <v-text-field
              v-model="password"
              :label="t('jellyseerr.user_detail.new_password')"
              :placeholder="t('jellyseerr.user_detail.placeholder_min8')"
              type="password"
              density="compact"
            />
            <v-text-field
              v-model="confirm"
              :label="t('jellyseerr.user_detail.confirm_password')"
              type="password"
              density="compact"
              :error-messages="passwordError ? [t(passwordError)] : []"
            />
            <v-btn
              color="service"
              variant="flat"
              :disabled="password === '' || passwordError !== null"
              @click="
                run(
                  () => seerrApi.userAction(id, 'password', { password }),
                  () => {
                    password = '';
                    confirm = '';
                  },
                )
              "
              >{{ t('jellyseerr.user_detail.save_password') }}</v-btn
            >
          </v-card>
        </v-window-item>
        <v-window-item value="perms">
          <v-card
            variant="flat"
            border
            class="pa-4"
            style="max-width: 760px"
            data-test="seerr-perms"
          >
            <template v-for="node in SEERR_PERMISSION_TREE" :key="node.bit">
              <div
                v-if="
                  node.section &&
                  !permissionState(node.bit, permissions, detail.data.value.has4k).hidden
                "
                class="text-title-small mt-3 mb-1"
              >
                {{ t(`jellyseerr.user_detail.perms.${node.section}`) }}
              </div>
              <v-checkbox
                v-if="!permissionState(node.bit, permissions, detail.data.value.has4k).hidden"
                :model-value="
                  permissionState(node.bit, permissions, detail.data.value.has4k).checked
                "
                :disabled="permissionState(node.bit, permissions, detail.data.value.has4k).disabled"
                :label="t(`jellyseerr.user_detail.perms.${node.key}_label`)"
                :messages="t(`jellyseerr.user_detail.perms.${node.key}_desc`)"
                :class="{ 'ms-6': node.parent !== undefined }"
                density="compact"
                :data-test="`seerr-perm-${node.bit}`"
                @update:model-value="permissions = togglePermission(permissions, node.bit)"
              />
            </template>
            <v-btn
              color="service"
              variant="flat"
              class="mt-3"
              data-test="seerr-perms-save"
              @click="run(() => seerrApi.userAction(id, 'permissions', { permissions }))"
              >{{ t('jellyseerr.common.save_changes') }}</v-btn
            >
          </v-card>
        </v-window-item>
        <v-window-item value="notifs">
          <v-card variant="flat" border class="pa-4" style="max-width: 560px">
            <v-text-field
              v-model="notifs.discordId"
              :label="t('jellyseerr.user_detail.notif_discord_id_label')"
              density="compact"
            />
            <v-text-field
              v-model="notifs.telegramChatId"
              :label="t('jellyseerr.user_detail.notif_telegram_id_label')"
              density="compact"
            />
            <v-switch
              v-model="notifs.telegramSendSilently"
              :label="t('jellyseerr.user_detail.notif_telegram_silent')"
              color="service"
              density="compact"
              hide-details
            />
            <v-text-field
              v-model="notifs.pushbulletAccessToken"
              :label="t('jellyseerr.user_detail.notif_pushbullet_label')"
              density="compact"
            />
            <v-text-field
              v-model="notifs.pushoverApplicationToken"
              :label="t('jellyseerr.user_detail.notif_pushover_app_label')"
              density="compact"
            />
            <v-text-field
              v-model="notifs.pushoverUserKey"
              :label="t('jellyseerr.user_detail.notif_pushover_user_label')"
              density="compact"
            />
            <v-btn
              color="service"
              variant="flat"
              @click="run(() => seerrApi.userAction(id, 'notifications', { ...notifs }))"
              >{{ t('jellyseerr.common.save_changes') }}</v-btn
            >
          </v-card>
        </v-window-item>
        <v-window-item value="requests">
          <p v-if="detail.data.value.requests.length === 0" class="text-muted">
            {{ t('jellyseerr.user_detail.no_requests') }}
          </p>
          <v-list v-else density="compact">
            <v-list-item
              v-for="request in detail.data.value.requests"
              :key="request.id"
              :title="
                request.tmdb?.title ??
                fillLegacy(t('jellyseerr.index.edit_request_fallback_tpl'), { ID: request.id })
              "
            >
              <template #append>
                <v-chip size="x-small" label :color="STATUS_COLORS[request.displayStatus]">{{
                  t(STATUS_KEYS[request.displayStatus] ?? 'common.labels.unknown')
                }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
        </v-window-item>
      </v-window>
    </template>
    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('jellyseerr.common.confirm_delete_user_irreversible')"
      :confirm-label="t('jellyseerr.common.delete')"
      danger
      @confirm="
        run(
          () => seerrApi.userAction(id, 'delete'),
          () => router.push({ name: 'seerr-users' }),
        )
      "
    />
  </SeerrPage>
</template>
