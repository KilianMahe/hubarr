<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Distribution ou équipe d'un film : bandeau horizontal de cartes (photo TMDB,
// nom, rôle). Le marque-page « Suivre cet artiste » arrive avec le suivi de
// personnes (P2.6) via le slot `action`.
import type { MovieCredit } from '@hubarr/shared';
import { mdiAccount } from '@mdi/js';
import { posterUrl } from './movie-display';

defineProps<{ people: { person: MovieCredit; role: string }[] }>();

/** Photo TMDB en `w185` (l'original chargeait l'image d'origine). */
function photo(url: string | null): string | null {
  return posterUrl(url, 'w185');
}
</script>

<template>
  <div class="movie-credits" role="list">
    <div v-for="(entry, index) in people" :key="index" class="movie-credits__card" role="listitem">
      <div class="movie-credits__photo">
        <img
          v-if="photo(entry.person.image)"
          :src="photo(entry.person.image)!"
          :alt="entry.person.personName"
          loading="lazy"
        />
        <v-icon v-else :icon="mdiAccount" size="28" color="muted" />
        <slot name="action" :person="entry.person" />
      </div>
      <div class="text-body-small font-weight-medium movie-credits__name">
        {{ entry.person.personName }}
      </div>
      <div class="text-label-small text-muted movie-credits__name">{{ entry.role }}</div>
    </div>
  </div>
</template>

<style scoped>
.movie-credits {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
  scroll-snap-type: x proximity;
}
.movie-credits__card {
  flex: 0 0 84px;
  text-align: center;
  scroll-snap-align: start;
}
.movie-credits__photo {
  position: relative;
  width: 64px;
  height: 64px;
  margin: 0 auto 6px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.movie-credits__photo img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.movie-credits__name {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
