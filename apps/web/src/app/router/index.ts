// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes de la SPA. Les URL des pages restent celles de l'original (CLAUDE.md,
// Annexe A) ; le serveur répond `index.html` sur chacune.

import type { ServiceId } from '@hubarr/shared';
import { msAdd } from '../../components/symbols';
import type { Pinia } from 'pinia';
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouteRecordSingleView,
  type RouterHistory,
} from 'vue-router';
import { adminRoutes } from '../../features/arr-admin/admin-pages';
import { RADARR_BOTTOM_NAV, RADARR_FAB } from '../../features/movies/radarr-pages';
import {
  PROWLARR_BOTTOM_NAV,
  PROWLARR_FAB,
  PROWLARR_PAGES,
  PROWLARR_SUBPAGES,
} from '../../features/prowlarr/prowlarr-pages';
import { basePath } from '../base-path';
import { SETTINGS_SERVICES_LOCATION } from '../service-admin';
import { BAZARR_TABS } from '../../features/bazarr/bazarr-nav';
import {
  TRACEARR_ROUTES,
  TRACEARR_SECTIONS,
  TRACEARR_TABS,
  TRACEARR_USER_ROUTE,
} from '../../features/activity/tracearr-nav';
import { SEERR_BOTTOM_NAV } from '../../features/seerr/seerr-nav';
import { SETTINGS_BOTTOM_NAV } from '../../features/settings/sections';
import { HOME_TABS } from '../home-tabs';
import { SONARR_BOTTOM_NAV, SONARR_FAB } from '../../features/series/sonarr-pages';
import { USENET_BOTTOM_NAV, USENET_FAB } from '../../features/usenet/usenet-nav';
import type { BottomNavItem, RouteFab } from '../navigation';
import { installGuards, type GuardOptions } from './guards';

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible sans session (l'assistant et la connexion le sont aussi). */
    public?: boolean;
    /** Réservé aux visiteurs non connectés : un utilisateur connecté repart vers l'accueil. */
    guestOnly?: boolean;
    /** Écran de l'assistant d'installation. */
    setup?: boolean;
    requiresAdmin?: boolean;
    /** Clé i18n du titre (onglet du navigateur et barre du haut). */
    titleKey?: string;
    /** Service affiché : accent par service et barre basse. */
    service?: ServiceId;
    /** Onglets de la barre basse (mobile) des vues du service. */
    bottomNav?: BottomNavItem[];
    /** Action principale du service, au centre de la barre basse ou en bouton flottant (mobile). */
    fab?: RouteFab;
    /** Paramètre du chemin qui désigne le service (`/usenet/:client`). */
    serviceParam?: string;
    /** Page d'index du service : elle affiche sa bannière au lieu d'être redirigée. */
    serviceIndex?: boolean;
    /** Exige au moins l'un de ces services (calendrier : Radarr ou Sonarr). */
    requiresAnyService?: ServiceId[];
    /** Page d'administration Radarr/Sonarr (P3b, `admin-pages.ts`). */
    adminPage?: string;
    /** Section d'une vue Seerr partagée entre plusieurs pages (P3f). */
    seerrSection?: string;
    /**
     * Page d'administration d'un service, ouverte depuis les paramètres de
     * Hubarr (P5c.4, D140) : pas de FAB, lien « Retour aux paramètres » ; sur
     * mobile, barre basse des groupes du service (`serviceSettingsBottomNav`).
     */
    serviceSettings?: boolean;
  }
}

/** Page d'une instance Radarr (réservée aux admins, barre basse du service). */
function radarrPage(
  path: string,
  name: string,
  titleKey: string,
  component: RouteRecordSingleView['component'],
): RouteRecordRaw {
  return {
    path,
    name,
    component,
    meta: {
      service: 'radarr',
      titleKey,
      requiresAdmin: true,
      bottomNav: RADARR_BOTTOM_NAV,
      fab: RADARR_FAB,
    },
  };
}

/** Page d'administration ouverte depuis les paramètres : sans barre basse ni FAB (D140). */
function settingsPage(record: RouteRecordRaw): RouteRecordRaw {
  const { bottomNav: _bottomNav, fab: _fab, ...meta } = record.meta ?? {};
  return { ...record, meta: { ...meta, serviceSettings: true } };
}

