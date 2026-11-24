<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout d'un film (Radarr) ou d'une série (Sonarr), en deux étapes.
// 1. Recherche différée (400 ms, 2 caractères), 20 résultats. Chaque résultat
//    propose « Voir » (fiche TMDB, ou fiche Hubarr si le titre est déjà dans
//    l'instance) et « Ajouter » (formulaire). Sans recherche : tendances TMDB.
// 2. Formulaire : profil (celui de l'instance présélectionné), dossier racine,
//    puis recherche automatique (film) ou type, épisodes suivis, dossiers par
//    saison, recherche des manquants et étiquettes (série). « Retour » revient
//    aux résultats (recherche et défilement conservés) ; la croix ferme tout.
// Après l'ajout d'un film suivi, la recherche de Radarr est suivie (file et
// historique toutes les 3 s, 60 s au plus).
import {
  SERIES_ADD_MONITOR,
  SERIES_TYPES,
  type SeriesType,
  type TmdbCard,
  type TmdbDetail,
} from '@hubarr/shared';
import {
  msAdd,
  msArrowBack,
  msBookmark,
  msCategory,
  msCheck,
  msCheckCircle,
  msError,
  msFolder,
  msFolderCopy,
  msSearch,
  msSell,
  msTune,
} from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { ApiError } from '../../app/api/client';
import { openQuickAdd } from '../../app/overlays';
import AddSuggestions from '../../components/AddSuggestions.vue';
import DialogTitle from '../../components/DialogTitle.vue';
import type { DetailTarget } from '../discover/discover-api';
import TmdbDetailDialog from '../discover/TmdbDetailDialog.vue';
import { ADD_POLL_MAX, addOutcome, formatRuntime } from '../movies/movie-detail';
import { posterUrl } from '../movies/movie-display';
import { moviesApi, moviesKeys } from '../movies/movies-api';
import { seriesApi, seriesKeys } from '../series/series-api';
import {
  ADD_TEXT,
  detailTarget,
  findAddable,
  itemLabel,
  libraryLocation,
  markAdded,
  movieItem,
  seriesItem,
  type AddKind,
  type LookupItem,
} from './add-media';

