// SPDX-License-Identifier: AGPL-3.0-or-later
// Serveur de faux upstreams. Chaque service simulé est monté sous
// son propre préfixe (`/radarr`, puis `/sonarr`, `/qbittorrent`… au fil des
// phases) avec ses fixtures ; `POST /<service>/__reset` remet son état à zéro.

import Fastify, { type FastifyInstance } from 'fastify';
import { embyMock, tautulliMock, tracearrMock } from './activity/routes';
import { bazarrMock } from './bazarr/routes';
import { seerrMock } from './seerr/routes';
import {
  delugeMock,
  gluetunMock,
  nzbgetMock,
  qbittorrentMock,
  sabnzbdMock,
  transmissionMock,
} from './downloads/routes';
import { prowlarrMock } from './prowlarr/routes';
import { radarrMock } from './radarr/routes';
import { sonarrMock } from './sonarr/routes';
import { tmdbMock } from './tmdb/routes';

export const MOCKED_SERVICES = [
  'radarr',
  'sonarr',
  'prowlarr',
  'bazarr',
  'qbittorrent',
  'transmission',
  'deluge',
  'sabnzbd',
  'nzbget',
  'gluetun',
  'tautulli',
  'tracearr',
  'emby',
  'seerr',
  'tmdb',
] as const;

export function buildMocks(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', () => ({ status: 'ok', services: [...MOCKED_SERVICES] }));
  void app.register(radarrMock, { prefix: '/radarr' });
  void app.register(sonarrMock, { prefix: '/sonarr' });
  void app.register(prowlarrMock, { prefix: '/prowlarr' });
  void app.register(bazarrMock, { prefix: '/bazarr' });
  void app.register(qbittorrentMock, { prefix: '/qbittorrent' });
  // Préfixe distinct : une URL qui finit par `/transmission` est ramenée à sa base (comme l'original).
  void app.register(transmissionMock, { prefix: '/transmission-mock' });
  void app.register(delugeMock, { prefix: '/deluge' });
  void app.register(sabnzbdMock, { prefix: '/sabnzbd' });
  void app.register(nzbgetMock, { prefix: '/nzbget' });
  void app.register(gluetunMock, { prefix: '/gluetun' });
  void app.register(tautulliMock, { prefix: '/tautulli' });
  void app.register(tracearrMock, { prefix: '/tracearr' });
  // Préfixe distinct : Hubarr ajoute `/emby` à l'URL d'Emby.
  void app.register(embyMock, { prefix: '/emby-mock' });
  void app.register(seerrMock, { prefix: '/seerr' });
  void app.register(tmdbMock, { prefix: '/tmdb' });

  return app;
}
