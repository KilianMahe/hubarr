<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ligne dense à vignette (vue « étendue »), sur `MediaListItem` : affiche,
// titre, année · saisons · chaîne · taille, puce de diffusion, « animé »,
// progression des épisodes (plus de synopsis, P5b.1 F2) ; épisodes vus
// (Tracearr, lot 7).
import { formatGb } from '../../app/format';
import type { SeriesLibraryItem } from '@hubarr/shared';
import { msBookmark, msBookmarkFill } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MediaListItem from '../../components/ds/MediaListItem.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import WatchedBadge from '../activity/WatchedBadge.vue';
import { watchedProgress } from '../activity/watched';
import { posterUrl } from '../movies/movie-display';
import {
  AIRING_STATUS_COLORS,
  SERIES_STATE_COLORS,
  airingStatusKey,
  progressWidth,
  seriesDisplayState,
  seriesProgressTitle,
} from './library';
import { pageReadOnly } from '../../app/access';

const props = defineProps<{
  series: SeriesLibraryItem;
  selectMode: boolean;
  selected: boolean;
  /** Épisodes vus par l'utilisateur connecté, hors spéciaux (Tracearr). */
  watchedEpisodes?: number;
}>();
const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
  open: [];
  monitor: [];
}>();
const { t } = useI18n();

const state = computed(() => seriesDisplayState(props.series));
const watched = computed(() =>
  watchedProgress(props.watchedEpisodes ?? 0, props.series.episodeCount),
);
const airing = computed(() => airingStatusKey(props.series.status));
const monitorLabel = computed(() =>
  t(props.series.monitored ? 'media.series.detail.unmonitor' : 'media.series.detail.monitor'),
);
</script>

<template>
  <MediaListItem
    :title="series.title"
    :image="posterUrl(series.poster, 'w92')"
    :select-mode="selectMode"
    :selected="selected"
    class="series-row"
    @open="emit('open')"
    @select="emit('select', $event)"
  >
    <template #meta>
      <span v-if="series.year !== null">{{ series.year }}</span>
      <span>{{ t('media.series.status.season_tpl', { count: series.seasonCount }) }}</span>
      <span v-if="series.network" class="d-none d-sm-inline-flex">{{ series.network }}</span>
      <span v-if="series.sizeGb">{{ formatGb(series.sizeGb) }}</span>
    </template>
    <template #chips>
      <StatusChip v-if="airing" :label="t(airing)" :color="AIRING_STATUS_COLORS[series.status]" />
      <v-chip v-if="series.seriesType === 'anime'" size="x-small" label variant="outlined">{{
        t('media.series.status.anime')
      }}</v-chip>
      <span class="series-row__progress" :title="seriesProgressTitle(t, series)">
        <span
          class="series-row__progress-fill"
          :class="`bg-${SERIES_STATE_COLORS[state]}`"
          :style="{ width: `${progressWidth(series)}%` }"
        />
      </span>
      <span class="text-body-small text-muted"
        >{{ series.episodeFileCount }}/{{ series.episodeCount }}</span
      >
      <WatchedBadge v-if="watched" dense :progress="watched" />
    </template>
    <template #append>
      <v-btn
        :icon="series.monitored ? msBookmarkFill : msBookmark"
        :color="series.monitored ? 'service-text' : 'muted'"
        variant="text"
        size="small"
        :disabled="selectMode || pageReadOnly"
        :aria-pressed="series.monitored"
        :aria-label="monitorLabel"
        :title="monitorLabel"
        data-test="series-row-monitor"
        @click="emit('monitor')"
      />
    </template>
  </MediaListItem>
</template>

<style scoped>
.series-row__progress {
  position: relative;
  display: inline-block;
  width: 64px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.series-row__progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
}
</style>
