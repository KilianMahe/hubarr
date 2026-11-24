<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Épisodes d'une série dans Bazarr (`bazarr/series_detail.html.twig`, route
// n° 19) : saison, épisode, titre, langues audio, état des sous-titres et
// recherche par épisode ; une série non suivie le dit.
import { msArrowBack, msSearch } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import BazarrPage from '../BazarrPage.vue';
import SubtitleSearchDialog from '../SubtitleSearchDialog.vue';
import { bazarrApi, bazarrKeys } from '../bazarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const { t } = useI18n();
const route = useRoute();
const seriesId = computed(() => Number(route.params.seriesId));
const detail = useQuery({
  queryKey: computed(() => bazarrKeys.series(seriesId.value)),
  queryFn: ({ signal }) => bazarrApi.series(seriesId.value, signal),
  retry: false,
});
const search = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });
const title = computed(
  () => detail.data.value?.title ?? `${t('bazarr.series_detail.title')} #${seriesId.value}`,
);
</script>

<template>
  <BazarrPage :title="title" :loading="detail.isPending.value" :error="detail.isError.value">
    <template #actions>
      <v-btn
        variant="text"
        size="small"
        :prepend-icon="msArrowBack"
        :to="{ name: 'bazarr-series' }"
        >{{ t('bazarr.series_detail.back') }}</v-btn
      >
    </template>
    <v-card v-if="detail.data.value" variant="flat" border>
      <v-card-title class="text-title-medium">{{ t('bazarr.series_detail.title') }}</v-card-title>
      <EmptyState
        v-if="detail.data.value.episodes.length === 0"
        inline
        :title="t('bazarr.series_detail.empty')"
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t('bazarr.series_detail.column_season') }}</th>
            <th>{{ t('bazarr.series_detail.column_episode') }}</th>
            <th>{{ t('bazarr.series_detail.column_title') }}</th>
            <th>{{ t('bazarr.series_detail.column_language') }}</th>
            <th>{{ t('bazarr.series_detail.column_status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(episode, index) in detail.data.value.episodes"
            :key="episode.episodeId ?? `e${index}`"
            data-test="bazarr-episode"
          >
            <td>{{ episode.season ?? '—' }}</td>
            <td>{{ episode.episode ?? '—' }}</td>
            <td>{{ episode.title ?? '—' }}</td>
            <td class="text-muted">{{ episode.audioLanguages.join(', ') || '—' }}</td>
            <td>
              <template v-if="episode.missing > 0">
                <v-btn
                  v-if="episode.episodeId !== null"
                  size="small"
                  variant="tonal"
                  color="service-text"
                  :prepend-icon="msSearch"
                  data-test="bazarr-episode-search"
                  @click="Object.assign(search, { open: true, id: episode.episodeId })"
                  >{{ t('bazarr.series_detail.search') }}</v-btn
                >
                <span v-else class="text-muted">—</span>
              </template>
              <span v-else-if="detail.data.value.tracked === false" class="text-muted">{{
                t('bazarr.series.not_tracked')
              }}</span>
              <v-chip
                v-else-if="episode.present > 0"
                size="x-small"
                color="success"
                variant="tonal"
                >{{ t('bazarr.series_detail.complete') }}</v-chip
              >
              <span v-else class="text-muted">—</span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <SubtitleSearchDialog
      v-model="search.open"
      kind="episode"
      :item-id="search.id"
      :series-id="seriesId"
      @downloaded="detail.refetch()"
    />
  </BazarrPage>
</template>
