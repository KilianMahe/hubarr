<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout d'une série (`#modal-add-serie` d'origine) : recherche différée
// (400 ms, 2 caractères), 20 résultats (déjà dans Sonarr = grisés), formulaire
// au-dessus des résultats : profil (celui de l'instance présélectionné), dossier
// racine, type (« animé » si la recherche le dit), épisodes suivis, dossiers par
// saison, recherche des manquants, étiquettes. Après l'ajout, la bibliothèque
// est relue (l'original rechargeait la page).
import {
  SERIES_ADD_MONITOR,
  SERIES_TYPES,
  type Series,
  type SeriesType,
  type TmdbCard,
} from '@hubarr/shared';
import { mdiCheck, mdiMagnify } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { ApiError } from '../../app/api/client';
import AddSuggestions from '../../components/AddSuggestions.vue';
import { posterUrl } from '../movies/movie-display';
import { seriesApi, seriesKeys } from './series-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ slug: string; defaultQualityProfileId: number | null }>();
const emit = defineEmits<{ added: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

const term = ref('');
const searching = ref(false);
const searchError = ref(false);
const results = ref<Series[] | null>(null);
const selected = ref<Series | null>(null);
interface AddForm {
  qualityProfileId: number;
  rootFolderPath: string;
  seriesType: SeriesType;
  monitor: (typeof SERIES_ADD_MONITOR)[number];
  seasonFolder: boolean;
  searchForMissing: boolean;
  tags: number[];
}
const form = reactive<AddForm>({
  qualityProfileId: 0,
  rootFolderPath: '',
  seriesType: 'standard',
  monitor: 'all',
  seasonFolder: true,
  searchForMissing: false,
  tags: [],
});
const result = ref<{ type: 'info' | 'success' | 'error' | 'warning'; text: string } | null>(null);
const adding = ref(false);

const config = useQuery({
  queryKey: computed(() => seriesKeys.config(props.slug)),
  queryFn: ({ signal }) => seriesApi.config(props.slug, signal),
  enabled: open,
  staleTime: 60_000,
});
const profileItems = computed(() =>
  (config.data.value?.qualityProfiles ?? []).map((p) => ({ value: p.id, title: p.name })),
);
const folderItems = computed(() => (config.data.value?.rootFolders ?? []).map((f) => f.path));
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
    const preferred = value.qualityProfiles.find((p) => p.id === props.defaultQualityProfileId);
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
    const found = await seriesApi.lookup(props.slug, value);
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

function select(series: Series): void {
  if (series.id !== null) return;
  selected.value = series;
  form.seriesType = series.seriesType === 'anime' ? 'anime' : 'standard';
  result.value = null;
}

/** Tendance TMDB choisie dans l'état vide (V16) : recherche du titre, puis présélection. */
async function pick(card: TmdbCard): Promise<void> {
  term.value = card.title;
  await search();
  const match = results.value?.find((series) => series.tmdbId === card.id && series.id === null);
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
const label = (series: Series) => (series.year ? `${series.title} (${series.year})` : series.title);

function statusKey(series: Series): string | null {
  if (series.status === 'ended') return 'media.series.status.ended';
  if (series.status === 'continuing') return 'media.series.status.continuing';
  return null;
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
});

// ── Ajout ───────────────────────────────────────────────────────────────────

async function add(): Promise<void> {
  const series = selected.value;
  const tvdbId = series?.tvdbId ?? null;
  if (series === null || tvdbId === null) return;
  if (form.rootFolderPath === '') {
    result.value = { type: 'warning', text: t('media.series.add.pick_root_folder') };
    return;
  }
  adding.value = true;
  result.value = { type: 'info', text: t('media.series.modal.adding') };
  try {
    const added = await seriesApi.add(props.slug, {
      tvdbId,
      qualityProfileId: form.qualityProfileId,
      rootFolderPath: form.rootFolderPath,
      seriesType: form.seriesType,
      monitor: form.monitor,
      monitored: true,
      seasonFolder: form.seasonFolder,
      searchForMissing: form.searchForMissing,
      tags: [...form.tags],
    });
    selected.value = null;
    // La série apparaît désormais comme « déjà ajoutée ».
    results.value = (results.value ?? []).map((item) =>
      item.tvdbId === tvdbId ? { ...item, id: added.series.id ?? 0 } : item,
    );
    result.value = { type: 'success', text: t('media.series.modal.added_success') };
    emit('added');
  } catch (error) {
    const network = error instanceof ApiError && error.code === 'NETWORK';
    const message = error instanceof ApiError ? (error.serverMessage ?? '') : '';
    result.value = {
      type: 'error',
      text: network
        ? t('media.series.modal.network_error')
        : t('media.series.modal.add_error_tpl', {
            error: message || t('media.series.modal.error_unknown'),
          }),
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
    <v-card data-test="add-series">
      <v-card-title class="text-title-large pt-4">{{
        t('media.series.modal.add_title')
      }}</v-card-title>
      <v-card-text>
        <v-filter-field
          :model-value="term"
          :prepend-inner-icon="mdiMagnify"
          :placeholder="t('media.series.modal.search_placeholder')"
          :aria-label="t('media.series.modal.search_placeholder')"
          :loading="searching"
          variant="outlined"
          density="comfortable"
          hide-details
          autofocus
          autocomplete="off"
          data-test="add-series-search"
          @update:model-value="onInput"
          @keydown.enter="search"
        />

        <v-card
          v-if="selected || result"
          variant="tonal"
          color="service-text"
          class="my-4 pa-3"
          data-test="add-series-form"
        >
          <template v-if="selected">
            <div class="text-title-medium mb-3">{{ label(selected) }}</div>
            <v-row density="compact">
              <v-col cols="12" sm="6" md="4">
                <v-select
                  v-model="form.qualityProfileId"
                  :items="profileItems"
                  :label="t('media.series.modal.quality_profile')"
                  :loading="config.isPending.value"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <v-select
                  v-model="form.rootFolderPath"
                  :items="folderItems"
                  :label="t('media.series.modal.root_folder')"
                  :loading="config.isPending.value"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="6" md="2">
                <v-select
                  v-model="form.seriesType"
                  :items="typeItems"
                  :label="t('media.series.modal.series_type')"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="6" md="2">
                <v-select
                  v-model="form.monitor"
                  :items="monitorItems"
                  :label="t('media.series.modal.monitor')"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
            </v-row>
            <div class="d-flex flex-wrap align-center ga-4 mt-2">
              <v-checkbox
                v-model="form.seasonFolder"
                :label="t('media.series.modal.season_folders')"
                density="compact"
                hide-details
                color="service"
              />
              <v-checkbox
                v-model="form.searchForMissing"
                :label="t('media.series.modal.search_missing')"
                density="compact"
                hide-details
                color="service"
                data-test="add-series-search-missing"
              />
            </div>
            <div v-if="(config.data.value?.tags ?? []).length > 0" class="mt-2">
              <span class="text-body-small mr-2">{{ t('media.series.modal.tags_label') }}</span>
              <v-chip-group v-model="form.tags" multiple column>
                <v-chip
                  v-for="tag in config.data.value?.tags ?? []"
                  :key="tag.id"
                  :value="tag.id"
                  size="small"
                  filter
                  variant="outlined"
                  >{{ tag.label }}</v-chip
                >
              </v-chip-group>
            </div>
            <div class="d-flex justify-end mt-2">
              <v-btn
                color="success"
                variant="flat"
                :loading="adding"
                data-test="add-series-confirm"
                @click="add"
                >{{ t('media.series.modal.add_button') }}</v-btn
              >
            </div>
          </template>
          <v-alert
            v-if="result"
            :type="result.type"
            variant="tonal"
            density="compact"
            :class="{ 'mt-3': selected }"
            data-test="add-series-result"
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

        <AddSuggestions v-if="idle" type="tv" @pick="pick" />
        <p v-else-if="searchError" class="text-error text-center py-3">
          {{ t('media.series.modal.network_error') }}
        </p>
        <p v-else-if="results !== null && results.length === 0" class="text-muted text-center py-3">
          {{ t('media.series.modal.no_results') }}
        </p>
        <div v-else-if="results" class="add-series__results mt-3">
          <button
            v-for="series in results"
            :key="series.tvdbId ?? series.title"
            type="button"
            class="add-series__result"
            :class="{
              'add-series__result--exists': series.id !== null,
              'add-series__result--selected': selected?.tvdbId === series.tvdbId,
            }"
            :disabled="series.id !== null"
            data-test="add-series-result-item"
            @click="select(series)"
          >
            <img
              v-if="series.poster"
              :src="posterUrl(series.poster, 'w92') ?? undefined"
              alt=""
              loading="lazy"
              class="add-series__poster"
            />
            <div v-else class="add-series__poster add-series__no-poster" />
            <div class="add-series__body">
              <div class="d-flex align-center flex-wrap ga-2">
                <span class="font-weight-medium text-truncate">{{ series.title }}</span>
                <span v-if="series.year" class="text-muted">({{ series.year }})</span>
                <v-chip v-if="series.id !== null" size="x-small" color="success" variant="tonal">
                  <v-icon :icon="mdiCheck" start size="12" />{{
                    t('media.series.modal.already_added')
                  }}
                </v-chip>
                <v-chip v-else-if="statusKey(series)" size="x-small" variant="tonal">{{
                  t(statusKey(series) ?? '')
                }}</v-chip>
              </div>
              <div class="text-body-small text-muted">
                {{ series.network ?? '' }}
                <template v-if="series.seasonCount">
                  · {{ t('media.series.status.season_tpl', { count: series.seasonCount }) }}
                </template>
              </div>
              <div class="d-flex flex-wrap ga-1 mt-1">
                <v-chip
                  v-for="genre in series.genres.slice(0, 4)"
                  :key="genre"
                  size="x-small"
                  variant="tonal"
                  >{{ genre }}</v-chip
                >
              </div>
              <p class="text-body-small text-muted add-series__overview">{{ series.overview }}</p>
            </div>
          </button>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('media.series.detail.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </component>
</template>

<style scoped>
.add-series__results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.add-series__result {
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
.add-series__result:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.add-series__result--selected {
  border-color: rgb(var(--v-theme-service));
  background: rgba(var(--v-theme-service), 0.1);
}
.add-series__result--exists {
  opacity: 0.5;
  cursor: not-allowed;
}
.add-series__poster {
  flex-shrink: 0;
  width: 60px;
  height: 90px;
  border-radius: 6px;
  object-fit: cover;
}
.add-series__no-poster {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.add-series__body {
  min-width: 0;
  flex: 1;
}
.add-series__overview {
  margin: 4px 0 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
@media (max-width: 599px) {
  .add-series__results {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
