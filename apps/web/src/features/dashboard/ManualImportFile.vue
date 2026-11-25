<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Un fichier du téléchargement dans l'import manuel : case « importer »,
// motifs de refus, puis la correspondance à corriger : film (Radarr) ou série,
// saison et épisodes (Sonarr), qualité, langues et groupe de release. Films et
// séries se cherchent dans la bibliothèque de l'instance.
import { FILE_LANGUAGE_CHOICES, type ArrNamedItem } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { msWarningFill } from '../../components/symbols';
import { moviesApi, moviesKeys } from '../movies/movies-api';
import { seriesApi, seriesKeys } from '../series/series-api';
import { episodeCode, rowReady, type ArrService, type ImportRow } from './manual-import';

const props = defineProps<{ service: ArrService; slug: string }>();
const row = defineModel<ImportRow>('row', { required: true });
const { t } = useI18n();
const format = useFormat();

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PER_PAGE = '50';

function update(changes: Partial<ImportRow>): void {
  row.value = { ...row.value, ...changes };
}

const ready = computed(() => rowReady(row.value, props.service));

// ── Recherche d'un film ou d'une série ──────────────────────────────────────

const search = ref<string | undefined>('');
const term = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    term.value = (value ?? '').trim();
  }, SEARCH_DEBOUNCE_MS);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const params = () => new URLSearchParams({ q: term.value, per_page: SEARCH_PER_PAGE });
const movies = useQuery({
  queryKey: computed(() => moviesKeys.library(props.slug, `manual-import:${term.value}`)),
  queryFn: ({ signal }) => moviesApi.library(props.slug, params(), signal),
  enabled: computed(() => props.service === 'radarr' && term.value !== ''),
});
const series = useQuery({
  queryKey: computed(() => seriesKeys.library(props.slug, `manual-import:${term.value}`)),
  queryFn: ({ signal }) => seriesApi.library(props.slug, params(), signal),
  enabled: computed(() => props.service === 'sonarr' && term.value !== ''),
});

interface MediaChoice {
  id: number;
  title: string;
  year: number | null;
}
const mediaLabel = (item: MediaChoice) =>
  item.year === null ? item.title : `${item.title} (${item.year})`;
const mediaValue = computed<MediaChoice | null>(() =>
  props.service === 'radarr'
    ? row.value.movie
    : row.value.series === null
      ? null
      : { ...row.value.series, year: null },
);
/** Résultats de la recherche, avec le choix courant en tête. */
const mediaItems = computed<MediaChoice[]>(() => {
  const current = mediaValue.value;
  const found =
    props.service === 'radarr'
      ? (movies.data.value?.items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          year: item.year,
        }))
      : (series.data.value?.items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          year: item.year,
        }));
  return [
    ...(current === null ? [] : [current]),
    ...found.filter((item) => item.id !== current?.id),
  ];
});
const searching = computed(() =>
  props.service === 'radarr' ? movies.isFetching.value : series.isFetching.value,
);

function pickMedia(item: MediaChoice | null): void {
  if (props.service === 'radarr') {
    update({ movie: item, selected: item !== null && row.value.qualityId !== null });
    return;
  }
  if (item?.id === row.value.series?.id) return;
  // Autre série : saison et épisodes sont à choisir à nouveau.
  update({
    series: item === null ? null : { id: item.id, title: item.title },
    seasonNumber: null,
    episodeIds: [],
    episodeLabels: [],
  });
}

// ── Saison et épisodes (Sonarr) ─────────────────────────────────────────────

const seriesId = computed(() => row.value.series?.id ?? 0);
const episodes = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.slug, seriesId.value, 'episodes')),
  queryFn: ({ signal }) => seriesApi.episodes(props.slug, seriesId.value, signal),
  enabled: computed(() => props.service === 'sonarr' && seriesId.value > 0),
});
const seasonItems = computed(() =>
  [...new Set((episodes.data.value ?? []).map((episode) => episode.seasonNumber))]
    .sort((a, b) => a - b)
    .map((season) => ({
      value: season,
      title:
        season === 0
          ? t('dashboard.queue.manage.specials')
          : t('dashboard.queue.manage.season_n', { n: season }),
    })),
);
const episodeItems = computed(() => {
  // Avant le chargement de la série : les épisodes reconnus par Sonarr.
  if (episodes.data.value === undefined) {
    return row.value.episodeIds.map((id, index) => ({
      value: id,
      title: row.value.episodeLabels[index] ?? String(id),
    }));
  }
  return episodes.data.value
    .filter((episode) => episode.seasonNumber === row.value.seasonNumber)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((episode) => ({
      value: episode.id,
      title: `${episodeCode(episode.seasonNumber, episode.episodeNumber)}${episode.title ? ` — ${episode.title}` : ''}`,
    }));
});
function pickSeason(season: number | null): void {
  if (season === row.value.seasonNumber) return;
  update({ seasonNumber: season, episodeIds: [], episodeLabels: [] });
}
function pickEpisodes(ids: number[]): void {
  update({ episodeIds: ids, selected: ids.length > 0 && row.value.qualityId !== null });
}

// ── Qualité et langues ──────────────────────────────────────────────────────

