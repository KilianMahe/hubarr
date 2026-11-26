<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Saisons et épisodes de la fiche série (maquette B du lot 6) : une saison
// ouverte à la fois (la plus récente au départ, hors spéciaux). En-tête de
// saison en ligne de réglage : pastille « S2 » à la couleur du service,
// libellé, épisodes présents et progression, suivi, recherche, puis les autres
// actions dans un menu (recherche interactive, fichiers, renommage,
// historique). Ligne d'épisode : suivi (Maj+clic pour une plage), pastille
// « E06 » à la couleur de son état (présent, en téléchargement avec sa
// progression, manquant, à venir, non suivi),
// titre, puis date, état, qualité et score ; infos média, recherche,
// recherche interactive, suppression du fichier. Le suivi d'une saison ou
// d'un épisode est désactivé quand la série n'est pas suivie (comme l'original).
// Avec Tracearr (lot 7) : « x/y vus » par saison et marque « Vu » par épisode.
import type { Episode, EpisodeFile } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  msBookmark,
  msBookmarkFill,
  msCheck,
  msCheckCircleFill,
  msDelete,
  msEditSquare,
  msFileCopy,
  msHistory,
  msInfo,
  msKeyboardArrowDown,
  msManageSearch,
  msMoreVert,
  msSearch,
} from '../../components/symbols';
import { episodeKey, watchedCount, type WatchedEpisodes } from '../activity/watched';
import { seriesSize } from './library';
import {
  EPISODE_STATUS_COLORS,
  episodeStatus,
  initiallyOpenSeason,
  mediaInfoLines,
  monitorRange,
  seasonGroups,
  seasonLabel,
  type SearchState,
} from './series-detail';
import { pageReadOnly, vWrite } from '../../app/access';

