<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'un utilisateur Tracearr (P5d.2, V23), ouverte depuis l'onglet
// Utilisateurs : compteurs (lectures, heures, films, épisodes, dernière
// activité), plateformes, titres les plus vus et dernières lectures. Les
// chiffres sont calculés par le serveur sur l'historique récent (fenêtre
// bornée, signalée quand elle ne couvre pas tout). L'adresse porte un jeton
// opaque, jamais l'identifiant Tracearr (D148).
import { msArrowBack, msPersonOff } from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { ApiError } from '../../app/api/client';
import { useFormat } from '../../app/format';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import StatTile from '../../components/ds/StatTile.vue';
import TracearrTabs from './TracearrTabs.vue';
import { durationLabel, tracearrApi } from './activity-api';
import { TRACEARR_ROUTES } from './tracearr-nav';

const { t } = useI18n();
const format = useFormat();
const route = useRoute();
const key = computed(() => String(route.params.key ?? ''));

const detail = useQuery({
  queryKey: computed(() => ['tracearr', 'user', key.value]),
  queryFn: ({ signal }) => tracearrApi.user(key.value, signal),
  retry: false,
});
const data = computed(() => detail.data.value);
const notFound = computed(
  () => detail.error.value instanceof ApiError && detail.error.value.status === 404,
);
const name = computed(() => data.value?.user.displayName ?? t('tracearr.user.title'));

const tiles = computed(() => {
  const s = data.value?.stats;
  return [
    ['tracearr.user.stats.plays', s?.plays ?? 0],
    ['tracearr.user.stats.watch_time', Math.round(((s?.watchTimeMs ?? 0) / 3_600_000) * 10) / 10],
    ['tracearr.user.stats.movies', s?.movies ?? 0],
    ['tracearr.user.stats.episodes', s?.episodes ?? 0],
    [
      'tracearr.user.stats.last_seen',
      (data.value?.user.lastSeen ?? 0) > 0
        ? (format.date((data.value?.user.lastSeen ?? 0) * 1000) ?? '—')
        : '—',
    ],
  ] as const;
});

/** Barres proportionnelles au plus grand nombre de lectures de la liste. */
function share(list: { plays: number }[], plays: number): number {
  const max = Math.max(1, ...list.map((item) => item.plays));
  return Math.round((plays / max) * 100);
}
</script>

<template>
  <v-container fluid data-test="tracearr-user-page">
    <ServiceDownBanner service="tracearr" />
    <ServiceHeader service="tracearr" :title="name" :subtitle="data?.user.serverName ?? null" />
    <TracearrTabs section="users" />

    <v-btn
      :to="{ name: TRACEARR_ROUTES.users.name }"
      :prepend-icon="msArrowBack"
      variant="text"
      size="small"
      class="mb-2 ms-n2"
      data-test="tracearr-user-back"
      >{{ t('tracearr.user.back') }}</v-btn
    >

    <EmptyState
      v-if="notFound"
      :icon="msPersonOff"
      :title="t('tracearr.user.not_found')"
      data-test="tracearr-user-not-found"
    />
    <v-progress-linear v-else-if="detail.isPending.value" indeterminate color="service-text" />

    <template v-else-if="data">
      <div class="d-flex align-center flex-wrap ga-2 mb-3">
        <h2 class="text-title-large" data-test="tracearr-user-name">
          {{ data.user.displayName ?? '—' }}
        </h2>
        <v-chip v-if="data.user.trustScore !== null" size="small" variant="tonal">
          {{ t('tracearr.user.trust', { score: data.user.trustScore }) }}
        </v-chip>
      </div>

      <div class="stat-grid mb-2" data-test="tracearr-user-stats">
        <StatTile
          v-for="[label, value] in tiles"
          :key="label"
          :value="value"
          :label="t(label)"
          dense
        />
      </div>
      <p
        v-if="data.truncated"
        class="text-body-small text-muted mb-4"
        data-test="tracearr-user-window"
      >
        {{ t('tracearr.user.window', { count: data.scannedRows }) }}
      </p>

      <v-row density="compact" class="mb-2 mt-2">
        <v-col
          v-for="[title, list, test] in [
            ['tracearr.user.platforms', data.stats.platforms, 'tracearr-user-platforms'],
            ['tracearr.user.top_titles', data.stats.topTitles, 'tracearr-user-top'],
          ] as const"
          :key="title"
          cols="12"
          md="6"
        >
          <v-card variant="flat" border class="h-100" :data-test="test">
            <v-card-title class="text-title-small">{{ t(title) }}</v-card-title>
            <v-card-text>
              <p v-if="list.length === 0" class="text-muted">{{ t('tracearr.user.empty') }}</p>
              <div v-for="item in list" :key="item.name" class="mb-2">
                <div class="d-flex text-body-small ga-2">
                  <span class="text-truncate">{{ item.name }}</span>
                  <v-spacer />
                  <span class="text-no-wrap text-muted">{{
                    t('tracearr.user.plays_count', { count: item.plays })
                  }}</span>
                </div>
                <v-progress-linear
                  :model-value="share(list, item.plays)"
                  color="service-text"
                  height="6"
                  rounded
                />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card variant="flat" border data-test="tracearr-user-history">
        <v-card-title class="text-title-small">{{ t('tracearr.user.history') }}</v-card-title>
        <p v-if="data.history.length === 0" class="text-muted px-4 pb-4">
          {{ t('tracearr.user.empty') }}
        </p>
        <v-list density="compact" class="py-0">
          <v-list-item
            v-for="(row, i) in data.history"
            :key="i"
            :title="row.title ?? '—'"
            :subtitle="`${row.platform ?? '—'} · ${format.dateTime(row.watchedAt * 1000) ?? ''} · ${durationLabel(Math.round(row.durationMs / 1000))}`"
            data-test="tracearr-user-history-row"
          >
            <template v-if="row.poster" #prepend>
              <v-img :src="row.poster" width="32" height="48" cover class="me-3 rounded" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </template>
  </v-container>
</template>
