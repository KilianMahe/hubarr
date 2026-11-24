<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Badge « Vu » (lot 7, Tracearr) : « Vu » quand tout est vu, sinon « x/y vus »
// (séries et saisons), ou « n épisodes vus » quand le total est inconnu
// (tendances TMDB). Fond plein et icône pleine pour rester lisible sur une
// affiche. Variante `overlay` posée sur une affiche, sinon puce (fiche, ou
// `dense` dans une ligne de la vue liste).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { msCheckCircleFill } from '../../components/symbols';
import type { WatchedProgress } from './watched';

const props = defineProps<{
  progress: WatchedProgress;
  overlay?: boolean;
  dense?: boolean;
}>();
const { t } = useI18n();

const label = computed(() => {
  const progress = props.progress;
  switch (progress.kind) {
    case 'all':
      return t('activity.watched.all');
    case 'some':
      return t('activity.watched.some', { watched: progress.watched, total: progress.total });
    case 'count':
      return t('activity.watched.episodes', { count: progress.watched });
  }
  return '';
});
const title = computed(() => t('activity.watched.title'));
</script>

<template>
  <span
    v-if="overlay"
    class="watched-badge bg-success"
    :title="title"
    :aria-label="`${label} · ${title}`"
    data-test="watched-badge"
    ><v-icon :icon="msCheckCircleFill" size="14" />{{ label }}</span
  >
  <v-chip
    v-else
    :size="dense ? 'x-small' : 'small'"
    :label="dense"
    variant="flat"
    color="success"
    :prepend-icon="msCheckCircleFill"
    :title="title"
    class="font-weight-bold"
    data-test="watched-badge"
    >{{ label }}</v-chip
  >
</template>

<style scoped>
.watched-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 4px;
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.5;
}
</style>
