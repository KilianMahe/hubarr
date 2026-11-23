<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'affiche d'un film (vues grille et mur), sur `PosterCard` : puce de
// statut en clair, qualité, titre et année (P5b.1 F3) ; badge de sous-titres
// Bazarr en bas à gauche. Un clic ouvre la fiche ; le marque-page bascule le
// suivi (`hover-monitor-btn-film`).
import type { MovieLibraryItem } from '@hubarr/shared';
import { mdiBookmark, mdiBookmarkOutline } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PosterCard from '../../components/ds/PosterCard.vue';
import SubtitleBadge from '../bazarr/SubtitleBadge.vue';
import type { SubtitleBadgeStatus } from '../bazarr/bazarr-api';
import { STATUS_COLORS, displayStatusOf, statusLabelKey } from './library';
import { posterUrl, statusTitle } from './movie-display';

const props = defineProps<{
  movie: MovieLibraryItem;
  selectMode: boolean;
  selected: boolean;
  /** Mur d'affiches : pas de légende sous l'affiche. */
  compact?: boolean;
  /** Badge de sous-titres Bazarr (`null` : aucun). */
  subtitle?: SubtitleBadgeStatus;
}>();
const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
  open: [];
  monitor: [];
  subtitles: [];
}>();
const { t } = useI18n();

const status = computed(() => {
  const value = displayStatusOf(props.movie);
  return {
    label: t(statusLabelKey(value)),
    color: STATUS_COLORS[value],
    title: statusTitle(t, props.movie),
  };
});
const poster = computed(() => posterUrl(props.movie.poster, props.compact ? 'w185' : 'w342'));
const monitorLabel = computed(() =>
  t(props.movie.monitored ? 'media.films.detail.unfollow' : 'media.films.detail.follow'),
);
</script>

<template>
  <PosterCard
    :title="movie.title"
    :subtitle="movie.year === null ? null : String(movie.year)"
    :image="poster"
    :status="status"
    :quality="movie.quality"
    :compact="compact"
    :select-mode="selectMode"
    :selected="selected"
    @open="emit('open')"
    @select="emit('select', $event)"
  >
    <template v-if="subtitle" #badges>
      <SubtitleBadge :id="movie.id" kind="movie" :status="subtitle" @search="emit('subtitles')" />
    </template>
    <template #action>
      <component
        :is="selectMode ? 'span' : 'button'"
        class="poster-monitor"
        :type="selectMode ? undefined : 'button'"
        :aria-pressed="selectMode ? undefined : movie.monitored"
        :aria-label="monitorLabel"
        :title="monitorLabel"
        data-test="movie-card-monitor"
        @click="!selectMode && emit('monitor')"
      >
        <v-icon :icon="movie.monitored ? mdiBookmark : mdiBookmarkOutline" size="20" />
      </component>
    </template>
  </PosterCard>
</template>
