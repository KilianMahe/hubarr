// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages de Prowlarr (`_prowlarr_nav.html.twig`) : onglets (indexeurs,
// historique) et pages des menus « Paramètres » (intégrations, configuration)
// et « Système », aux URL de l'original, ouvertes depuis les paramètres de
// Hubarr (P5c.4, D140). Source unique des routes Vue et de la navigation.

import {
  mdiApplicationCogOutline,
  mdiBackupRestore,
  mdiBellOutline,
  mdiCalendarClock,
  mdiCogOutline,
  mdiDownload,
  mdiHistory,
  mdiInformationOutline,
  mdiPaletteOutline,
  mdiPlus,
  mdiRadar,
  mdiTagOutline,
  mdiTextBoxOutline,
  mdiUpdate,
} from '@mdi/js';
import type { RouteRecordSingleView } from 'vue-router';
import type { ArrPage, BottomNavItem, RouteFab } from '../../app/navigation';

export interface ProwlarrPage extends ArrPage {
  path: string;
  titleKey: string;
  component: RouteRecordSingleView['component'];
}

export const PROWLARR_PAGES: ArrPage[] = [
  { name: 'prowlarr', labelKey: 'prowlarr.nav.indexers', icon: mdiRadar },
  { name: 'prowlarr-history', labelKey: 'prowlarr.nav.history', icon: mdiHistory },
];

/**
 * Barre basse (mobile, P5b.4, D131) : indexeurs et historique, de part et
 * d'autre du FAB. Plus d'onglet « Serveur » : ses pages (paramètres, système)
 * s'ouvrent depuis les paramètres de Hubarr (P5c.4, D140).
 */
export const PROWLARR_BOTTOM_NAV: BottomNavItem[] = PROWLARR_PAGES.map((entry) => ({
  labelKey: entry.labelKey,
  icon: entry.icon,
  to: { name: entry.name },
}));

/** FAB (mobile) : ajout d'un indexeur, exécuté par la liste des indexeurs (`?action=add`). */
export const PROWLARR_FAB: RouteFab = {
  icon: mdiPlus,
  labelKey: 'prowlarr.common.add',
  action: 'add',
  index: 'prowlarr',
  testId: 'prowlarr-add',
};

const page = (
  name: string,
  path: string,
  labelKey: string,
  titleKey: string,
  icon: string,
  component: RouteRecordSingleView['component'],
): ProwlarrPage => ({ name, path, labelKey, titleKey, icon, component });

/** Pages autres que l'index (n° 250, 270-276, 278, 280-282). */
export const PROWLARR_SUBPAGES: ProwlarrPage[] = [
  page(
    'prowlarr-history',
    'prowlarr/historique',
    'prowlarr.nav.history',
    'prowlarr.history.title',
    mdiHistory,
    () => import('./views/ProwlarrHistoryView.vue'),
  ),
  page(
    'prowlarr-apps',
    'prowlarr/apps',
    'prowlarr.nav.apps',
    'prowlarr.apps.title',
    mdiApplicationCogOutline,
    () => import('./views/ProwlarrAppsView.vue'),
  ),
  page(
    'prowlarr-download-clients',
    'prowlarr/download-clients',
    'prowlarr.nav.download_clients',
    'prowlarr.download_clients.title',
    mdiDownload,
    () => import('./views/ProwlarrDownloadClientsView.vue'),
  ),
  page(
    'prowlarr-notifications',
    'prowlarr/notifications',
    'prowlarr.nav.notifications',
    'prowlarr.notifications.title',
    mdiBellOutline,
    () => import('./views/ProwlarrNotificationsView.vue'),
  ),
  page(
    'prowlarr-tags',
    'prowlarr/tags-page',
    'prowlarr.nav.tags',
    'prowlarr.tags.title',
    mdiTagOutline,
    () => import('./views/ProwlarrTagsView.vue'),
  ),
  page(
    'prowlarr-general',
    'prowlarr/general',
    'prowlarr.nav.general',
    'prowlarr.general.title',
    mdiCogOutline,
    () => import('./views/ProwlarrGeneralView.vue'),
  ),
  page(
    'prowlarr-ui',
    'prowlarr/ui',
    'prowlarr.nav.ui',
    'prowlarr.ui.title',
    mdiPaletteOutline,
    () => import('./views/ProwlarrUiView.vue'),
  ),
  page(
    'prowlarr-system',
    'prowlarr/systeme',
    'prowlarr.nav.status',
    'prowlarr.system.title',
    mdiInformationOutline,
    () => import('./views/ProwlarrSystemView.vue'),
  ),
  page(
    'prowlarr-tasks',
    'prowlarr/tasks',
    'prowlarr.nav.tasks',
    'prowlarr.tasks.title',
    mdiCalendarClock,
    () => import('./views/ProwlarrTasksView.vue'),
  ),
  page(
    'prowlarr-backups',
    'prowlarr/backups',
    'prowlarr.nav.backups',
    'prowlarr.backups.title',
    mdiBackupRestore,
    () => import('./views/ProwlarrBackupsView.vue'),
  ),
  page(
    'prowlarr-updates',
    'prowlarr/updates',
    'prowlarr.nav.updates',
    'prowlarr.updates.title',
    mdiUpdate,
    () => import('./views/ProwlarrUpdatesView.vue'),
  ),
  page(
    'prowlarr-logs',
    'prowlarr/logs-page',
    'prowlarr.nav.logs',
    'prowlarr.logs.title',
    mdiTextBoxOutline,
    () => import('./views/ProwlarrLogsView.vue'),
  ),
];

export interface ProwlarrMenu {
  id: 'settings' | 'system';
  labelKey: string;
  icon: string;
  groups: { labelKey: string | null; pages: string[] }[];
}

/** Menus de la navigation, groupés comme l'original. */
export const PROWLARR_MENUS: ProwlarrMenu[] = [
  {
    id: 'settings',
    labelKey: 'prowlarr.nav.settings',
    icon: mdiCogOutline,
    groups: [
      {
        labelKey: 'prowlarr.nav.integrations',
        pages: ['prowlarr-apps', 'prowlarr-download-clients', 'prowlarr-notifications'],
      },
      {
        labelKey: 'prowlarr.nav.config',
        pages: ['prowlarr-tags', 'prowlarr-general', 'prowlarr-ui'],
      },
    ],
  },
  {
    id: 'system',
    labelKey: 'prowlarr.nav.system',
    icon: mdiInformationOutline,
    groups: [
      {
        labelKey: null,
        pages: ['prowlarr-system', 'prowlarr-tasks', 'prowlarr-backups', 'prowlarr-updates'],
      },
      { labelKey: null, pages: ['prowlarr-logs'] },
    ],
  },
];

export function subpage(name: string): ProwlarrPage | undefined {
  return PROWLARR_SUBPAGES.find((candidate) => candidate.name === name);
}
