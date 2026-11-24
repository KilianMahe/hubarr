// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages d'une instance Radarr : onglets (`RadarrNav`) et barre basse mobile.

import {
  msAdd,
  msDownload,
  msHistory,
  msLan,
  msPermMedia,
  msReport,
  msSearch,
  msTheaters,
  msTrendingDown,
} from '../../components/symbols';
import type { ArrPage, BottomNavItem, RouteFab } from '../../app/navigation';

export const RADARR_PAGES: ArrPage[] = [
  { name: 'radarr', labelKey: 'media.nav.films', icon: msTheaters },
  // Onglet dédié (P5c.6, V18, D143).
  { name: 'radarr-queue', labelKey: 'media.queue_page.title', icon: msDownload },
  { name: 'radarr-history', labelKey: 'media.item.history', icon: msHistory },
  { name: 'radarr-blocklist', labelKey: 'media.item.blocklist', icon: msReport },
  { name: 'radarr-missing', labelKey: 'media.item.missing', icon: msSearch },
  { name: 'radarr-cutoff', labelKey: 'media.item.cutoff', icon: msTrendingDown },
  { name: 'radarr-collections', labelKey: 'media.item.collections', icon: msPermMedia },
];

/**
 * Barre basse (mobile, P5b.4, D131 ; P5c.6, D143) : bibliothèque, manquants,
 * file d'attente et « Serveur » (les autres pages et les commandes), de part
 * et d'autre du FAB d'ajout.
 */
const RADARR_TABS = ['radarr', 'radarr-missing', 'radarr-queue'] as const;
export const RADARR_BOTTOM_NAV: BottomNavItem[] = [
  ...RADARR_TABS.map((name): BottomNavItem => {
    const page = RADARR_PAGES.find((candidate) => candidate.name === name);
    if (page === undefined) throw new Error(name);
    return {
      labelKey: page.labelKey,
      icon: page.icon,
      to: { name },
      // La fiche relève de la bibliothèque.
      ...(name === 'radarr' ? { matches: (route) => route.name === 'radarr-movie' } : {}),
    };
  }),
  {
    labelKey: 'server.tab',
    icon: msLan,
    to: { name: 'radarr-server' },
    // Toutes les autres pages de l'instance (historique, liste de blocage…).
    matches: (route) =>
      !(RADARR_TABS as readonly unknown[]).includes(route.name) && route.name !== 'radarr-movie',
  },
];

/** FAB du service (mobile) : ajout, exécuté par la bibliothèque (`?action=add`). */
export const RADARR_FAB: RouteFab = {
  icon: msAdd,
  labelKey: 'media.films.actions.add',
  action: 'add',
  index: 'radarr',
  testId: 'movies-add',
};
