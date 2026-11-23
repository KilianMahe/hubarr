<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Modification d'une demande (`index.html.twig`, route n° 111) : profil de
// qualité et dossier racine du serveur par défaut (`/service/{type}`),
// demandeur (`/users`), saisons pour une série, étiquettes Radarr/Sonarr du
// serveur (P5c.7, V11).
import type { SeerrRequest } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../app/api/error-text';
import { fillLegacy } from '../../app/legacy-template';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { field, seerrApi, text } from './seerr-api';

const props = defineProps<{ request: SeerrRequest | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const open = computed({
  get: () => props.request !== null,
  set: (value: boolean) => {
    if (!value) emit('close');
  },
});
const type = computed(() => (props.request?.type === 'tv' ? 'sonarr' : 'radarr'));
const service = useQuery({
  queryKey: computed(() => ['seerr', 'service', type.value]),
  queryFn: ({ signal }) => seerrApi.serviceInfo(type.value, signal),
  enabled: open,
  retry: false,
});
const users = useQuery({
  queryKey: ['seerr', 'users-list'],
  queryFn: ({ signal }) => seerrApi.usersList(signal),
  enabled: open,
  retry: false,
});
const profileId = ref<number | null>(null);
const rootFolder = ref<string | null>(null);
const userId = ref<number | null>(null);
const seasons = ref<number[]>([]);
const tags = ref<number[]>([]);
const saving = ref(false);
watch(
  () => props.request,
  (request) => {
    if (request === null) return;
    profileId.value = field<number | null>(request, 'profileId', null);
    rootFolder.value = field<string | null>(request, 'rootFolder', null);
    userId.value = field<number | null>(field(request, 'requestedBy', {}), 'id', null);
    tags.value = field<unknown[]>(request, 'tags', [])
      .map((tag) => Number(tag))
      .filter((n) => Number.isFinite(n));
    seasons.value = (field<unknown[]>(request, 'seasons', []) as Record<string, unknown>[])
      .map((s) => Number(s.seasonNumber))
      .filter((n) => Number.isFinite(n));
  },
  { immediate: true },
);
const profiles = computed(() =>
  (service.data.value?.profiles ?? []).map((p) => ({
    value: Number(p.id),
    title: text(p.name, p.id),
  })),
);
const folders = computed(() =>
  (service.data.value?.rootFolders ?? []).map((f) => text(f.path)).filter((p) => p !== ''),
);
/** Étiquettes du serveur *arr (`/service/{type}/{id}` les renvoie avec les profils). */
const tagItems = computed(() =>
  (field<unknown[]>(service.data.value ?? null, 'tags', []) as Record<string, unknown>[]).map(
    (tag) => ({ value: Number(tag.id), title: text(tag.label, tag.id) }),
  ),
);
const userItems = computed(() =>
  (users.data.value ?? []).map((u) => ({
    value: Number(u.id),
    title: text(u.displayName, u.email, u.id),
  })),
);
const seasonItems = computed(() =>
  (field<unknown[]>(props.request, 'seasons', []) as Record<string, unknown>[])
    .map((s) => Number(s.seasonNumber))
    .sort((a, b) => a - b),
);

async function save(): Promise<void> {
  const request = props.request;
  if (request === null) return;
  saving.value = true;
  try {
    await seerrApi.editRequest(request.id, {
      mediaType: request.type,
      serverId: field<number | null>(request, 'serverId', null),
      profileId: profileId.value,
      rootFolder: rootFolder.value,
      userId: userId.value,
      tags: tags.value,
      ...(request.type === 'tv' ? { seasons: seasons.value } : {}),
    });
    notify.success('jellyseerr.common.saved');
    await queryClient.invalidateQueries({ queryKey: ['seerr'] });
    open.value = false;
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="
      request?.tmdb?.title
        ? fillLegacy(t('jellyseerr.index.edit_request_title_tpl'), { TITLE: request.tmdb.title })
        : t('jellyseerr.index.edit_request_title')
    "
    :max-width="560"
  >
    <div data-test="seerr-edit-dialog">
      <v-progress-linear
        v-if="service.isPending.value"
        indeterminate
        color="service"
        class="mb-2"
      />
      <v-select
        v-model="profileId"
        :items="profiles"
        :label="t('jellyseerr.index.quality_profile_label')"
        density="compact"
      />
      <v-select
        v-model="rootFolder"
        :items="folders"
        :label="t('jellyseerr.index.root_folder_label')"
        density="compact"
      />
      <v-autocomplete
        v-model="tags"
        :items="tagItems"
        :label="t('jellyseerr.settings.services.tags_label')"
        :hint="
          t('jellyseerr.index.tags_hint', { service: type === 'radarr' ? 'Radarr' : 'Sonarr' })
        "
        persistent-hint
        multiple
        chips
        closable-chips
        density="compact"
        class="mb-3"
        data-test="seerr-edit-tags"
      />
      <v-select
        v-model="userId"
        :items="userItems"
        :label="t('jellyseerr.index.requested_by_label')"
        density="compact"
      />
      <template v-if="request?.type === 'tv' && seasonItems.length > 0">
        <div class="text-caption text-muted mb-1">{{ t('jellyseerr.index.seasons_label') }}</div>
        <div class="d-flex flex-wrap ga-2">
          <v-checkbox
            v-for="season in seasonItems"
            :key="season"
            v-model="seasons"
            :value="season"
            :label="fillLegacy(t('jellyseerr.common.season_tpl'), { N: season })"
            density="compact"
            hide-details
          />
        </div>
      </template>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('jellyseerr.common.cancel') }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="saving"
        data-test="seerr-edit-save"
        @click="save"
        >{{ t('jellyseerr.common.save') }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
