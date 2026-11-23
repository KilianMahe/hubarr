// SPDX-License-Identifier: AGPL-3.0-or-later
// Onglets de Tracearr (P5c.7, V9) : résumé, lectures en cours,
// statistiques, historique, utilisateurs. En haut sur grand écran, dans la
// barre basse sur mobile (sans FAB). URL propres à Hubarr, `/tracearr` restant
// la page de l'original (le résumé).

import {
  mdiAccountMultiple,
  mdiChartBar,
  mdiHistory,
  mdiPlayCircleOutline,
  mdiViewDashboardOutline,
} from '@mdi/js';
import type { BottomNavItem } from '../../app/navigation';

export const TRACEARR_SECTIONS = ['summary', 'now', 'stats', 'history', 'users'] as const;
export type TracearrSection = (typeof TRACEARR_SECTIONS)[number];

export const TRACEARR_ROUTES: Record<TracearrSection, { name: string; path: string }> = {
  summary: { name: 'tracearr', path: 'tracearr' },
  now: { name: 'tracearr-now', path: 'tracearr/en-cours' },
  stats: { name: 'tracearr-stats', path: 'tracearr/statistiques' },
  history: { name: 'tracearr-history', path: 'tracearr/historique' },
  users: { name: 'tracearr-users', path: 'tracearr/utilisateurs' },
};

const ICONS: Record<TracearrSection, string> = {
  summary: mdiViewDashboardOutline,
  now: mdiPlayCircleOutline,
  stats: mdiChartBar,
  history: mdiHistory,
  users: mdiAccountMultiple,
};

/** Fiche d'un utilisateur (P5d.2, V23), rattachée à l'onglet Utilisateurs. */
export const TRACEARR_USER_ROUTE = { name: 'tracearr-user', path: 'tracearr/utilisateurs/:key' };

export const TRACEARR_TABS: BottomNavItem[] = TRACEARR_SECTIONS.map((section) => ({
  labelKey: `tracearr.nav.${section}`,
  icon: ICONS[section],
  to: { name: TRACEARR_ROUTES[section].name },
  ...(section === 'users' ? { matches: (route) => route.name === TRACEARR_USER_ROUTE.name } : {}),
}));

export function tracearrSectionOf(name: unknown): TracearrSection {
  if (name === TRACEARR_USER_ROUTE.name) return 'users';
  return TRACEARR_SECTIONS.find((section) => TRACEARR_ROUTES[section].name === name) ?? 'summary';
}
