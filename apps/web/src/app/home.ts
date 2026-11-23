// SPDX-License-Identifier: AGPL-3.0-or-later
// Accueil `/` (`HomeController::index`, `LastVisitedRouteSubscriber`) : page
// choisie (`display_home_page`), sinon premier service configuré (TMDB, Radarr,
// Sonarr, qBittorrent), sinon écran de bienvenue. « Dernière page visitée » est
// gardée dans le navigateur (`localStorage`, cookie dans l'original).

import type { BootstrapServices } from '@hubarr/shared';
import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';
import { isConfigured, serviceIndexLocation } from './services';

export const LAST_ROUTE_STORAGE_KEY = 'hubarr.last-route';

/** Pages jamais retenues comme « dernière visitée ». */
const NOT_REMEMBERED = new Set(['home', 'login', 'configure-services', 'not-found', 'settings']);

export interface LastRoute {
  name: string;
  /** Paramètres hors slug (le slug est remplacé par l'instance par défaut). */
  params?: Record<string, string>;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function rememberRoute(
  to: RouteLocationNormalized,
  store: Storage | null = storage(),
): void {
  const name = typeof to.name === 'string' ? to.name : null;
  if (name === null || NOT_REMEMBERED.has(name) || name.startsWith('setup')) return;
  if (to.matched.some((record) => record.meta.public === true)) return;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(to.params)) {
    if (key !== 'slug' && typeof value === 'string') params[key] = value;
  }
  try {
    store?.setItem(
      LAST_ROUTE_STORAGE_KEY,
      JSON.stringify(Object.keys(params).length > 0 ? { name, params } : { name }),
    );
  } catch {
    // Stockage refusé (navigation privée) : la préférence retombe sur la suite.
  }
}

export function readLastRoute(store: Storage | null = storage()): LastRoute | null {
  try {
    const raw = store?.getItem(LAST_ROUTE_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as LastRoute).name !== 'string'
    )
      return null;
    return parsed as LastRoute;
  } catch {
    return null;
  }
}

/** Route d'une page retenue, si elle existe encore et que son service est utilisable. */
function lastVisitedTarget(
  services: BootstrapServices,
  last: LastRoute | null,
  hasRoute: (name: string) => boolean,
): RouteLocationRaw | null {
  if (last === null || !hasRoute(last.name)) return null;
  if (last.name === 'radarr' || last.name === 'sonarr')
    return serviceIndexLocation(services, last.name);
  if (last.name === 'usenet') {
    const client = last.params?.client;
    return client === 'sabnzbd' || client === 'nzbget'
      ? isConfigured(services, client)
        ? { name: 'usenet', params: { client } }
        : null
      : null;
  }
  const service = SERVICE_OF_ROUTE[last.name];
  if (service !== undefined && !isConfigured(services, service)) return null;
  return last.params === undefined ? { name: last.name } : { name: last.name, params: last.params };
}

const SERVICE_OF_ROUTE: Record<string, Parameters<typeof isConfigured>[1]> = {
  tmdb: 'tmdb',
  prowlarr: 'prowlarr',
  seerr: 'seerr',
  qbittorrent: 'qbittorrent',
  deluge: 'deluge',
  transmission: 'transmission',
  tautulli: 'tautulli',
  bazarr: 'bazarr',
  tracearr: 'tracearr',
};

export function resolveHome(
  homePage: string,
  services: BootstrapServices,
  last: LastRoute | null = null,
  hasRoute: (name: string) => boolean = () => true,
): RouteLocationRaw | null {
  const preferred = ((): RouteLocationRaw | null => {
    switch (homePage) {
      case 'dashboard':
        return { name: 'dashboard' };
      case 'discovery':
        return isConfigured(services, 'tmdb') ? { name: 'tmdb' } : null;
      case 'films':
        return serviceIndexLocation(services, 'radarr');
      case 'series':
        return serviceIndexLocation(services, 'sonarr');
      case 'qbittorrent':
        return isConfigured(services, 'qbittorrent') ? { name: 'qbittorrent' } : null;
      case 'last':
        return lastVisitedTarget(services, last, hasRoute);
      default:
        return null;
    }
  })();
  if (preferred !== null) return preferred;
  // Repli : premier service configuré (un service désactivé n'est pas configuré).
  if (isConfigured(services, 'tmdb')) return { name: 'tmdb' };
  for (const type of ['radarr', 'sonarr'] as const) {
    const index = isConfigured(services, type) ? serviceIndexLocation(services, type) : null;
    if (index !== null) return index;
  }
  if (isConfigured(services, 'qbittorrent')) return { name: 'qbittorrent' };
  return null;
}

/** Retient chaque page affichée (après les gardes). */
export function installLastVisited(router: Router): void {
  router.afterEach((to, _from, failure) => {
    if (failure === undefined) rememberRoute(to);
  });
}