const open = defineModel<boolean>({ required: true });
const props = withDefaults(
  defineProps<{
    kind: AddKind;
    slug: string;
    /** Film : nombre d'indexeurs annoncé après l'ajout. */
    indexerCount?: number;
    /** Série : profil de l'instance (celui d'un film vient de la configuration). */
    defaultQualityProfileId?: number | null;
  }>(),
  { indexerCount: 0, defaultQualityProfileId: null },
);
const emit = defineEmits<{ added: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

const text = computed(() => ADD_TEXT[props.kind]);
const testId = (suffix?: string) => (suffix ? `add-${props.kind}-${suffix}` : `add-${props.kind}`);

const term = ref('');
const searching = ref(false);
const searchError = ref(false);
const results = ref<LookupItem[] | null>(null);
/** Titre du formulaire ; `null` : étape des résultats. */
const selected = ref<LookupItem | null>(null);
/** Ajout effectué : le formulaire laisse place au compte rendu. */
const done = ref(false);
const tmdbDetail = ref<DetailTarget | null>(null);

interface AddForm {
  qualityProfileId: number;
  rootFolderPath: string;
  /** Film : suivi et recherche automatique. */
  monitored: boolean;
  seriesType: SeriesType;
  monitor: (typeof SERIES_ADD_MONITOR)[number];
  seasonFolder: boolean;
  searchForMissing: boolean;
  tags: number[];
}
const form = reactive<AddForm>({
  qualityProfileId: 0,
  rootFolderPath: '',
  monitored: true,
  seriesType: 'standard',
  monitor: 'all',
  seasonFolder: true,
  searchForMissing: false,
  tags: [],
});
const result = ref<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
const adding = ref(false);
const RESULT_ICONS = {
  success: msCheckCircle,
  warning: msError,
  error: msError,
} as const;
/** Fiche du titre ajouté (« Voir » du compte rendu). */
const addedLocation = computed(() => {
  const key = selected.value?.key;
  if (!done.value || key === undefined) return null;
  const item = (results.value ?? []).find((entry) => entry.key === key);
  return item ? libraryLocation(item, props.slug) : null;
});

// ── Configuration de l'instance ────────────────────────────────────────────
interface AddConfig {
  qualityProfiles: { id: number; name: string }[];
  rootFolders: { path: string }[];
  tags: { id: number; label: string }[];
  defaultQualityProfileId: number | null;
}
const config = useQuery({
  queryKey: computed(() =>
    props.kind === 'movie' ? moviesKeys.config(props.slug) : seriesKeys.config(props.slug),
  ),
  queryFn: async ({ signal }): Promise<AddConfig> => {
    if (props.kind === 'movie') return moviesApi.config(props.slug, signal);
    const value = await seriesApi.config(props.slug, signal);
    return { ...value, defaultQualityProfileId: props.defaultQualityProfileId };
  },
  enabled: computed(() => open.value && selected.value !== null),
  staleTime: 60_000,
});
const profileItems = computed(() =>
  (config.data.value?.qualityProfiles ?? []).map((p) => ({ value: p.id, title: p.name })),
);
const folderItems = computed(() => (config.data.value?.rootFolders ?? []).map((f) => f.path));
const tagItems = computed(() => config.data.value?.tags ?? []);
const typeItems = computed(() =>
  SERIES_TYPES.map((value) => ({ value, title: t(`media.series.modal.type_${value}`) })),
);
const MONITOR_KEYS: Record<(typeof SERIES_ADD_MONITOR)[number], string> = {
  all: 'monitor_all',
  future: 'monitor_future',
  missing: 'monitor_missing',
  firstSeason: 'monitor_first_season',
  lastSeason: 'monitor_last_season',
  none: 'monitor_none',
};
const monitorItems = computed(() =>
  SERIES_ADD_MONITOR.map((value) => ({
    value,
    title: t(`media.series.modal.${MONITOR_KEYS[value]}`),
  })),
);
// Présélection : profil de l'instance s'il existe, sinon le premier ; premier dossier.
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
async function lookup(value: string): Promise<LookupItem[]> {
  if (props.kind === 'movie') return (await moviesApi.lookup(props.slug, value)).map(movieItem);
  return (await seriesApi.lookup(props.slug, value)).map(seriesItem);
}
async function search(): Promise<void> {
  clearTimeout(searchTimer);
  const value = term.value.trim();
  if (value.length < 2) return;
  const seq = ++searchSeq;
  searching.value = true;
  searchError.value = false;
  backToResults();
  try {
    const found = await lookup(value);
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
const idle = computed(
  () => results.value === null && !searching.value && !searchError.value && selected.value === null,
);

// ── Étapes ──────────────────────────────────────────────────────────────────
// Le défilement des résultats est mémorisé à l'ouverture du formulaire.
const body = ref<{ $el: HTMLElement } | null>(null);
let resultsScroll = 0;
function scrollBody(top: number): void {
  void nextTick(() => {
    if (body.value) body.value.$el.scrollTop = top;
  });
}

function select(item: LookupItem): void {
  if (item.libraryId !== null) return;
  resultsScroll = body.value?.$el.scrollTop ?? 0;
  followSeq++;
  selected.value = item;
  done.value = false;
  result.value = null;
  if (item.kind === 'series')
    form.seriesType = item.media.seriesType === 'anime' ? 'anime' : 'standard';
  scrollBody(0);
}
function backToResults(): void {
  if (selected.value === null) return;
  selected.value = null;
  scrollBody(resultsScroll);
}

/** Ajout d'un titre TMDB : résultat affiché, sinon recherche de son titre. */
async function addFromTmdb(tmdbId: number, title: string): Promise<void> {
  let match = findAddable(results.value ?? [], tmdbId);
  if (match === null) {
    term.value = title;
    await search();
    match = findAddable(results.value ?? [], tmdbId);
  }
  if (match) select(match);
}
/** Tendance TMDB choisie dans l'état vide (V16). */
function pick(card: TmdbCard): void {
  void addFromTmdb(card.id, card.title);
}
/** « Ajouter » de la fiche TMDB ouverte par « Voir ». */
function addFromDetail(detail: TmdbDetail): void {
  tmdbDetail.value = null;
  const sameKind = (detail.type === 'movie') === (props.kind === 'movie');
  if (sameKind) void addFromTmdb(detail.id, detail.title);
  else openQuickAdd({ tmdb: { type: detail.type, id: detail.id } });
}

// ── Affichage d'un résultat ────────────────────────────────────────────────
function details(item: LookupItem): string[] {
  if (item.kind === 'movie') return [formatRuntime(item.media.runtime)].filter((x) => x !== '');
  const parts = [item.media.network ?? ''];
  if (item.media.seasonCount)
    parts.push(t('media.series.status.season_tpl', { count: item.media.seasonCount }));
  return parts.filter((x) => x !== '');
}
function statusKey(item: LookupItem): string | null {
  if (item.kind !== 'series') return null;
  if (item.media.status === 'ended') return 'media.series.status.ended';
  if (item.media.status === 'continuing') return 'media.series.status.continuing';
  return null;
}

// ── Ajout et suivi ──────────────────────────────────────────────────────────
let pollTimer: ReturnType<typeof setTimeout> | undefined;
/** Incrémenté pour abandonner un suivi en cours (autre titre, fermeture). */
let followSeq = 0;
let disposed = false;
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(searchTimer);
  clearTimeout(pollTimer);
});

const via = (src: string | null) => (src ? t('media.films.modal.via_prefix', { src }) : '');

async function follow(movieId: number, title: string, seq: number, poll = 1): Promise<void> {
  await new Promise<void>((resolve) => {
    pollTimer = setTimeout(resolve, 3_000);
  });
  if (disposed || seq !== followSeq) return;
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
  if (seq !== followSeq) return;
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
      await follow(movieId, title, seq, poll + 1);
  }
}

