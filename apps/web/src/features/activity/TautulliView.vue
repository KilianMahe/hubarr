<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page Tautulli (`tautulli/index.html.twig`, routes n° 531 à 549) : lectures
// en cours (relues toutes les 10 s, onglet visible), filtres communs (plage
// 7/30/90 jours, métrique lectures ou durée, utilisateur), statistiques,
// graphiques (lectures dans le temps par média ou par flux, heure, jour,
// plateformes, résolutions source et flux, flux par utilisateur, flux
// simultanés), historique (« Charger plus »), bibliothèques et utilisateurs.
// Un clic sur une lecture ou une ligne d'historique ouvre ses métadonnées.
import { TAUTULLI_RANGES, type TautulliHistoryItem } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import ActivityPanel from './ActivityPanel.vue';
import ChartCard from './ChartCard.vue';
import TautulliMetadataDialog from './TautulliMetadataDialog.vue';
import {
  NOW_PLAYING_POLL_MS,
  durationLabel,
  tautulliApi,
  type TautulliFilters,
} from './activity-api';
import { activitySchema } from '@hubarr/shared';
import { useLiveQuery } from '../../app/live';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';

const { t } = useI18n();
const format = useFormat();
const filters = reactive<TautulliFilters>({ range: 30, metric: 'plays', user: '' });
const playsMode = ref<'media' | 'stream'>('media');
const key = (name: string) => computed(() => ['tautulli', name, { ...filters }] as const);

const activity = useQuery({
  queryKey: ['tautulli', 'activity'],
  queryFn: ({ signal }) => tautulliApi.activity(signal),
  refetchInterval: useLiveQuery({
    topic: 'activity.tautulli',
    queryKey: ['tautulli', 'activity'],
    mode: 'set',
    map: (data) => activitySchema.parse(data),
    fallbackMs: NOW_PLAYING_POLL_MS,
  }),
  retry: false,
});
const userNames = useQuery({
  queryKey: ['tautulli', 'user-names'],
  queryFn: ({ signal }) => tautulliApi.userNames(signal),
  retry: false,
});
const stats = useQuery({
  queryKey: key('stats'),
  queryFn: ({ signal }) => tautulliApi.stats(filters, signal),
  retry: false,
});
const plays = useQuery({
  queryKey: computed(() => ['tautulli', 'plays', playsMode.value, { ...filters }] as const),
  queryFn: ({ signal }) =>
    tautulliApi.chart('plays', { ...filters, mode: playsMode.value }, signal),
  retry: false,
});
const CHARTS = [
  ['activity-hour', 'tautulli.section.activity_hour'],
  ['activity-dow', 'tautulli.section.activity_dow'],
  ['clients-stream-type', 'tautulli.section.clients'],
  ['plays-source-res', 'tautulli.section.source_res'],
  ['plays-stream-res', 'tautulli.section.stream_res'],
  ['users-stream-type', 'tautulli.section.users_stream_type'],
  ['concurrent', 'tautulli.section.concurrent'],
] as const;
const charts = CHARTS.map(([path, title]) => ({
  path,
  title,
  query: useQuery({
    queryKey: key(path),
    queryFn: ({ signal }) => tautulliApi.chart(path, filters, signal),
    retry: false,
  }),
}));
const libraries = useQuery({
  queryKey: ['tautulli', 'libraries'],
  queryFn: ({ signal }) => tautulliApi.libraries(signal),
  retry: false,
});
const users = useQuery({
  queryKey: ['tautulli', 'users'],
  queryFn: ({ signal }) => tautulliApi.users(signal),
  retry: false,
});

// Historique : 25 par page, « Charger plus » ajoute la suite.
const history = ref<TautulliHistoryItem[]>([]);
const historyDone = ref(false);
const historyLoading = ref(false);
async function loadHistory(reset: boolean): Promise<void> {
  historyLoading.value = true;
  try {
    const rows = await tautulliApi.history(reset ? 0 : history.value.length, filters.user);
    history.value = reset ? rows : [...history.value, ...rows];
    historyDone.value = rows.length < 25;
  } catch {
    historyDone.value = true;
  } finally {
    historyLoading.value = false;
  }
}
watch(
  () => filters.user,
  () => void loadHistory(true),
  { immediate: true },
);

