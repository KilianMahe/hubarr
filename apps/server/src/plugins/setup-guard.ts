// SPDX-License-Identifier: AGPL-3.0-or-later
// Garde « installation requise » (`SetupRedirectSubscriber` d'origine) : tant que
// l'assistant n'est pas terminé, toute route non publique répond 409
// `SETUP_REQUIRED`. Les routes publiques (assistant, connexion, santé, bootstrap,
// puis fichiers statiques et fallback SPA) passent : c'est le routeur Vue qui
// envoie vers `/setup` d'après `setupRequired` de `/api/bootstrap`.
// Décore aussi l'application avec l'état de l'installation (`app.setup`).

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../http/errors';
import { SetupState } from '../modules/setup/setup-state';

declare module 'fastify' {
  interface FastifyInstance {
    setup: SetupState;
  }
}

const setupGuardPlugin: FastifyPluginAsync = async (app) => {
  const state = new SetupState(app.db);
  app.decorate('setup', state);

  app.addHook('onRequest', async (request) => {
    if (request.is404 || request.routeOptions.config.access === 'public') return;
    let completed: boolean;
    try {
      completed = state.isCompleted();
    } catch (error) {
      // Base illisible : on laisse passer plutôt que de bloquer sur l'assistant
      // (comportement d'origine) ; la route échouera d'elle-même.
      request.log.warn({ err: error }, "état de l'installation illisible");
      return;
    }
    if (!completed) throw new ApiError(409, 'SETUP_REQUIRED');
  });
};

export default fp(setupGuardPlugin, { name: 'hubarr-setup-guard', dependencies: [] });