async function addMovie(item: LookupItem & { kind: 'movie' }): Promise<number | null> {
  const movie = item.media;
  const added = await moviesApi.add(props.slug, {
    tmdbId: movie.tmdbId ?? 0,
    title: movie.title,
    year: movie.year ?? 0,
    qualityProfileId: form.qualityProfileId,
    rootFolderPath: form.rootFolderPath,
    monitored: form.monitored,
    searchForMovie: form.monitored,
  });
  if (form.monitored && added.movieId !== null) {
    result.value = {
      type: 'info',
      text: t('media.films.modal.added_searching', {
        title: movie.title,
        count: props.indexerCount,
      }),
    };
    void follow(added.movieId, movie.title, followSeq);
  } else {
    result.value = {
      type: 'success',
      text: t('media.films.modal.added_not_monitored', { title: movie.title }),
    };
  }
  return added.movieId;
}

async function addSeries(item: LookupItem & { kind: 'series' }): Promise<number | null> {
  const added = await seriesApi.add(props.slug, {
    tvdbId: item.media.tvdbId ?? 0,
    qualityProfileId: form.qualityProfileId,
    rootFolderPath: form.rootFolderPath,
    seriesType: form.seriesType,
    monitor: form.monitor,
    monitored: true,
    seasonFolder: form.seasonFolder,
    searchForMissing: form.searchForMissing,
    tags: [...form.tags],
  });
  result.value = { type: 'success', text: t('media.series.modal.added_success') };
  return added.series.id;
}

function addError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NETWORK') return t(text.value.networkErrorKey);
  if (props.kind === 'movie') return t('media.films.modal.add_error_duplicate');
  const message = error instanceof ApiError ? (error.serverMessage ?? '') : '';
  return t('media.series.modal.add_error_tpl', {
    error: message || t('media.series.modal.error_unknown'),
  });
}

async function add(): Promise<void> {
  const item = selected.value;
  if (item === null) return;
  if (item.kind === 'movie' && (form.qualityProfileId === 0 || form.rootFolderPath === '')) {
    result.value = { type: 'warning', text: t('media.films.modal.pick_quality_folder') };
    return;
  }
  if (item.kind === 'series' && form.rootFolderPath === '') {
    result.value = { type: 'warning', text: t('media.series.add.pick_root_folder') };
    return;
  }
  adding.value = true;
  result.value = { type: 'info', text: t(text.value.addingKey) };
  try {
    const libraryId = item.kind === 'movie' ? await addMovie(item) : await addSeries(item);
    done.value = true;
    results.value = markAdded(results.value ?? [], item.key, libraryId);
    emit('added');
  } catch (error) {
    result.value = { type: 'error', text: addError(error) };
  } finally {
    adding.value = false;
  }
}