const metadataKey = ref<string | null>(null);
const valueFormat = (v: number) => (filters.metric === 'duration' ? durationLabel(v) : String(v));
const statLists = computed(() => {
  const s = stats.data.value;
  if (!s) return [];
  return [
    [
      'tautulli.stats.top_movie',
      s.topMovies.map((m) => ({
        key: m.ratingKey,
        label: m.title,
        poster: m.poster,
        value:
          filters.metric === 'duration'
            ? durationLabel(m.duration)
            : t('tautulli.stats.plays_count', { count: m.plays }),
      })),
    ],
    [
      'tautulli.stats.top_show',
      s.topShows.map((m) => ({
        key: m.ratingKey,
        label: m.title,
        poster: m.poster,
        value:
          filters.metric === 'duration'
            ? durationLabel(m.duration)
            : t('tautulli.stats.plays_count', { count: m.plays }),
      })),
    ],
    [
      'tautulli.stats.popular_movie',
      s.popularMovies.map((m) => ({
        key: m.ratingKey,
        label: m.title,
        poster: m.poster,
        value: t('tautulli.stats.users_count', { count: m.usersWatched }),
      })),
    ],
    [
      'tautulli.stats.popular_show',
      s.popularShows.map((m) => ({
        key: m.ratingKey,
        label: m.title,
        poster: m.poster,
        value: t('tautulli.stats.users_count', { count: m.usersWatched }),
      })),
    ],
    [
      'tautulli.stats.top_user',
      s.topUsers.map((u, i) => ({
        key: `u${i}`,
        label: u.userDisplayName,
        poster: null,
        value:
          filters.metric === 'duration'
            ? durationLabel(u.duration)
            : t('tautulli.stats.plays_count', { count: u.plays }),
      })),
    ],
    [
      'tautulli.stats.top_platform',
      s.topPlatforms.map((p, i) => ({
        key: `p${i}`,
        label: p.platform,
        poster: null,
        value:
          filters.metric === 'duration'
            ? durationLabel(p.duration)
            : t('tautulli.stats.plays_count', { count: p.plays }),
      })),
    ],
    [
      'tautulli.stats.most_concurrent',
      s.mostConcurrent.map((c, i) => ({
        key: `c${i}`,
        label: c.title,
        poster: null,
        value: String(c.count),
      })),
    ],
  ] as const;
});
</script>

