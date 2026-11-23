<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Accueil de Bazarr (`bazarr/index.html.twig`, route n° 15) : films et
// épisodes recherchés, fournisseurs actifs, rangée des sous-titres les plus
// manquants (affiche, titre, recherche automatique ; une série mène à ses
// épisodes).
import { useQuery } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifyStore } from '../../../app/stores/notify';
import { posterUrl } from '../../movies/movie-display';
import BazarrPage from '../BazarrPage.vue';
import { bazarrApi, bazarrKeys } from '../bazarr-api';
import StatTile from '../../../components/ds/StatTile.vue';

const { t } = useI18n();
const notify = useNotifyStore();
const overview = useQuery({
  queryKey: bazarrKeys.overview,
  queryFn: ({ signal }) => bazarrApi.overview(signal),
  retry: false,
});
const running = ref<string | null>(null);
async function auto(kind: 'movie' | 'series', id: number): Promise<void> {
  running.value = `${kind}-${id}`;
  try {
    await bazarrApi.auto(kind, id);
    notify.success('bazarr.auto.started');
  } catch {
    notify.error('bazarr.modal.error');
  } finally {
    running.value = null;
  }
}
const TILES = [
  ['movies', 'bazarr.stat.movies_wanted', 'primary'],
  ['episodes', 'bazarr.stat.episodes_wanted', 'info'],
  ['providers', 'bazarr.stat.providers', 'success'],
] as const;
</script>

<template>
  <BazarrPage
    :loading="overview.isPending.value"
    :error="overview.isError.value"
    :warming="overview.data.value?.state === 'warming'"
    @reload="overview.refetch()"
  >
    <template v-if="overview.data.value">
      <div class="bazarr-tiles mb-4">
        <StatTile
          v-for="[key, label, color] in TILES"
          :key="key"
          :value="overview.data.value.counts[key]"
          :label="t(label)"
          :color="color"
          :data-test="`bazarr-tile-${key}`"
        />
      </div>
      <v-card variant="flat" border>
        <v-card-title class="d-flex flex-wrap align-center ga-2 text-title-medium">
          {{ t('bazarr.landing.most_missing_title') }}
          <v-spacer />
          <v-btn size="small" variant="tonal" :to="{ name: 'bazarr-movies' }">{{
            t('bazarr.landing.view_movies')
          }}</v-btn>
          <v-btn size="small" variant="tonal" :to="{ name: 'bazarr-series' }">{{
            t('bazarr.landing.view_series')
          }}</v-btn>
        </v-card-title>
        <v-card-text>
          <p
            v-if="overview.data.value.mostMissing.length === 0"
            class="text-center text-muted py-4"
          >
            {{ t('bazarr.landing.empty') }}
          </p>
          <div v-else class="bazarr-row">
            <div
              v-for="item in overview.data.value.mostMissing"
              :key="`${item.kind}-${item.id}`"
              class="bazarr-row__item"
              data-test="bazarr-missing"
            >
              <div class="bazarr-row__poster">
                <img
                  v-if="posterUrl(item.poster, 'w185')"
                  :src="posterUrl(item.poster, 'w185') ?? ''"
                  :alt="item.title"
                  loading="lazy"
                />
                <div v-else class="bazarr-row__no-poster text-body-small">{{ item.title }}</div>
                <span class="bazarr-row__chip">{{
                  t('bazarr.badge.missing_count', { count: item.missingCount })
                }}</span>
              </div>
              <router-link
                v-if="item.kind === 'series'"
                :to="{ name: 'bazarr-series-detail', params: { seriesId: item.id } }"
                class="text-body-medium font-weight-medium text-truncate d-block mt-1"
                >{{ item.title }}</router-link
              >
              <div v-else class="text-body-medium font-weight-medium text-truncate mt-1">
                {{ item.title }}
              </div>
              <div class="text-body-small text-muted">{{ item.year ?? '' }}</div>
              <v-btn
                block
                size="small"
                variant="text"
                color="service-text"
                :loading="running === `${item.kind}-${item.id}`"
                data-test="bazarr-auto"
                @click="auto(item.kind, item.id)"
                >{{ t('bazarr.auto.button') }}</v-btn
              >
            </div>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </BazarrPage>
</template>

<style scoped>
.bazarr-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.bazarr-row {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 140px;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.bazarr-row__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt));
}
.bazarr-row__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bazarr-row__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  text-align: center;
}
.bazarr-row__chip {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: rgb(var(--v-theme-warning));
  font-size: 0.6875rem;
  font-weight: 600;
}
</style>