// Ouverture : recherche, résultats et formulaire vides.
watch(open, (value) => {
  if (!value) return;
  followSeq++;
  term.value = '';
  results.value = null;
  selected.value = null;
  done.value = false;
  result.value = null;
  searchError.value = false;
  tmdbDetail.value = null;
  form.tags = [];
});
</script>

<template>
  <component
    :is="smAndDown ? VBottomSheet : VDialog"
    v-model="open"
    :max-width="smAndDown ? 'none' : 960"
    scrollable
  >
    <v-card :data-test="testId()">
      <DialogTitle :title="t(text.titleKey)" @close="open = false" />
      <v-card-text ref="body">
        <!-- Étape 1 : recherche et résultats (conservés pendant le formulaire). -->
        <div v-show="selected === null">
          <v-filter-field
            :model-value="term"
            :prepend-inner-icon="msSearch"
            :placeholder="t(text.placeholderKey)"
            :aria-label="t(text.placeholderKey)"
            :loading="searching"
            variant="outlined"
            density="comfortable"
            hide-details
            autofocus
            autocomplete="off"
            :data-test="testId('search')"
            @update:model-value="onInput"
            @keydown.enter="search"
          />

          <AddSuggestions v-if="idle" :type="kind === 'movie' ? 'movie' : 'tv'" @pick="pick" />
          <p v-else-if="searchError" class="text-error text-center py-3">
            {{ t(text.searchErrorKey) }}
          </p>
          <p
            v-else-if="results !== null && results.length === 0"
            class="text-muted text-center py-3"
          >
            {{ t(text.noResultsKey) }}
          </p>
          <div v-else-if="results" class="add-media__results mt-3">
            <div
              v-for="item in results"
              :key="item.key"
              class="add-media__result"
              :class="{ 'add-media__result--exists': item.libraryId !== null }"
              :data-test="testId('result-item')"
            >
              <div class="d-flex ga-3">
                <img
                  v-if="posterUrl(item.media.poster, 'w92')"
                  :src="posterUrl(item.media.poster, 'w92')!"
                  alt=""
                  loading="lazy"
                  class="add-media__poster"
                />
                <div v-else class="add-media__poster add-media__no-poster text-label-small">
                  {{ t('media.films.modal.no_poster') }}
                </div>
                <div class="add-media__body">
                  <div class="d-flex align-center flex-wrap ga-2">
                    <span class="font-weight-medium">{{ item.media.title }}</span>
                    <span v-if="item.media.year" class="text-muted">({{ item.media.year }})</span>
                    <v-chip
                      v-if="item.libraryId !== null"
                      size="x-small"
                      color="success"
                      variant="tonal"
                      :data-test="testId('exists')"
                    >
                      <v-icon :icon="msCheck" start size="12" />{{ t(text.alreadyKey) }}
                    </v-chip>
                    <v-chip v-else-if="statusKey(item)" size="x-small" variant="tonal">{{
                      t(statusKey(item) ?? '')
                    }}</v-chip>
                  </div>
                  <div v-if="details(item).length > 0" class="text-body-small text-muted">
                    {{ details(item).join(' · ') }}
                  </div>
                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      v-for="genre in item.media.genres.slice(0, 3)"
                      :key="genre"
                      size="x-small"
                      variant="tonal"
                      >{{ genre }}</v-chip
                    >
                  </div>
                  <p class="text-body-small text-muted add-media__overview">
                    {{ item.media.overview }}
                  </p>
                </div>
              </div>
              <div class="d-flex justify-end ga-2 mt-2">
                <v-btn
                  v-if="libraryLocation(item, slug)"
                  :to="libraryLocation(item, slug)!"
                  variant="tonal"
                  size="small"
                  :data-test="testId('view')"
                  @click="open = false"
                  >{{ t('common.action.view') }}</v-btn
                >
                <v-btn
                  v-else-if="detailTarget(item)"
                  variant="tonal"
                  size="small"
                  :data-test="testId('view')"
                  @click="tmdbDetail = detailTarget(item)"
                  >{{ t('common.action.view') }}</v-btn
                >
                <v-btn
                  v-if="item.libraryId === null"
                  color="service"
                  variant="flat"
                  size="small"
                  :prepend-icon="msAdd"
                  :data-test="testId('pick')"
                  @click="select(item)"
                  >{{ t('common.action.add') }}</v-btn
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Étape 2 : formulaire d'ajout (maquette B du lot 6) : bandeau du titre,
             réglages en lignes groupées (bibliothèque, suivi), compte rendu. -->
        <div v-if="selected" :data-test="testId('form')">
          <div class="add-form__hero">
            <img
              v-if="posterUrl(selected.media.poster, 'w185')"
              :src="posterUrl(selected.media.poster, 'w185')!"
              alt=""
              class="add-form__poster"
            />
            <div class="add-media__body">
              <div class="text-title-medium">{{ itemLabel(selected) }}</div>
              <div v-if="details(selected).length > 0" class="text-body-small text-muted">
                {{ details(selected).join(' · ') }}
              </div>
              <p class="text-body-small text-muted add-media__overview">
                {{ selected.media.overview }}
              </p>
            </div>
          </div>

          <template v-if="!done">
            <div class="add-form__section">{{ t('media.add.section_library') }}</div>
            <div class="add-form__row">
              <span class="add-form__icon"><v-icon :icon="msFolder" size="18" /></span>
              <span class="add-form__label">{{ t(text.folderKey) }}</span>
              <v-select
                v-model="form.rootFolderPath"
                :items="folderItems"
                :aria-label="t(text.folderKey)"
                :loading="config.isPending.value"
                density="compact"
                variant="outlined"
                hide-details
                class="add-form__control"
              />
            </div>
            <div class="add-form__row">
              <span class="add-form__icon"><v-icon :icon="msTune" size="18" /></span>
              <span class="add-form__label">{{ t(text.profileKey) }}</span>
              <v-select
                v-model="form.qualityProfileId"
                :items="profileItems"
                :aria-label="t(text.profileKey)"
                :loading="config.isPending.value"
                density="compact"
                variant="outlined"
                hide-details
                class="add-form__control"
              />
            </div>
            <div v-if="kind === 'series'" class="add-form__row">
              <span class="add-form__icon"><v-icon :icon="msCategory" size="18" /></span>
              <span class="add-form__label">{{ t('media.series.modal.series_type') }}</span>
              <v-select
                v-model="form.seriesType"
                :items="typeItems"
                :aria-label="t('media.series.modal.series_type')"
                density="compact"
                variant="outlined"
                hide-details
                class="add-form__control"
              />
            </div>

            <div class="add-form__section">{{ t('media.add.section_monitoring') }}</div>
            <div v-if="kind === 'movie'" class="add-form__row">
              <span class="add-form__icon"><v-icon :icon="msBookmark" size="18" /></span>
              <span class="add-form__label">{{ t('media.films.modal.search_auto') }}</span>
              <v-switch
                v-model="form.monitored"
                :aria-label="t('media.films.modal.search_auto')"
                color="service"
                density="compact"
                hide-details
                inset
                class="flex-grow-0"
                :data-test="testId('monitored')"
              />
            </div>
            <template v-else>
              <div class="add-form__row">
                <span class="add-form__icon"><v-icon :icon="msBookmark" size="18" /></span>
                <span class="add-form__label">{{ t('media.series.modal.monitor') }}</span>
                <v-select
                  v-model="form.monitor"
                  :items="monitorItems"
                  :aria-label="t('media.series.modal.monitor')"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="add-form__control"
                />
              </div>
              <div class="add-form__row">
                <span class="add-form__icon"><v-icon :icon="msFolderCopy" size="18" /></span>
                <span class="add-form__label">{{ t('media.series.modal.season_folders') }}</span>
                <v-switch
                  v-model="form.seasonFolder"
                  :aria-label="t('media.series.modal.season_folders')"
                  color="service"
                  density="compact"
                  hide-details
                  inset
                  class="flex-grow-0"
                />
              </div>
              <div class="add-form__row">
                <span class="add-form__icon"><v-icon :icon="msSearch" size="18" /></span>
                <span class="add-form__label">{{ t('media.series.modal.search_missing') }}</span>
                <v-switch
                  v-model="form.searchForMissing"
                  :aria-label="t('media.series.modal.search_missing')"
                  color="service"
                  density="compact"
                  hide-details
                  inset
                  class="flex-grow-0"
                  :data-test="testId('search-missing')"
                />
              </div>
              <div v-if="tagItems.length > 0" class="add-form__row add-form__row--wrap">
                <span class="add-form__icon"><v-icon :icon="msSell" size="18" /></span>
                <span class="add-form__label">{{ t('media.series.modal.tags_label') }}</span>
                <v-chip-group v-model="form.tags" multiple column class="add-form__control">
                  <v-chip
                    v-for="tag in tagItems"
                    :key="tag.id"
                    :value="tag.id"
                    size="small"
                    filter
                    variant="outlined"
                    >{{ tag.label }}</v-chip
                  >
                </v-chip-group>
              </div>
            </template>
          </template>

          <!-- Compte rendu de l'ajout : en cours (indicateur), réussi (lien vers la fiche), erreur. -->
          <div
            v-if="result"
            class="add-form__result"
            :class="`text-${result.type === 'info' ? 'service-text' : result.type}`"
            role="status"
            :data-test="testId('result')"
          >
            <v-progress-circular v-if="result.type === 'info'" indeterminate size="20" width="2" />
            <v-icon v-else :icon="RESULT_ICONS[result.type]" size="22" />
            <span class="add-form__result-text">{{ result.text }}</span>
            <v-btn
              v-if="addedLocation"
              :to="addedLocation"
              variant="text"
              size="small"
              color="service-text"
              :data-test="testId('open')"
              @click="open = false"
              >{{ t('common.action.view') }}</v-btn
            >
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <template v-if="selected">
          <v-btn
            variant="text"
            :prepend-icon="msArrowBack"
            :data-test="testId('back')"
            @click="backToResults"
            >{{ t('common.action.back') }}</v-btn
          >
          <v-spacer />
          <v-btn
            v-if="!done"
            color="service"
            variant="flat"
            :prepend-icon="msAdd"
            :loading="adding"
            :data-test="testId('confirm')"
            @click="add"
            >{{ t(text.confirmKey) }}</v-btn
          >
        </template>
        <template v-else>
          <v-spacer />
          <v-btn variant="text" @click="open = false">{{ t('common.action.close') }}</v-btn>
        </template>
      </v-card-actions>
      <TmdbDetailDialog v-model="tmdbDetail" inline-add @add="addFromDetail" />
    </v-card>
  </component>
