<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique de Bazarr (`bazarr/history.html.twig`, route n° 18) : films et
// épisodes ; une liste en échec affiche son erreur sans masquer l'autre.
import type { BazarrHistoryItem } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import BazarrPage from '../BazarrPage.vue';
import { bazarrApi, bazarrKeys } from '../bazarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const { t } = useI18n();
const format = useFormat();
const history = useQuery({
  queryKey: bazarrKeys.history,
  queryFn: ({ signal }) => bazarrApi.history(signal),
  retry: false,
});
const sections = (data: {
  movies: BazarrHistoryItem[] | null;
  episodes: BazarrHistoryItem[] | null;
}) =>
  [
    ['movies', 'bazarr.history.movies_title', data.movies],
    ['episodes', 'bazarr.history.episodes_title', data.episodes],
  ] as const;
const dateOf = (value: string | null) =>
  value === null ? '—' : /^\d{4}-\d{2}-\d{2}T/.test(value) ? format.dateTime(value) : value;
</script>

<template>
  <BazarrPage :loading="history.isPending.value" :error="history.isError.value">
    <template v-if="history.data.value">
      <v-card
        v-for="[key, title, items] in sections(history.data.value)"
        :key="key"
        variant="flat"
        border
        class="mb-4"
        :data-test="`bazarr-history-${key}`"
      >
        <v-card-title class="text-title-medium">{{ t(title) }}</v-card-title>
        <v-alert
          v-if="items === null"
          type="error"
          variant="tonal"
          density="compact"
          class="ma-3"
          >{{ t('error.service_banner.title_unreachable', { service: 'Bazarr' }) }}</v-alert
        >
        <EmptyState v-else-if="items.length === 0" inline :title="t('bazarr.history.empty')" />
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th>{{ t('bazarr.history.column_title') }}</th>
              <th>{{ t('bazarr.history.column_action') }}</th>
              <th>{{ t('bazarr.history.column_provider') }}</th>
              <th>{{ t('bazarr.history.column_language') }}</th>
              <th>{{ t('bazarr.history.column_date') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in items" :key="index" data-test="bazarr-history-row">
              <td>{{ item.title }}</td>
              <td>{{ item.action ?? '—' }}</td>
              <td>{{ item.provider ?? '—' }}</td>
              <td>{{ item.language ?? '—' }}</td>
              <td class="text-muted text-no-wrap">{{ dateOf(item.date) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>
  </BazarrPage>
</template>
