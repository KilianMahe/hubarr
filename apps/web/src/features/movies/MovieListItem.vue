<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ligne dense à vignette (vue « étendue »), sur `MediaListItem` : affiche,
// titre, année · durée · taille, puces de statut et de qualité, genres sur
// grand écran (P5b.1 F2 : plus de synopsis, ~7 films par écran sur mobile).
import type { MovieLibraryItem } from '@hubarr/shared';
import { mdiBookmark, mdiBookmarkOutline } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MediaListItem from '../../components/ds/MediaListItem.vue';
import QualityChip from '../../components/ds/QualityChip.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import { STATUS_COLORS, displayStatusOf, statusLabelKey } from './library';
import { posterUrl, sizeText, statusTitle } from './movie-display';

const props = defineProps<{ movie: MovieLibraryItem; selectMode: boolean; selected: boolean }>();
const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
  open: [];
  monitor: [];
}>();
const { t } = useI18n();

const status = computed(() => displayStatusOf(props.movie));
const size = computed(() => sizeText(t, props.movie.sizeGb));
const runtime = computed(() => (props.movie.runtime ? `${props.movie.runtime} min` : null));
</script>

<template>
  <MediaListItem
    :title="movie.title"
    :image="posterUrl(movie.poster, 'w92')"
    :select-mode="selectMode"
    :selected="selected"
    class="movie-row"
    @open="emit('open')"
    @select="emit('select', $event)"
  >
    <template #meta>
      <span v-if="movie.year !== null">{{ movie.year }}</span>
      <span v-if="runtime">{{ runtime }}</span>
      <span v-if="size">{{ size }}</span>
    </template>
    <template #chips>
      <StatusChip
        :label="t(statusLabelKey(status))"
        :color="STATUS_COLORS[status]"
        :title="statusTitle(t, movie)"
      />
      <QualityChip v-if="movie.quality" :quality="movie.quality" />
      <v-chip
        v-for="genre in movie.genres.slice(0, 3)"
        :key="genre"
        size="x-small"
        label
        variant="text"
        class="text-muted d-none d-md-inline-flex"
        >{{ genre }}</v-chip
      >
    </template>
    <template #append>
      <v-btn
        :icon="movie.monitored ? mdiBookmark : mdiBookmarkOutline"
        :color="movie.monitored ? 'service-text' : 'muted'"
        variant="text"
        size="small"
        :disabled="selectMode"
        :aria-pressed="movie.monitored"
        :aria-label="
          t(movie.monitored ? 'media.films.detail.unfollow' : 'media.films.detail.follow')
        "
        :title="t(movie.monitored ? 'media.films.detail.unfollow' : 'media.films.detail.follow')"
        data-test="movie-row-monitor"
        @click="emit('monitor')"
      />
    </template>
  </MediaListItem>
</template>
