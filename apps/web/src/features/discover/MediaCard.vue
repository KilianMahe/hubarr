<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'un titre TMDB (`renderCardHTML` d'origine) : affiche, note, état en
// bibliothèque, compte à rebours avant la sortie, étoile de la watchlist et
// bouton d'ajout (admins, titre absent des bibliothèques). Un clic ouvre la
// fiche.
import type { TmdbCard } from '@hubarr/shared';
import { mdiMovieOpen, mdiPlus, mdiStar, mdiStarOutline, mdiTelevisionClassic } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { openQuickAdd } from '../../app/overlays';
import { useSessionStore } from '../../app/stores/session';
import { countdownDays, libStatusColor } from './discover-api';
import { posterPathOf, useWatchlist } from './useWatchlist';

const props = defineProps<{ card: TmdbCard; width?: number | string | undefined }>();
const emit = defineEmits<{ open: [card: TmdbCard] }>();
const { t } = useI18n();
const session = useSessionStore();
const watchlist = useWatchlist();

const inWatchlist = computed(() => watchlist.has(props.card.type, props.card.id));
const countdown = computed(() => countdownDays(props.card.release));
const statusKey = computed(
  () => `decouverte.card.status_short.${props.card.libStatus ?? 'default'}`,
);

function star(): void {
  watchlist.toggle({
    id: props.card.id,
    type: props.card.type,
    title: props.card.title,
    posterPath: posterPathOf(props.card.poster),
    vote: props.card.vote,
    year: props.card.year,
  });
}
</script>

<template>
  <v-card
    :width="width"
    rounded="lg"
    class="media-card"
    :data-test="`media-card-${card.type}-${card.id}`"
    @click="emit('open', card)"
  >
    <v-img :src="card.poster ?? ''" :aspect-ratio="2 / 3" cover class="bg-surface-alt">
      <template #placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon :icon="card.type === 'tv' ? mdiTelevisionClassic : mdiMovieOpen" size="32" />
        </div>
      </template>
      <template #error>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon :icon="card.type === 'tv' ? mdiTelevisionClassic : mdiMovieOpen" size="32" />
        </div>
      </template>
      <div class="media-card__top d-flex justify-space-between pa-1">
        <v-chip
          v-if="card.vote && card.vote > 0"
          size="x-small"
          variant="flat"
          color="surface"
          :prepend-icon="mdiStar"
          :aria-label="t('decouverte.card.rating', { value: card.vote })"
          >{{ card.vote }}</v-chip
        >
        <v-spacer />
        <v-chip v-if="countdown !== null" size="x-small" variant="flat" color="warning">{{
          t('decouverte.card.countdown', { days: countdown })
        }}</v-chip>
      </div>
      <div class="media-card__bottom d-flex align-end pa-1 ga-1">
        <v-chip
          v-if="card.inLibrary"
          size="x-small"
          variant="flat"
          :color="libStatusColor(card.libStatus)"
          data-test="lib-status"
          >{{ t(statusKey) }}</v-chip
        >
        <v-spacer />
        <v-btn
          v-if="watchlist.enabled.value"
          :icon="inWatchlist ? mdiStar : mdiStarOutline"
          size="x-small"
          variant="flat"
          :color="inWatchlist ? 'warning' : 'surface'"
          :aria-label="
            t(inWatchlist ? 'decouverte.modal.in_watchlist' : 'decouverte.modal.watchlist')
          "
          data-test="watchlist-star"
          @click.stop="star"
        />
        <v-btn
          v-if="session.isAdmin && !card.inLibrary"
          :icon="mdiPlus"
          size="x-small"
          variant="flat"
          color="primary"
          :aria-label="t('decouverte.action.add')"
          data-test="quick-add"
          @click.stop="openQuickAdd({ tmdb: { type: card.type, id: card.id } })"
        />
      </div>
    </v-img>
    <div class="pa-2">
      <div class="text-body-medium text-truncate" :title="card.title">{{ card.title }}</div>
      <div class="text-body-small text-muted">
        {{ t(card.type === 'tv' ? 'dashboard.type.series' : 'dashboard.type.film')
        }}<template v-if="card.year"> · {{ card.year }}</template>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.media-card__top {
  position: absolute;
  inset: 0 0 auto 0;
}
.media-card__bottom {
  position: absolute;
  inset: auto 0 0 0;
}
</style>
