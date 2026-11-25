// SPDX-License-Identifier: AGPL-3.0-or-later
// Groupe « Accueil » (lot 11) : Tableau de bord, Découverte, Explorateur,
// Watchlist et Calendrier gardent leurs URL et sont reliés par des onglets (en
// haut de page sur grand écran, barre basse sur mobile, `meta.bottomNav`). Un
// onglet n'apparaît que si sa page est utilisable : Découverte, Explorateur et
// Watchlist avec TMDB, Calendrier avec Radarr ou Sonarr, chacun visible dans le
// menu (`sidebar_hide_*`).

import type { BootstrapServices } from '@hubarr/shared';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  msCalendarToday,
  msDashboardFill,
  msExplore,
  msManageSearch,
  msStarFill,
} from '../components/symbols';
import type { BottomNavItem, BottomNavContext } from './navigation';
import { isConfigured, isVisibleInSidebar, SERVICE_PAGES } from './services';

/** Routes du groupe « Accueil » (pages des onglets). */
export const HOME_ROUTES = new Set([
  'dashboard',
  'tmdb',
  'tmdb-explorer',
  'tmdb-watchlist',
  'calendar',
]);

export function isHomeRoute(route: Pick<RouteLocationNormalizedLoaded, 'name'>): boolean {
  return typeof route.name === 'string' && HOME_ROUTES.has(route.name);
}

export function discoverTabVisible(services: BootstrapServices, isAdmin: boolean): boolean {
  return (
    isConfigured(services, 'tmdb') &&
    isVisibleInSidebar(services, 'tmdb') &&
    (isAdmin || SERVICE_PAGES.tmdb?.adminOnly !== true)
  );
}

export function calendarTabVisible(services: BootstrapServices): boolean {
  return (
    (isConfigured(services, 'radarr') || isConfigured(services, 'sonarr')) &&
    isVisibleInSidebar(services, 'calendar')
  );
}

export const HOME_TABS: BottomNavItem[] = [
  {
    labelKey: 'sidebar.nav.dashboard',
    icon: msDashboardFill,
    to: { name: 'dashboard' },
    testId: 'home-tab-dashboard',
  },
  {
    labelKey: 'home.tabs.discover',
    icon: msExplore,
    to: { name: 'tmdb' },
    testId: 'home-tab-discover',
    visible: ({ services, isAdmin }) => discoverTabVisible(services, isAdmin),
  },
  {
    labelKey: 'decouverte.explorer.title',
    icon: msManageSearch,
    to: { name: 'tmdb-explorer' },
    testId: 'home-tab-explorer',
    visible: ({ services, isAdmin }) => discoverTabVisible(services, isAdmin),
  },
  {
    labelKey: 'decouverte.watchlist.title',
    icon: msStarFill,
    to: { name: 'tmdb-watchlist' },
    testId: 'home-tab-watchlist',
    visible: ({ services, isAdmin }) => discoverTabVisible(services, isAdmin),
  },
  {
    labelKey: 'sidebar.nav.calendar',
    icon: msCalendarToday,
    to: { name: 'calendar' },
    testId: 'home-tab-calendar',
    visible: ({ services }) => calendarTabVisible(services),
  },
];

/**
 * Onglets affichés d'une barre déclarée par la route : ceux dont la page est
 * utilisable. Une barre filtrée qui ne garde qu'un onglet n'a plus d'objet.
 */
export function visibleBottomNav(
  items: readonly BottomNavItem[],
  context: BottomNavContext,
): BottomNavItem[] {
  const shown = items.filter((item) => item.visible?.(context) ?? true);
  const filtered = items.some((item) => item.visible !== undefined);
  return filtered && shown.length < 2 ? [] : shown;
}
