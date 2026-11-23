<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Suggestions d'import (`radarr/suggestions.html.twig`, Radarr) : films des
// listes d'import et recommandations, en affiches (badges recommandé,
// tendance, populaire ; « déjà ajouté ») ; ajout par un dialogue (synopsis,
// durée, studio, notes, genres ; profil, dossier, recherche automatique).
import { suggestionsPageSchema, type Suggestion } from '@hubarr/shared';
import { mdiCheck } from '@mdi/js';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { moviesApi } from '../../movies/movies-api';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import EmptyState from '../../../components/EmptyState.vue';

const { t } = useI18n();
const { ctx, query, feedback, error } = useAdminPage(
  'suggestions',
  '/suggestions',
  suggestionsPageSchema,
);
const title = computed(() => t(ctx.kindKey('page_title')));
const page = computed(() => query.data.value);
const added = ref(new Set<number>());

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const current = ref<Suggestion | null>(null);
const form = reactive<{ qualityProfileId: number | null; rootFolderPath: string; search: boolean }>(
  {
    qualityProfileId: null,
    rootFolderPath: '',
    search: true,
  },
);
function show(movie: Suggestion): void {
  current.value = movie;
  formError.value = null;
  form.qualityProfileId = form.qualityProfileId ?? page.value?.qualityProfiles[0]?.id ?? null;
  form.rootFolderPath = form.rootFolderPath || (page.value?.rootFolders[0]?.path ?? '');
  open.value = true;
}
const inLibrary = (movie: Suggestion) => movie.inLibrary || added.value.has(movie.tmdbId);

async function add(): Promise<void> {
  const movie = current.value;
  if (movie === null) return;
  saving.value = true;
  formError.value = null;
  try {
    await moviesApi.add(ctx.slug.value, {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year ?? 0,
      qualityProfileId: form.qualityProfileId ?? 0,
      rootFolderPath: form.rootFolderPath,
      monitored: true,
      searchForMovie: form.search,
    });
    added.value = new Set([...added.value, movie.tmdbId]);
    open.value = false;
    feedback.value = {
      type: 'success',
      text: t(ctx.key('added_success_tpl'), { title: movie.title }),
    };
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('add_error'));
  } finally {
    saving.value = false;
  }
}
const runtime = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="page?.movies.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <EmptyState
      v-if="page && page.movies.length === 0"
      inline
      :title="t(ctx.key('empty_radarr'))"
    />
    <div v-if="page" class="suggestions-grid">
      <v-card
        v-for="movie in page.movies"
        :key="movie.tmdbId"
        variant="flat"
        border
        class="suggestion-card"
        :class="{ 'suggestion-card--owned': inLibrary(movie) }"
        data-test="suggestion-card"
        @click="show(movie)"
      >
        <v-img
          v-if="movie.poster"
          :src="movie.poster"
          :alt="movie.title"
          aspect-ratio="0.667"
          cover
        />
        <div
          v-else
          class="suggestion-card__placeholder d-flex align-center justify-center text-center pa-2 text-body-small"
        >
          {{ movie.title }}
        </div>
        <div class="pa-2">
          <div class="text-body-medium font-weight-medium text-truncate" :title="movie.title">
            {{ movie.title }}
          </div>
          <div class="d-flex align-center ga-1 flex-wrap">
            <span class="text-body-small text-muted">{{ movie.year ?? '' }}</span>
            <v-chip
              v-if="inLibrary(movie)"
              size="x-small"
              color="success"
              variant="tonal"
              :prepend-icon="mdiCheck"
              >{{ t(ctx.key('already_added')) }}</v-chip
            >
            <v-chip v-else-if="movie.recommended" size="x-small" color="info" variant="tonal">{{
              t(ctx.key('badge_recommended'))
            }}</v-chip>
            <v-chip v-else-if="movie.trending" size="x-small" color="warning" variant="tonal">{{
              t(ctx.key('badge_trending'))
            }}</v-chip>
            <v-chip v-else-if="movie.popular" size="x-small" color="error" variant="tonal">{{
              t(ctx.key('badge_popular'))
            }}</v-chip>
          </div>
        </div>
      </v-card>
    </div>

    <AdminDialog
      v-model="open"
      :title="
        current
          ? `${current.title}${current.year ? ` (${current.year})` : ''}`
          : t(ctx.key('modal_title'))
      "
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key('btn_add'))"
      :hide-save="current !== null && inLibrary(current)"
      @save="add"
    >
      <template v-if="current">
        <v-alert
          v-if="inLibrary(current)"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          >{{ t(ctx.key('already_in_lib')) }}</v-alert
        >
        <div class="d-flex flex-wrap ga-1 mb-3">
          <v-chip v-if="current.runtime" size="x-small" variant="tonal">{{
            runtime(current.runtime)
          }}</v-chip>
          <v-chip v-if="current.studio" size="x-small" variant="tonal" color="info">{{
            current.studio
          }}</v-chip>
          <v-chip v-if="current.ratings.imdb" size="x-small" variant="tonal" color="warning"
            >IMDb {{ current.ratings.imdb }}</v-chip
          >
          <v-chip v-if="current.ratings.tmdb" size="x-small" variant="tonal" color="success"
            >TMDB {{ current.ratings.tmdb }}</v-chip
          >
          <v-chip
            v-for="genre in current.genres"
            :key="genre"
            size="x-small"
            variant="tonal"
            color="purple"
            >{{ genre }}</v-chip
          >
        </div>
        <p class="text-body-medium mb-4">{{ current.overview ?? t(ctx.key('no_overview')) }}</p>
        <template v-if="!inLibrary(current)">
          <v-select
            v-model="form.qualityProfileId"
            :items="
              (page?.qualityProfiles ?? []).map((profile) => ({
                value: profile.id,
                title: profile.name,
              }))
            "
            :label="t(ctx.key('label_quality_profile'))"
            variant="outlined"
            density="compact"
          />
          <v-select
            v-model="form.rootFolderPath"
            :items="(page?.rootFolders ?? []).map((root) => root.path)"
            :label="t(ctx.key('label_root_folder'))"
            variant="outlined"
            density="compact"
          />
          <v-switch
            v-model="form.search"
            :label="t(ctx.key('label_search_auto'))"
            color="service"
            density="compact"
            hide-details
          />
        </template>
      </template>
    </AdminDialog>
  </AdminPage>
</template>

<style scoped>
.suggestions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.suggestion-card {
  cursor: pointer;
}
.suggestion-card--owned {
  opacity: 0.6;
}
.suggestion-card__placeholder {
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>
