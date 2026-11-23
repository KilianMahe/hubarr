<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Saisons et épisodes de la fiche série (`#modal-serie-episodes`) : une saison
// ouverte à la fois (la plus récente au départ, hors spéciaux) ; en-tête de
// saison (suivi, progression, recherche, recherche interactive, fichiers,
// renommage, historique) ; ligne d'épisode (suivi, Maj+clic pour une plage,
// pastille, numéro, titre, date, qualité, score, infos média, recherche,
// recherche interactive, suppression du fichier). Le suivi d'une saison ou
// d'un épisode est désactivé quand la série n'est pas suivie (comme l'original).
import type { Episode, EpisodeFile } from '@hubarr/shared';
import {
  mdiBookmark,
  mdiBookmarkOutline,
  mdiCheck,
  mdiChevronRight,
  mdiDelete,
  mdiFileDocumentMultipleOutline,
  mdiFormTextboxPassword,
  mdiHistory,
  mdiInformationOutline,
  mdiMagnify,
  mdiViewGridOutline,
} from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { seriesSize } from './library';
import {
  episodeDotColor,
  initiallyOpenSeason,
  mediaInfoLines,
  monitorRange,
  seasonGroups,
  seasonLabel,
  type SearchState,
} from './series-detail';

const props = defineProps<{
  episodes: Episode[];
  files: EpisodeFile[];
  seriesMonitored: boolean;
  /** État des recherches en cours (clé : `e<id>` ou `s<numéro>`). */
  searches: Record<string, SearchState>;
}>();
const emit = defineEmits<{
  seasonMonitor: [season: number, monitored: boolean];
  episodeMonitor: [episodeIds: number[], monitored: boolean];
  searchEpisode: [episode: Episode];
  interactiveEpisode: [episode: Episode];
  searchSeason: [season: number];
  interactiveSeason: [season: number];
  seasonFiles: [season: number];
  seasonRename: [season: number];
  seasonHistory: [season: number];
  deleteFile: [fileId: number];
}>();
const { t } = useI18n();

const groups = computed(() => seasonGroups(props.episodes));
const filesById = computed(() => new Map(props.files.map((file) => [file.id, file])));
const openSeason = ref<number | null>(null);
let initialized = false;
watch(
  groups,
  (value) => {
    if (initialized || value.length === 0) return;
    initialized = true;
    openSeason.value = initiallyOpenSeason(value);
  },
  { immediate: true },
);
function toggleSeason(season: number): void {
  openSeason.value = openSeason.value === season ? null : season;
}

// Suivi par Maj+clic : plage depuis le dernier épisode cliqué (ordre affiché).
const orderedIds = computed(() =>
  groups.value.flatMap((group) => group.episodes.map((episode) => episode.id)),
);
let anchor: number | null = null;
function onEpisodeMonitor(episode: Episode, event: MouseEvent): void {
  const monitored = !episode.monitored;
  const ids = event.shiftKey ? monitorRange(orderedIds.value, anchor, episode.id) : [episode.id];
  anchor = episode.id;
  emit('episodeMonitor', ids, monitored);
}

function fileOf(episode: Episode): EpisodeFile | undefined {
  return episode.hasFile ? filesById.value.get(episode.episodeFileId) : undefined;
}
function infoTip(episode: Episode): string {
  const file = fileOf(episode);
  if (file === undefined) return t('media.series.detail.episode_info_none');
  const lines = mediaInfoLines(t, file, seriesSize(t, file.size));
  return lines.length > 0 ? lines.join('\n') : t('media.series.detail.episode_info_none');
}
function monitorTitle(monitored: boolean): string {
  return t(monitored ? 'media.series.detail.unmonitor' : 'media.series.detail.monitor');
}
function searchIcon(key: string): string {
  return props.searches[key] === 'done' ? mdiCheck : mdiMagnify;
}
</script>