/** Page d'une instance Sonarr (réservée aux admins, barre basse du service). */
function sonarrPage(
  path: string,
  name: string,
  titleKey: string,
  component: RouteRecordSingleView['component'],
): RouteRecordRaw {
  return {
    path,
    name,
    component,
    meta: {
      service: 'sonarr',
      titleKey,
      requiresAdmin: true,
      bottomNav: SONARR_BOTTOM_NAV,
      fab: SONARR_FAB,
    },
  };
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../../features/auth/LoginView.vue'),
    meta: { public: true, guestOnly: true, titleKey: 'login.title' },
  },
  {
    path: '/setup',
    component: () => import('../../layouts/SetupLayout.vue'),
    meta: { public: true, setup: true },
    children: [
      { path: '', redirect: { name: 'setup-welcome' } },
      {
        path: 'welcome',
        name: 'setup-welcome',
        component: () => import('../../features/setup/SetupWelcome.vue'),
        meta: { titleKey: 'setup.step.welcome.title' },
      },
      {
        path: 'admin',
        name: 'setup-admin',
        component: () => import('../../features/setup/SetupAdmin.vue'),
        meta: { titleKey: 'setup.stepper.admin' },
      },
    ],
  },
  {
    path: '/',
    component: () => import('../../layouts/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('../../features/home/HomeView.vue'),
        meta: { titleKey: 'common.labels.welcome' },
      },
      {
        path: 'profil',
        name: 'profile',
        component: () => import('../../features/profile/ProfileView.vue'),
        meta: { titleKey: 'profile.title' },
      },
      {
        path: 'admin/settings',
        name: 'settings',
        component: () => import('../../features/settings/SettingsView.vue'),
        meta: { titleKey: 'admin.page.title', requiresAdmin: true, bottomNav: SETTINGS_BOTTOM_NAV },
      },
      {
        // Journaux : section des paramètres (lot 9) ; l'adresse reste valide.
        path: 'admin/logs',
        name: 'logs',
        redirect: { name: 'settings', hash: '#section-logs' },
      },
      {
        path: 'tableau-de-bord',
        name: 'dashboard',
        component: () => import('../../features/dashboard/DashboardView.vue'),
        meta: { titleKey: 'dashboard.title', bottomNav: HOME_TABS },
      },
      {
        // Route n° 70 : les admins vont aux services des paramètres, les autres à l'accueil.
        path: 'services/configurer',
        name: 'configure-services',
        // Jamais affichée : la garde redirige selon le rôle (`resolveNavigation`).
        component: () => import('../../features/home/HomeView.vue'),
      },
      {
        path: 'decouverte',
        name: 'tmdb',
        component: () => import('../../features/discover/DiscoverView.vue'),
        meta: {
          serviceIndex: true,
          service: 'tmdb',
          titleKey: 'sidebar.nav.discovery',
          bottomNav: HOME_TABS,
        },
      },
      {
        path: 'decouverte/explorer',
        name: 'tmdb-explorer',
        component: () => import('../../features/discover/ExplorerView.vue'),
        meta: { service: 'tmdb', titleKey: 'decouverte.explorer.title', bottomNav: HOME_TABS },
      },
      {
        path: 'decouverte/watchlist',
        name: 'tmdb-watchlist',
        component: () => import('../../features/discover/WatchlistView.vue'),
        meta: { service: 'tmdb', titleKey: 'decouverte.watchlist.title', bottomNav: HOME_TABS },
      },
      {
        path: 'calendrier',
        name: 'calendar',
        component: () => import('../../features/calendar/CalendarView.vue'),
        meta: {
          titleKey: 'sidebar.nav.calendar',
          requiresAnyService: ['radarr', 'sonarr'],
          bottomNav: HOME_TABS,
        },
      },
      {
        path: 'medias/:slug/films',
        name: 'radarr',
        component: () => import('../../features/movies/MoviesView.vue'),
        // Ancien lien profond de la fiche (`?open=<id>`, D88) → page du film (D130).
        beforeEnter: (to) => {
          const open = typeof to.query.open === 'string' ? to.query.open : '';
          if (!/^\d+$/.test(open)) return true;
          return {
            name: 'radarr-movie',
            params: { slug: to.params.slug, id: open },
            replace: true,
          };
        },
        meta: {
          serviceIndex: true,
          service: 'radarr',
          titleKey: 'sidebar.nav.films',
          requiresAdmin: true,
          bottomNav: RADARR_BOTTOM_NAV,
          fab: RADARR_FAB,
        },
      },
      // Fiche d'un film en page (P5b.3, D130).
      radarrPage(
        'medias/:slug/films/:id(\\d+)',
        'radarr-movie',
        'sidebar.nav.films',
        () => import('../../features/movies/MovieDetailView.vue'),
      ),
      // Onglet « File d'attente » (P5c.6, V18, D143) : URL propre à Hubarr.
      radarrPage(
        'medias/:slug/films/file-attente',
        'radarr-queue',
        'media.queue_page.title',
        () => import('../../features/movies/MoviesQueueView.vue'),
      ),
      // Pages de l'instance Radarr (P2.7), aux URL de l'original.
      radarrPage(
        'medias/:slug/films/manquants',
        'radarr-missing',
        'media.films_missing.title',
        () => import('../../features/movies/MoviesMissingView.vue'),
      ),
      radarrPage(
        'medias/:slug/films/cutoff',
        'radarr-cutoff',
        'media.films_cutoff.empty_title',
        () => import('../../features/movies/MoviesCutoffView.vue'),
      ),
      radarrPage(
        'medias/:slug/films/historique',
        'radarr-history',
        'media.films_history.title',
        () => import('../../features/movies/MoviesHistoryView.vue'),
      ),
      radarrPage(
        'medias/:slug/films/blocklist',
        'radarr-blocklist',
        'media.films_blocklist.title',
        () => import('../../features/movies/MoviesBlocklistView.vue'),
      ),
      radarrPage(
        'medias/:slug/films/collections',
        'radarr-collections',
        'media.films_collections.title',
        () => import('../../features/movies/MoviesCollectionsView.vue'),
      ),
      // Onglet « Serveur » (P5b.4, D138) : URL propre à Hubarr.
      {
        ...radarrPage(
          'medias/:slug/radarr/serveur',
          'radarr-server',
          'server.tab',
          () => import('../../features/arr-admin/ArrServerView.vue'),
        ),
        props: { kind: 'radarr' },
      } as RouteRecordRaw,
      // État du système : administration, ouverte depuis les paramètres (D140).
      settingsPage(
        radarrPage(
          'medias/:slug/radarr/systeme',
          'radarr-system',
          'media.arr_system.title_radarr',
          () => import('../../features/movies/RadarrSystemView.vue'),
        ),
      ),
      {
        path: 'medias/:slug/series',
        name: 'sonarr',
        component: () => import('../../features/series/SeriesView.vue'),
        // Ancien lien profond de la fiche (`?open=<id>`, D94) → page de la série (D130).
        beforeEnter: (to) => {
          const open = typeof to.query.open === 'string' ? to.query.open : '';
          if (!/^\d+$/.test(open)) return true;
          return {
            name: 'sonarr-series',
            params: { slug: to.params.slug, id: open },
            replace: true,
          };
        },
        meta: {
          serviceIndex: true,
          service: 'sonarr',
          titleKey: 'sidebar.nav.series',
          requiresAdmin: true,
          bottomNav: SONARR_BOTTOM_NAV,
          fab: SONARR_FAB,
        },
      },
      // Onglets « Prochains épisodes » et « File d'attente » (P5c.6, V17, V18,
      // D143) : URL propres à Hubarr.
      sonarrPage(
        'medias/:slug/series/prochains',
        'sonarr-upcoming',
        'media.upcoming.title',
        () => import('../../features/series/SeriesUpcomingView.vue'),
      ),
      sonarrPage(
        'medias/:slug/series/file-attente',
        'sonarr-queue',
        'media.queue_page.title',
        () => import('../../features/series/SeriesQueueView.vue'),
      ),
      // Pages de l'instance Sonarr (P3a.3), aux URL de l'original.
      sonarrPage(
        'medias/:slug/series/manquants',
        'sonarr-missing',
        'media.series_missing.title',
        () => import('../../features/series/SeriesMissingView.vue'),
      ),
      sonarrPage(
        'medias/:slug/series/cutoff',
        'sonarr-cutoff',
        'media.series_cutoff.title',
        () => import('../../features/series/SeriesCutoffView.vue'),
      ),
      sonarrPage(
        'medias/:slug/series/historique',
        'sonarr-history',
        'media.series_history.title',
        () => import('../../features/series/SeriesHistoryView.vue'),
      ),
      sonarrPage(
        'medias/:slug/series/blocklist',
        'sonarr-blocklist',
        'media.series_blocklist.title',
        () => import('../../features/series/SeriesBlocklistView.vue'),
      ),
      {
        ...sonarrPage(
          'medias/:slug/sonarr/serveur',
          'sonarr-server',
          'server.tab',
          () => import('../../features/arr-admin/ArrServerView.vue'),
        ),
        props: { kind: 'sonarr' },
      } as RouteRecordRaw,
      settingsPage(
        sonarrPage(
          'medias/:slug/series/systeme',
          'sonarr-system',
          'media.arr_system.title_sonarr',
          () => import('../../features/series/SonarrSystemView.vue'),
        ),
      ),
      // Administration Radarr/Sonarr (P3b), aux URL de l'original.
      ...adminRoutes((kind, settings) =>
        settings
          ? { service: kind, requiresAdmin: true, serviceSettings: true }
          : {
              service: kind,
              requiresAdmin: true,
              bottomNav: kind === 'radarr' ? RADARR_BOTTOM_NAV : SONARR_BOTTOM_NAV,
              fab: kind === 'radarr' ? RADARR_FAB : SONARR_FAB,
            },
      ),
      // Routes n° 526 à 529 : l'original rendait ces pages Sonarr avec le gabarit
      // des commandes (bug) ; elles mènent aux pages de P3a.
      ...(
        [
          ['historique', 'sonarr-history'],
          ['blocklist', 'sonarr-blocklist'],
          ['manquants', 'sonarr-missing'],
          ['cutoff', 'sonarr-cutoff'],
        ] as const
      ).map(([segment, name]): RouteRecordRaw => ({
        path: `medias/:slug/sonarr/${segment}`,
        name: `sonarr-legacy-${segment}`,
        redirect: (to) => ({ name, params: { slug: to.params.slug }, query: to.query }),
      })),
      // Page n° 195 de l'original : fiche de la série en page (P5b.3, D130).
      sonarrPage(
        'medias/:slug/series/:id(\\d+)',
        'sonarr-series',
        'sidebar.nav.series',
        () => import('../../features/series/SeriesDetailView.vue'),
      ),
      // Prowlarr (P3c), aux URL de l'original.
      {
        path: 'prowlarr',
        name: 'prowlarr',
        component: () => import('../../features/prowlarr/ProwlarrIndexersView.vue'),
        meta: {
          serviceIndex: true,
          service: 'prowlarr',
          titleKey: 'sidebar.nav.prowlarr',
          requiresAdmin: true,
          bottomNav: PROWLARR_BOTTOM_NAV,
          fab: PROWLARR_FAB,
        },
      },
      ...PROWLARR_SUBPAGES.map((page): RouteRecordRaw => ({
        path: page.path,
        name: page.name,
        component: page.component,
        meta: PROWLARR_PAGES.some((tab) => tab.name === page.name)
          ? {
              service: 'prowlarr',
              titleKey: page.titleKey,
              requiresAdmin: true,
              bottomNav: PROWLARR_BOTTOM_NAV,
              fab: PROWLARR_FAB,
            }
          : // Menus « Paramètres » et « Système » : administration (D140).
            {
              service: 'prowlarr',
              titleKey: page.titleKey,
              requiresAdmin: true,
              serviceSettings: true,
            },
      })),
      // Ancien onglet « Serveur » (P5b.4, URL propre à Hubarr) : tout y était
      // administration, désormais dans les paramètres (D140).
      { path: 'prowlarr/serveur', name: 'prowlarr-server', redirect: SETTINGS_SERVICES_LOCATION },
      { path: 'jellyseerr/serveur', name: 'seerr-server', redirect: SETTINGS_SERVICES_LOCATION },
      // Seerr (P3f), aux URL de l'original.
      ...(
        [
          [
            'jellyseerr',
            'seerr',
            'sidebar.nav.jellyseerr',
            () => import('../../features/seerr/views/SeerrRequestsView.vue'),
            undefined,
            true,
          ],
          [
            'jellyseerr/utilisateurs',
            'seerr-users',
            'jellyseerr.users.page_title',
            () => import('../../features/seerr/views/SeerrUsersView.vue'),
            undefined,
            false,
          ],
          [
            'jellyseerr/utilisateurs/:id(\\d+)',
            'seerr-user',
            'jellyseerr.users.page_title',
            () => import('../../features/seerr/views/SeerrUserView.vue'),
            undefined,
            false,
          ],
          [
            'jellyseerr/parametres',
            'seerr-settings',
            'jellyseerr.nav.general',
            () => import('../../features/seerr/views/SeerrSettingsGeneralView.vue'),
            'general',
            false,
          ],
          [
            'jellyseerr/parametres/utilisateurs',
            'seerr-settings-users',
            'jellyseerr.nav.default_users',
            () => import('../../features/seerr/views/SeerrSettingsGeneralView.vue'),
            'users',
            false,
          ],
          [
            'jellyseerr/parametres/jellyfin',
            'seerr-settings-jellyfin',
            'jellyseerr.nav.jellyfin',
            () => import('../../features/seerr/views/SeerrSettingsJellyfinView.vue'),
            undefined,
            false,
          ],
          [
            'jellyseerr/parametres/services',
            'seerr-settings-services',
            'jellyseerr.nav.services',
            () => import('../../features/seerr/views/SeerrSettingsServicesView.vue'),
            undefined,
            false,
          ],
          [
            'jellyseerr/parametres/taches-cache',
            'seerr-settings-tasks',
            'jellyseerr.nav.tasks_cache',
            () => import('../../features/seerr/views/SeerrSystemView.vue'),
            'tasks',
            false,
          ],
          [
            'jellyseerr/parametres/logs',
            'seerr-settings-logs',
            'jellyseerr.nav.logs',
            () => import('../../features/seerr/views/SeerrSystemView.vue'),
            'logs',
            false,
          ],
          [
            'jellyseerr/parametres/a-propos',
            'seerr-settings-about',
            'jellyseerr.nav.about',
            () => import('../../features/seerr/views/SeerrSystemView.vue'),
            'about',
            false,
          ],
          [
            'jellyseerr/parametres/mises-a-jour',
            'seerr-settings-updates',
            'jellyseerr.nav.updates',
            () => import('../../features/seerr/views/SeerrSystemView.vue'),
            'updates',
            false,
          ],
        ] as const
      ).map(([path, name, titleKey, component, seerrSection, serviceIndex]): RouteRecordRaw => ({
        path,
        name,
        component,
        meta: {
          service: 'seerr',
          titleKey,
          requiresAdmin: true,
          // Réglages et système : administration, ouverte depuis les paramètres (D140).
          ...(name.startsWith('seerr-settings')
            ? { serviceSettings: true }
            : { bottomNav: SEERR_BOTTOM_NAV }),
          ...(serviceIndex ? { serviceIndex: true } : {}),
          ...(seerrSection ? { seerrSection } : {}),
        },
      })),
      // Clients torrent (P3d) : une seule vue, pilotée par les capacités du client.
      ...(['qbittorrent', 'deluge', 'transmission'] as const).map((client): RouteRecordRaw => ({
        path: client,
        name: client,
        component: () => import('../../features/downloads/TorrentsView.vue'),
        props: { client },
        meta: {
          serviceIndex: true,
          service: client,
          titleKey: `sidebar.nav.${client}`,
          requiresAdmin: true,
          // Pas d'onglets : FAB flottant d'ajout (mobile, P5b.4).
          fab: {
            icon: msAdd,
            labelKey: 'qbittorrent.toolbar.add_title',
            action: 'add',
            index: client,
            testId: 'torrent-add-open',
          },
        },
      })),
      // Usenet (P3d.5) : file et historique, `:client` = SABnzbd ou NZBGet.
      {
        path: 'usenet/:client(sabnzbd|nzbget)',
        name: 'usenet',
        component: () => import('../../features/usenet/UsenetView.vue'),
        meta: {
          serviceIndex: true,
          serviceParam: 'client',
          requiresAdmin: true,
          bottomNav: USENET_BOTTOM_NAV,
          fab: USENET_FAB,
        },
      },
      {
        path: 'usenet/:client(sabnzbd|nzbget)/history',
        name: 'usenet-history',
        component: () => import('../../features/usenet/UsenetHistoryView.vue'),
        meta: {
          serviceParam: 'client',
          titleKey: 'usenet.history.title',
          requiresAdmin: true,
          bottomNav: USENET_BOTTOM_NAV,
          fab: USENET_FAB,
        },
      },
      // Route n° 231 : page Téléchargements agrégée (l'original redirigeait vers qBittorrent).
      {
        path: 'medias/:slug/telechargements',
        name: 'downloads',
        component: () => import('../../features/downloads/DownloadsView.vue'),
        meta: { titleKey: 'qbittorrent.page_title', requiresAdmin: true },
      },
      // Tautulli et Tracearr (P3e) : ouverts à tous les utilisateurs, comme l'original.
      {
        path: 'tautulli',
        name: 'tautulli',
        component: () => import('../../features/activity/TautulliView.vue'),
        meta: { serviceIndex: true, service: 'tautulli', titleKey: 'tautulli.title' },
      },
      // Bazarr (P3c.4), aux URL de l'original.
      {
        path: 'bazarr',
        name: 'bazarr',
        component: () => import('../../features/bazarr/views/BazarrIndexView.vue'),
        meta: {
          serviceIndex: true,
          service: 'bazarr',
          titleKey: 'sidebar.nav.bazarr',
          requiresAdmin: true,
          bottomNav: BAZARR_TABS,
        },
      },
      ...(
        [
          [
            'bazarr/movies',
            'bazarr-movies',
            'bazarr.nav.movies',
            () => import('../../features/bazarr/views/BazarrMoviesView.vue'),
          ],
          [
            'bazarr/series',
            'bazarr-series',
            'bazarr.nav.series',
            () => import('../../features/bazarr/views/BazarrSeriesView.vue'),
          ],
          [
            'bazarr/history',
            'bazarr-history',
            'bazarr.nav.history',
            () => import('../../features/bazarr/views/BazarrHistoryView.vue'),
          ],
          [
            'bazarr/series/:seriesId(\\d+)',
            'bazarr-series-detail',
            'bazarr.series_detail.title',
            () => import('../../features/bazarr/views/BazarrSeriesDetailView.vue'),
          ],
        ] as const
      ).map(([path, name, titleKey, component]): RouteRecordRaw => ({
        path,
        name,
        component,
        meta: { service: 'bazarr', titleKey, requiresAdmin: true, bottomNav: BAZARR_TABS },
      })),
      // Tracearr (P3e) : ouvert à tous ; un onglet par partie (P5c.7, V9, D143).
      ...TRACEARR_SECTIONS.map((section): RouteRecordRaw => ({
        path: TRACEARR_ROUTES[section].path,
        name: TRACEARR_ROUTES[section].name,
        component: () => import('../../features/activity/TracearrView.vue'),
        meta: {
          ...(section === 'summary' ? { serviceIndex: true } : {}),
          service: 'tracearr',
          titleKey: section === 'summary' ? 'tracearr.title' : `tracearr.nav.${section}`,
          bottomNav: TRACEARR_TABS,
        },
      })),
      // Fiche d'un utilisateur (P5d.2, V23), sous l'onglet Utilisateurs.
      {
        path: TRACEARR_USER_ROUTE.path,
        name: TRACEARR_USER_ROUTE.name,
        component: () => import('../../features/activity/TracearrUserView.vue'),
        meta: { service: 'tracearr', titleKey: 'tracearr.user.title', bottomNav: TRACEARR_TABS },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../../features/errors/NotFoundView.vue'),
        meta: { titleKey: 'error.404.title' },
      },
    ],
  },
];

export function createHubarrRouter(
  pinia: Pinia,
  history: RouterHistory = createWebHistory(basePath()),
  options: GuardOptions = {},
) {
  const router = createRouter({ history, routes });
  installGuards(router, pinia, options);
  return router;
}
