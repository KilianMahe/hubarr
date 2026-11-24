// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages d'administration Radarr/Sonarr (P3b) : un seul registre pour les deux
// services. Chaque page devient une route Vue à l'URL de l'original
// (`/medias/:slug/<kind>/<segment>`, nom `<kind>-<id>`), groupée comme les
// menus de `_radarr_nav.html.twig` et `_sonarr_nav.html.twig`. Depuis P5c.4
// (D140), les groupes de configuration s'ouvrent depuis les paramètres de
// Hubarr ; les pages d'usage restent dans la navigation de l'instance.

import { ARR_KINDS, type ArrKind } from '@hubarr/shared';
import {
  msArchive,
  msBarChart,
  msCalendarMonth,
  msChecklist,
  msCloudDownload,
  msDashboardCustomize,
  msDatabase,
  msEditDocument,
  msEditSquare,
  msFilterAlt,
  msFolderShared,
  msFolderSpecial,
  msHourglassTop,
  msHowToReg,
  msLabel,
  msLandscape,
  msLightbulbFill,
  msManageSearch,
  msNotificationsActive,
  msPlaylistAdd,
  msPlaylistRemove,
  msSettingsFill,
  msStyle,
  msTerminal,
  msTune,
  msUpdate,
} from '../../components/symbols';
import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

export const ADMIN_GROUPS = [
  'activity',
  'wanted',
  'discovery',
  'profiles',
  'integrations',
  'general',
  'system',
] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

/**
 * Groupes de configuration (P5c.4) : ouverts depuis les
 * paramètres d'administration de Hubarr. Les autres (activité, recherché,
 * découverte) restent des pages d'usage du service (menu « Plus », onglet
 * « Serveur »).
 */
export const SETTINGS_ADMIN_GROUPS: readonly AdminGroup[] = [
  'profiles',
  'integrations',
  'general',
  'system',
];
export type AdminScope = 'service' | 'settings';

/** Page d'administration ouverte depuis les paramètres de Hubarr ? */
export function isSettingsAdminPage(page: AdminPageSpec): boolean {
  return SETTINGS_ADMIN_GROUPS.includes(page.group);
}

export interface AdminPageSpec {
  /** Identifiant de la page ; route `<kind>-<id>`. */
  id: string;
  /** Segment de l'URL d'origine (`/medias/:slug/<kind>/<segment>`). */
  segment: string;
  /** Préfixe des clés i18n de la page (`media.arr_admin.<prefix>.*`). */
  prefix: string;
  labelKey: string;
  icon: string;
  group: AdminGroup;
  /** Services qui ont la page (les deux par défaut). */
  kinds?: readonly ArrKind[];
  /** Autres URL de la page (Sonarr : `/suggestions` mène à l'import de bibliothèque). */
  aliases?: Partial<Record<ArrKind, string[]>>;
  /** Vue de la page (`views/<Nom>.vue`) ; page écartée tant qu'elle n'existe pas. */
  view: string;
  /** Clé du titre, si elle ne suit pas `media.arr_admin.<prefix>.title_<kind>`. */
  titleKey?: string;
}

type ViewLoader = () => Promise<{ default: Component }>;
const VIEWS = import.meta.glob<{ default: Component }>('./views/*.vue');

/** Chargeur paresseux de la vue d'une page. */
export function viewLoader(page: AdminPageSpec): ViewLoader | undefined {
  return VIEWS[`./views/${page.view}.vue`];
}