</template>

<style scoped>
.add-media__results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.add-media__result {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
}
.add-media__result--exists .add-media__poster,
.add-media__result--exists .add-media__body {
  opacity: 0.6;
}
.add-media__poster {
  flex-shrink: 0;
  width: 70px;
  height: 105px;
  border-radius: 6px;
  object-fit: cover;
}
.add-media__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.add-media__body {
  min-width: 0;
  flex: 1;
}
.add-media__overview {
  margin: 4px 0 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}
.add-form__hero {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: -4px -4px 8px;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(var(--v-theme-service), 0.16), transparent);
}
.add-form__poster {
  flex-shrink: 0;
  width: 64px;
  height: 96px;
  border-radius: 6px;
  object-fit: cover;
}
.add-form__section {
  margin: 16px 0 4px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}
.add-form__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.add-form__icon {
  display: grid;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  color: rgb(var(--v-theme-service-text));
  background: rgba(var(--v-theme-service), 0.14);
}
.add-form__label {
  flex: 1;
  min-width: 0;
}
.add-form__control {
  flex: 0 1 280px;
  min-width: 0;
}
.add-form__result {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid currentColor;
  border-radius: 12px;
}
.add-form__result-text {
  flex: 1;
  color: rgb(var(--v-theme-on-surface));
}
@media (max-width: 599px) {
  .add-form__row--wrap,
  .add-form__row:has(.v-select) {
    flex-wrap: wrap;
  }
  .add-form__row:has(.v-select) .add-form__control,
  .add-form__row--wrap .add-form__control {
    flex: 1 1 100%;
  }
}
@media (max-width: 599px) {
  .add-media__results {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
