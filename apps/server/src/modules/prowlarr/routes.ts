// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Prowlarr (P3c) : les 69 routes de `ProwlarrController`. Réservé aux
// admins, comme le contrôleur d'origine (`#[IsGranted('ROLE_ADMIN')]`) ;
// chaque route déclare le service pour la garde « désactivé / non configuré ».

import type { FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../plugins/access';
import { registerIndexerRoutes } from './indexer-routes';
import { registerProviderRoutes } from './provider-routes';
import { registerSearchRoutes } from './search-routes';
import { registerSystemRoutes } from './system-routes';

export const prowlarrRoutes: FastifyPluginAsync = async (instance) => {
  instance.addHook('onRequest', requireRole('admin'));
  registerIndexerRoutes(instance);
  registerSearchRoutes(instance);
  registerProviderRoutes(instance);
  registerSystemRoutes(instance);
};