const PAGES: readonly AdminPageSpec[] = [
  {
    id: 'commands',
    segment: 'commandes',
    prefix: 'commands',
    labelKey: 'media.item.commands',
    icon: msTerminal,
    group: 'activity',
    view: 'CommandsView',
  },
  {
    id: 'calendar',
    segment: 'calendrier',
    prefix: 'calendar',
    labelKey: 'sidebar.nav.calendar',
    icon: msCalendarMonth,
    group: 'activity',
    kinds: ['sonarr'],
    titleKey: 'media.arr_admin.calendar.title_sonarr',
    view: 'CalendarView',
  },
  {
    id: 'library-import',
    segment: 'import-bibliotheque',
    prefix: 'library_import',
    labelKey: 'media.item.library_import',
    icon: msDatabase,
    group: 'wanted',
    aliases: { sonarr: ['suggestions'] },
    view: 'LibraryImportView',
  },
  {
    id: 'suggestions',
    segment: 'suggestions',
    prefix: 'suggestions',
    labelKey: 'media.item.suggestions',
    icon: msLightbulbFill,
    group: 'discovery',
    kinds: ['radarr'],
    view: 'SuggestionsView',
  },
  {
    id: 'exclusions',
    segment: 'exclusions',
    prefix: 'exclusions',
    labelKey: 'media.item.exclusions',
    icon: msPlaylistRemove,
    group: 'discovery',
    view: 'ExclusionsView',
  },
  {
    id: 'quality',
    segment: 'qualite',
    prefix: 'quality',
    labelKey: 'media.item.quality',
    icon: msLandscape,
    group: 'profiles',
    view: 'QualityView',
  },
  {
    id: 'delay-profiles',
    segment: 'profils-delai',
    prefix: 'delay_profiles',
    labelKey: 'media.item.delay_profiles',
    icon: msHourglassTop,
    group: 'profiles',
    view: 'DelayProfilesView',
  },
  {
    id: 'custom-formats',
    segment: 'formats',
    prefix: 'custom_formats',
    labelKey: 'media.item.custom_formats',
    icon: msChecklist,
    group: 'profiles',
    view: 'CustomFormatsView',
  },
  {
    id: 'custom-filters',
    segment: 'filtres-personnalises',
    prefix: 'custom_filters',
    labelKey: 'media.item.custom_filters',
    icon: msFilterAlt,
    group: 'profiles',
    view: 'CustomFiltersView',
  },
  {
    id: 'indexers',
    segment: 'indexeurs',
    prefix: 'indexers',
    labelKey: 'media.item.indexers',
    icon: msManageSearch,
    group: 'integrations',
    view: 'IndexersView',
  },
  {
    id: 'download-clients',
    segment: 'clients-telechargement',
    prefix: 'download_clients',
    labelKey: 'media.item.download_clients',
    icon: msCloudDownload,
    group: 'integrations',
    view: 'DownloadClientsView',
  },
  {
    id: 'import-lists',
    segment: 'listes-import',
    prefix: 'import_lists',
    labelKey: 'media.item.import_lists',
    icon: msPlaylistAdd,
    group: 'integrations',
    view: 'ImportListsView',
  },
  {
    id: 'notifications',
    segment: 'notifications',
    prefix: 'notifications',
    labelKey: 'media.item.notifications',
    icon: msNotificationsActive,
    group: 'integrations',
    view: 'NotificationsView',
  },
  {
    id: 'auto-tags',
    segment: 'auto-tags',
    prefix: 'auto_tags',
    labelKey: 'media.item.auto_tags',
    icon: msLabel,
    group: 'general',
    view: 'AutoTagsView',
  },
  {
    id: 'tags',
    segment: 'tags',
    prefix: 'tags',
    labelKey: 'media.item.tags',
    icon: msStyle,
    group: 'general',
    view: 'TagsView',
  },
  {
    id: 'rename',
    segment: 'renommer',
    prefix: 'rename',
    labelKey: 'media.arr_admin.rename.page_title',
    icon: msEditSquare,
    group: 'general',
    kinds: ['radarr'],
    view: 'RenameView',
  },
  {
    id: 'media-management',
    segment: 'gestion-medias',
    prefix: 'media_management',
    labelKey: 'media.item.media_management',
    icon: msEditDocument,
    group: 'general',
    view: 'MediaManagementView',
  },
  {
    id: 'ui',
    segment: 'ui',
    prefix: 'ui',
    labelKey: 'media.item.ui',
    icon: msDashboardCustomize,
    group: 'general',
    view: 'UiView',
  },
  {
    id: 'root-folders',
    segment: 'dossiers-racine',
    prefix: 'root_folders',
    labelKey: 'media.item.root_folders',
    icon: msFolderSpecial,
    group: 'general',
    view: 'RootFoldersView',
  },
  {
    id: 'remote-paths',
    segment: 'chemins-distants',
    prefix: 'remote_path_mappings',
    labelKey: 'media.item.remote_paths',
    icon: msFolderShared,
    group: 'general',
    view: 'RemotePathMappingsView',
  },
  {
    id: 'metadata',
    segment: 'metadata',
    prefix: 'metadata',
    labelKey: 'media.item.metadata',
    icon: msHowToReg,
    group: 'general',
    view: 'MetadataView',
  },
  {
    id: 'settings',
    segment: 'parametres',
    prefix: 'settings',
    labelKey: 'media.item.general',
    icon: msSettingsFill,
    group: 'system',
    view: 'HostSettingsView',
  },
  {
    id: 'tasks',
    segment: 'taches',
    prefix: 'tasks',
    labelKey: 'media.item.tasks',
    icon: msChecklist,
    group: 'system',
    view: 'TasksView',
  },
  {
    id: 'logs',
    segment: 'logs',
    prefix: 'logs',
    labelKey: 'media.item.logs',
    icon: msEditSquare,
    group: 'system',
    view: 'LogsView',
  },
  {
    id: 'stats',
    segment: 'stats',
    prefix: 'stats',
    labelKey: 'media.item.stats',
    icon: msBarChart,
    group: 'system',
    view: 'StatsView',
  },
  {
    id: 'parse',
    segment: 'parser',
    prefix: 'parse',
    labelKey: 'media.item.parse',
    icon: msTune,
    group: 'system',
    view: 'ParseView',
  },
  {
    id: 'backups',
    segment: 'sauvegardes',
    prefix: 'backups',
    labelKey: 'media.item.backups',
    icon: msArchive,
    group: 'system',
    view: 'BackupsView',
  },
  {
    id: 'updates',
    segment: 'mises-a-jour',
    prefix: 'updates',
    labelKey: 'media.item.updates',
    icon: msUpdate,
    group: 'system',
    view: 'UpdatesView',
  },
];

