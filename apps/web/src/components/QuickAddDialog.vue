<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout rapide à Radarr ou Sonarr depuis n'importe où (`#quick-add-modal` de
// `base.html.twig`) : résolution du titre TMDB (`/decouverte/resolve`),
// instance cible (instances qui l'ont déjà signalées), profil de qualité
// (préselectionné sur celui de l'instance), dossier racine ; disponibilité
// minimale et recherche automatique (film), type de série, épisodes suivis,
// dossiers de saison et recherche des manquants (série). Réservé aux admins
// (routes d'ajout de `MediaController`).
import {
  MINIMUM_AVAILABILITIES,
  SERIES_ADD_MONITOR,
  type AddCandidate,
  type ResolvedMedia,
} from '@hubarr/shared';
import { mdiCheck } from '@mdi/js';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, validationMessages } from '../app/api/client';
import { closeQuickAdd, overlays } from '../app/overlays';
import { useNotifyStore } from '../app/stores/notify';
import { discoverApi } from '../features/discover/discover-api';
import { moviesApi } from '../features/movies/movies-api';
import { seriesApi } from '../features/series/series-api';
import ResponsiveDialog from './ResponsiveDialog.vue';

const { t } = useI18n();
const notify = useNotifyStore();
const client = useQueryClient();

const open = computed({
  get: () => overlays.quickAdd !== null,
  set: (value) => {
    if (!value) closeQuickAdd();
  },
});
const media = ref<ResolvedMedia | null>(null);
const resolving = ref(false);
const resolveError = ref<string | null>(null);
const slug = ref<string | null>(null);
interface QuickAddForm {
  qualityProfileId: number;
  rootFolderPath: string;
  minimumAvailability: (typeof MINIMUM_AVAILABILITIES)[number];
  searchForMovie: boolean;
  seriesType: 'standard' | 'daily' | 'anime';
  monitor: (typeof SERIES_ADD_MONITOR)[number];
  seasonFolder: boolean;
  searchForMissing: boolean;
}
const form = reactive<QuickAddForm>({
  qualityProfileId: 0,
  rootFolderPath: '',
  minimumAvailability: 'released',
  searchForMovie: true,
  seriesType: 'standard',
  monitor: 'all',
  seasonFolder: true,
  searchForMissing: true,
});
const adding = ref(false);
const done = ref(false);
const error = ref<string | null>(null);
const isFilm = computed(() => media.value?.type === 'film');

/** Instance préselectionnée : la par défaut, sinon la première. */
function pickCandidate(candidates: AddCandidate[]): string | null {
  return (candidates.find((c) => c.isDefault) ?? candidates[0])?.slug ?? null;
}

watch(
  () => overlays.quickAdd,
  async (input) => {
    media.value = null;
    resolveError.value = null;
    error.value = null;
    done.value = false;
    form.qualityProfileId = 0;
    form.rootFolderPath = '';
    if (input === null) return;
    if ('media' in input) {
      media.value = input.media;
    } else {
      resolving.value = true;
      try {
        media.value = await discoverApi.resolve(input.tmdb.type, input.tmdb.id);
      } catch (cause) {
        resolveError.value =
          validationMessages(cause)[0] ??
          (cause instanceof ApiError && cause.status === 404
            ? 'decouverte.error.not_found_tmdb'
            : 'quickadd.error.network');
      } finally {
        resolving.value = false;
      }
    }
    if (media.value) {
      slug.value = pickCandidate(media.value.candidates);
      if (media.value.type === 'serie') form.seriesType = media.value.seriesType;
    }
  },
  { immediate: true },
);

const candidate = computed(
  () => media.value?.candidates.find((c) => c.slug === slug.value) ?? null,
);
const ownedBy = computed(() => new Set(media.value?.instances.map((i) => i.slug) ?? []));
const instanceItems = computed(() =>
  (media.value?.candidates ?? []).map((c) => ({
    value: c.slug,
    title: ownedBy.value.has(c.slug) ? `${c.name} · ${t('quickadd.already_in_library')}` : c.name,
  })),
);
const alreadyThere = computed(() => slug.value !== null && ownedBy.value.has(slug.value));

