<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'une demande Seerr (maquette P0 « Demandes », P5b.1 S1) : affiche,
// titre, puces type et statut, demandeur avec avatar, date ; pour une demande
// en attente, profil de qualité et dossier racine choisis sur la carte
// (serveur par défaut, `/service/{type}`) puis Refuser / Approuver : un choix
// modifié est enregistré (`/request/{id}/edit`) avant l'approbation.
import type { SeerrRequest } from '@hubarr/shared';
import { mdiCheck, mdiClose, mdiDelete, mdiPencil, mdiRefresh } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { fillLegacy } from '../../app/legacy-template';
import MetaLine from '../../components/ds/MetaLine.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import { STATUS_COLORS, STATUS_KEYS, field, seerrApi, text, tmdbImage } from './seerr-api';

const props = defineProps<{ request: SeerrRequest; busy: string | null }>();
const emit = defineEmits<{
  approve: [choice: { profileId: number | null; rootFolder: string | null } | null];
  decline: [];
  retry: [];
  edit: [];
  delete: [];
}>();
const { t } = useI18n();
const format = useFormat();

const pending = computed(() => props.request.displayStatus === 'pending');
const type = computed(() => (props.request.type === 'tv' ? 'sonarr' : 'radarr'));
// Une seule lecture par type de service, partagée par toutes les cartes.
const service = useQuery({
  queryKey: computed(() => ['seerr', 'service', type.value]),
  queryFn: ({ signal }) => seerrApi.serviceInfo(type.value, signal),
  enabled: pending,
  retry: false,
  staleTime: 60_000,
});
const profiles = computed(() =>
  (service.data.value?.profiles ?? []).map((p) => ({
    value: Number(p.id),
    title: text(p.name, p.id),
  })),
);
const folders = computed(() =>
  (service.data.value?.rootFolders ?? []).map((f) => text(f.path)).filter((p) => p !== ''),
);
const profileId = ref<number | null>(null);
const rootFolder = ref<string | null>(null);
watch(
  () => props.request,
  (request) => {
    profileId.value = field<number | null>(request, 'profileId', null);
    rootFolder.value = field<string | null>(request, 'rootFolder', null);
  },
  { immediate: true },
);
function approve(): void {
  const changed =
    profileId.value !== field<number | null>(props.request, 'profileId', null) ||
    rootFolder.value !== field<string | null>(props.request, 'rootFolder', null);
  emit('approve', changed ? { profileId: profileId.value, rootFolder: rootFolder.value } : null);
}

const title = computed(
  () =>
    props.request.tmdb?.title ??
    fillLegacy(t('jellyseerr.index.edit_request_fallback_tpl'), { ID: props.request.id }),
);
const requester = computed(() =>
  field<string>(field(props.request, 'requestedBy', {}), 'displayName', '—'),
);
const initial = computed(() => requester.value.charAt(0).toUpperCase());
const createdAt = computed(() => field<string | null>(props.request, 'createdAt', null));
const poster = computed(() => tmdbImage(props.request.tmdb?.posterPath));
</script>

<template>
  <v-card variant="flat" border class="seerr-card" data-test="seerr-request">
    <div class="seerr-card__top">
      <div class="seerr-card__poster">
        <img v-if="poster" :src="poster" :alt="title" loading="lazy" />
      </div>
      <div class="seerr-card__body">
        <div class="text-title-small font-weight-medium text-truncate" :title="title">
          {{ title }}
        </div>
        <div class="d-flex flex-wrap ga-1 my-1">
          <v-chip size="x-small" label>{{
            t(request.type === 'tv' ? 'jellyseerr.common.tv' : 'jellyseerr.common.movie')
          }}</v-chip>
          <StatusChip
            :label="t(STATUS_KEYS[request.displayStatus] ?? 'common.labels.unknown')"
            :color="STATUS_COLORS[request.displayStatus]"
            data-test="seerr-request-status"
          />
        </div>
        <MetaLine>
          <span>
            <v-avatar size="20" color="service" class="text-caption" aria-hidden="true">{{
              initial
            }}</v-avatar>
            {{ requester }}
          </span>
          <span v-if="request.tmdb?.releaseDate">{{ request.tmdb.releaseDate.slice(0, 4) }}</span>
          <span v-if="createdAt">{{ format.date(createdAt) }}</span>
        </MetaLine>
      </div>
    </div>

    <div v-if="pending" class="seerr-card__choices">
      <v-select
        v-model="profileId"
        :items="profiles"
        :label="t('jellyseerr.index.quality_profile_label')"
        :loading="service.isPending.value"
        density="compact"
        variant="outlined"
        hide-details
        data-test="seerr-card-profile"
      />
      <v-select
        v-model="rootFolder"
        :items="folders"
        :label="t('jellyseerr.index.root_folder_label')"
        :loading="service.isPending.value"
        density="compact"
        variant="outlined"
        hide-details
        data-test="seerr-card-folder"
      />
    </div>

    <div class="d-flex flex-wrap align-center ga-1 mt-2">
      <v-btn
        size="small"
        variant="text"
        :icon="mdiPencil"
        :aria-label="t('jellyseerr.common.edit')"
        :title="t('jellyseerr.common.edit')"
        data-test="seerr-edit"
        @click="emit('edit')"
      />
      <v-btn
        size="small"
        variant="text"
        color="error"
        :icon="mdiDelete"
        :aria-label="t('jellyseerr.common.delete')"
        :title="t('jellyseerr.common.delete')"
        data-test="seerr-delete"
        @click="emit('delete')"
      />
      <v-btn
        v-if="['processing', 'approved'].includes(request.displayStatus)"
        size="small"
        variant="text"
        :icon="mdiRefresh"
        :loading="busy === `${request.id}-retry`"
        :aria-label="t('common.action.retry')"
        :title="t('common.action.retry')"
        @click="emit('retry')"
      />
      <v-spacer />
      <template v-if="pending">
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          :prepend-icon="mdiClose"
          :loading="busy === `${request.id}-decline`"
          data-test="seerr-decline"
          @click="emit('decline')"
          >{{ t('jellyseerr.common.decline') }}</v-btn
        >
        <v-btn
          size="small"
          variant="flat"
          color="service"
          :prepend-icon="mdiCheck"
          :loading="busy === `${request.id}-approve`"
          data-test="seerr-approve"
          @click="approve"
          >{{ t('jellyseerr.common.approve') }}</v-btn
        >
      </template>
    </div>
  </v-card>
</template>

<style scoped>
.seerr-card {
  display: flex;
  flex-direction: column;
  padding: 12px;
  height: 100%;
}
.seerr-card__top {
  display: flex;
  gap: 12px;
}
.seerr-card__poster {
  flex-shrink: 0;
  width: 56px;
  aspect-ratio: 2 / 3;
  align-self: flex-start;
  border-radius: 8px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt));
}
.seerr-card__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.seerr-card__body {
  flex: 1;
  min-width: 0;
}
.seerr-card__choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
@media (max-width: 599px) {
  .seerr-card__choices {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
