// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrôle d'accès : chaque route déclare sa politique, sans quoi le serveur
// refuse de démarrer (`onReady`). Politiques (`config.access`) :
// - `public` : accessible sans session ;
// - `user` : tout compte connecté (route personnelle, ou page qui agrège
//   plusieurs services et filtre elle-même selon `request.access`) ;
// - `admin` : admins seulement, posée sur tout un module par `guardAdminModule` ;
// - `service` : module d'un service, posée par `guardServiceModule`.
// Une route qui déclare `config.service` n'a pas besoin de politique : la garde
// de service (`service-guard.ts`) vérifie le niveau exigé, lecture pour
// `GET`/`HEAD` et écriture sinon, sauf `config.permission` explicite (`read`
// pour une recherche en `POST`, `admin` pour une page d'administration du
// service).
//
// Tous ces contrôles ont lieu en `onRequest`, avant la validation : un compte
// sans droit reçoit 403, jamais une erreur qui décrirait le format attendu.

import { hasAccess, type AccessLevel, type ServiceId } from '@hubarr/shared';
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  RouteOptions,
  onRequestAsyncHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../http/errors';
import { accessScope, type AccessScope } from '../modules/users/access-scope';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Politique d'accès de la route (voir l'en-tête du module). Obligatoire,
     * sauf pour une route qui déclare `service`.
     */
    access?: RouteAccess;
    /**
     * Niveau exigé sur le service de la route. Par défaut : `read` pour
     * `GET`/`HEAD`, `write` sinon ; `admin` : réservé aux admins.
     */
    permission?: AccessLevel | 'admin';
  }
  interface FastifyRequest {
    /** Périmètre d'accès du compte connecté (calculé au premier usage). */
    readonly access: AccessScope;
  }
}

export type RouteAccess = 'public' | 'user' | 'admin' | 'service';

const scopes = new WeakMap<FastifyRequest, AccessScope>();

/**
 * Impose une politique à toutes les routes d'un module (enregistrées après
 * l'appel). Une route du module qui en déclare une autre est une erreur.
 */
function moduleAccess(instance: FastifyInstance, access: RouteAccess): void {
  instance.addHook('onRoute', (route) => {
    const declared = route.config?.access;
    if (declared !== undefined && declared !== access) {
      throw new Error(
        `${String(route.method)} ${route.url} : politique « ${declared} » dans un module « ${access} »`,
      );
    }
    route.config = { ...route.config, access };
  });
}

/** Module d'administration de Hubarr : toutes ses routes sont réservées aux admins. */
export function guardAdminModule(instance: FastifyInstance): void {
  moduleAccess(instance, 'admin');
}

/** Niveau qu'exige la requête sur son service. */
export function requiredLevel(request: FastifyRequest): AccessLevel | 'admin' {
  const declared = request.routeOptions.config.permission;
  if (declared !== undefined) return declared;
  return request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
}

/** Le compte connecté a-t-il ce niveau sur le service (instance Radarr/Sonarr) ? */
export function canAccess(
  request: FastifyRequest,
  service: ServiceId,
  slug: string | null,
  level: AccessLevel,
): boolean {
  return hasAccess(request.user, service, slug, level);
}

/** Refuse la requête (403) si le compte n'a pas le niveau exigé sur le service. */
export function assertServiceAccess(
  request: FastifyRequest,
  service: ServiceId,
  slug: string | null,
): void {
  const user = request.user;
  if (user === null) throw new ApiError(401, 'UNAUTHENTICATED');
  if (user.role === 'admin') return;
  const level = requiredLevel(request);
  if (level === 'admin' || !hasAccess(user, service, slug, level)) {
    throw new ApiError(403, 'FORBIDDEN', { service, details: { level } });
  }
}

/**
 * Module d'un service. Les routes qui déclarent `config.service` sont
 * contrôlées par la garde de service ; `resolve` donne le service des autres
 * (paramètre `:client` de l'Usenet, lu brut : la validation vient après).
 * Sans service : réservé aux admins (fermé par défaut).
 */
export function guardServiceModule(
  instance: FastifyInstance,
  resolve?: (request: FastifyRequest) => ServiceId | null,
): void {
  moduleAccess(instance, 'service');
  instance.addHook('onRequest', serviceModuleHook(resolve));
}

function serviceModuleHook(
  resolve?: (request: FastifyRequest) => ServiceId | null,
): onRequestAsyncHookHandler {
  return async (request) => {
    const user = request.user;
    if (user === null) throw new ApiError(401, 'UNAUTHENTICATED');
    if (user.role === 'admin') return;
    if (request.routeOptions.config.service !== undefined) return;
    const service = resolve?.(request) ?? null;
    if (service === null) throw new ApiError(403, 'FORBIDDEN');
    assertServiceAccess(request, service, null);
  };
}

const accessPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('access', {
    getter(this: FastifyRequest): AccessScope {
      let scope = scopes.get(this);
      if (scope === undefined) {
        scope = accessScope(this.server.db, this.user);
        scopes.set(this, scope);
      }
      return scope;
    },
  });
  app.addHook('onRequest', async (request) => {
    const access = request.routeOptions.config.access;
    // Une route inconnue répond 404 sans révéler qu'une authentification manque.
    if (request.is404 || access === 'public') return;
    if (request.user === null) throw new ApiError(401, 'UNAUTHENTICATED');
    if (access === 'admin' && request.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN');
  });

  // Toute route doit déclarer sa politique : un oubli empêche le démarrage au
  // lieu d'ouvrir la route à tout compte connecté. Les gardes de module posent
  // la leur dans leur propre `onRoute`, exécuté après celui-ci : la
  // vérification attend donc que toutes les routes soient enregistrées.
  const routes: RouteOptions[] = [];
  app.addHook('onRoute', (route) => {
    routes.push(route);
  });
  app.addHook('onReady', async () => {
    const missing = routes
      .filter((route) => route.config?.access === undefined && route.config?.service === undefined)
      .map((route) => `${String(route.method)} ${route.url}`);
    routes.length = 0;
    if (missing.length > 0) {
      throw new Error(`Routes sans politique d'accès (config.access) : ${missing.join(', ')}`);
    }
  });
};

export default fp(accessPlugin, { name: 'hubarr-access', dependencies: ['hubarr-sessions'] });