const config = useQuery({
  queryKey: computed(() => ['quick-add', 'config', media.value?.type, slug.value] as const),
  queryFn: async ({ signal }) => {
    const target = slug.value ?? '';
    if (isFilm.value) {
      const value = await moviesApi.config(target, signal);
      return {
        profiles: value.qualityProfiles,
        folders: value.rootFolders,
        defaultProfile: value.defaultQualityProfileId,
      };
    }
    const value = await seriesApi.config(target, signal);
    return { profiles: value.qualityProfiles, folders: value.rootFolders, defaultProfile: null };
  },
  enabled: computed(() => open.value && media.value !== null && slug.value !== null),
  staleTime: 60_000,
  retry: false,
});
watch(
  () => config.data.value,
  (value) => {
    if (value === undefined) return;
    const preferred = candidate.value?.defaultQualityProfileId ?? value.defaultProfile;
    form.qualityProfileId =
      value.profiles.find((p) => p.id === preferred)?.id ?? value.profiles[0]?.id ?? 0;
    form.rootFolderPath = value.folders[0]?.path ?? '';
  },
);
const profileItems = computed(() =>
  (config.data.value?.profiles ?? []).map((p) => ({ value: p.id, title: p.name })),
);
const folderItems = computed(() => (config.data.value?.folders ?? []).map((f) => f.path));
const availabilityItems = computed(() =>
  MINIMUM_AVAILABILITIES.map((value) => ({ value, title: t(`quickadd.availability.${value}`) })),
);
const typeItems = computed(() =>
  (['standard', 'daily', 'anime'] as const).map((value) => ({
    value,
    title: t(`quickadd.series_type_options.${value}`),
  })),
);
const monitorItems = computed(() =>
  (['all', 'future', 'missing', 'firstSeason', 'lastSeason', 'pilot', 'none'] as const)
    .filter((value) => (SERIES_ADD_MONITOR as readonly string[]).includes(value))
    .map((value) => ({ value, title: t(`quickadd.monitor_options.${value}`) })),
);

