<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Langues » (`section-languages`) : langue de Hubarr et des
// métadonnées TMDB, puis langue de l'interface de chaque service connecté
// (Radarr et Sonarr par instance, Prowlarr, Seerr). Un service injoignable est
// signalé sans bloquer les autres.
import {
  LANGUAGES_SECTION_METADATA,
  displayOptionLabelKey,
  isLocale,
  languagesResponseSchema,
  languagesSaveResponseSchema,
  type LanguagesResponse,
  type LanguagesSaveRequest,
} from '@hubarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { setLocale } from '../../app/plugins/i18n';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import { SETTINGS_KEY } from './settings-api';

const LANGUAGES_KEY = ['admin', 'settings', 'languages'] as const;
const { t } = useI18n();
const notify = useNotifyStore();
const session = useSessionStore();
const queryClient = useQueryClient();

const languages = useQuery({
  queryKey: LANGUAGES_KEY,
  queryFn: ({ signal }) =>
    api.get('/api/admin/settings/languages', languagesResponseSchema, signal),
});

interface LanguagesForm {
  hubarrUi: string;
  hubarrMetadata: string;
  radarrUi: Record<string, number | null>;
  radarrInfo: Record<string, number | null>;
  sonarrUi: Record<string, number | null>;
  prowlarrUi: string | null;
  seerrUi: string | null;
}

const form = reactive<LanguagesForm>({
  hubarrUi: 'en',
  hubarrMetadata: 'en-US',
  radarrUi: {},
  radarrInfo: {},
  sonarrUi: {},
  prowlarrUi: null,
  seerrUi: null,
});

function reset(data: LanguagesResponse): void {
  form.hubarrUi = data.hubarr.ui;
  form.hubarrMetadata = data.hubarr.metadata;
  form.radarrUi = Object.fromEntries(data.radarr.map((row) => [row.slug, row.current]));
  form.radarrInfo = Object.fromEntries(data.radarr.map((row) => [row.slug, row.currentInfo]));
  form.sonarrUi = Object.fromEntries(data.sonarr.map((row) => [row.slug, row.current]));
  form.prowlarrUi = data.prowlarr.current;
  form.seerrUi = data.seerr.current;
}
watch(
  () => languages.data.value,
  (data) => {
    if (data) reset(data);
  },
  { immediate: true },
);

