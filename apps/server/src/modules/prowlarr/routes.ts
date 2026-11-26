// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Prowlarr (P3c) : les 69 routes de `ProwlarrController`. Chaque
// route déclare le service : garde « désactivé / non configuré » et droit
// d'accès (indexeurs, recherche, historique) ; réglages et système : admins.

import type { FastifyPluginAsync } from 'fastify';
import { guardServiceModule } from '../../plugins/access';
import { registerIndexerRoutes } from './indexer-routes';
import { registerProviderRoutes } from './provider-routes';
import { registerSearchRoutes } from './search-routes';
import { registerSystemRoutes } from './system-routes';

export const prowlarrRoutes: FastifyPluginAsync = async (instance) => {
  guardServiceModule(instance);
  registerIndexerRoutes(instance);
  registerSearchRoutes(instance);
  registerProviderRoutes(instance);
  registerSystemRoutes(instance);
};
