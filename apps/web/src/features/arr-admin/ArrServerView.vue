<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglet « Serveur » d'une instance Radarr ou Sonarr (P5b.4, D131, D138) :
// version, pages hors de la barre basse (liste de blocage, cutoff,
// collections, système), commandes de l'instance (actualiser, RSS,
// rechercher les manquants) et pages d'administration groupées comme le menu
// « Paramètres ». Compteurs de la bibliothèque dans la barre du haut (mobile).
import { gbParts } from '../../app/format';
import { SERVICE_SETTINGS, type ArrKind, type CommandStartedResponse } from '@hubarr/shared';
import { mdiMagnifyScan, mdiRefresh, mdiRss } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import type { ArrPage, BottomNavItem } from '../../app/navigation';
import { useTopBarStats } from '../../app/service-chrome';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import ServerPanel from '../../components/ServerPanel.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import type { ServerGroup } from '../../components/server-panel';
import RadarrNav from '../movies/RadarrNav.vue';
import { moviesApi, moviesKeys } from '../movies/movies-api';
import { RADARR_BOTTOM_NAV, RADARR_PAGES } from '../movies/radarr-pages';
import SonarrNav from '../series/SonarrNav.vue';
import { seriesApi, seriesKeys } from '../series/series-api';
import { SONARR_BOTTOM_NAV, SONARR_PAGES } from '../series/sonarr-pages';
import { adminMenu } from './admin-pages';

const props = defineProps<{ kind: ArrKind }>();
const { t } = useI18n();
const route = useRoute();
const notify = useNotifyStore();
const session = useSessionStore();
const slug = computed(() => String(route.params.slug ?? ''));

// Bibliothèque par défaut : même clé que la page de la bibliothèque (cache partagé).
const libraryParams = computed(
  () => new URLSearchParams({ per_page: session.preferences.display_page_size }),
);
const movies = useQuery({
  queryKey: computed(() => moviesKeys.library(slug.value, libraryParams.value.toString())),
  queryFn: ({ signal }) => moviesApi.library(slug.value, libraryParams.value, signal),
  enabled: computed(() => props.kind === 'radarr'),
  retry: false,
});
const series = useQuery({
  queryKey: computed(() => seriesKeys.library(slug.value, libraryParams.value.toString())),
  queryFn: ({ signal }) => seriesApi.library(slug.value, libraryParams.value, signal),
  enabled: computed(() => props.kind === 'sonarr'),
  retry: false,
});
// Même clé que la page Système (`ArrSystemView`).
const system = useQuery({
  queryKey: computed(() => [props.kind, slug.value, 'page', 'system']),
  queryFn: ({ signal }) =>
    (props.kind === 'radarr' ? moviesApi : seriesApi).system(slug.value, signal),
  retry: false,
});
const version = computed(() => system.data.value?.status?.version ?? null);

useTopBarStats(() => {
  if (props.kind === 'radarr') {
    const stats = movies.data.value?.stats;
    if (!stats) return null;
    return [
      { value: stats.total, label: t('media.films.stats.total') },
      { value: stats.downloaded, label: t('media.films.stats.downloaded') },
      { value: stats.waiting, label: t('media.films.stats.waiting') },
      {
        ...gbParts(stats.totalGb),
        label: t('media.films.stats.total_size'),
      },
    ];
  }
  const stats = series.data.value?.stats;
  if (!stats) return null;
  return [
    { value: stats.total, label: t('server.stats.series') },
    { value: stats.continuing, label: t('server.stats.continuing') },
    { value: stats.ended, label: t('server.stats.ended') },
    {
      ...gbParts(stats.totalGb),
      label: t('media.films.stats.total_size'),
    },
  ];
});

async function command(
  start: (slug: string) => Promise<CommandStartedResponse>,
  label: string,
): Promise<void> {
  try {
    const started = await start(slug.value);
    if (started.cmdId === null) notify.error('server.command_error', { name: label });
    else notify.success('server.command_started', { name: label });
  } catch {
    notify.error('server.command_error', { name: label });
  }
}

const groups = computed<ServerGroup[]>(() => {
  const radarr = props.kind === 'radarr';
  const pages: ArrPage[] = radarr ? RADARR_PAGES : SONARR_PAGES;
  const inBottomNav: BottomNavItem[] = radarr ? RADARR_BOTTOM_NAV : SONARR_BOTTOM_NAV;
  const bottomNames = new Set(inBottomNav.map((item) => item.to.name));
  const api = radarr ? moviesApi : seriesApi;
  const refreshLabel = t(
    radarr ? 'media.films.actions.refresh_all_title' : 'server.commands.refresh_series',
  );
  const rssLabel = t('media.films.actions.rss_sync');
  const missingLabel = t('server.commands.search_missing');
  return [
    {
      title: null,
      items: pages
        .filter((page) => !bottomNames.has(page.name))
        .map((page) => ({
          id: page.name,
          icon: page.icon,
          label: t(page.labelKey),
          to: { name: page.name, params: { slug: slug.value } },
        })),
    },
    {
      title: t('server.group.commands'),
      items: [
        {
          id: 'refresh-all',
          icon: mdiRefresh,
          label: refreshLabel,
          run: () => command(api.refreshAll, refreshLabel),
        },
        {
          id: 'rss-sync',
          icon: mdiRss,
          label: rssLabel,
          run: () => command(api.rssSync, rssLabel),
        },
        {
          id: 'search-missing',
          icon: mdiMagnifyScan,
          label: missingLabel,
          confirm: t('server.commands.search_missing_confirm'),
          run: () =>
            command(radarr ? moviesApi.searchAllMissing : seriesApi.missingSearch, missingLabel),
        },
      ],
    },
    ...adminMenu(props.kind, 'service').map((group) => ({
      title: t(group.labelKey),
      items: group.pages.map((page) => ({
        id: page.name,
        icon: page.icon,
        label: t(page.labelKey),
        to: { name: page.name, params: { slug: slug.value } },
      })),
    })),
  ];
});
</script>

<template>
  <v-container fluid :data-test="`${kind}-server`">
    <ServiceDownBanner :service="kind" :instance="slug" />
    <RadarrNav v-if="kind === 'radarr'" />
    <SonarrNav v-else />
    <ServerPanel
      :service="kind"
      :title="SERVICE_SETTINGS[kind].label"
      :version="version"
      :groups="groups"
    />
  </v-container>
</template>
