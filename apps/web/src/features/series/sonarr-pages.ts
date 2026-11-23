// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages d'une instance Sonarr : onglets (`SonarrNav`) et barre basse mobile.

import {
  mdiAlertOctagonOutline,
  mdiHistory,
  mdiMagnify,
  mdiPlus,
  mdiServerNetwork,
  mdiTelevisionClassic,
  mdiTrayArrowDown,
  mdiTrendingDown,
  mdiCalendarClock,
} from '@mdi/js';
import type { ArrPage, BottomNavItem, RouteFab } from '../../app/navigation';

export const SONARR_PAGES: ArrPage[] = [
  { name: 'sonarr', labelKey: 'media.nav.series', icon: mdiTelevisionClassic },
  // Onglets dédiés (P5c.6, V17, V18, D143).
  { name: 'sonarr-upcoming', labelKey: 'media.upcoming.tab', icon: mdiCalendarClock },
  { name: 'sonarr-queue', labelKey: 'media.queue_page.title', icon: mdiTrayArrowDown },
  { name: 'sonarr-history', labelKey: 'media.item.history', icon: mdiHistory },
  { name: 'sonarr-blocklist', labelKey: 'media.item.blocklist', icon: mdiAlertOctagonOutline },
  { name: 'sonarr-missing', labelKey: 'media.item.missing', icon: mdiMagnify },
  { name: 'sonarr-cutoff', labelKey: 'media.item.cutoff', icon: mdiTrendingDown },
];

/**
 * Barre basse (mobile, P5b.4, D131 ; P5c.6, D143) : bibliothèque, prochains
 * épisodes, file d'attente et « Serveur » (les autres pages et les
 * commandes), de part et d'autre du FAB d'ajout.
 */
const SONARR_TABS = ['sonarr', 'sonarr-upcoming', 'sonarr-queue'] as const;
export const SONARR_BOTTOM_NAV: BottomNavItem[] = [
  ...SONARR_TABS.map((name): BottomNavItem => {
    const page = SONARR_PAGES.find((candidate) => candidate.name === name);
    if (page === undefined) throw new Error(name);
    return {
      labelKey: page.labelKey,
      icon: page.icon,
      to: { name },
      // La fiche relève de la bibliothèque.
      ...(name === 'sonarr' ? { matches: (route) => route.name === 'sonarr-series' } : {}),
    };
  }),
  {
    labelKey: 'server.tab',
    icon: mdiServerNetwork,
    to: { name: 'sonarr-server' },
    // Toutes les autres pages de l'instance (manquants, historique, liste de blocage…).
    matches: (route) =>
      !(SONARR_TABS as readonly unknown[]).includes(route.name) && route.name !== 'sonarr-series',
  },
];

/** FAB du service (mobile) : ajout, exécuté par la bibliothèque (`?action=add`). */
export const SONARR_FAB: RouteFab = {
  icon: mdiPlus,
  labelKey: 'media.series.actions.add',
  action: 'add',
  index: 'sonarr',
  testId: 'series-add',
};