<template>
  <div class="series-seasons" data-test="series-seasons">
    <p v-if="groups.length === 0" class="text-muted text-center py-4">
      {{ t('media.series.detail.no_episodes') }}
    </p>
    <v-card
      v-for="group in groups"
      :key="group.seasonNumber"
      variant="outlined"
      class="mb-2"
      :data-season="group.seasonNumber"
    >
      <div class="series-seasons__header">
        <v-btn
          :icon="group.monitored ? mdiBookmark : mdiBookmarkOutline"
          :color="group.monitored ? 'service-text' : 'muted'"
          variant="text"
          size="small"
          :disabled="!seriesMonitored"
          :aria-pressed="group.monitored"
          :aria-label="monitorTitle(group.monitored)"
          :title="monitorTitle(group.monitored)"
          data-test="season-monitor"
          @click="emit('seasonMonitor', group.seasonNumber, !group.monitored)"
        />
        <button
          type="button"
          class="series-seasons__toggle"
          :aria-expanded="openSeason === group.seasonNumber"
          @click="toggleSeason(group.seasonNumber)"
        >
          <v-icon
            :icon="mdiChevronRight"
            size="18"
            class="series-seasons__chevron"
            :class="{ 'series-seasons__chevron--open': openSeason === group.seasonNumber }"
          />
          <span class="font-weight-medium series-seasons__label">{{
            seasonLabel(t, group.seasonNumber)
          }}</span>
          <span class="series-seasons__bar">
            <span
              class="series-seasons__bar-fill"
              :class="group.percent === 100 ? 'bg-success' : 'bg-service'"
              :style="{ width: `${group.percent}%` }"
            />
          </span>
          <span class="text-body-small text-muted">{{ group.files }}/{{ group.total }}</span>
        </button>
        <div class="series-seasons__actions">
          <v-btn
            :icon="searchIcon(`s${group.seasonNumber}`)"
            :loading="searches[`s${group.seasonNumber}`] === 'running'"
            variant="text"
            size="small"
            color="service-text"
            :aria-label="t('media.series.detail.search_season_title')"
            :title="t('media.series.detail.search_season_title')"
            data-test="season-search"
            @click="emit('searchSeason', group.seasonNumber)"
          />
          <v-btn
            :icon="mdiViewGridOutline"
            variant="text"
            size="small"
            :aria-label="t('media.series.detail.season_interactive_search')"
            :title="t('media.series.detail.season_interactive_search')"
            data-test="season-interactive"
            @click="emit('interactiveSeason', group.seasonNumber)"
          />
          <v-btn
            :icon="mdiFileDocumentMultipleOutline"
            variant="text"
            size="small"
            :aria-label="t('media.series.detail.manage_files')"
            :title="t('media.series.detail.manage_files')"
            data-test="season-files"
            @click="emit('seasonFiles', group.seasonNumber)"
          />
          <v-btn
            :icon="mdiFormTextboxPassword"
            variant="text"
            size="small"
            :aria-label="t('media.series.detail.rename_files')"
            :title="t('media.series.detail.rename_files')"
            data-test="season-rename"
            @click="emit('seasonRename', group.seasonNumber)"
          />
          <v-btn
            :icon="mdiHistory"
            variant="text"
            size="small"
            :aria-label="t('media.series.detail.history')"
            :title="t('media.series.detail.history')"
            data-test="season-history"
            @click="emit('seasonHistory', group.seasonNumber)"
          />
        </div>
      </div>
      <div v-if="openSeason === group.seasonNumber" class="series-seasons__episodes">
        <div
          v-for="episode in group.episodes"
          :key="episode.id"
          class="series-seasons__episode"
          data-test="episode-row"
        >
          <v-btn
            :icon="episode.monitored ? mdiBookmark : mdiBookmarkOutline"
            :color="episode.monitored ? 'service-text' : 'muted'"
            variant="text"
            size="x-small"
            :disabled="!seriesMonitored"
            :aria-pressed="episode.monitored"
            :aria-label="monitorTitle(episode.monitored)"
            :title="monitorTitle(episode.monitored)"
            data-test="episode-monitor"
            @click="onEpisodeMonitor(episode, $event)"
          />
          <span class="series-seasons__dot" :class="`bg-${episodeDotColor(episode)}`" />
          <span class="series-seasons__number"
            >E{{ String(episode.episodeNumber).padStart(2, '0') }}</span
          >
          <span class="series-seasons__title">{{ episode.title ?? '—' }}</span>
          <span class="series-seasons__date text-muted">{{ episode.airDate ?? '—' }}</span>
          <template v-if="fileOf(episode)">
            <v-chip
              v-if="fileOf(episode)?.quality"
              size="x-small"
              label
              variant="tonal"
              color="info"
              :title="t('media.series.detail.ep_quality_label')"
              >{{ fileOf(episode)?.quality?.name }}</v-chip
            >
            <span
              v-if="fileOf(episode)?.customFormatScore"
              class="text-body-small font-weight-medium"
              :class="(fileOf(episode)?.customFormatScore ?? 0) > 0 ? 'text-success' : 'text-error'"
              :title="t('media.series.detail.ep_cf_score_label')"
              >{{ (fileOf(episode)?.customFormatScore ?? 0) > 0 ? '+' : ''
              }}{{ fileOf(episode)?.customFormatScore }}</span
            >
          </template>
          <v-icon
            v-if="episode.hasFile"
            :icon="mdiInformationOutline"
            size="16"
            class="series-seasons__info"
            :title="infoTip(episode)"
          />
          <v-btn
            :icon="searchIcon(`e${episode.id}`)"
            :loading="searches[`e${episode.id}`] === 'running'"
            variant="text"
            size="x-small"
            color="service-text"
            :aria-label="t('media.series.detail.search_bookmark')"
            :title="t('media.series.detail.search_bookmark')"
            data-test="episode-search"
            @click="emit('searchEpisode', episode)"
          />
          <v-btn
            :icon="mdiViewGridOutline"
            variant="text"
            size="x-small"
            :aria-label="t('media.series.detail.interactive_search')"
            :title="t('media.series.detail.interactive_search')"
            data-test="episode-interactive"
            @click="emit('interactiveEpisode', episode)"
          />
          <v-btn
            v-if="episode.hasFile"
            :icon="mdiDelete"
            variant="text"
            size="x-small"
            color="error"
            :aria-label="t('media.series.detail.delete_file')"
            :title="t('media.series.detail.delete_file')"
            data-test="episode-delete-file"
            @click="emit('deleteFile', episode.episodeFileId)"
          />
        </div>
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.series-seasons__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  flex-wrap: wrap;
}
.series-seasons__toggle {
  flex: 1 1 220px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  padding: 6px 0;
}
.series-seasons__chevron {
  transition: transform 0.2s;
}
.series-seasons__chevron--open {
  transform: rotate(90deg);
}
.series-seasons__label {
  min-width: 90px;
}
.series-seasons__bar {
  flex: 1;
  max-width: 200px;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.series-seasons__bar-fill {
  display: block;
  height: 100%;
}
.series-seasons__actions {
  display: flex;
  margin-left: auto;
}
.series-seasons__episodes {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.series-seasons__episode {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px;
  font-size: 0.85rem;
  border-top: 1px solid rgba(var(--v-border-color), 0.05);
}
.series-seasons__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.series-seasons__number {
  min-width: 36px;
  font-weight: 600;
  opacity: 0.7;
}
.series-seasons__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-seasons__date {
  min-width: 80px;
  text-align: right;
  font-size: 0.75rem;
}
.series-seasons__info {
  cursor: help;
  opacity: 0.7;
}
@media (max-width: 599px) {
  .series-seasons__date {
    display: none;
  }
}
</style>
