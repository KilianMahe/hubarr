<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout d'un film (`#modal-add-film` d'origine) : recherche différée (400 ms,
// 2 caractères), 20 résultats (déjà dans Radarr = grisés), formulaire au-dessus
// des résultats (profil, préselectionné sur celui de l'instance ; dossier racine ;
// recherche automatique), puis suivi de la recherche de Radarr (file et
// historique toutes les 3 s, 60 s au plus).
import type { Movie, TmdbCard } from '@hubarr/shared';
import { mdiCheck, mdiMagnify } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { ApiError } from '../../app/api/client';
import AddSuggestions from '../../components/AddSuggestions.vue';
import { ADD_POLL_MAX, addOutcome, formatRuntime } from './movie-detail';
import { posterUrl } from './movie-display';
import { moviesApi, moviesKeys } from './movies-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ slug: string; indexerCount: number }>();
const emit = defineEmits<{ added: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

const term = ref('');
const searching = ref(false);
const searchError = ref(false);
const results = ref<Movie[] | null>(null);
const selected = ref<Movie | null>(null);
const form = reactive({ qualityProfileId: 0, rootFolderPath: '', monitored: true });
const result = ref<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
const adding = ref(false);

const config = useQuery({
  queryKey: computed(() => moviesKeys.config(props.slug)),
  queryFn: ({ signal }) => moviesApi.config(props.slug, signal),
  enabled: computed(() => open.value && selected.value !== null),
  staleTime: 60_000,
});
const profileItems = computed(() =>
  (config.data.value?.qualityProfiles ?? []).map((p) => ({ value: p.id, title: p.name })),
);
const folderItems = computed(() => (config.data.value?.rootFolders ?? []).map((f) => f.path));
// Préselection : profil de l'instance s'il existe, sinon le premier ; premier dossier.
watch(
  () => config.data.value,
  (value) => {
    if (value === undefined) return;
    const preferred = value.qualityProfiles.find((p) => p.id === value.defaultQualityProfileId);
    if (form.qualityProfileId === 0)
      form.qualityProfileId = preferred?.id ?? value.qualityProfiles[0]?.id ?? 0;
    if (form.rootFolderPath === '') form.rootFolderPath = value.rootFolders[0]?.path ?? '';
  },
  { immediate: true },
);

// ── Recherche ───────────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;
async function search(): Promise<void> {
  clearTimeout(searchTimer);
  const value = term.value.trim();
  if (value.length < 2) return;
  const seq = ++searchSeq;
  searching.value = true;
  searchError.value = false;
  selected.value = null;
  try {
    const found = await moviesApi.lookup(props.slug, value);
    if (seq === searchSeq) results.value = found.slice(0, 20);
  } catch {
    if (seq === searchSeq) {
      searchError.value = true;
      results.value = null;
    }
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}
function onInput(value: string | null): void {
  term.value = value ?? '';
  clearTimeout(searchTimer);
  if (term.value.trim().length < 2) {
    results.value = null;
    return;
  }
  searchTimer = setTimeout(() => void search(), 400);
}

function select(movie: Movie): void {
  if (movie.id !== null) return;
  selected.value = movie;
  result.value = null;
}
/** Tendance TMDB choisie dans l'état vide (V16) : recherche du titre, puis présélection. */
async function pick(card: TmdbCard): Promise<void> {
  term.value = card.title;
  await search();
  const match = results.value?.find((movie) => movie.tmdbId === card.id && movie.id === null);
  if (match) select(match);
}
const idle = computed(
  () =>
    results.value === null &&
    !searching.value &&
    !searchError.value &&
    selected.value === null &&
    result.value === null,
);
const label = (movie: Movie) => (movie.year ? `${movie.title} (${movie.year})` : movie.title);

// ── Ajout et suivi ──────────────────────────────────────────────────────────
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(searchTimer);
  clearTimeout(pollTimer);
});

const via = (src: string | null) => (src ? t('media.films.modal.via_prefix', { src }) : '');

async function follow(movieId: number, title: string, poll = 1): Promise<void> {
  await new Promise<void>((resolve) => {
    pollTimer = setTimeout(resolve, 3_000);
  });
  if (disposed) return;
  const elapsed = poll * 3;
  const dots = '.'.repeat((poll % 3) + 1);
  result.value = {
    type: 'info',
    text:
      t('media.films.modal.searching_dots', { dots }) +
      (elapsed >= 9 ? t('media.films.modal.searching_elapsed', { seconds: elapsed }) : ''),
  };
  let outcome: ReturnType<typeof addOutcome>;
  try {
    const [queue, history] = await Promise.all([
      moviesApi.queue(props.slug),
      moviesApi.history(props.slug, movieId),
    ]);
    outcome = addOutcome(movieId, poll, history, queue);
  } catch {
    outcome = poll >= ADD_POLL_MAX ? { kind: 'timeout' } : { kind: 'waiting' };
  }
  switch (outcome.kind) {
    case 'queue':
      result.value = {
        type: 'success',
        text: t('media.films.modal.dl_started', { title, src: via(outcome.indexer) }),
      };
      emit('added');
      return;
    case 'failed':
      result.value = { type: 'error', text: t('media.films.modal.dl_failed', { title }) };
      emit('added');
      return;
    case 'grabbed':
      result.value = {
        type: 'warning',
        text: t('media.films.modal.grab_but_no_queue', { title, src: via(outcome.indexer) }),
      };
      emit('added');
      return;
    case 'timeout':
      result.value = {
        type: 'warning',
        text: t('media.films.modal.no_download_detected', { title }),
      };
      emit('added');
      return;
    case 'waiting':
      await follow(movieId, title, poll + 1);
  }
}

async function add(): Promise<void> {
  const movie = selected.value;
  const tmdbId = movie?.tmdbId ?? null;
  if (movie === null || tmdbId === null) return;
  if (form.qualityProfileId === 0 || form.rootFolderPath === '') {
    result.value = { type: 'warning', text: t('media.films.modal.pick_quality_folder') };
    return;
  }
  adding.value = true;
  result.value = { type: 'info', text: t('media.films.modal.adding') };
  try {
    const added = await moviesApi.add(props.slug, {
      tmdbId,
      title: movie.title,
      year: movie.year ?? 0,
      qualityProfileId: form.qualityProfileId,
      rootFolderPath: form.rootFolderPath,
      monitored: form.monitored,
      searchForMovie: form.monitored,
    });
    selected.value = null;
    // Le film apparaît désormais comme « déjà dans Radarr ».
    results.value = (results.value ?? []).map((item) =>
      item.tmdbId === movie.tmdbId ? { ...item, id: added.movieId ?? 0 } : item,
    );
    if (form.monitored && added.movieId !== null) {
      result.value = {
        type: 'info',
        text: t('media.films.modal.added_searching', {
          title: movie.title,
          count: props.indexerCount,
        }),
      };
      emit('added');
      void follow(added.movieId, movie.title);
    } else {
      result.value = {
        type: 'success',
        text: t('media.films.modal.added_not_monitored', { title: movie.title }),
      };
      emit('added');
    }
  } catch (error) {
    const network = error instanceof ApiError && error.code === 'NETWORK';
    result.value = {
      type: 'error',
      text: t(
        network ? 'media.films.modal.network_error' : 'media.films.modal.add_error_duplicate',
      ),
    };
  } finally {
    adding.value = false;
  }
}

// Ouverture : formulaire et résultats vides.
watch(open, (value) => {
  if (!value) return;
  term.value = '';
  results.value = null;
  selected.value = null;
  result.value = null;
  searchError.value = false;
});
</script>

<template>
  <component
    :is="smAndDown ? VBottomSheet : VDialog"
    v-model="open"
    :max-width="smAndDown ? 'none' : 960"
    scrollable
  >
    <v-card data-test="add-movie">
      <v-card-title class="text-title-large pt-4">{{
        t('media.films.modal.add_title')
      }}</v-card-title>
      <v-card-text>
        <v-filter-field
          :model-value="term"
          :prepend-inner-icon="mdiMagnify"
          :placeholder="t('media.films.modal.search_placeholder')"
          :aria-label="t('media.films.modal.search_placeholder')"
          :loading="searching"
          variant="outlined"
          density="comfortable"
          hide-details
          autofocus
          autocomplete="off"
          data-test="add-movie-search"
          @update:model-value="onInput"
          @keydown.enter="search"
        />

        <v-card
          v-if="selected || result"
          variant="tonal"
          color="service-text"
          class="my-4 pa-3"
          data-test="add-movie-form"
        >
          <template v-if="selected">
            <div class="text-title-medium mb-3">{{ label(selected) }}</div>
            <v-row density="compact">
              <v-col cols="12" sm="5">
                <v-select
                  v-model="form.qualityProfileId"
                  :items="profileItems"
                  :label="t('media.films.modal.quality_profile')"
                  :loading="config.isPending.value"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-select
                  v-model="form.rootFolderPath"
                  :items="folderItems"
                  :label="t('media.films.modal.root_folder')"
                  :loading="config.isPending.value"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="3" class="d-flex align-center">
                <v-switch
                  v-model="form.monitored"
                  :label="t('media.films.modal.search_auto')"
                  color="service"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>
            <div class="d-flex justify-end mt-2">
              <v-btn
                color="success"
                variant="flat"
                :loading="adding"
                data-test="add-movie-confirm"
                @click="add"
                >{{ t('media.films.modal.add_button') }}</v-btn
              >
            </div>
          </template>
          <v-alert
            v-if="result"
            :type="result.type"
            variant="tonal"
            density="compact"
            :class="{ 'mt-3': selected }"
            data-test="add-movie-result"
          >
            <div class="d-flex align-center ga-2">
              <v-progress-circular
                v-if="result.type === 'info'"
                indeterminate
                size="16"
                width="2"
              />
              <span>{{ result.text }}</span>
            </div>
          </v-alert>
        </v-card>

        <AddSuggestions v-if="idle" type="movie" @pick="pick" />
        <p v-else-if="searchError" class="text-error text-center py-3">
          {{ t('media.films.modal.search_error') }}
        </p>
        <p v-else-if="results !== null && results.length === 0" class="text-muted text-center py-3">
          {{ t('media.films.modal.no_results') }}
        </p>
        <div v-else-if="results" class="add-movie__results mt-3">
          <button
            v-for="movie in results"
            :key="movie.tmdbId ?? movie.title"
            type="button"
            class="add-movie__result"
            :class="{
              'add-movie__result--exists': movie.id !== null,
              'add-movie__result--selected': selected?.tmdbId === movie.tmdbId,
            }"
            :disabled="movie.id !== null"
            data-test="add-movie-result-item"
            @click="select(movie)"
          >
            <img
              v-if="posterUrl(movie.poster, 'w92')"
              :src="posterUrl(movie.poster, 'w92')!"
              alt=""
              loading="lazy"
              class="add-movie__poster"
            />
            <div v-else class="add-movie__poster add-movie__no-poster text-label-small">
              {{ t('media.films.modal.no_poster') }}
            </div>
            <div class="add-movie__body">
              <div class="d-flex align-center ga-2">
                <span class="font-weight-medium text-truncate">{{ movie.title }}</span>
                <span v-if="movie.year" class="text-muted">({{ movie.year }})</span>
                <v-chip
                  v-if="movie.id !== null"
                  size="x-small"
                  color="success"
                  variant="tonal"
                  class="ml-auto"
                >
                  <v-icon :icon="mdiCheck" start size="12" />{{
                    t('media.films.modal.already_radarr')
                  }}
                </v-chip>
              </div>
              <div class="d-flex flex-wrap align-center ga-1 mt-1">
                <v-chip
                  v-for="genre in movie.genres.slice(0, 3)"
                  :key="genre"
                  size="x-small"
                  variant="tonal"
                  >{{ genre }}</v-chip
                >
                <span v-if="movie.runtime" class="text-body-small text-muted">{{
                  formatRuntime(movie.runtime)
                }}</span>
              </div>
              <p class="text-body-small text-muted add-movie__overview">{{ movie.overview }}</p>
            </div>
          </button>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('media.films.detail.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </component>
</template>

<style scoped>
.add-movie__results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.add-movie__result {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.add-movie__result:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.add-movie__result--selected {
  border-color: rgb(var(--v-theme-service));
  background: rgba(var(--v-theme-service), 0.1);
}
.add-movie__result--exists {
  opacity: 0.5;
  cursor: not-allowed;
}
.add-movie__poster {
  flex-shrink: 0;
  width: 70px;
  height: 105px;
  border-radius: 6px;
  object-fit: cover;
}
.add-movie__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.add-movie__body {
  min-width: 0;
  flex: 1;
}
.add-movie__overview {
  margin: 4px 0 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}
@media (max-width: 599px) {
  .add-movie__results {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
