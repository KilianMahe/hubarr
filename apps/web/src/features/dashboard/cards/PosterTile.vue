<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vignette d'affiche du tableau de bord (watchlist, tendances, ajouts) : un
// clic ouvre l'aperçu rapide.
import { mdiMovieOpen, mdiStar, mdiTelevisionClassic } from '@mdi/js';

defineProps<{
  title: string;
  subtitle: string;
  poster: string | null;
  tv: boolean;
  vote?: number | null | undefined;
  badge?: string | null | undefined;
  badgeColor?: string | undefined;
}>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <v-card width="140" rounded="lg" class="flex-shrink-0" @click="emit('open')">
    <v-img :src="poster ?? ''" :aspect-ratio="2 / 3" cover class="bg-surface-alt">
      <template #error>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon :icon="tv ? mdiTelevisionClassic : mdiMovieOpen" size="28" />
        </div>
      </template>
      <div class="d-flex pa-1 ga-1">
        <v-chip
          v-if="vote && vote > 0"
          size="x-small"
          variant="flat"
          color="surface"
          :prepend-icon="mdiStar"
          >{{ Math.round(vote * 10) / 10 }}</v-chip
        >
        <v-spacer />
        <v-chip v-if="badge" size="x-small" variant="flat" :color="badgeColor ?? 'surface'">{{
          badge
        }}</v-chip>
      </div>
    </v-img>
    <div class="pa-2">
      <div class="text-body-small font-weight-medium text-truncate" :title="title">{{ title }}</div>
      <div class="text-label-small text-muted text-truncate">{{ subtitle }}</div>
    </div>
  </v-card>
</template>
