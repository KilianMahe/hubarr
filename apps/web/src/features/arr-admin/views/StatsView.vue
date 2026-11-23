<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Statistiques de la bibliothèque (`radarr/stats.html.twig`, `sonarr/stats`) :
// compteurs (films : total, téléchargés, suivis, manquants ; séries : total,
// en cours, terminées, suivies), taille totale, disques, répartition par
// qualité, genre, décennie (Radarr) ou réseau (Sonarr).
import { libraryStatsSchema } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import StatTile from '../../../components/ds/StatTile.vue';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error } = useAdminPage('stats', '/stats', libraryStatsSchema);
const title = computed(() => t(ctx.kindKey('page_title')));
const stats = computed(() => query.data.value);
const isRadarr = computed(() => ctx.kind.value === 'radarr');

const tiles = computed(() => {
  const data = stats.value;
  if (!data) return [];
  return isRadarr.value
    ? [
        { key: 'card_movies', value: data.total },
        { key: 'card_downloaded', value: data.hasFile ?? 0 },
        { key: 'card_monitored', value: data.monitored },
        { key: 'card_missing', value: data.missing ?? 0 },
      ]
    : [
        { key: 'card_series', value: data.total },
        { key: 'card_continuing', value: data.continuing ?? 0 },
        { key: 'card_ended', value: data.ended ?? 0 },
        { key: 'card_monitored_series', value: data.monitored },
      ];
});
const maxGenre = computed(() =>
  Math.max(1, ...(stats.value?.genres ?? []).map((entry) => entry.count)),
);
const maxDecade = computed(() =>
  Math.max(1, ...(stats.value?.decades ?? []).map((entry) => entry.count)),
);
const maxNetwork = computed(() =>
  Math.max(1, ...(stats.value?.networks ?? []).map((entry) => entry.count)),
);
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="query.isPending.value"
    :error="error"
  >
    <template v-if="stats">
      <v-row density="compact" class="mb-2">
        <v-col v-for="tile in tiles" :key="tile.key" cols="6" md="3">
          <StatTile
            :value="tile.value"
            :label="t(ctx.key(tile.key))"
            color="service-text"
            class="h-100"
            data-test="stats-tile"
          />
        </v-col>
      </v-row>
      <v-row density="compact">
        <v-col cols="12" md="6">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-medium">{{
              t(ctx.key('storage_disk_card_title'))
            }}</v-card-title>
            <v-card-text>
              <p class="mb-3">
                {{ t(ctx.key('total_size')) }} :
                <strong>{{ format.bytes(stats.sizeOnDisk) }}</strong>
              </p>
              <div v-for="disk in stats.disks" :key="disk.path ?? disk.label ?? ''" class="mb-3">
                <div class="d-flex text-body-small">
                  <span class="font-monospace">{{ disk.path ?? disk.label }}</span>
                  <v-spacer />
                  <span class="text-muted">{{
                    t('media.arr_system.disk.free_total_sizes', {
                      free: format.bytes(disk.freeSpace),
                      total: format.bytes(disk.totalSpace),
                    })
                  }}</span>
                </div>
                <v-progress-linear
                  :model-value="
                    disk.totalSpace > 0
                      ? ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100
                      : 0
                  "
                  color="service"
                  height="6"
                  rounded
                />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col v-if="isRadarr" cols="12" md="6">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-medium">{{
              t(ctx.key('by_quality_card_title'))
            }}</v-card-title>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>{{ t(ctx.key('col_quality')) }}</th>
                  <th>{{ t(ctx.key('col_films')) }}</th>
                  <th>{{ t(ctx.key('col_size')) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="quality in stats.qualities" :key="quality.name">
                  <td>{{ quality.name }}</td>
                  <td>{{ quality.count }}</td>
                  <td class="text-muted">{{ format.bytes(quality.size) }}</td>
                </tr>
                <tr v-if="stats.qualities.length === 0">
                  <td colspan="3" class="text-center text-muted">{{ t(ctx.key('no_data')) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-medium">{{
              t(ctx.key(isRadarr ? 'by_genre_card_title' : 'genres_card_title'))
            }}</v-card-title>
            <v-card-text>
              <div v-for="genre in stats.genres.slice(0, 15)" :key="genre.name" class="mb-1">
                <div class="d-flex text-body-small">
                  <span>{{ genre.name }}</span><v-spacer /><span class="text-muted">{{
                    genre.count
                  }}</span>
                </div>
                <v-progress-linear
                  :model-value="(genre.count / maxGenre) * 100"
                  color="service"
                  height="4"
                  rounded
                />
              </div>
              <p v-if="stats.genres.length === 0" class="text-center text-muted">
                {{ t(ctx.key('no_data')) }}
              </p>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col v-if="isRadarr" cols="12" md="6">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-medium">{{
              t(ctx.key('by_decade_card_title'))
            }}</v-card-title>
            <v-card-text>
              <div v-for="decade in stats.decades" :key="decade.name" class="mb-1">
                <div class="d-flex text-body-small">
                  <span>{{ decade.name }}</span><v-spacer /><span class="text-muted">{{
                    decade.count
                  }}</span>
                </div>
                <v-progress-linear
                  :model-value="(decade.count / maxDecade) * 100"
                  color="service"
                  height="4"
                  rounded
                />
              </div>
              <p v-if="stats.decades.length === 0" class="text-center text-muted">
                {{ t(ctx.key('no_data')) }}
              </p>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col v-else cols="12" md="6">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-medium">{{
              t(ctx.key('networks_card_title'))
            }}</v-card-title>
            <v-card-text>
              <div v-for="network in stats.networks.slice(0, 15)" :key="network.name" class="mb-1">
                <div class="d-flex text-body-small">
                  <span>{{ network.name }}</span><v-spacer /><span class="text-muted">{{
                    network.count
                  }}</span>
                </div>
                <v-progress-linear
                  :model-value="(network.count / maxNetwork) * 100"
                  color="service"
                  height="4"
                  rounded
                />
              </div>
              <p v-if="stats.networks.length === 0" class="text-center text-muted">
                {{ t(ctx.key('no_data')) }}
              </p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </AdminPage>
</template>
