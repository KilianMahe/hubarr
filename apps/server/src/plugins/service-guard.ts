// SPDX-License-Identifier: AGPL-3.0-or-later
// Garde des routes d'un service et liaison de l'instance par slug : port de
// `ServiceRouteGuardSubscriber`, `MultiInstanceBinderSubscriber` et
// `ServiceNotConfiguredSubscriber`, pour l'API.
//
// Une route déclare son service : `config: { service: 'radarr' }`. Si son
// chemin porte `:slug` (Radarr/Sonarr), l'instance correspondante est liée à
// la requête (`request.instance`) :
// - slug inconnu → 404 `NOT_FOUND` ;
// - service désactivé, ou instance désactivée → 409 `SERVICE_NOT_CONFIGURED`
//   (`details.reason = 'disabled'`) ;
// - service non configuré → 409 `SERVICE_NOT_CONFIGURED` (`reason = 'missing'`).
// Sans `:slug`, Radarr/Sonarr se lient à l'instance par défaut.
//
// Un service injoignable n'est pas refusé ici : l'original redirigeait la page
// vers l'index du service (bannière) ; c'est le routeur Vue qui le fait, et les
// appels à l'API échouent d'eux-mêmes en 503 `SERVICE_UNREACHABLE`.

import { SERVICE_SETTINGS, type ServiceId } from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../http/errors';
import {
  getDefaultInstance,
  getInstanceBySlug,
  type InstanceRow,
} from '../modules/instances/instances';
import { isServiceConfigured, isServiceDisabled } from '../modules/services/config';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Service que la route interroge : gardes « désactivé » et « non configuré ». */
    service?: ServiceId;
  }
  interface FastifyRequest {
    /** Instance Radarr/Sonarr liée (slug du chemin, sinon instance par défaut). */
    instance: InstanceRow | null;
  }
}

function notConfigured(
  service: ServiceId,
  reason: 'missing' | 'disabled',
  name?: string,
): ApiError {
  return new ApiError(409, 'SERVICE_NOT_CONFIGURED', {
    service,
    details: { reason, name: name ?? SERVICE_SETTINGS[service].label },
  });
}

const serviceGuardPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('instance', null);

  // `preHandler` : après la validation des paramètres et le contrôle d'accès.
  app.addHook('preHandler', async (request) => {
    const service = request.routeOptions.config.service;
    if (service === undefined) return;

    if (isServiceDisabled(app.db, service)) throw notConfigured(service, 'disabled');

    if (service === 'radarr' || service === 'sonarr') {
      const slug = (request.params as { slug?: unknown } | undefined)?.slug;
      if (typeof slug === 'string' && slug !== '') {
        const instance = getInstanceBySlug(app.db, service, slug);
        if (instance === null) throw new ApiError(404, 'NOT_FOUND', { service });
        if (!instance.enabled) throw notConfigured(service, 'disabled', instance.name);
        request.instance = instance;
        return;
      }
      const fallback = getDefaultInstance(app.db, service);
      if (fallback === null) throw notConfigured(service, 'missing');
      request.instance = fallback;
      return;
    }

    if (!isServiceConfigured(app.db, service)) throw notConfigured(service, 'missing');
  });
};

export default fp(serviceGuardPlugin, { name: 'hubarr-service-guard' });
