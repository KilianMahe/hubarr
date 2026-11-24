// SPDX-License-Identifier: AGPL-3.0-or-later
// Barre basse d'un client Usenet (mobile, P5b.4, D131) : file et historique,
// FAB d'ajout d'un NZB (exécuté par la file, `?action=add`). SABnzbd et NZBGet
// n'ont pas de pages d'administration dans l'original : pas d'onglet
// « Serveur » (D138).

import { msAdd, msDownload, msHistory } from '../../components/symbols';
import type { BottomNavItem, RouteFab } from '../../app/navigation';

export const USENET_BOTTOM_NAV: BottomNavItem[] = [
  { labelKey: 'usenet.nav.queue', icon: msDownload, to: { name: 'usenet' } },
  { labelKey: 'usenet.history.title', icon: msHistory, to: { name: 'usenet-history' } },
];

export const USENET_FAB: RouteFab = {
  icon: msAdd,
  labelKey: 'usenet.toolbar.add_nzb',
  action: 'add',
  index: 'usenet',
  testId: 'usenet-add-open',
};
