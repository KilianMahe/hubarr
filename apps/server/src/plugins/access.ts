// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrôle d'accès (`access_control` de security.yaml) : toute route
// exige une session authentifiée, sauf déclaration explicite
// `config: { access: 'public' }`. Les modules réservés aux administrateurs
// ajoutent `requireRole('admin')` (12 contrôleurs).

import type { UserRole } from '@hubarr/shared';
import type { FastifyPluginAsync, onRequestAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../http/errors';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** `public` : accessible sans session. Par défaut : utilisateur connecté. */
    access?: 'public';
  }
}

/** Hook à poser sur un module (`instance.addHook('onRequest', requireRole('admin'))`). */
export function requireRole(role: UserRole): onRequestAsyncHookHandler {
  return async (request) => {
    if (request.user === null) throw new ApiError(401, 'UNAUTHENTICATED');
    if (role === 'admin' && request.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN');
  };
}

const accessPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    // Une route inconnue répond 404 sans révéler qu'une authentification manque.
    if (request.is404 || request.routeOptions.config.access === 'public') return;
    if (request.user === null) throw new ApiError(401, 'UNAUTHENTICATED');
  });
};

export default fp(accessPlugin, { name: 'hubarr-access', dependencies: ['hubarr-sessions'] });
