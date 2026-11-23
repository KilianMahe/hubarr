// SPDX-License-Identifier: AGPL-3.0-or-later
// Fabrique des clients HTTP des services à clé d'API (Radarr, Sonarr, Prowlarr,
// Seerr, Bazarr) sur le socle `integrations/http`, et clients typés par service.
//
// Pas de cache de clients : un client à clé d'API ne garde aucun état (le
// disjoncteur vit dans `app.upstream.health`, partagé), et le reconstruire à
// chaque requête suit sans effort une modification de l'instance.

import type { FastifyInstance } from 'fastify';
import { HttpClient, UpstreamError, apiKeyHeader } from '../../integrations/http';
import { RadarrClient } from '../../integrations/radarr/client';
import { SonarrClient } from '../../integrations/sonarr/client';
import { apiKeyOf, type InstanceRow } from '../instances/instances';
import { isServiceConfigured, readServiceConfig } from './config';

function options(app: FastifyInstance) {
  return {
    health: app.upstream.health,
    logger: app.log,
    ...(app.upstream.dispatcher ? { dispatcher: app.upstream.dispatcher } : {}),
  };
}

/** Client d'une instance Radarr/Sonarr (disjoncteur propre à l'instance). */
export function arrClient(app: FastifyInstance, row: InstanceRow): HttpClient {
  return new HttpClient({
    service: row.type === 'sonarr' ? 'sonarr' : 'radarr',
    instance: row.slug,
    baseUrl: row.url,
    auth: apiKeyHeader('X-Api-Key', apiKeyOf(row) ?? ''),
    ...options(app),
  });
}

/** Client typé d'une instance Radarr. */
export function radarrClient(app: FastifyInstance, row: InstanceRow): RadarrClient {
  if (row.type !== 'radarr')
    throw new TypeError(`instance ${row.slug} : type ${row.type}, radarr attendu`);
  return new RadarrClient(arrClient(app, row));
}

/** Client typé d'une instance Sonarr. */
export function sonarrClient(app: FastifyInstance, row: InstanceRow): SonarrClient {
  if (row.type !== 'sonarr')
    throw new TypeError(`instance ${row.slug} : type ${row.type}, sonarr attendu`);
  return new SonarrClient(arrClient(app, row));
}

/** Client de Prowlarr, de Seerr ou de Bazarr ; lève `not_configured` s'il ne l'est pas. */
export function apiKeyServiceClient(
  app: FastifyInstance,
  service: 'prowlarr' | 'seerr' | 'bazarr',
): HttpClient {
  if (!isServiceConfigured(app.db, service)) {
    throw new UpstreamError('not_configured', { service });
  }
  const config = readServiceConfig(app.db, service);
  return new HttpClient({
    service,
    baseUrl: config.url,
    auth: apiKeyHeader(service === 'bazarr' ? 'X-API-KEY' : 'X-Api-Key', config.apiKey),
    ...options(app),
  });
}
