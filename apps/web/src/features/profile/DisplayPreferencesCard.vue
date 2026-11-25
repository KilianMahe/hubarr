<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte « Préférences d'affichage » du profil : mode d'ouverture des
// bibliothèques Radarr et Sonarr, mode et filtre de la liste des torrents.
// Préférences du compte, appliquées à chaque ouverture de la page ; seules les
// lignes des services configurés sont proposées.
import {
  LIBRARY_VIEW_MODES,
  TORRENT_CLIENTS,
  TORRENT_FILTERS,
  TORRENT_VIEWS,
  userPreferencesSchema,
  type UserPreferences,
} from '@hubarr/shared';
import { useMutation } from '@tanstack/vue-query';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { isConfigured } from '../../app/services';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';

const { t } = useI18n();
const session = useSessionStore();
const notify = useNotifyStore();

const form = reactive<UserPreferences>({ ...session.userPreferences });
watch(
  () => session.userPreferences,
  (next) => Object.assign(form, next),
);

const radarr = computed(() => isConfigured(session.services, 'radarr'));
const sonarr = computed(() => isConfigured(session.services, 'sonarr'));
const torrents = computed(() =>
  TORRENT_CLIENTS.some((client) => isConfigured(session.services, client)),
);
const visible = computed(() => radarr.value || sonarr.value || torrents.value);

const libraryItems = (section: 'films' | 'series') => [
  { value: 'auto', title: t('profile.preferences.view_auto') },
  ...LIBRARY_VIEW_MODES.map((mode) => ({
    value: mode,
    title: t(`media.${section}.view.${mode}`),
  })),
];
const torrentViewItems = computed(() =>
  TORRENT_VIEWS.map((mode) => ({ value: mode, title: t(`qbittorrent.view.${mode}`) })),
);
const torrentFilterItems = computed(() =>
  TORRENT_FILTERS.map((filter) => ({ value: filter, title: t(`qbittorrent.filters.${filter}`) })),
);

const save = useMutation({
  mutationFn: () => api.post('/api/profil/preferences', { ...form }, userPreferencesSchema),
  onSuccess: (next) => {
    session.setUserPreferences(next);
    notify.success('flash.profile.preferences_updated');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});
</script>

<template>
  <v-card v-if="visible" rounded="xl" class="pa-2" data-test="profile-preferences">
    <v-form @submit.prevent="save.mutate()">
      <v-card-title class="text-title-medium">{{ t('profile.preferences.section') }}</v-card-title>
      <v-card-text>
        <p class="text-body-small text-muted mb-4">{{ t('profile.preferences.hint') }}</p>
        <v-row density="compact">
          <v-col v-if="radarr" cols="12" sm="6">
            <v-select
              v-model="form.moviesView"
              :items="libraryItems('films')"
              :label="t('profile.preferences.movies_view')"
              data-test="pref-movies-view"
            />
          </v-col>
          <v-col v-if="sonarr" cols="12" sm="6">
            <v-select
              v-model="form.seriesView"
              :items="libraryItems('series')"
              :label="t('profile.preferences.series_view')"
              data-test="pref-series-view"
            />
          </v-col>
          <template v-if="torrents">
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.torrentsView"
                :items="torrentViewItems"
                :label="t('profile.preferences.torrents_view')"
                data-test="pref-torrents-view"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.torrentsFilter"
                :items="torrentFilterItems"
                :label="t('profile.preferences.torrents_filter')"
                :hint="
                  form.torrentsFilter === 'stalled' ? t('profile.preferences.stalled_hint') : ''
                "
                persistent-hint
                data-test="pref-torrents-filter"
              />
            </v-col>
          </template>
        </v-row>
      </v-card-text>
      <v-card-actions class="justify-end px-4 pb-4">
        <v-btn
          type="submit"
          color="service"
          variant="flat"
          :loading="save.isPending.value"
          data-test="profile-preferences-save"
          >{{ t('common.action.save') }}</v-btn
        >
      </v-card-actions>
    </v-form>
  </v-card>
</template>
