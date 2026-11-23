// SPDX-License-Identifier: AGPL-3.0-or-later
// Entrées de service du tiroir (barre latérale de `base.html.twig`) : services
// configurés, visibles dans le menu (`sidebar_hide_*`), et réservés aux admins
// quand leur contrôleur l'était. Radarr/Sonarr : une entrée par instance active
// s'il y en a plusieurs. Regroupés par famille.

import {
  SERVICES,
  SERVICE_FAMILIES,
  type BootstrapServices,
  type ServiceFamily,
  type ServiceId,
  type ServicesHealthResponse,
} from '@hubarr/shared';
import type { RouteLocationRaw } from 'vue-router';
import {
  SERVICE_PAGES,
  isConfigured,
  isVisibleInSidebar,
  serviceIndexLocation,
  serviceLabel,
} from './services';

export interface DrawerServiceItem {
  key: string;
  service: ServiceId | null;
  /** Texte affiché (nom du service ou de l'instance) ; sinon `labelKey`. */
  label?: string;
  labelKey?: string;
  to: RouteLocationRaw;
  /** Slug de l'instance (pastille de santé propre). */
  instance?: string;
  /** Entrées filles (instances multiples). */
  children?: DrawerServiceItem[];
}

export interface DrawerServiceSection {
  titleKey: string;
  items: DrawerServiceItem[];
}

const FAMILY_ORDER: Record<ServiceFamily, ServiceId[]> = Object.fromEntries(
  SERVICE_FAMILIES.map((family) => [
    family,
    (Object.keys(SERVICES) as ServiceId[]).filter((id) => SERVICES[id].family === family),
  ]),
) as Record<ServiceFamily, ServiceId[]>;

function itemFor(services: BootstrapServices, id: ServiceId): DrawerServiceItem | null {
  const page = SERVICE_PAGES[id];
  if (page === undefined) return null;
  if (id === 'radarr' || id === 'sonarr') {
    const enabled = services.instances[id].filter((row) => row.enabled);
    const to = serviceIndexLocation(services, id);
    if (to === null) return null;
    const base: DrawerServiceItem = { key: id, service: id, label: serviceLabel(id), to };
    if (enabled.length < 2)
      return { ...base, ...(enabled[0] ? { instance: enabled[0].slug } : {}) };
    return {
      ...base,
      children: enabled.map((row) => ({
        key: `${id}:${row.slug}`,
        service: id,
        label: row.name,
        instance: row.slug,
        to: { name: page.route, params: { slug: row.slug } },
      })),
    };
  }
  const to = serviceIndexLocation(services, id);
  if (to === null) return null;
  return {
    key: id,
    service: id,
    ...(page.labelKey === undefined ? { label: serviceLabel(id) } : { labelKey: page.labelKey }),
    to,
  };
}

export function buildDrawerSections(
  services: BootstrapServices,
  isAdmin: boolean,
): DrawerServiceSection[] {
  const shown = (id: ServiceId) =>
    isConfigured(services, id) &&
    isVisibleInSidebar(services, id) &&
    (isAdmin || SERVICE_PAGES[id]?.adminOnly !== true);

  const explore: DrawerServiceItem[] = [];
  if (shown('tmdb')) {
    explore.push({
      key: 'tmdb',
      service: 'tmdb',
      labelKey: 'sidebar.nav.discovery',
      to: { name: 'tmdb' },
    });
  }
  if (
    (isConfigured(services, 'radarr') || isConfigured(services, 'sonarr')) &&
    isVisibleInSidebar(services, 'calendar')
  ) {
    explore.push({
      key: 'calendar',
      service: null,
      labelKey: 'sidebar.nav.calendar',
      to: { name: 'calendar' },
    });
  }

  const sections: DrawerServiceSection[] = [];
  if (explore.length > 0) sections.push({ titleKey: 'sidebar.section.discovery', items: explore });
  for (const family of SERVICE_FAMILIES) {
    const items = FAMILY_ORDER[family]
      .filter((id) => id !== 'tmdb' && shown(id))
      .map((id) => itemFor(services, id))
      .filter((item): item is DrawerServiceItem => item !== null);
    if (items.length > 0) sections.push({ titleKey: `sidebar.family.${family}`, items });
  }
  return sections;
}

/** Couleur de la pastille de santé d'une entrée (`null` : pas de pastille). */
export function healthColor(
  health: ServicesHealthResponse | undefined,
  item: Pick<DrawerServiceItem, 'service' | 'instance'>,
): string | null {
  if (health === undefined || item.service === null) return null;
  let state: boolean | null | undefined;
  if ((item.service === 'radarr' || item.service === 'sonarr') && item.instance !== undefined) {
    state = health.instances[item.service].find((row) => row.slug === item.instance)?.state;
  } else {
    state = health.services[item.service];
  }
  if (state === true) return 'success';
  if (state === false) return 'error';
  return null;
}
