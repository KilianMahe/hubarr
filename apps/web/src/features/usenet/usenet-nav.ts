// SPDX-License-Identifier: AGPL-3.0-or-later
// Barre basse d'un client Usenet (mobile, P5b.4, D131) : file et historique,
// FAB d'ajout d'un NZB (exécuté par la file, `?action=add`). SABnzbd et NZBGet
// n'ont pas de pages d'administration dans l'original : pas d'onglet
// « Serveur » (D138).

import { mdiDownload, mdiHistory, mdiPlus } from '@mdi/js';
import type { BottomNavItem, RouteFab } from '../../app/navigation';

export const USENET_BOTTOM_NAV: BottomNavItem[] = [
  { labelKey: 'usenet.nav.queue', icon: mdiDownload, to: { name: 'usenet' } },
  { labelKey: 'usenet.history.title', icon: mdiHistory, to: { name: 'usenet-history' } },
];

export const USENET_FAB: RouteFab = {
  icon: mdiPlus,
  labelKey: 'usenet.toolbar.add_nzb',
  action: 'add',
  index: 'usenet',
  testId: 'usenet-add-open',
};