/** Valeurs choisies seulement (un service injoignable n'envoie rien). */
function definedIds(map: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(map).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

function request(data: LanguagesResponse): LanguagesSaveRequest {
  const reachable = (rows: { slug: string; error: boolean }[]) =>
    new Set(rows.filter((row) => !row.error).map((row) => row.slug));
  const radarr = reachable(data.radarr);
  const sonarr = reachable(data.sonarr);
  const only = (map: Record<string, number>, slugs: Set<string>) =>
    Object.fromEntries(Object.entries(map).filter(([slug]) => slugs.has(slug)));
  return {
    hubarrUi: form.hubarrUi,
    hubarrMetadata: form.hubarrMetadata,
    radarrUi: only(definedIds(form.radarrUi), radarr),
    radarrInfo: only(definedIds(form.radarrInfo), radarr),
    sonarrUi: only(definedIds(form.sonarrUi), sonarr),
    ...(data.prowlarr.configured && !data.prowlarr.error && form.prowlarrUi !== null
      ? { prowlarrUi: form.prowlarrUi }
      : {}),
    ...(data.seerr.configured && !data.seerr.error && form.seerrUi !== null
      ? { seerrUi: form.seerrUi }
      : {}),
  };
}

const save = useMutation({
  mutationFn: (data: LanguagesResponse) =>
    api.post('/api/admin/settings/languages/save', request(data), languagesSaveResponseSchema),
  onSuccess: async (result) => {
    if (result.failed.length === 0) notify.success('admin.languages.saved_success');
    else notify.error('admin.languages.partial_error', { services: result.failed.join(', ') });
    if (isLocale(result.locale)) {
      await setLocale(result.locale);
      session.setPreferences({
        ...session.preferences,
        display_language: result.locale,
        display_metadata_language: form.hubarrMetadata,
      });
    }
    await queryClient.invalidateQueries({ queryKey: LANGUAGES_KEY });
    await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY, exact: true });
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const uiItems = [
  { value: 'fr', title: 'Français' },
  { value: 'en', title: 'English' },
];
const metadataItems = LANGUAGES_SECTION_METADATA.map((value) => ({
  value,
  title: t(displayOptionLabelKey('display_metadata_language', value)),
}));
const idItems = (available: { id: number; name: string }[]) =>
  available.map((row) => ({ value: row.id, title: row.name }));
const codeItems = (available: Record<string, string>) =>
  Object.entries(available).map(([value, title]) => ({ value, title }));
</script>

<template>
  <section id="section-languages" data-section="languages">
    <h2 class="text-title-large mb-1">{{ t('admin.languages.tab_label') }}</h2>
    <p class="text-body-medium text-muted mb-4">{{ t('admin.languages.description') }}</p>

    <v-progress-linear v-if="languages.isPending.value" indeterminate color="primary" />
    <v-alert v-else-if="languages.isError.value" type="error" variant="tonal">{{
      t('error.generic.message')
    }}</v-alert>
    <form
      v-else-if="languages.data.value"
      @submit.prevent="languages.data.value && save.mutate(languages.data.value)"
    >
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-title-medium">{{
          t('admin.languages.prismarr_section')
        }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="form.hubarrUi"
                :items="uiItems"
                :label="t('admin.languages.prismarr_ui_label')"
                :hint="t('admin.languages.prismarr_ui_help')"
                persistent-hint
                data-test="hubarr-ui"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="form.hubarrMetadata"
                :items="metadataItems"
                :label="t('admin.languages.prismarr_metadata_label')"
                :hint="t('admin.languages.prismarr_metadata_help')"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-title-medium">{{
          t('admin.languages.services_section')
        }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <div>
            <div class="text-title-small mb-2">Radarr</div>
            <p v-if="languages.data.value.radarr.length === 0" class="text-body-medium text-muted">
              {{ t('admin.languages.not_configured') }}
            </p>
            <v-row
              v-for="row in languages.data.value.radarr"
              :key="row.slug"
              :data-language-row="`radarr:${row.slug}`"
              density="compact"
            >
              <v-col cols="12" md="4" class="d-flex align-center text-body-large">{{
                row.name
              }}</v-col>
              <v-col v-if="row.error" cols="12" md="8" class="text-error">{{
                t('admin.languages.unreachable')
              }}</v-col>
              <template v-else>
                <v-col cols="12" md="4">
                  <v-select
                    :model-value="form.radarrUi[row.slug] ?? null"
                    :items="idItems(row.available)"
                    :label="t('admin.languages.radarr_ui_label')"
                    @update:model-value="
                      (value: number | null) => (form.radarrUi[row.slug] = value)
                    "
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-select
                    :model-value="form.radarrInfo[row.slug] ?? null"
                    :items="idItems(row.available)"
                    :label="t('admin.languages.radarr_info_label')"
                    @update:model-value="
                      (value: number | null) => (form.radarrInfo[row.slug] = value)
                    "
                  />
                </v-col>
              </template>
            </v-row>
            <p v-if="languages.data.value.radarr.length > 0" class="text-body-small text-muted">
              {{ t('admin.languages.radarr_info_help') }}
            </p>
          </div>

          <div>
            <div class="text-title-small mb-2">Sonarr</div>
            <p v-if="languages.data.value.sonarr.length === 0" class="text-body-medium text-muted">
              {{ t('admin.languages.not_configured') }}
            </p>
            <v-row
              v-for="row in languages.data.value.sonarr"
              :key="row.slug"
              :data-language-row="`sonarr:${row.slug}`"
              density="compact"
            >
              <v-col cols="12" md="4" class="d-flex align-center text-body-large">{{
                row.name
              }}</v-col>
              <v-col v-if="row.error" cols="12" md="8" class="text-error">{{
                t('admin.languages.unreachable')
              }}</v-col>
              <v-col v-else cols="12" md="4">
                <v-select
                  :model-value="form.sonarrUi[row.slug] ?? null"
                  :items="idItems(row.available)"
                  :label="t('admin.languages.sonarr_ui_label')"
                  @update:model-value="(value: number | null) => (form.sonarrUi[row.slug] = value)"
                />
              </v-col>
            </v-row>
            <p v-if="languages.data.value.sonarr.length > 0" class="text-body-small text-muted">
              {{ t('admin.languages.sonarr_info_unavailable') }}
            </p>
          </div>

          <v-row
            v-for="service in ['prowlarr', 'seerr'] as const"
            :key="service"
            density="compact"
            :data-language-row="service"
          >
            <v-col cols="12" md="4" class="d-flex align-center text-title-small">{{
              service === 'prowlarr' ? 'Prowlarr' : 'Seerr'
            }}</v-col>
            <v-col
              v-if="!languages.data.value[service].configured"
              cols="12"
              md="8"
              class="text-muted"
            >
              {{ t('admin.languages.not_configured') }}
            </v-col>
            <v-col
              v-else-if="languages.data.value[service].error"
              cols="12"
              md="8"
              class="text-error"
            >
              {{ t('admin.languages.unreachable') }}
            </v-col>
            <v-col v-else cols="12" md="4">
              <v-select
                v-if="service === 'prowlarr'"
                v-model="form.prowlarrUi"
                :items="codeItems(languages.data.value.prowlarr.available)"
                :label="t('admin.languages.prowlarr_ui_label')"
              />
              <v-select
                v-else
                v-model="form.seerrUi"
                :items="codeItems(languages.data.value.seerr.available)"
                :label="t('admin.languages.jellyseerr_ui_label')"
                :hint="t('admin.languages.info_jellyseerr_global')"
                persistent-hint
              />
            </v-col>
          </v-row>
          <p class="text-body-small text-muted">{{ t('admin.languages.info_existing_items') }}</p>
        </v-card-text>
      </v-card>

      <v-btn
        type="submit"
        color="primary"
        variant="flat"
        :loading="save.isPending.value"
        data-test="languages-save"
      >
        {{ t('admin.languages.save_btn') }}
      </v-btn>
    </form>
  </section>
</template>
