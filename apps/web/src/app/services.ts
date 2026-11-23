// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages d'index des services (URL de l'original) et règles d'accès côté
// client, d'après l'état des services du bootstrap. Le serveur reste
// l'autorité (`plugins/service-guard.ts`).

import { SERVICE_SETTINGS, type BootstrapServices, type ServiceId } from '@hubarr/shared';
import type { RouteLocationRaw } from 'vue-router';

export interface ServicePage {
  /** Nom de la route Vue de l'index du service. */
  route: string;
  /** Clé i18n du libellé dans le tiroir ; à défaut, le nom du service. */
  labelKey?: string;
  /** Contrôleur réservé aux admins dans l'original. */
  adminOnly: boolean;
}

/** Services qui ont des pages (Gluetun et Emby n'en ont pas : widgets seulement). */
export const SERVICE_PAGES: Partial<Record<ServiceId, ServicePage>> = {
  tmdb: { route: 'tmdb', labelKey: 'sidebar.nav.discovery', adminOnly: false },
  radarr: { route: 'radarr', adminOnly: true },
  sonarr: { route: 'sonarr', adminOnly: true },
  prowlarr: { route: 'prowlarr', adminOnly: true },
  bazarr: { route: 'bazarr', labelKey: 'sidebar.nav.bazarr', adminOnly: true },
  qbittorrent: { route: 'qbittorrent', labelKey: 'sidebar.nav.qbittorrent', adminOnly: true },
  deluge: { route: 'deluge', labelKey: 'sidebar.nav.deluge', adminOnly: true },
  transmission: { route: 'transmission', labelKey: 'sidebar.nav.transmission', adminOnly: true },
  sabnzbd: { route: 'usenet', adminOnly: true },
  nzbget: { route: 'usenet', adminOnly: true },
  tautulli: { route: 'tautulli', adminOnly: false },
  tracearr: { route: 'tracearr', adminOnly: false },
  seerr: { route: 'seerr', labelKey: 'sidebar.nav.jellyseerr', adminOnly: true },
};

export function serviceLabel(id: ServiceId): string {
  return SERVICE_SETTINGS[id].label;
}

export function isConfigured(services: BootstrapServices, id: ServiceId): boolean {
  return services.states[id]?.configured === true;
}

export function isVisibleInSidebar(services: BootstrapServices, id: string): boolean {
  return services.sidebar[id] !== false;
}

/** Instance par défaut active (`getDefault`), ou `null`. */
export function defaultInstance(services: BootstrapServices, type: 'radarr' | 'sonarr') {
  const enabled = services.instances[type].filter((row) => row.enabled);
  return enabled.find((row) => row.isDefault) ?? enabled[0] ?? null;
}

/** Lien vers l'index d'un service (instance par défaut pour Radarr/Sonarr). */
export function serviceIndexLocation(
  services: BootstrapServices,
  id: ServiceId,
  slug?: string,
): RouteLocationRaw | null {
  const page = SERVICE_PAGES[id];
  if (page === undefined) return null;
  if (id === 'radarr' || id === 'sonarr') {
    const target = slug ?? defaultInstance(services, id)?.slug;
    return target === undefined ? null : { name: page.route, params: { slug: target } };
  }
  if (id === 'sabnzbd' || id === 'nzbget') return { name: 'usenet', params: { client: id } };
  return { name: page.route };
}
