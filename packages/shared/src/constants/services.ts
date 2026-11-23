// SPDX-License-Identifier: AGPL-3.0-or-later
// Catalogue des 15 services pilotés par Hubarr et leur famille, qui
// ordonne le tiroir de navigation (ARRS, TÉLÉCHARGEMENTS, SERVEUR,
// DEMANDES, AUTRES). L'ordre des clés est l'ordre d'affichage.

export const SERVICE_FAMILIES = ['arrs', 'downloads', 'server', 'requests', 'others'] as const;
export type ServiceFamily = (typeof SERVICE_FAMILIES)[number];

export const SERVICES = {
  radarr: { family: 'arrs', multiInstance: true },
  sonarr: { family: 'arrs', multiInstance: true },
  prowlarr: { family: 'arrs', multiInstance: false },
  bazarr: { family: 'arrs', multiInstance: false },
  qbittorrent: { family: 'downloads', multiInstance: false },
  transmission: { family: 'downloads', multiInstance: false },
  deluge: { family: 'downloads', multiInstance: false },
  sabnzbd: { family: 'downloads', multiInstance: false },
  nzbget: { family: 'downloads', multiInstance: false },
  gluetun: { family: 'downloads', multiInstance: false },
  tautulli: { family: 'server', multiInstance: false },
  tracearr: { family: 'server', multiInstance: false },
  emby: { family: 'server', multiInstance: false },
  seerr: { family: 'requests', multiInstance: false },
  tmdb: { family: 'others', multiInstance: false },
} as const satisfies Record<string, { family: ServiceFamily; multiInstance: boolean }>;

export type ServiceId = keyof typeof SERVICES;
export const SERVICE_IDS = Object.keys(SERVICES) as ServiceId[];

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && Object.hasOwn(SERVICES, value);
}
