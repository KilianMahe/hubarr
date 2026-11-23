<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Puce de qualité (« Bluray-1080p », « WEBDL-2160p »…) : jamais tronquée au
// milieu ; coupée à droite avec le nom complet en infobulle. `overlay` : sur
// une affiche.
defineProps<{ quality: string; overlay?: boolean }>();
</script>

<template>
  <span v-if="overlay" class="quality-chip--overlay" :title="quality" data-test="quality-chip">{{
    quality
  }}</span>
  <v-chip
    v-else
    size="x-small"
    label
    variant="outlined"
    class="quality-chip flex-shrink-1"
    :title="quality"
    data-test="quality-chip"
    >{{ quality }}</v-chip
  >
</template>

<style scoped>
.quality-chip {
  max-width: 100%;
}
.quality-chip :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.quality-chip--overlay {
  display: inline-block;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  background: rgba(0, 0, 0, 0.72);
}
</style>
