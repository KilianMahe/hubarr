// SPDX-License-Identifier: AGPL-3.0-or-later
// Onglets de Bazarr (`bazarr/_nav.html.twig`) : en haut sur grand écran
// (`BazarrNav`), dans la barre basse sur mobile (P5b.4, D131). Bazarr n'a pas
// de pages d'administration dans l'original : pas d'onglet « Serveur » (D138).

import { mdiFilmstrip, mdiHistory, mdiMagnify, mdiTelevisionClassic } from '@mdi/js';
import type { BottomNavItem } from '../../app/navigation';

export const BAZARR_TABS: BottomNavItem[] = [
  { labelKey: 'bazarr.nav.wanted', icon: mdiMagnify, to: { name: 'bazarr' } },
  { labelKey: 'bazarr.nav.movies', icon: mdiFilmstrip, to: { name: 'bazarr-movies' } },
  {
    labelKey: 'bazarr.nav.series',
    icon: mdiTelevisionClassic,
    to: { name: 'bazarr-series' },
    matches: (route) => route.name === 'bazarr-series-detail',
  },
  { labelKey: 'bazarr.nav.history', icon: mdiHistory, to: { name: 'bazarr-history' } },
];