<template>
  <v-container fluid data-test="tautulli-page">
    <ServiceDownBanner service="tautulli" />
    <ServiceHeader service="tautulli" :title="t('tautulli.title')" />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-btn-toggle
        v-model="filters.range"
        mandatory
        density="compact"
        variant="outlined"
        data-test="tautulli-range"
      >
        <v-btn v-for="range in TAUTULLI_RANGES" :key="range" :value="range">{{
          t(`tautulli.range.${range}d`)
        }}</v-btn>
      </v-btn-toggle>
      <v-btn-toggle v-model="filters.metric" mandatory density="compact" variant="outlined">
        <v-btn value="plays">{{ t('tautulli.metric.plays') }}</v-btn>
        <v-btn value="duration">{{ t('tautulli.metric.duration') }}</v-btn>
      </v-btn-toggle>
      <v-select
        v-model="filters.user"
        :items="[
          { value: '', title: t('tautulli.filter.all_users') },
          ...(userNames.data.value ?? []).map((u) => ({ value: u.id, title: u.name })),
        ]"
        :label="t('tautulli.filter.user')"
        density="compact"
        hide-details
        style="max-width: 220px"
        data-test="tautulli-user"
      />
    </div>

    <h2 class="text-title-medium mb-2">{{ t('tautulli.section.now_playing') }}</h2>
    <ActivityPanel
      :activity="activity.data.value"
      service="tautulli"
      empty-key="dashboard.plex.empty"
      class="mb-5"
      @open="(s) => (metadataKey = s.ratingKey)"
    />

    <h2 class="text-title-medium mb-2">{{ t('tautulli.section.stats') }}</h2>
    <v-progress-linear v-if="stats.isPending.value" indeterminate color="service" class="mb-4" />
    <p v-else-if="statLists.every(([, list]) => list.length === 0)" class="text-muted mb-4">
      {{ t('tautulli.stats.empty') }}
    </p>
    <v-row v-else density="compact" class="mb-4" data-test="tautulli-stats">
      <template v-for="[title, list] in statLists" :key="title">
        <v-col v-if="list.length > 0" cols="12" sm="6" lg="4" xl="3">
          <v-card variant="flat" border class="h-100">
            <v-card-title class="text-title-small">{{ t(title) }}</v-card-title>
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="item in list"
                :key="item.key ?? item.label ?? ''"
                :title="item.label ?? '—'"
                :subtitle="item.value"
              >
                <template v-if="item.poster" #prepend>
                  <v-img :src="item.poster" width="32" height="48" cover class="me-3 rounded" />
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </template>
    </v-row>

    <v-row density="compact" class="mb-4">
      <v-col cols="12">
        <ChartCard
          :title="t('tautulli.section.plays')"
          :chart="plays.data.value"
          :loading="plays.isPending.value"
          :empty-text="t('tautulli.plays.empty')"
          :format="valueFormat"
        >
          <template #actions>
            <v-btn-toggle v-model="playsMode" mandatory density="compact" variant="outlined">
              <v-btn value="media" size="small">{{ t('tautulli.plays.mode.media') }}</v-btn>
              <v-btn value="stream" size="small">{{ t('tautulli.plays.mode.stream') }}</v-btn>
            </v-btn-toggle>
          </template>
        </ChartCard>
      </v-col>
      <v-col v-for="chart in charts" :key="chart.path" cols="12" lg="6">
        <ChartCard
          :title="t(chart.title)"
          :chart="chart.query.data.value"
          :loading="chart.query.isPending.value"
          :empty-text="t('tautulli.plays.empty')"
          :format="chart.path === 'concurrent' ? undefined : valueFormat"
        />
      </v-col>
    </v-row>

    <v-row density="compact">
      <v-col cols="12" lg="7">
        <v-card variant="flat" border data-test="tautulli-history">
          <v-card-title class="text-title-small">{{ t('tautulli.section.history') }}</v-card-title>
          <v-list density="compact" class="py-0">
            <v-list-item
              v-for="(row, i) in history"
              :key="`${row.ratingKey}-${row.watchedAt}-${i}`"
              :title="
                row.grandparentTitle
                  ? `${row.grandparentTitle} — ${row.episodeCode ?? ''} ${row.title ?? ''}`
                  : (row.title ?? '—')
              "
              :subtitle="`${row.userDisplayName ?? '—'} · ${format.dateTime(row.watchedAt * 1000) ?? ''} · ${row.percentComplete}%`"
              data-test="tautulli-history-row"
              @click="metadataKey = row.ratingKey"
            >
              <template v-if="row.poster" #prepend>
                <v-img :src="row.poster" width="32" height="48" cover class="me-3 rounded" />
              </template>
            </v-list-item>
          </v-list>
          <v-card-actions v-if="!historyDone">
            <v-btn
              variant="tonal"
              block
              :loading="historyLoading"
              data-test="tautulli-history-more"
              @click="loadHistory(false)"
              >{{ t('tautulli.history.load_more') }}</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="12" lg="5">
        <v-card variant="flat" border class="mb-3" data-test="tautulli-libraries">
          <v-card-title class="text-title-small">{{
            t('tautulli.section.libraries')
          }}</v-card-title>
          <p v-if="(libraries.data.value ?? []).length === 0" class="text-muted px-4 pb-4">
            {{ t('tautulli.libraries.empty') }}
          </p>
          <v-list v-else density="compact" class="py-0">
            <v-list-item
              v-for="(lib, i) in libraries.data.value"
              :key="i"
              :title="lib.name ?? '—'"
              :subtitle="
                lib.childCount !== null && lib.type === 'show'
                  ? `${t('tautulli.libraries.items', { count: lib.count })} · ${t('tautulli.libraries.episodes', { count: lib.childCount })}`
                  : t('tautulli.libraries.items', { count: lib.count })
              "
            />
          </v-list>
        </v-card>
        <v-card variant="flat" border data-test="tautulli-users">
          <v-card-title class="text-title-small">{{ t('tautulli.section.users') }}</v-card-title>
          <p v-if="(users.data.value ?? []).length === 0" class="text-muted px-4 pb-4">
            {{ t('tautulli.users.empty') }}
          </p>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>{{ t('tautulli.users.col.user') }}</th>
                <th>{{ t('tautulli.users.col.plays') }}</th>
                <th>{{ t('tautulli.users.col.duration') }}</th>
                <th>{{ t('tautulli.users.col.last_seen') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(user, i) in users.data.value" :key="i">
                <td>{{ user.friendlyName ?? '—' }}</td>
                <td>{{ user.plays }}</td>
                <td>{{ durationLabel(user.durationSeconds) }}</td>
                <td class="text-no-wrap">
                  {{ user.lastSeen > 0 ? format.date(user.lastSeen * 1000) : '—' }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <TautulliMetadataDialog :rating-key="metadataKey" @close="metadataKey = null" />
  </v-container>
</template>
