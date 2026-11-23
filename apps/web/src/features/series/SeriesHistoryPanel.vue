<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique d'une série ou d'une saison dans la fiche (`btn-serie-history`,
// `btn-season-history`) : épisode, action, source, qualité, date ; 100
// évènements pour la série, 50 pour une saison (comme l'original).
import type { SeriesHistoryItem } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { episodeCode } from './library';
import { historyEventColor, historyEventLabel } from './series-detail';

const props = defineProps<{ items: SeriesHistoryItem[] | undefined; season?: number | null }>();
const { t } = useI18n();
const format = useFormat();

const rows = computed(() => {
  const all = props.items ?? [];
  if (props.season === undefined || props.season === null) return all.slice(0, 100);
  return all.filter((item) => item.episode?.seasonNumber === props.season).slice(0, 50);
});
const emptyText = computed(() =>
  props.season === undefined || props.season === null
    ? t('media.series.detail.no_history')
    : t('media.series.detail.no_history_for_season_tpl', { n: props.season }),
);
</script>

<template>
  <div data-test="series-history">
    <v-progress-linear v-if="items === undefined" indeterminate color="service" />
    <p v-else-if="rows.length === 0" class="text-body-small text-muted pa-3">{{ emptyText }}</p>
    <v-table v-else density="compact" class="series-history">
      <thead>
        <tr>
          <th>{{ t('media.series.detail.col_episode') }}</th>
          <th>{{ t('media.series.detail.col_action') }}</th>
          <th>{{ t('media.series.detail.col_source') }}</th>
          <th>{{ t('media.series.detail.col_quality') }}</th>
          <th>{{ t('media.series.detail.col_date') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in rows" :key="item.id">
          <td class="font-weight-medium">
            {{
              item.episode
                ? episodeCode(item.episode.seasonNumber, item.episode.episodeNumber)
                : '—'
            }}
          </td>
          <td>
            <v-chip
              size="x-small"
              label
              variant="tonal"
              :color="historyEventColor(item.eventType)"
              >{{ historyEventLabel(t, item.eventType) }}</v-chip
            >
          </td>
          <td class="text-muted series-history__source" :title="item.sourceTitle ?? ''">
            {{ item.sourceTitle ?? '—' }}
          </td>
          <td>{{ item.quality ?? '—' }}</td>
          <td class="text-muted text-no-wrap">
            {{ item.date === null ? '—' : (format.date(item.date) ?? '—') }}
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<style scoped>
.series-history {
  font-size: 0.8rem;
}
.series-history__source {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
