<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// État vide de l'ajout d'un film ou d'une série (P5c.2, V16) : invitation à
// chercher, exemples d'identifiants, puis les tendances TMDB de la semaine
// (masquées si TMDB n'est pas configuré). Un clic sur une affiche lance la
// recherche du titre dans Radarr/Sonarr (`pick`).
import type { TmdbCard } from '@hubarr/shared';
import ScrollRow from './ScrollRow.vue';
import { msCheck, msLiveTv, msMovie } from './symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { discoverApi } from '../features/discover/discover-api';

const props = defineProps<{ type: 'movie' | 'tv' }>();
const emit = defineEmits<{ pick: [card: TmdbCard] }>();
const { t } = useI18n();

const section = computed(() => (props.type === 'movie' ? 'trending-movies' : 'trending-tv'));
const trending = useQuery({
  queryKey: computed(() => ['discover', 'section', section.value, 1] as const),
  queryFn: ({ signal }) => discoverApi.section(section.value, 1, signal),
  staleTime: 10 * 60_000,
  retry: false,
});
const cards = computed(() => (trending.data.value?.results ?? []).slice(0, 12));
const prefix = computed(() => (props.type === 'movie' ? 'movie' : 'series'));
</script>

<template>
  <div class="add-suggestions" data-test="add-suggestions">
    <div class="add-suggestions__intro">
      <v-icon :icon="type === 'movie' ? msMovie : msLiveTv" size="48" color="service-text" />
      <div class="text-title-medium mt-2">{{ t(`media.add.empty_${prefix}_title`) }}</div>
      <p class="text-body-medium text-muted mt-1">{{ t(`media.add.empty_${prefix}_hint`) }}</p>
    </div>

    <template v-if="trending.isPending.value">
      <ScrollRow item-width="112px" aria-hidden="true">
        <v-skeleton-loader v-for="n in 6" :key="n" type="image" class="add-suggestions__card" />
      </ScrollRow>
    </template>
    <template v-else-if="cards.length > 0">
      <h3 class="text-title-small mb-2">{{ t(`media.add.trending_${prefix}`) }}</h3>
      <ScrollRow item-width="112px">
        <button
          v-for="card in cards"
          :key="card.id"
          type="button"
          class="add-suggestions__card"
          :class="{ 'add-suggestions__card--owned': card.inLibrary }"
          :title="card.inLibrary ? t('media.add.in_library') : card.title"
          :aria-label="card.year ? `${card.title} (${card.year})` : card.title"
          data-test="add-suggestion"
          @click="emit('pick', card)"
        >
          <v-img
            :src="card.poster ?? ''"
            :aspect-ratio="2 / 3"
            cover
            class="bg-surface-alt rounded"
          >
            <v-chip
              v-if="card.inLibrary"
              size="x-small"
              color="success"
              variant="flat"
              class="ma-1"
              :aria-label="t('media.add.in_library')"
            >
              <v-icon :icon="msCheck" size="12" />
            </v-chip>
          </v-img>
          <span class="add-suggestions__title text-body-small">{{ card.title }}</span>
          <span v-if="card.year" class="text-label-small text-muted">{{ card.year }}</span>
        </button>
      </ScrollRow>
    </template>
  </div>
</template>

<style scoped>
.add-suggestions__intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 16px 20px;
}
.add-suggestions__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.add-suggestions__card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 6px;
}
.add-suggestions__card--owned {
  opacity: 0.55;
}
.add-suggestions__title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
