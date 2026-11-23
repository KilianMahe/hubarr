<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Réglages généraux de Seerr (`settings/general.html.twig`, routes n° 83-84)
// et réglages des utilisateurs par défaut (`settings/users.html.twig`,
// n° 85) : une vue, deux sections (`meta.seerrSection`). La clé d'API de
// Seerr n'est ni affichée ni modifiable (masquée par le serveur).
import { SEERR_PERMISSION_TREE } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { apiErrorText } from '../../../app/api/error-text';
import { useNotifyStore } from '../../../app/stores/notify';
import SeerrPage from '../SeerrPage.vue';
import { field, permissionState, seerrApi, togglePermission, text } from '../seerr-api';

const { t } = useI18n();
const route = useRoute();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const users = computed(() => route.meta.seerrSection === 'users');
const settings = useQuery({
  queryKey: computed(() => ['seerr', 'settings', users.value]),
  queryFn: ({ signal }) => seerrApi.settings(users.value ? '/utilisateurs' : '', signal),
  retry: false,
});
const form = reactive<Record<string, unknown>>({});
const quotas = reactive({
  movieLimit: null as number | null,
  movieDays: null as number | null,
  tvLimit: null as number | null,
  tvDays: null as number | null,
});
const permissions = ref(0);
const saving = ref(false);
const TEXT = [
  'applicationTitle',
  'applicationUrl',
  'youtubeUrl',
  'locale',
  'blacklistedTags',
] as const;
const SWITCHES = [
  'cacheImages',
  'hideAvailable',
  'hideBlacklisted',
  'partialRequestsEnabled',
  'enableSpecialEpisodes',
] as const;
const LOGIN = ['localLogin', 'mediaServerLogin', 'newPlexLogin'] as const;
watch(
  () => settings.data.value,
  (data) => {
    if (!data) return;
    const main = data.main;
    for (const key of [
      ...TEXT,
      ...SWITCHES,
      ...LOGIN,
      'discoverRegion',
      'originalLanguage',
      'streamingRegion',
      'blacklistedTagsLimit',
    ]) {
      form[key] = main[key] ?? null;
    }
    const dq = field<Record<string, Record<string, number | null>>>(main, 'defaultQuotas', {});
    quotas.movieLimit = dq.movie?.quotaLimit ?? null;
    quotas.movieDays = dq.movie?.quotaDays ?? null;
    quotas.tvLimit = dq.tv?.quotaLimit ?? null;
    quotas.tvDays = dq.tv?.quotaDays ?? null;
    permissions.value = field<number>(main, 'defaultPermissions', 0);
  },
  { immediate: true },
);
const regions = computed(() =>
  (settings.data.value?.regions ?? []).map((r) => ({
    value: text(r.iso_3166_1),
    title: text(r.english_name, r.iso_3166_1),
  })),
);
const languages = computed(() =>
  (settings.data.value?.languages ?? []).map((l) => ({
    value: text(l.iso_639_1),
    title: text(l.english_name, l.iso_639_1),
  })),
);
const toNumber = (value: unknown) =>
  value === null || value === '' || value === undefined ? null : Number(value);