async function add(): Promise<void> {
  const value = media.value;
  if (value === null || slug.value === null) return;
  if (!form.qualityProfileId || !form.rootFolderPath) {
    error.value = 'quickadd.error.missing_fields';
    return;
  }
  adding.value = true;
  error.value = null;
  try {
    if (value.type === 'film') {
      await moviesApi.add(slug.value, {
        tmdbId: value.tmdbId,
        title: value.title,
        year: value.year,
        qualityProfileId: form.qualityProfileId,
        rootFolderPath: form.rootFolderPath,
        monitored: true,
        minimumAvailability: form.minimumAvailability,
        searchForMovie: form.searchForMovie,
      });
    } else {
      await seriesApi.add(slug.value, {
        tvdbId: value.tvdbId,
        qualityProfileId: form.qualityProfileId,
        rootFolderPath: form.rootFolderPath,
        monitored: true,
        seriesType: form.seriesType,
        monitor: form.monitor,
        seasonFolder: form.seasonFolder,
        searchForMissing: form.searchForMissing,
      });
    }
    done.value = true;
    notify.success('quickadd.toast.added', {
      type: t(value.type === 'film' ? 'quickadd.toast.type_film' : 'quickadd.toast.type_series'),
      service: value.type === 'film' ? 'Radarr' : 'Sonarr',
    });
    void client.invalidateQueries({ queryKey: ['discover'] });
    void client.invalidateQueries({ queryKey: ['dashboard'] });
    setTimeout(() => {
      closeQuickAdd();
    }, 1000);
  } catch (cause) {
    const reason =
      validationMessages(cause)[0] ??
      (cause instanceof ApiError ? (cause.serverMessage ?? cause.code) : 'quickadd.error.network');
    error.value = reason;
  } finally {
    adding.value = false;
  }
}
const translated = (key: string | null) => (key === null ? '' : key.includes('.') ? t(key) : key);
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="
      t(
        isFilm
          ? 'quickadd.cta.add_radarr'
          : media
            ? 'quickadd.cta.add_sonarr'
            : 'decouverte.action.add',
      )
    "
    :max-width="560"
  >
    <div data-test="quick-add-dialog">
      <v-progress-linear v-if="resolving" indeterminate color="primary" />
      <v-alert v-if="resolveError" type="error" variant="tonal">{{
        t('decouverte.modal.impossible', { reason: translated(resolveError) })
      }}</v-alert>
      <template v-if="media">
        <div class="d-flex ga-3 mb-4">
          <v-img
            v-if="media.poster"
            :src="media.poster"
            width="72"
            :aspect-ratio="2 / 3"
            rounded="md"
            class="flex-grow-0"
          />
          <div>
            <div class="text-title-large">{{ media.title }}</div>
            <div class="text-body-medium text-muted">
              {{ t(isFilm ? 'quickadd.toast.type_film' : 'quickadd.toast.type_series')
              }}<template v-if="media.year"> · {{ media.year }}</template>
            </div>
            <div v-if="media.instances.length" class="d-flex flex-wrap ga-1 mt-1">
              <v-chip
                v-for="owner in media.instances"
                :key="owner.slug"
                size="x-small"
                color="success"
                >{{ owner.name }}</v-chip
              >
            </div>
          </div>
        </div>
        <v-alert v-if="media.candidates.length === 0" type="warning" variant="tonal">{{
          t('quickadd.error.cannot_add')
        }}</v-alert>
        <template v-else>
          <v-select
            v-if="media.candidates.length > 1"
            v-model="slug"
            :items="instanceItems"
            :label="t('quickadd.field.target_instance')"
            density="comfortable"
            data-test="qa-instance"
          />
          <v-alert v-if="alreadyThere" type="info" variant="tonal" density="compact" class="mb-3">{{
            t('quickadd.already_in_library')
          }}</v-alert>
          <v-progress-linear
            v-if="config.isFetching.value"
            indeterminate
            color="primary"
            class="mb-2"
          />
          <v-select
            v-model="form.qualityProfileId"
            :items="profileItems"
            :label="t('quickadd.field.quality_profile')"
            density="comfortable"
            data-test="qa-profile"
          />
          <v-select
            v-model="form.rootFolderPath"
            :items="folderItems"
            :label="t('quickadd.field.root_folder')"
            density="comfortable"
            data-test="qa-folder"
          />
          <template v-if="isFilm">
            <v-select
              v-model="form.minimumAvailability"
              :items="availabilityItems"
              :label="t('quickadd.field.min_availability')"
              density="comfortable"
            />
            <v-switch
              v-model="form.searchForMovie"
              :label="t('quickadd.field.search_auto')"
              color="primary"
              density="compact"
              hide-details
            />
          </template>
          <template v-else>
            <v-select
              v-model="form.seriesType"
              :items="typeItems"
              :label="t('quickadd.field.series_type')"
              density="comfortable"
            />
            <v-select
              v-model="form.monitor"
              :items="monitorItems"
              :label="t('quickadd.field.monitor')"
              density="comfortable"
            />
            <v-switch
              v-model="form.seasonFolder"
              :label="t('quickadd.field.season_folder')"
              color="primary"
              density="compact"
              hide-details
            />
            <v-switch
              v-model="form.searchForMissing"
              :label="t('quickadd.field.search_missing')"
              color="primary"
              density="compact"
              hide-details
            />
          </template>
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3"
            data-test="qa-error"
            >{{ translated(error) }}</v-alert
          >
          <v-alert v-if="done" type="success" variant="tonal" density="compact" class="mt-3">{{
            t('quickadd.error.added_success', {
              type: t(isFilm ? 'quickadd.toast.type_film' : 'quickadd.toast.type_series'),
            })
          }}</v-alert>
        </template>
      </template>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('quickadd.close') }}</v-btn>
      <v-btn
        v-if="media && media.candidates.length"
        color="primary"
        :loading="adding"
        :disabled="done"
        :prepend-icon="done ? mdiCheck : undefined"
        data-test="qa-submit"
        @click="add"
        >{{
          done
            ? t('quickadd.error.added_done')
            : t('quickadd.cta.add_to', { service: isFilm ? 'Radarr' : 'Sonarr' })
        }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