const qualities = useQuery({
  queryKey: computed(() =>
    props.service === 'radarr'
      ? moviesKeys.qualityDefinitions(props.slug)
      : seriesKeys.qualityDefinitions(props.slug),
  ),
  queryFn: ({ signal }) =>
    props.service === 'radarr'
      ? moviesApi.qualityDefinitions(props.slug, signal)
      : seriesApi.qualityDefinitions(props.slug, signal),
  staleTime: 5 * 60_000,
});
const qualityItems = computed(() => {
  const list = qualities.data.value ?? [];
  const current = row.value.quality;
  const all =
    current !== null && !list.some((quality) => quality.id === current.id)
      ? [current, ...list]
      : list;
  return all.map((quality) => ({ value: quality.id, title: quality.name }));
});
const languageItems = computed<ArrNamedItem[]>(() => [
  ...FILE_LANGUAGE_CHOICES,
  ...row.value.languages.filter(
    (language) => !FILE_LANGUAGE_CHOICES.some((choice) => choice.id === language.id),
  ),
]);
function pickLanguages(ids: number[]): void {
  update({
    languages: ids.flatMap((id) => {
      const language = languageItems.value.find((choice) => choice.id === id);
      return language === undefined ? [] : [{ ...language }];
    }),
  });
}
</script>

<template>
  <div class="manual-file" :class="{ 'manual-file--off': !row.selected }" data-test="manual-file">
    <div class="d-flex align-start ga-2">
      <v-checkbox-btn
        :model-value="row.selected"
        :disabled="!ready"
        :aria-label="t('dashboard.queue.manage.select_file', { name: row.name })"
        density="compact"
        data-test="manual-file-select"
        @update:model-value="update({ selected: Boolean($event) })"
      />
      <div class="flex-grow-1 min-w-0 pt-1">
        <div class="text-body-medium font-weight-medium manual-file__name">{{ row.name }}</div>
        <div class="text-body-small text-muted">{{ format.bytes(row.size) }}</div>
        <div
          v-for="(reason, index) in row.rejections"
          :key="index"
          class="text-body-small text-warning"
          data-test="manual-file-rejection"
        >
          <v-icon :icon="msWarningFill" size="12" /> {{ reason }}
        </div>
      </div>
    </div>

    <v-row density="compact" class="mt-1">
      <v-col cols="12" :md="service === 'radarr' ? 12 : 6">
        <v-autocomplete
          v-model:search="search"
          :model-value="mediaValue"
          :items="mediaItems"
          :item-title="mediaLabel"
          item-value="id"
          return-object
          no-filter
          :loading="searching"
          :label="
            t(
              service === 'radarr'
                ? 'dashboard.queue.manage.movie'
                : 'dashboard.queue.manage.series',
            )
          "
          :placeholder="t('dashboard.queue.manage.search_library')"
          :no-data-text="t('dashboard.queue.manage.search_empty')"
          density="compact"
          variant="outlined"
          hide-details
          data-test="manual-file-media"
          @update:model-value="pickMedia($event as MediaChoice | null)"
        />
      </v-col>
      <template v-if="service === 'sonarr'">
        <v-col cols="4" md="2">
          <v-select
            :model-value="row.seasonNumber"
            :items="seasonItems"
            :label="t('dashboard.queue.manage.season')"
            :disabled="row.series === null"
            :loading="episodes.isFetching.value"
            density="compact"
            variant="outlined"
            hide-details
            data-test="manual-file-season"
            @update:model-value="pickSeason($event)"
          />
        </v-col>
        <v-col cols="8" md="4">
          <v-select
            :model-value="row.episodeIds"
            :items="episodeItems"
            :label="t('dashboard.queue.manage.episodes')"
            :disabled="row.seasonNumber === null"
            multiple
            chips
            closable-chips
            density="compact"
            variant="outlined"
            hide-details
            data-test="manual-file-episodes"
            @update:model-value="pickEpisodes($event)"
          />
        </v-col>
      </template>
      <v-col cols="12" sm="4">
        <v-select
          :model-value="row.qualityId"
          :items="qualityItems"
          :label="t('dashboard.queue.manage.quality')"
          :loading="qualities.isFetching.value"
          density="compact"
          variant="outlined"
          hide-details
          data-test="manual-file-quality"
          @update:model-value="update({ qualityId: $event })"
        />
      </v-col>
      <v-col cols="12" sm="5">
        <v-select
          :model-value="row.languages.map((language) => language.id)"
          :items="languageItems"
          item-title="name"
          item-value="id"
          :label="t('dashboard.queue.manage.languages')"
          multiple
          chips
          density="compact"
          variant="outlined"
          hide-details
          data-test="manual-file-languages"
          @update:model-value="pickLanguages($event)"
        />
      </v-col>
      <v-col cols="12" sm="3">
        <v-text-field
          :model-value="row.releaseGroup"
          :label="t('dashboard.queue.manage.release_group')"
          density="compact"
          variant="outlined"
          hide-details
          data-test="manual-file-group"
          @update:model-value="update({ releaseGroup: $event })"
        />
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.manual-file {
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
}
.manual-file--off {
  opacity: 0.75;
}
.manual-file__name {
  overflow-wrap: anywhere;
}
.min-w-0 {
  min-width: 0;
}
</style>