async function save(): Promise<void> {
  saving.value = true;
  const body = users.value
    ? {
        localLogin: form.localLogin,
        mediaServerLogin: form.mediaServerLogin,
        newPlexLogin: form.newPlexLogin,
        defaultPermissions: permissions.value,
        defaultQuotas: {
          movie: { quotaLimit: toNumber(quotas.movieLimit), quotaDays: toNumber(quotas.movieDays) },
          tv: { quotaLimit: toNumber(quotas.tvLimit), quotaDays: toNumber(quotas.tvDays) },
        },
      }
    : { ...form, blacklistedTagsLimit: toNumber(form.blacklistedTagsLimit) };
  try {
    await seerrApi.saveSettings(body);
    notify.success('jellyseerr.common.saved');
    await queryClient.invalidateQueries({ queryKey: ['seerr', 'settings'] });
  } catch (error) {
    notify.error('common.labels.text', { text: apiErrorText(error, t, 'jellyseerr.common.error') });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SeerrPage
    :title="
      t(users ? 'jellyseerr.settings.settings_users.title' : 'jellyseerr.settings.general.title')
    "
    :loading="settings.isPending.value"
    :error="settings.isError.value"
  >
    <v-card
      variant="flat"
      border
      class="pa-4"
      style="max-width: 760px"
      data-test="seerr-settings-form"
    >
      <template v-if="!users">
        <div class="text-title-small mb-2">
          {{ t('jellyseerr.settings.general.section_application') }}
        </div>
        <v-text-field
          v-model="form.applicationTitle"
          :label="t('jellyseerr.settings.general.app_name')"
          density="compact"
          data-test="seerr-app-title"
        />
        <v-text-field
          v-model="form.applicationUrl"
          :label="t('jellyseerr.settings.general.app_url')"
          density="compact"
        />
        <v-text-field
          v-model="form.youtubeUrl"
          :label="t('jellyseerr.settings.general.youtube_url')"
          :hint="t('jellyseerr.settings.general.youtube_url_desc')"
          density="compact"
        />
        <v-switch
          v-model="form.cacheImages"
          :label="t('jellyseerr.settings.general.enable_image_proxy')"
          :messages="t('jellyseerr.settings.general.enable_image_proxy_desc')"
          color="service"
          density="compact"
        />
        <div class="text-title-small my-2">
          {{ t('jellyseerr.settings.general.section_regions_languages') }}
        </div>
        <v-text-field
          v-model="form.locale"
          :label="t('jellyseerr.settings.general.display_language')"
          density="compact"
        />
        <v-select
          v-model="form.discoverRegion"
          :items="regions"
          :label="t('jellyseerr.settings.general.discover_country')"
          clearable
          density="compact"
        />
        <v-select
          v-model="form.originalLanguage"
          :items="languages"
          :label="t('jellyseerr.settings.general.discover_language')"
          clearable
          density="compact"
        />
        <v-select
          v-model="form.streamingRegion"
          :items="regions"
          :label="t('jellyseerr.settings.general.streaming_country')"
          clearable
          density="compact"
        />
        <div class="text-title-small my-2">
          {{ t('jellyseerr.settings.general.section_filters_blocking') }}
        </div>
        <v-text-field
          v-model="form.blacklistedTags"
          :label="t('jellyseerr.settings.general.blocked_tags')"
          :placeholder="t('jellyseerr.settings.general.blocked_tags_placeholder')"
          density="compact"
        />
        <v-text-field
          v-model="form.blacklistedTagsLimit"
          :label="t('jellyseerr.settings.general.tags_limit')"
          type="number"
          density="compact"
        />
        <v-switch
          v-model="form.hideAvailable"
          :label="t('jellyseerr.settings.general.hide_available')"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          v-model="form.hideBlacklisted"
          :label="t('jellyseerr.settings.general.hide_blocked')"
          color="service"
          density="compact"
          hide-details
        />
        <div class="text-title-small my-2">
          {{ t('jellyseerr.settings.general.section_requests') }}
        </div>
        <v-switch
          v-model="form.partialRequestsEnabled"
          :label="t('jellyseerr.settings.general.partial_requests')"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          v-model="form.enableSpecialEpisodes"
          :label="t('jellyseerr.settings.general.special_episodes')"
          color="service"
          density="compact"
          hide-details
        />
      </template>
      <template v-else>
        <div class="text-title-small mb-2">
          {{ t('jellyseerr.settings.settings_users.section_auth') }}
        </div>
        <v-switch
          v-model="form.localLogin"
          :label="t('jellyseerr.settings.settings_users.enable_local_login')"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          v-model="form.mediaServerLogin"
          :label="t('jellyseerr.settings.settings_users.enable_jellyfin_login')"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          v-model="form.newPlexLogin"
          :label="t('jellyseerr.settings.settings_users.allow_new_jellyfin_login')"
          color="service"
          density="compact"
          hide-details
        />
        <div class="text-title-small my-2">
          {{ t('jellyseerr.settings.settings_users.section_global_quotas') }}
        </div>
        <v-row density="compact">
          <v-col cols="6"
            ><v-text-field
              v-model="quotas.movieLimit"
              :label="t('jellyseerr.settings.settings_users.global_movie_limit')"
              type="number"
              density="compact"
          /></v-col>
          <v-col cols="6"
            ><v-text-field
              v-model="quotas.movieDays"
              :label="t('jellyseerr.settings.settings_users.days')"
              type="number"
              density="compact"
          /></v-col>
          <v-col cols="6"
            ><v-text-field
              v-model="quotas.tvLimit"
              :label="t('jellyseerr.settings.settings_users.global_tv_limit')"
              type="number"
              density="compact"
          /></v-col>
          <v-col cols="6"
            ><v-text-field
              v-model="quotas.tvDays"
              :label="t('jellyseerr.settings.settings_users.days')"
              type="number"
              density="compact"
          /></v-col>
        </v-row>
        <div class="text-title-small my-2">
          {{ t('jellyseerr.settings.settings_users.section_default_perms') }}
        </div>
        <template v-for="node in SEERR_PERMISSION_TREE" :key="node.bit">
          <div v-if="node.section" class="text-body-medium font-weight-medium mt-2">
            {{ t(`jellyseerr.user_detail.perms.${node.section}`) }}
          </div>
          <v-checkbox
            :model-value="permissionState(node.bit, permissions, true).checked"
            :disabled="permissionState(node.bit, permissions, true).disabled"
            :label="t(`jellyseerr.user_detail.perms.${node.key}_label`)"
            :class="{ 'ms-6': node.parent !== undefined }"
            density="compact"
            hide-details
            @update:model-value="permissions = togglePermission(permissions, node.bit)"
          />
        </template>
      </template>
      <v-btn
        color="service"
        variant="flat"
        class="mt-4"
        :loading="saving"
        data-test="seerr-settings-save"
        @click="save"
        >{{ t('jellyseerr.common.save_changes') }}</v-btn
      >
    </v-card>
  </SeerrPage>
</template>
