<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'affiche d'une série (vues grille et mur), sur `PosterCard` : puce
// d'état en clair (épisodes présents / attendus, couleur de l'état), barre de
// progression des épisodes, titre et saisons (« animé » en sous-titre) ; badge
// de sous-titres Bazarr et « Vu » / « x/y vus » (Tracearr, lot 7). Un clic ouvre la fiche ; le marque-page bascule le
// suivi (`hover-monitor-btn`).
import type { SeriesLibraryItem } from '@hubarr/shared';
import { msBookmark, msBookmarkFill } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PosterCard from '../../components/ds/PosterCard.vue';
import WatchedBadge from '../activity/WatchedBadge.vue';
import { watchedProgress } from '../activity/watched';
import SubtitleBadge from '../bazarr/SubtitleBadge.vue';
import type { SubtitleBadgeStatus } from '../bazarr/bazarr-api';
import { posterUrl } from '../movies/movie-display';
import {
  SERIES_STATE_COLORS,
  airingStatusKey,
  hasProgressBar,
  progressWidth,
  seriesDisplayState,
  seriesStateTitle,
} from './library';

const props = defineProps<{
  series: SeriesLibraryItem;
  selectMode: boolean;
  selected: boolean;
  /** Mur d'affiches : pas de légende sous l'affiche. */
  compact?: boolean;
  /** Badge de sous-titres Bazarr (`null` : aucun). */
  subtitle?: SubtitleBadgeStatus;
  /** Épisodes vus par l'utilisateur connecté, hors spéciaux (Tracearr). */
  watchedEpisodes?: number;
}>();
const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
  open: [];
  monitor: [];
  subtitles: [];
}>();
const { t } = useI18n();

const status = computed(() => {
  const state = seriesDisplayState(props.series);
  const airing = airingStatusKey(props.series.status);
  return {
    label:
      props.series.episodeCount > 0
        ? `${props.series.episodeFileCount}/${props.series.episodeCount}`
        : airing
          ? t(airing)
          : '—',
    color: SERIES_STATE_COLORS[state],
    title: seriesStateTitle(t, props.series),
  };
});
const subtitleText = computed(() =>
  [
    t('media.series.status.season_tpl', { count: props.series.seasonCount }),
    props.series.seriesType === 'anime' ? t('media.series.status.anime') : null,
  ]
    .filter((part) => part !== null)
    .join(' · '),
);
const watched = computed(() =>
  watchedProgress(props.watchedEpisodes ?? 0, props.series.episodeCount),
);
const poster = computed(() => posterUrl(props.series.poster, props.compact ? 'w185' : 'w342'));
const monitorLabel = computed(() =>
  t(props.series.monitored ? 'media.series.detail.unmonitor' : 'media.series.detail.monitor'),
);
</script>

<template>
  <PosterCard
    :title="series.title"
    :subtitle="subtitleText"
    :image="poster"
    :status="status"
    :progress="hasProgressBar(series) ? progressWidth(series) : null"
    :compact="compact"
    :select-mode="selectMode"
    :selected="selected"
    @open="emit('open')"
    @select="emit('select', $event)"
  >
    <template v-if="subtitle || watched" #badges>
      <SubtitleBadge
        v-if="subtitle"
        :id="series.id"
        kind="series"
        :status="subtitle"
        @search="emit('subtitles')"
      />
      <WatchedBadge v-if="watched" overlay :progress="watched" />
    </template>
    <template #action>
      <component
        :is="selectMode ? 'span' : 'button'"
        class="poster-monitor"
        :type="selectMode ? undefined : 'button'"
        :aria-pressed="selectMode ? undefined : series.monitored"
        :aria-label="monitorLabel"
        :title="monitorLabel"
        data-test="series-card-monitor"
        @click="!selectMode && emit('monitor')"
      >
        <v-icon :icon="series.monitored ? msBookmarkFill : msBookmark" size="20" />
      </component>
    </template>
  </PosterCard>
</template>
