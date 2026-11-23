<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Évènements d'historique d'un film (fiche) : libellé, qualité, release ou
// chemin importé, date ; pastille colorée par type d'évènement.
import type { MovieHistoryItem } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { historyEventKey, historyTone } from './movie-detail';

defineProps<{ items: MovieHistoryItem[] }>();
const { t } = useI18n();
const format = useFormat();

function label(eventType: string): string {
  const key = historyEventKey(eventType);
  return key === null ? eventType : t(key);
}
const TONE_COLORS = {
  info: 'info',
  success: 'success',
  error: 'error',
  warning: 'warning',
  muted: 'muted',
} as const;
</script>

<template>
  <v-timeline side="end" density="compact" truncate-line="both" class="movie-history">
    <v-timeline-item
      v-for="item in items"
      :key="item.id"
      :dot-color="TONE_COLORS[historyTone(item.eventType)]"
      size="x-small"
      data-test="movie-history-item"
    >
      <div class="d-flex justify-space-between ga-2">
        <div class="min-width-0">
          <span class="text-body-medium font-weight-medium">{{ label(item.eventType) }}</span>
          <v-chip v-if="item.quality" size="x-small" variant="tonal" class="ml-1">{{
            item.quality
          }}</v-chip>
          <div
            v-if="item.releaseTitle ?? item.importedPath ?? item.sourceTitle"
            class="text-body-small text-muted text-truncate"
            :title="item.releaseTitle ?? item.importedPath ?? item.sourceTitle ?? ''"
          >
            {{ item.releaseTitle ?? item.importedPath ?? item.sourceTitle }}
          </div>
        </div>
        <span class="text-body-small text-muted text-no-wrap">{{
          item.date ? format.dateTime(item.date) : '—'
        }}</span>
      </div>
    </v-timeline-item>
  </v-timeline>
</template>

<style scoped>
.movie-history :deep(.v-timeline-item__body) {
  width: 100%;
  min-width: 0;
}
.min-width-0 {
  min-width: 0;
}
</style>
