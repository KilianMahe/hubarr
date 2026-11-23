<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page Tracearr (`tracearr/index.html.twig`, routes n° 569 à 576) : lectures
// en cours (10 s), statistiques, graphiques par période (semaine, mois,
// année : lectures, heure, jour, plateformes, flux simultanés, qualité),
// historique par curseur (« Charger plus ») et utilisateurs. Un onglet par
// partie (P5c.7, V9, D143) : le résumé (`/tracearr`) garde les compteurs, les
// lectures en cours en lignes denses et les dernières lectures de
// l'historique. Une lecture en cours s'ouvre sur son détail (V19).
import { TRACEARR_PERIODS, type ActivitySession, type TracearrHistory } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useFormat } from '../../app/format';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import ActivityPanel from './ActivityPanel.vue';
import ChartCard from './ChartCard.vue';
import SessionDetailDialog from './SessionDetailDialog.vue';
import { NOW_PLAYING_POLL_MS, durationLabel, tracearrApi } from './activity-api';
import { activitySchema } from '@hubarr/shared';
import { useLiveQuery } from '../../app/live';
import StatTile from '../../components/ds/StatTile.vue';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import { mdiAccountMultiple, mdiChevronRight, mdiMagnify } from '@mdi/js';
import EmptyState from '../../components/EmptyState.vue';
import TracearrTabs from './TracearrTabs.vue';
import { TRACEARR_ROUTES, TRACEARR_USER_ROUTE, tracearrSectionOf } from './tracearr-nav';

const { t } = useI18n();
const format = useFormat();
const route = useRoute();
const section = computed(() => tracearrSectionOf(route.name));
const shows = (...sections: (typeof section.value)[]) =>
  computed(() => sections.includes(section.value));
const period = ref<(typeof TRACEARR_PERIODS)[number]>('month');
const detail = ref<ActivitySession | null>(null);

const activity = useQuery({
  queryKey: ['tracearr', 'activity'],
  queryFn: ({ signal }) => tracearrApi.activity(signal),
  enabled: shows('summary', 'now'),
  refetchInterval: useLiveQuery({
    topic: 'activity.tracearr',
    queryKey: ['tracearr', 'activity'],
    mode: 'set',
    map: (data) => activitySchema.parse(data),
    fallbackMs: NOW_PLAYING_POLL_MS,
  }),
  retry: false,
});
const stats = useQuery({
  queryKey: ['tracearr', 'stats'],
  queryFn: ({ signal }) => tracearrApi.stats(signal),
  enabled: shows('summary', 'stats'),
  retry: false,
});
const charts = useQuery({
  queryKey: computed(() => ['tracearr', 'charts', period.value]),
  queryFn: ({ signal }) => tracearrApi.charts(period.value, signal),
  enabled: shows('stats'),
  retry: false,
});
const users = useQuery({
  queryKey: ['tracearr', 'users'],
  queryFn: ({ signal }) => tracearrApi.users(signal),
  enabled: shows('users'),
  retry: false,
});

