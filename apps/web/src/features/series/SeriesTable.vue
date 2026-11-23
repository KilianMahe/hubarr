<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue tableau : vignette, titre (année), saisons, chaîne, progression,
// épisodes, taille, statut ; colonne de sélection en mode sélection.
import { formatGb } from '../../app/format';
import type { SeriesLibraryItem } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { posterUrl } from '../movies/movie-display';
import {
  AIRING_STATUS_COLORS,
  SERIES_STATE_COLORS,
  airingStatusKey,
  seriesDisplayState,
  seriesProgressTitle,
} from './library';

defineProps<{
  series: SeriesLibraryItem[];
  selectMode: boolean;
  selected: ReadonlySet<number>;
}>();
const emit = defineEmits<{
  select: [id: number, event: MouseEvent | KeyboardEvent];
  open: [id: number];
}>();
const { t } = useI18n();

function statusLabel(status: string): string {
  const key = airingStatusKey(status);
  return key === null ? status : t(key);
}
</script>

<template>
  <v-card variant="flat" border>
    <v-table density="compact" class="series-table" hover>
      <thead>
        <tr>
          <th v-if="selectMode" style="width: 40px" />
          <th style="width: 48px" />
          <th>{{ t('media.series.table.title') }}</th>
          <th style="width: 40px">{{ t('media.series.table.col_s') }}</th>
          <th>{{ t('media.series.table.network') }}</th>
          <th style="width: 120px">{{ t('media.series.table.progress') }}</th>
          <th>{{ t('media.series.table.episodes') }}</th>
          <th>{{ t('media.series.table.size') }}</th>
          <th>{{ t('media.series.table.status') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in series"
          :key="entry.id"
          :class="{ 'series-table__row--selected': selected.has(entry.id) }"
          style="cursor: pointer"
          @click="selectMode ? emit('select', entry.id, $event) : emit('open', entry.id)"
        >
          <td v-if="selectMode">
            <v-checkbox-btn
              :model-value="selected.has(entry.id)"
              color="service"
              :aria-label="entry.title"
              @click.stop="emit('select', entry.id, $event)"
            />
          </td>
          <td>
            <img
              v-if="entry.poster"
              :src="posterUrl(entry.poster, 'w92') ?? undefined"
              alt=""
              loading="lazy"
              class="series-table__poster"
            />
            <div v-else class="series-table__poster" />
          </td>
          <td class="font-weight-medium">
            <a
              v-if="!selectMode"
              href="#"
              class="series-table__link"
              @click.prevent.stop="emit('open', entry.id)"
              >{{ entry.title }}</a
            >
            <template v-else>{{ entry.title }}</template>
            <span v-if="entry.year !== null" class="text-muted font-weight-regular">
              ({{ entry.year }})</span
            >
          </td>
          <td>
            <v-chip size="x-small" label variant="tonal">{{ entry.seasonCount }}</v-chip>
          </td>
          <td class="text-muted">{{ entry.network ?? '—' }}</td>
          <td>
            <div class="series-table__progress" :title="seriesProgressTitle(t, entry)">
              <div
                class="series-table__progress-fill"
                :class="`bg-${SERIES_STATE_COLORS[seriesDisplayState(entry)]}`"
                :style="{ width: `${entry.percent}%` }"
              />
            </div>
          </td>
          <td>{{ entry.episodeFileCount }}/{{ entry.episodeCount }}</td>
          <td class="text-muted">
            {{ entry.sizeGb ? formatGb(entry.sizeGb) : '—' }}
          </td>
          <td>
            <v-chip
              size="x-small"
              label
              variant="tonal"
              :color="AIRING_STATUS_COLORS[entry.status] ?? 'muted'"
              >{{ statusLabel(entry.status) }}</v-chip
            >
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<style scoped>
.series-table__poster {
  display: block;
  width: 30px;
  height: 45px;
  object-fit: cover;
  border-radius: 4px;
  background: rgb(var(--v-theme-surface-alt));
}
.series-table__row--selected {
  background: rgba(var(--v-theme-service), 0.12);
}
.series-table__link {
  color: inherit;
  text-decoration: none;
}
.series-table__link:hover,
.series-table__link:focus-visible {
  text-decoration: underline;
}
.series-table__progress {
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.series-table__progress-fill {
  height: 100%;
}
</style>
