// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration des services depuis les paramètres de Hubarr (P5c.4, V4,
// MEMOIRE D140) : un registre des pages de configuration et de système de
// Radarr, Sonarr (par instance), Prowlarr et Seerr. Ces pages gardent les URL
// de l'original ; seules leurs entrées changent : bouton « Paramètres » des
// cartes de `/admin/settings` (P5d.3, D149), puis onglets à deux niveaux
// (groupes, pages du groupe) sur chacune de ces pages.

import type { ArrKind } from '@hubarr/shared';
import {
  msArticle,
  msCast,
  msDns,
  msExtension,
  msInfo,
  msManageAccounts,
  msSettings,
  msTimer,
  msTune,
  msUpdate,
} from '../components/symbols';
import type { RouteLocationRaw } from 'vue-router';
import type { BottomNavItem } from './navigation';
import { adminMenu } from '../features/arr-admin/admin-pages';
import { PROWLARR_MENUS, subpage } from '../features/prowlarr/prowlarr-pages';

export type AdministeredService = ArrKind | 'prowlarr' | 'seerr';
export const ADMINISTERED_SERVICES: readonly AdministeredService[] = [
  'radarr',
  'sonarr',
  'prowlarr',
  'seerr',
];

export interface AdminLink {
  /** Nom de la route (clé de liste, `data-test="admin-link-<id>"`). */
  id: string;
  icon: string;
  labelKey: string;
  to: RouteLocationRaw;
}

export interface AdminLinkGroup {
  labelKey: string;
  /** Icône de l'onglet du groupe dans la barre basse (mobile). */
  icon: string;
  links: AdminLink[];
}

/** Icônes des groupes Radarr/Sonarr (`media.group.<groupe>`). */
const ARR_GROUP_ICONS: Record<string, string> = {
  'media.group.profiles': msTune,
  'media.group.integrations': msExtension,
  'media.group.general': msSettings,
  'media.group.system': msInfo,
};

/** Retour des pages d'administration vers la section « Services » des paramètres. */
export const SETTINGS_SERVICES_LOCATION: RouteLocationRaw = {
  name: 'settings',
  hash: '#section-services',
};

const link = (id: string, icon: string, labelKey: string, to: RouteLocationRaw = { name: id }) => ({
  id,
  icon,
  labelKey,
  to,
});

function arrGroups(kind: ArrKind, slug: string): AdminLinkGroup[] {
  const groups = adminMenu(kind, 'settings').map((group) => ({
    labelKey: group.labelKey,
    icon: ARR_GROUP_ICONS[group.labelKey] ?? msSettings,
    links: group.pages.map((page) =>
      link(page.name, page.icon, page.labelKey, { name: page.name, params: { slug } }),
    ),
  }));
  // État du système (page « Système » de l'instance), en tête du groupe système.
  const status = link(`${kind}-system`, msDns, 'admin.service_admin.status', {
    name: `${kind}-system`,
    params: { slug },
  });
  const system = groups.find((group) => group.labelKey === 'media.group.system');
  if (system) system.links.unshift(status);
  else groups.push({ labelKey: 'media.group.system', icon: msInfo, links: [status] });
  return groups;
}

function prowlarrGroups(): AdminLinkGroup[] {
  return PROWLARR_MENUS.map((menu) => ({
    labelKey: menu.labelKey,
    icon: menu.icon,
    links: menu.groups.flatMap((group) =>
      group.pages.flatMap((name) => {
        const page = subpage(name);
        return page ? [link(name, page.icon, page.labelKey)] : [];
      }),
    ),
  }));
}

const SEERR_GROUPS: AdminLinkGroup[] = [
  {
    labelKey: 'jellyseerr.nav.settings',
    icon: msSettings,
    links: [
      link('seerr-settings', msSettings, 'jellyseerr.nav.general'),
      link('seerr-settings-users', msManageAccounts, 'jellyseerr.nav.default_users'),
      link('seerr-settings-jellyfin', msCast, 'jellyseerr.nav.jellyfin'),
      link('seerr-settings-services', msDns, 'jellyseerr.nav.services'),
    ],
  },
  {
    labelKey: 'server.group.system',
    icon: msInfo,
    links: [
      link('seerr-settings-tasks', msTimer, 'jellyseerr.nav.tasks_cache'),
      link('seerr-settings-logs', msArticle, 'jellyseerr.nav.logs'),
      link('seerr-settings-about', msInfo, 'jellyseerr.nav.about'),
      link('seerr-settings-updates', msUpdate, 'jellyseerr.nav.updates'),
    ],
  },
];

/** Pages d'administration d'un service (d'une instance pour Radarr et Sonarr). */
export function serviceAdminGroups(service: AdministeredService, slug = ''): AdminLinkGroup[] {
  if (service === 'radarr' || service === 'sonarr') return arrGroups(service, slug);
  if (service === 'prowlarr') return prowlarrGroups();
  return SEERR_GROUPS;
}

/**
 * Entrée de la page de paramètres d'un service (P5d.3, V24) : première page du
 * premier groupe, ouverte par le bouton « Paramètres » de sa carte.
 */
export function serviceSettingsEntry(service: AdministeredService, slug = ''): RouteLocationRaw {
  const first = serviceAdminGroups(service, slug)[0]?.links[0];
  return first?.to ?? SETTINGS_SERVICES_LOCATION;
}

/** Groupe de la page courante (le premier si la page n'est dans aucun). */
export function activeAdminGroup(
  groups: AdminLinkGroup[],
  routeName: unknown,
): AdminLinkGroup | undefined {
  return groups.find((group) => group.links.some((item) => item.id === routeName)) ?? groups[0];
}

/**
 * Barre basse des paramètres d'un service (mobile) : un onglet par groupe ;
 * un groupe de plusieurs pages les propose dans un menu.
 */
export function serviceSettingsBottomNav(service: AdministeredService, slug = ''): BottomNavItem[] {
  return serviceAdminGroups(service, slug).flatMap((group): BottomNavItem[] => {
    const first = group.links[0];
    if (!first) return [];
    return [
      {
        labelKey: group.labelKey,
        icon: group.icon,
        to: { name: first.id },
        testId: 'admin-group',
        ...(group.links.length > 1
          ? {
              menu: group.links.map((item) => ({
                id: item.id,
                labelKey: item.labelKey,
                icon: item.icon,
                to: item.to,
              })),
            }
          : {}),
      },
    ];
  });
}

/** Page d'administration affichée (libellé du titre de la barre du haut). */
export function serviceSettingsLink(
  service: AdministeredService,
  slug: string,
  routeName: unknown,
): AdminLink | undefined {
  return serviceAdminGroups(service, slug)
    .flatMap((group) => group.links)
    .find((item) => item.id === routeName);
}

export function isAdministered(service: string): service is AdministeredService {
  return (ADMINISTERED_SERVICES as readonly string[]).includes(service);
}