// Liste des utilisateurs (V33) : les plus récemment actifs d'abord, recherche
// par nom au-delà de six ; chaque carte est un lien vers la fiche (V23).
const userSearch = ref<string | null>('');
const sortedUsers = computed(() => {
  const needle = (userSearch.value ?? '').trim().toLocaleLowerCase();
  return [...(users.data.value ?? [])]
    .filter(
      (user) => needle === '' || (user.displayName ?? '').toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) => b.lastSeen - a.lastSeen);
});
function initials(name: string | null): string {
  const parts = (name ?? '?')
    .trim()
    .split(/[\s._-]+/)
    .filter((part) => part !== '');
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}
const AVATAR_COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];
function avatarColor(name: string | null): string {
  let hash = 0;
  for (const char of name ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? 'primary';
}
const trustColor = (score: number) => (score >= 80 ? 'success' : score >= 50 ? 'warning' : 'error');

const history = ref<TracearrHistory['rows']>([]);
const cursor = ref<string | null>(null);
const historyLoading = ref(false);
const historyStarted = ref(false);
async function loadHistory(): Promise<void> {
  historyLoading.value = true;
  try {
    const page = await tracearrApi.history(historyStarted.value ? cursor.value : null);
    history.value = [...history.value, ...page.rows];
    cursor.value = page.nextCursor;
  } catch {
    cursor.value = null;
  } finally {
    historyStarted.value = true;
    historyLoading.value = false;
  }
}
// Première page de l'historique dès qu'une section l'affiche.
watch(
  section,
  (value) => {
    if ((value === 'summary' || value === 'history') && !historyStarted.value) void loadHistory();
  },
  { immediate: true },
);
const visibleHistory = computed(() =>
  section.value === 'summary' ? history.value.slice(0, 5) : history.value,
);

const tiles = computed(() => {
  const s = stats.data.value;
  return [
    ['tracearr.stats.today_plays', s?.todayPlays ?? 0],
    ['tracearr.stats.watch_time_today', s?.watchTimeHours ?? 0],
    ['tracearr.stats.active_users_today', s?.activeUsersToday ?? 0],
    ['tracearr.stats.plays_30d', s?.plays30d ?? 0],
    ['tracearr.stats.total_users', s?.totalUsers ?? 0],
    ['tracearr.stats.violations_7d', s?.violations7d ?? 0],
  ] as const;
});
const chartList = computed(() =>
  (
    [
      ['plays', 'tracearr.section.plays', 12],
      ['hour', 'tracearr.section.activity_hour', 6],
      ['dow', 'tracearr.section.activity_dow', 6],
      ['platforms', 'tracearr.section.platforms', 6],
      ['concurrent', 'tracearr.section.concurrent', 6],
    ] as const
  ).map(([id, title, cols]) => ({ id, title, cols, chart: charts.data.value?.[id] })),
);
</script>

<template>
  <v-container fluid data-test="tracearr-page" :data-section="section">
    <ServiceDownBanner service="tracearr" />
    <ServiceHeader service="tracearr" :title="t('tracearr.title')" />
    <TracearrTabs :section="section" />

    <!-- Compteurs : résumé et statistiques -->
    <div
      v-if="section === 'summary' || section === 'stats'"
      class="stat-grid mb-4"
      data-test="tracearr-stats"
    >
      <StatTile
        v-for="[label, value] in tiles"
        :key="label"
        :value="value"
        :label="t(label)"
        dense
      />
    </div>

    <!-- Lectures en cours : lignes denses dans le résumé, cartes dans leur onglet -->
    <template v-if="section === 'summary' || section === 'now'">
      <div class="d-flex align-center mb-2">
        <h2 class="text-title-medium">{{ t('tracearr.section.now_playing') }}</h2>
        <v-spacer />
        <v-btn
          v-if="section === 'summary'"
          :to="{ name: TRACEARR_ROUTES.now.name }"
          variant="text"
          size="small"
          data-test="tracearr-see-now"
          >{{ t('tracearr.see_all') }}</v-btn
        >
      </div>
      <ActivityPanel
        :activity="activity.data.value"
        service="tracearr"
        empty-key="tracearr.now_playing.empty"
        :compact="section === 'summary'"
        class="mb-5"
        @open="(session) => (detail = session)"
      />
    </template>

    <template v-if="section === 'stats'">
      <div class="d-flex align-center mb-2">
        <v-spacer />
        <v-btn-toggle
          v-model="period"
          mandatory
          density="compact"
          variant="outlined"
          data-test="tracearr-period"
        >
          <v-btn v-for="p in TRACEARR_PERIODS" :key="p" :value="p">{{
            t(`tracearr.period.${p}`)
          }}</v-btn>
        </v-btn-toggle>
      </div>
      <v-row density="compact" class="mb-4">
        <v-col v-for="item in chartList" :key="item.id" cols="12" :lg="item.cols">
          <ChartCard
            :title="t(item.title)"
            :chart="item.chart"
            :loading="charts.isPending.value"
            :empty-text="t('tracearr.charts.empty')"
          />
        </v-col>
        <v-col v-if="charts.data.value && charts.data.value.quality.total > 0" cols="12" lg="6">
          <v-card variant="flat" border class="h-100" data-test="tracearr-quality">
            <v-card-title class="text-title-small">{{
              t('tracearr.section.quality')
            }}</v-card-title>
            <v-card-text>
              <div
                v-for="[key, label, color] in [
                  ['directPlay', 'dashboard.plex.decision.direct_play', 'success'],
                  ['directStream', 'dashboard.plex.decision.direct_stream', 'info'],
                  ['transcode', 'dashboard.plex.decision.transcode', 'warning'],
                ] as const"
                :key="key"
                class="mb-2"
              >
                <div class="d-flex text-body-small">
                  <span>{{ t(label) }}</span><v-spacer /><span
                    >{{ charts.data.value.quality[key] }} ({{
                      charts.data.value.quality[`${key}Percent`]
                    }}
                    %)</span
                  >
                </div>
                <v-progress-linear
                  :model-value="charts.data.value.quality[`${key}Percent`]"
                  :color="color"
                  height="6"
                  rounded
                />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <div v-if="section === 'summary' || section === 'history'" class="mb-4">
      <v-card variant="flat" border data-test="tracearr-history">
        <v-card-title class="d-flex align-center text-title-small">
          {{ t('tracearr.section.history') }}
          <v-spacer />
          <v-btn
            v-if="section === 'summary'"
            :to="{ name: TRACEARR_ROUTES.history.name }"
            variant="text"
            size="small"
            data-test="tracearr-see-history"
            >{{ t('tracearr.see_all') }}</v-btn
          >
        </v-card-title>
        <p v-if="historyStarted && history.length === 0" class="text-muted px-4 pb-4">
          {{ t('tracearr.history.empty') }}
        </p>
        <v-list density="compact" class="py-0">
          <v-list-item
            v-for="(row, i) in visibleHistory"
            :key="i"
            :title="row.title ?? '—'"
            :subtitle="`${row.userDisplayName ?? '—'} · ${row.platform ?? '—'} · ${format.dateTime(row.watchedAt * 1000) ?? ''} · ${durationLabel(Math.round(row.durationMs / 1000))}`"
            data-test="tracearr-history-row"
          >
            <template v-if="row.poster" #prepend>
              <v-img :src="row.poster" width="32" height="48" cover class="me-3 rounded" />
            </template>
          </v-list-item>
        </v-list>
        <v-card-actions v-if="section === 'history' && cursor !== null">
          <v-btn
            variant="tonal"
            block
            :loading="historyLoading"
            data-test="tracearr-history-more"
            @click="loadHistory"
            >{{ t('tracearr.history.load_more') }}</v-btn
          >
        </v-card-actions>
      </v-card>
    </div>

    <!-- Utilisateurs (P5d.7, V33) : une carte par utilisateur, ouvre sa fiche -->
    <section v-if="section === 'users'" data-test="tracearr-users">
      <div class="d-flex align-center flex-wrap ga-2 mb-3">
        <h2 class="text-title-medium">{{ t('tracearr.section.users') }}</h2>
        <v-chip size="small" variant="tonal">{{ (users.data.value ?? []).length }}</v-chip>
        <v-spacer />
        <v-filter-field
          v-if="(users.data.value ?? []).length > 6"
          v-model="userSearch"
          :prepend-inner-icon="mdiMagnify"
          :placeholder="t('tracearr.users.search')"
          :aria-label="t('tracearr.users.search')"
          density="compact"
          clearable
          class="tracearr-users__search"
          data-test="tracearr-users-search"
        />
      </div>
      <EmptyState
        v-if="(users.data.value ?? []).length === 0"
        :icon="mdiAccountMultiple"
        :title="t('tracearr.users.empty')"
        inline
      />
      <div v-else class="tracearr-users__grid">
        <v-card
          v-for="(user, i) in sortedUsers"
          :key="user.key ?? i"
          variant="flat"
          border
          rounded="lg"
          :to="
            user.key !== null
              ? { name: TRACEARR_USER_ROUTE.name, params: { key: user.key } }
              : undefined
          "
          :aria-label="
            user.key !== null
              ? t('tracearr.user.open', { name: user.displayName ?? '—' })
              : undefined
          "
          class="pa-3"
          data-test="tracearr-user-card"
          :data-linked="user.key !== null"
        >
          <div class="d-flex align-center ga-3">
            <v-avatar :color="avatarColor(user.displayName)" size="44" class="text-title-medium">
              {{ initials(user.displayName) }}
            </v-avatar>
            <div class="flex-grow-1 overflow-hidden">
              <div class="text-title-small text-truncate" data-test="tracearr-user-name-cell">
                {{ user.displayName ?? '—' }}
              </div>
              <div class="text-body-small text-muted text-truncate">
                {{ user.serverName ?? '—' }}
              </div>
            </div>
            <v-icon v-if="user.key !== null" :icon="mdiChevronRight" class="text-muted" />
          </div>
          <div class="tracearr-users__stats mt-3 text-body-small">
            <div>
              <div class="text-title-small">{{ user.plays }}</div>
              <div class="text-muted">{{ t('tracearr.users.col.plays') }}</div>
            </div>
            <div>
              <div class="text-title-small text-no-wrap">
                {{ user.lastSeen > 0 ? format.date(user.lastSeen * 1000) : '—' }}
              </div>
              <div class="text-muted">{{ t('tracearr.users.col.last_seen') }}</div>
            </div>
          </div>
          <div v-if="user.trustScore !== null" class="mt-3">
            <div class="d-flex text-body-small mb-1">
              <span class="text-muted">{{ t('tracearr.users.col.trust') }}</span>
              <v-spacer />
              <span>{{ user.trustScore }}</span>
            </div>
            <v-progress-linear
              :model-value="user.trustScore"
              :color="trustColor(user.trustScore)"
              height="6"
              rounded
            />
          </div>
        </v-card>
      </div>
      <p v-if="sortedUsers.length === 0 && (users.data.value ?? []).length > 0" class="text-muted">
        {{ t('tracearr.users.no_match') }}
      </p>
    </section>

    <SessionDetailDialog :session="detail" @close="detail = null" />
  </v-container>
</template>

<style scoped>
.tracearr-users__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.tracearr-users__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.tracearr-users__search {
  max-width: 260px;
}
</style>
