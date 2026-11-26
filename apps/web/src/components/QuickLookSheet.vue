<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Aperçu rapide d'un titre (`_quicklook_body.html.twig`, routes n° 41 et 42),
// ouvert depuis le dashboard ou la recherche globale : fond, affiche, année,
// durée ou chaîne et saisons, note, genres, état en bibliothèque, dates de
// sortie, plateformes, distribution, synopsis ; action principale « Gérer »
// (fiche de l'instance exacte) ou « Découvrir » + « Ajouter » ; watchlist et
// bande-annonce pour un titre TMDB.
import { msAdd, msOpenInNew, msPlayArrowFill, msStar, msStarFill } from './symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';
import { closeQuickLook, openQuickAdd, overlays } from '../app/overlays';
import { useSessionStore } from '../app/stores/session';
import { useFormat } from '../app/format';
import { dashboardApi } from '../features/dashboard/dashboard-api';
import { useWatchlist } from '../features/discover/useWatchlist';
import ResponsiveDialog from './ResponsiveDialog.vue';
import { mediaDetailLocation } from '../app/media-links';

const { t } = useI18n();
const format = useFormat();
const session = useSessionStore();
const watchlist = useWatchlist();

const open = computed({
  get: () => overlays.quickLook !== null,
  set: (value) => {
    if (!value) closeQuickLook();
  },
});
const ql = useQuery({
  queryKey: computed(() => ['quicklook', overlays.quickLook] as const),
  queryFn: ({ signal }) => {
    const target = overlays.quickLook;
    if (target === null) throw new Error('no target');
    return dashboardApi.quickLook(target, signal);
  },
  enabled: computed(() => overlays.quickLook !== null),
  staleTime: 60_000,
  retry: false,
});
const d = computed(() => ql.data.value);
const STATUS_COLOR = { downloaded: 'success', monitored: 'info', missing: 'warning' } as const;
const meta = computed(() => {
  const value = d.value;
  if (value === undefined) return '';
  const parts: string[] = [];
  if (value.year) parts.push(String(value.year));
  if (value.runtime) parts.push(t('dashboard.quicklook.runtime', { min: value.runtime }));
  if (value.network) parts.push(value.network);
  if (value.seasons) parts.push(t('dashboard.quicklook.seasons', { count: value.seasons }));
  return parts.join(' · ');
});
const action = computed<{ to: RouteLocationRaw; label: string } | null>(() => {
  const value = d.value;
  if (value === undefined) return null;
  if (value.action.kind === 'manage') {
    // Fiche Radarr/Sonarr : droit de lecture sur l'instance.
    const service = value.action.type === 'movie' ? 'radarr' : 'sonarr';
    if (!session.can(service, value.action.slug, 'read')) return null;
    return {
      to: mediaDetailLocation(value.action.type, value.action.slug, value.action.id),
      label: t('dashboard.quicklook.manage'),
    };
  }
  return {
    to: { name: 'tmdb', query: { detail: `${value.action.type}/${value.action.id}` } },
    label: t('dashboard.quicklook.discover'),
  };
});
const inWatchlist = computed(() =>
  d.value?.tmdbId && d.value.tmdbType ? watchlist.has(d.value.tmdbType, d.value.tmdbId) : false,
);
const canWatchlist = computed(
  () => watchlist.editable.value && overlays.quickLook?.kind === 'tmdb' && d.value?.tmdbId != null,
);
function star(): void {
  const value = d.value;
  if (!value?.tmdbId || !value.tmdbType) return;
  watchlist.toggle({
    id: value.tmdbId,
    type: value.tmdbType,
    title: value.title,
    posterPath: value.posterPath,
    vote: value.rating,
    year: value.year,
  });
}
const trailerUrl = computed(() =>
  d.value?.trailerKey
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(d.value.trailerKey)}`
    : '',
);
// Ajout : droit d'écriture sur au moins une instance du type du titre.
const canAdd = computed(() => {
  const value = d.value;
  if (value?.action.kind !== 'discover') return false;
  return session.can(value.action.type === 'movie' ? 'radarr' : 'sonarr', null, 'write');
});
function add(): void {
  const value = d.value;
  if (value?.action.kind === 'discover')
    openQuickAdd({ tmdb: { type: value.action.type, id: value.action.id } });
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="d?.title ?? ''" :max-width="720">
    <div data-test="quicklook">
      <v-progress-linear v-if="ql.isFetching.value" indeterminate color="primary" />
      <v-alert v-if="ql.isError.value" type="warning" variant="tonal">{{
        t('dashboard.quicklook.error')
      }}</v-alert>
      <template v-if="d">
        <v-img v-if="d.backdrop" :src="d.backdrop" height="160" cover rounded="lg" class="mb-3" />
        <div class="d-flex ga-3">
          <v-img
            v-if="d.poster"
            :src="d.poster"
            width="96"
            :aspect-ratio="2 / 3"
            rounded="md"
            class="flex-grow-0"
          />
          <div class="flex-grow-1">
            <div class="text-body-medium text-muted">{{ meta }}</div>
            <div class="d-flex flex-wrap ga-1 my-2">
              <v-chip v-if="d.rating" size="small" :prepend-icon="msStarFill">{{
                Math.round(d.rating * 10) / 10
              }}</v-chip>
              <v-chip v-if="d.status" size="small" :color="STATUS_COLOR[d.status]" variant="flat">{{
                t(`dashboard.quicklook.status.${d.status}`)
              }}</v-chip>
              <v-chip v-if="d.airStatus" size="small" variant="outlined">{{
                t(`dashboard.quicklook.airstatus.${d.airStatus}`)
              }}</v-chip>
              <v-chip v-for="g in d.genres" :key="g" size="small" variant="tonal">{{ g }}</v-chip>
            </div>
            <div v-if="d.releaseDates.length" class="d-flex flex-wrap ga-1 mb-2">
              <v-chip
                v-for="chip in d.releaseDates"
                :key="chip.kind"
                size="small"
                :color="chip.upcoming ? 'primary' : undefined"
                :variant="chip.upcoming ? 'flat' : 'outlined'"
                >{{ t(`dashboard.quicklook.date.${chip.kind}`) }} ·
                {{ format.date(`${chip.date}T12:00:00Z`) }}</v-chip
              >
            </div>
          </div>
        </div>
        <p v-if="d.overview" class="text-body-medium my-3">{{ d.overview }}</p>
        <template v-if="d.providers.length">
          <div class="text-label-large mb-1">{{ t('dashboard.quicklook.providers') }}</div>
          <div class="d-flex flex-wrap ga-1 mb-3">
            <v-chip v-for="p in d.providers" :key="p.name" size="small">
              <template v-if="p.logo" #prepend>
                <v-avatar size="18" class="me-1"><v-img :src="p.logo" /></v-avatar>
              </template>
              {{ p.name }}
            </v-chip>
          </div>
        </template>
        <div v-if="d.cast.length" class="d-flex ga-3 overflow-x-auto mb-2">
          <div v-for="c in d.cast" :key="c.name" class="text-center" style="width: 64px">
            <v-avatar size="52" color="surface-alt">
              <v-img v-if="c.profile" :src="c.profile" cover />
              <span v-else>{{ c.name.charAt(0) }}</span>
            </v-avatar>
            <div class="text-label-small text-truncate">{{ c.name }}</div>
          </div>
        </div>
      </template>
    </div>
    <template #actions>
      <template v-if="d">
        <v-btn
          v-if="canWatchlist"
          :prepend-icon="inWatchlist ? msStarFill : msStar"
          variant="text"
          :color="inWatchlist ? 'warning' : undefined"
          @click="star"
          >{{
            t(inWatchlist ? 'dashboard.quicklook.watchlist_added' : 'dashboard.quicklook.watchlist')
          }}</v-btn
        >
        <v-btn
          v-if="d.trailerKey"
          :href="trailerUrl"
          target="_blank"
          rel="noopener"
          variant="text"
          :prepend-icon="msPlayArrowFill"
          :append-icon="msOpenInNew"
          >{{ t('dashboard.quicklook.trailer') }}</v-btn
        >
        <v-btn
          v-if="canAdd"
          variant="tonal"
          :prepend-icon="msAdd"
          data-test="quicklook-add"
          @click="add"
          >{{ t('decouverte.action.add') }}</v-btn
        >
        <v-btn
          v-if="action"
          :to="action.to"
          color="primary"
          data-test="quicklook-action"
          @click="open = false"
          >{{ action.label }}</v-btn
        >
      </template>
      <v-btn v-else variant="text" @click="open = false">{{
        t('dashboard.quicklook.close')
      }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>
