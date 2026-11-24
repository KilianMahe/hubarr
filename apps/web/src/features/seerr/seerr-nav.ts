// SPDX-License-Identifier: AGPL-3.0-or-later
// Barre basse de Seerr (mobile, P5b.4, D131) : demandes et utilisateurs. Les
// réglages et le système s'ouvrent depuis les paramètres de Hubarr (P5c.4, D140).

import { msConfirmationNumber, msGroup } from '../../components/symbols';
import type { BottomNavItem } from '../../app/navigation';

const name = (value: unknown) => (typeof value === 'string' ? value : '');

export const SEERR_BOTTOM_NAV: BottomNavItem[] = [
  { labelKey: 'jellyseerr.nav.requests', icon: msConfirmationNumber, to: { name: 'seerr' } },
  {
    labelKey: 'jellyseerr.nav.users',
    icon: msGroup,
    to: { name: 'seerr-users' },
    matches: (route) => name(route.name) === 'seerr-user',
  },
];