const props = defineProps<{
  episodes: Episode[];
  files: EpisodeFile[];
  seriesMonitored: boolean;
  /** État des recherches en cours (clé : `e<id>` ou `s<numéro>`). */
  searches: Record<string, SearchState>;
  /** Épisodes vus par l'utilisateur connecté (Tracearr), `null` : aucun. */
  watched?: WatchedEpisodes | null;
  /** Épisodes dans la file de Sonarr et leur progression (`null` : inconnue). */
  queued?: ReadonlyMap<number, number | null>;
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
const now = Date.now();
function statusOf(episode: Episode) {
  const progress = props.queued?.get(episode.id);
  const status = episodeStatus(episode, now, props.queued?.has(episode.id) === true);
  return {
    color: EPISODE_STATUS_COLORS[status],
    label:
      status === 'downloading' && progress !== undefined && progress !== null
        ? t('media.series_detail.episode.status_downloading_progress', { progress })
        : t(`media.series_detail.episode.status_${status}`),
  };
}
const pad = (value: number) => String(value).padStart(2, '0');
const seasonWatched = (season: number) => watchedCount(props.watched ?? null, season);
const isWatched = (episode: Episode) =>
  props.watched?.has(episodeKey(episode.seasonNumber, episode.episodeNumber)) === true;
</script>

<template>
  <div class="series-seasons" data-test="series-seasons">
    <p v-if="groups.length === 0" class="text-muted text-center py-4">
      {{ t('media.series.detail.no_episodes') }}
    </p>
    <section
      v-for="group in groups"
      :key="group.seasonNumber"
      class="season"
      :class="{ 'season--open': openSeason === group.seasonNumber }"
      :data-season="group.seasonNumber"
    >
      <div class="season__head">
        <button
          type="button"
          class="season__toggle"
          :aria-expanded="openSeason === group.seasonNumber"
          @click="toggleSeason(group.seasonNumber)"
        >
          <span class="season__badge">{{
            group.seasonNumber === 0 ? 'SP' : `S${group.seasonNumber}`
          }}</span>
          <span class="season__text">
            <span class="season__label">{{ seasonLabel(t, group.seasonNumber) }}</span>
            <span class="season__sub">
              <span>{{
                t('media.series_detail.season.episode_count_tpl', {
                  files: group.files,
                  total: group.total,
                })
              }}</span>
              <span
                v-if="seasonWatched(group.seasonNumber) > 0"
                class="episode__watched text-success"
                data-test="season-watched"
                ><v-icon :icon="msCheckCircleFill" size="14" />{{
                  t('activity.watched.some', {
                    watched: Math.min(seasonWatched(group.seasonNumber), group.total),
                    total: group.total,
                  })
                }}</span
              >
              <span class="season__bar">
                <span
                  class="season__bar-fill"
                  :class="group.percent === 100 ? 'bg-success' : 'bg-service'"
                  :style="{ width: `${group.percent}%` }"
                />
              </span>
            </span>
          </span>
        </button>
        <v-btn
          :icon="group.monitored ? msBookmarkFill : msBookmark"
          :color="group.monitored ? 'service-text' : 'muted'"
          variant="text"
          size="small"
          :disabled="!seriesMonitored || pageReadOnly"
          :aria-pressed="group.monitored"
          :aria-label="monitorTitle(group.monitored)"
          :title="monitorTitle(group.monitored)"
          data-test="season-monitor"
          @click="emit('seasonMonitor', group.seasonNumber, !group.monitored)"
        />
        <v-btn
          v-write
          :icon="searches[`s${group.seasonNumber}`] === 'done' ? msCheck : msSearch"
          :loading="searches[`s${group.seasonNumber}`] === 'running'"
          variant="tonal"
          rounded="lg"
          size="small"
          color="service-text"
          :aria-label="t('media.series.detail.search_season_title')"
          :title="t('media.series.detail.search_season_title')"
          data-test="season-search"
          @click="emit('searchSeason', group.seasonNumber)"
        />
        <v-menu location="bottom end">
          <template #activator="{ props: menu }">
            <v-btn
              v-bind="menu"
              :icon="msMoreVert"
              variant="text"
              size="small"
              :aria-label="t('common.action.more_actions')"
              :title="t('common.action.more_actions')"
              data-test="season-menu"
            />
          </template>
          <v-list density="compact">
            <v-list-item
              v-write
              :prepend-icon="msManageSearch"
              :title="t('media.series.detail.season_interactive_search')"
              data-test="season-interactive"
              @click="emit('interactiveSeason', group.seasonNumber)"
            />
            <v-list-item
              v-write
              :prepend-icon="msFileCopy"
              :title="t('media.series.detail.manage_files')"
              data-test="season-files"
              @click="emit('seasonFiles', group.seasonNumber)"
            />
            <v-list-item
              v-write
              :prepend-icon="msEditSquare"
              :title="t('media.series.detail.rename_files')"
              data-test="season-rename"
              @click="emit('seasonRename', group.seasonNumber)"
            />
            <v-list-item
              :prepend-icon="msHistory"
              :title="t('media.series.detail.history')"
              data-test="season-history"
              @click="emit('seasonHistory', group.seasonNumber)"
            />
          </v-list>
        </v-menu>
        <v-btn
          :icon="msKeyboardArrowDown"
          variant="text"
          size="small"
          class="season__chevron"
          :aria-label="seasonLabel(t, group.seasonNumber)"
          :aria-expanded="openSeason === group.seasonNumber"
          tabindex="-1"
          @click="toggleSeason(group.seasonNumber)"
        />
      </div>
      <div v-if="openSeason === group.seasonNumber" class="season__episodes">
        <div
          v-for="episode in group.episodes"
          :key="episode.id"
          class="episode"
          data-test="episode-row"
        >
          <v-btn
            :icon="episode.monitored ? msBookmarkFill : msBookmark"
            :color="episode.monitored ? 'service-text' : 'muted'"
            variant="text"
            size="x-small"
            :disabled="!seriesMonitored || pageReadOnly"
            :aria-pressed="episode.monitored"
            :aria-label="monitorTitle(episode.monitored)"
            :title="monitorTitle(episode.monitored)"
            data-test="episode-monitor"
            @click="onEpisodeMonitor(episode, $event)"
          />
          <span
            class="episode__badge"
            :class="`text-${statusOf(episode).color}`"
            :title="statusOf(episode).label"
            >E{{ pad(episode.episodeNumber) }}</span
          >
          <div class="episode__main">
            <div class="episode__title">{{ episode.title ?? '—' }}</div>
            <div class="episode__meta">
              <span
                v-if="isWatched(episode)"
                class="episode__watched text-success"
                :title="t('activity.watched.title')"
                data-test="episode-watched"
                ><v-icon :icon="msCheckCircleFill" size="16" />{{ t('activity.watched.all') }}</span
              >
              <span v-if="episode.airDate">{{ episode.airDate }}</span>
              <span class="episode__status" :class="`text-${statusOf(episode).color}`">{{
                statusOf(episode).label
              }}</span>
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
                  class="episode__score font-weight-medium"
                  :class="
                    (fileOf(episode)?.customFormatScore ?? 0) > 0 ? 'text-success' : 'text-error'
                  "
                  :title="t('media.series.detail.ep_cf_score_label')"
                  >{{ (fileOf(episode)?.customFormatScore ?? 0) > 0 ? '+' : ''
                  }}{{ fileOf(episode)?.customFormatScore }}</span
                >
              </template>
            </div>
          </div>
          <div class="episode__actions">
            <v-icon
              v-if="episode.hasFile"
              :icon="msInfo"
              size="16"
              class="episode__info"
              :title="infoTip(episode)"
            />
            <v-btn
              v-write
              :icon="searches[`e${episode.id}`] === 'done' ? msCheck : msSearch"
              :loading="searches[`e${episode.id}`] === 'running'"
              variant="text"
              class="episode__action"
              size="small"
              :aria-label="t('media.series.detail.search_bookmark')"
              :title="t('media.series.detail.search_bookmark')"
              data-test="episode-search"
              @click="emit('searchEpisode', episode)"
            />
            <v-btn
              v-write
              :icon="msManageSearch"
              variant="text"
              class="episode__action"
              size="small"
              :aria-label="t('media.series.detail.interactive_search')"
              :title="t('media.series.detail.interactive_search')"
              data-test="episode-interactive"
              @click="emit('interactiveEpisode', episode)"
            />
            <v-btn
              v-if="episode.hasFile"
              v-write
              :icon="msDelete"
              variant="text"
              class="episode__action episode__action--danger"
              size="small"
              :aria-label="t('media.series.detail.delete_file')"
              :title="t('media.series.detail.delete_file')"
              data-test="episode-delete-file"
              @click="emit('deleteFile', episode.episodeFileId)"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.series-seasons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.season {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
}
.season--open {
  border-color: rgba(var(--v-theme-service), 0.5);
}
.season__head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 6px 6px 10px;
}
.season--open .season__head {
  background: linear-gradient(90deg, rgba(var(--v-theme-service), 0.12), transparent);
}
.season__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.season__badge,
.episode__badge {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border-radius: 10px;
  font-weight: 600;
}
.season__badge {
  width: 40px;
  height: 40px;
  color: rgb(var(--v-theme-service-text));
  background: rgba(var(--v-theme-service), 0.16);
}
.season__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.season__label {
  font-weight: 500;
}
.season__sub {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  opacity: 0.8;
}
.season__bar {
  flex: 1;
  max-width: 180px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.season__bar-fill {
  display: block;
  height: 100%;
}
.season__chevron :deep(.v-icon) {
  transition: transform 0.2s;
}
.season--open .season__chevron :deep(.v-icon) {
  transform: rotate(180deg);
}
.season__episodes {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.episode {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 8px;
}
.episode + .episode {
  border-top: 1px solid rgba(var(--v-border-color), 0.06);
}
.episode__badge {
  position: relative;
  width: 40px;
  height: 32px;
  font-size: 0.78rem;
  overflow: hidden;
}
.episode__badge::before {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0.16;
}
.episode__main {
  flex: 1;
  min-width: 0;
}
.episode__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.episode__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.episode__watched {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
}
.episode__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
/* Actions d'un épisode : icônes Material Symbols sans fond, grises au repos,
   à la couleur du service au survol (rouge pour la suppression). */
.episode__action {
  color: rgba(var(--v-theme-on-surface), 0.62);
}
.episode__action:hover,
.episode__action:focus-visible {
  color: rgb(var(--v-theme-service-text));
}
.episode__action--danger:hover,
.episode__action--danger:focus-visible {
  color: rgb(var(--v-theme-error));
}
.episode__info {
  margin-inline: 4px;
  cursor: help;
  opacity: 0.7;
}
@media (max-width: 599px) {
  .season__bar {
    max-width: 80px;
  }
  /* Une seule ligne sous le titre : l'état est porté par la couleur de la pastille. */
  .episode__meta {
    flex-wrap: nowrap;
    overflow: hidden;
    white-space: nowrap;
  }
  .episode__info,
  .episode__status,
  .episode__score {
    display: none;
  }
}
</style>
