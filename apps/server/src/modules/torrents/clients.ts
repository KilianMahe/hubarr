// SPDX-License-Identifier: AGPL-3.0-or-later
// Clients torrent et Gluetun de l'application (P3d.1).
//
// Contrairement aux clients à clé d'API (reconstruits à chaque requête,
// MEMOIRE D82), qBittorrent, Deluge et Transmission gardent un état de session
// (cookie, jeton) : un client par service, **conservé** tant que sa
// configuration (URL, utilisateur, mot de passe, clé) ne change pas. Le cache
// est attaché aux dépendances réseau de l'application (`app.upstream`), donc
// propre à chaque application (tests isolés).

import type { TorrentClientId } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import {
  HttpClient,
  UpstreamError,
  apiKeyHeader,
  basicAuth,
  combineAuth,
  cookieSession,
  transmissionSessionId,
} from '../../integrations/http';
import { DelugeClient } from '../../integrations/torrents/deluge';
import { GluetunClient } from '../../integrations/torrents/gluetun';
import { QBittorrentClient } from '../../integrations/torrents/qbittorrent';
import {
  TransmissionClient,
  normalizeTransmissionBaseUrl,
} from '../../integrations/torrents/transmission';
import type { TorrentClient } from '../../integrations/torrents/types';
import { isServiceConfigured, readServiceConfig } from '../services/config';

interface Entry<T> {
  fingerprint: string;
  client: T;
}

const registries = new WeakMap<object, Map<string, Entry<unknown>>>();

function registryOf(app: FastifyInstance): Map<string, Entry<unknown>> {
  let registry = registries.get(app.upstream);
  if (registry === undefined) {
    registry = new Map();
    registries.set(app.upstream, registry);
  }
  return registry;
}

function cached<T>(app: FastifyInstance, key: string, fingerprint: string, build: () => T): T {
  const registry = registryOf(app);
  const entry = registry.get(key);
  if (entry?.fingerprint === fingerprint) return entry.client as T;
  const client = build();
  registry.set(key, { fingerprint, client });
  return client;
}

function baseOptions(app: FastifyInstance) {
  return {
    health: app.upstream.health,
    logger: app.log,
    ...(app.upstream.dispatcher ? { dispatcher: app.upstream.dispatcher } : {}),
  };
}

/** Client HTTP d'une session, créé juste après la stratégie qui s'en sert pour se connecter. */
function requireHttp(ref: { http?: HttpClient }): HttpClient {
  if (ref.http === undefined) throw new Error('client HTTP pas encore créé');
  return ref.http;
}

/** Client du service ; lève `not_configured` s'il ne l'est pas. */
export function torrentClient(app: FastifyInstance, id: TorrentClientId): TorrentClient {
  if (!isServiceConfigured(app.db, id)) throw new UpstreamError('not_configured', { service: id });
  const config = readServiceConfig(app.db, id);
  const fingerprint = JSON.stringify([config.url, config.user, config.password]);
  return cached<TorrentClient>(app, id, fingerprint, () => {
    switch (id) {
      case 'qbittorrent': {
        const ref: { http?: HttpClient } = {};
        const session = cookieSession({
          login: () => QBittorrentClient.login(requireHttp(ref), config),
          isExpired: (response) => response.status === 401 || response.status === 403,
        });
        ref.http = new HttpClient({
          service: id,
          baseUrl: config.url,
          auth: session,
          headers: { referer: config.url.replace(/\/+$/, '') },
          ...baseOptions(app),
        });
        return new QBittorrentClient(ref.http);
      }
      case 'deluge': {
        const ref: { http?: HttpClient } = {};
        const session = cookieSession({
          login: () => DelugeClient.login(requireHttp(ref), config.password),
          isExpired: () => false,
        });
        ref.http = new HttpClient({
          service: id,
          baseUrl: config.url,
          auth: session,
          ...baseOptions(app),
        });
        return new DelugeClient(ref.http);
      }
      case 'transmission':
        return new TransmissionClient(
          new HttpClient({
            service: id,
            baseUrl: normalizeTransmissionBaseUrl(config.url),
            auth: combineAuth(basicAuth(config.user, config.password), transmissionSessionId()),
            ...baseOptions(app),
          }),
        );
    }
  });
}

/** Client Gluetun, ou `null` s'il n'est pas configuré ou désactivé. */
export function gluetunClient(app: FastifyInstance): GluetunClient | null {
  if (!isServiceConfigured(app.db, 'gluetun')) return null;
  const config = readServiceConfig(app.db, 'gluetun');
  return cached(
    app,
    'gluetun',
    JSON.stringify([config.url, config.apiKey]),
    () =>
      new GluetunClient(
        new HttpClient({
          service: 'gluetun',
          baseUrl: config.url,
          ...(config.apiKey === '' ? {} : { auth: apiKeyHeader('X-API-Key', config.apiKey) }),
          ...baseOptions(app),
        }),
      ),
  );
}