/** Pages dont la vue existe. */
export const ADMIN_PAGES: readonly AdminPageSpec[] = PAGES.filter(
  (page) => viewLoader(page) !== undefined,
);

/** Pages d'un service. */
export function adminPagesOf(kind: ArrKind): AdminPageSpec[] {
  return ADMIN_PAGES.filter((page) => page.kinds === undefined || page.kinds.includes(kind));
}

export function adminRouteName(kind: ArrKind, id: string): string {
  return `${kind}-${id}`;
}

export interface AdminMenuGroup {
  group: AdminGroup;
  labelKey: string;
  pages: { name: string; labelKey: string; icon: string }[];
}

/**
 * Pages d'une instance, groupées : `service` (menu « Plus » et onglet
 * « Serveur ») ou `settings` (bloc « Administration » des paramètres).
 */
export function adminMenu(kind: ArrKind, scope: AdminScope): AdminMenuGroup[] {
  const pages = adminPagesOf(kind);
  return ADMIN_GROUPS.filter(
    (group) => SETTINGS_ADMIN_GROUPS.includes(group) === (scope === 'settings'),
  )
    .map((group) => ({
      group,
      labelKey: `media.group.${group}`,
      pages: pages
        .filter((page) => page.group === group)
        .map((page) => ({
          name: adminRouteName(kind, page.id),
          labelKey: page.labelKey,
          icon: page.icon,
        })),
    }))
    .filter((entry) => entry.pages.length > 0);
}

/** Toutes les routes d'administration, pour les deux services. */
export function adminRoutes(
  meta: (kind: ArrKind, settings: boolean) => Record<string, unknown>,
): RouteRecordRaw[] {
  return ARR_KINDS.flatMap((kind) =>
    adminPagesOf(kind).flatMap((page): RouteRecordRaw[] => {
      const component = viewLoader(page);
      if (component === undefined) return [];
      return [
        {
          path: `medias/:slug/${kind}/${page.segment}`,
          name: adminRouteName(kind, page.id),
          component,
          ...(page.aliases?.[kind]
            ? { alias: page.aliases[kind].map((segment) => `medias/:slug/${kind}/${segment}`) }
            : {}),
          meta: {
            ...meta(kind, isSettingsAdminPage(page)),
            titleKey: page.titleKey ?? `media.arr_admin.${page.prefix}.title_${kind}`,
            adminPage: page.id,
          },
        },
      ];
    }),
  );
}
