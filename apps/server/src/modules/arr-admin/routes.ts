// SPDX-License-Identifier: AGPL-3.0-or-later
// Module d'administration Radarr/Sonarr (P3b) : les 97 + 94 routes de
// `RadarrController` et `SonarrController`, servies par un seul module
// paramétré par `kind`. Chaque famille de routes est enregistrée
// une fois par service ; les écarts passent par les capacités
// (`ARR_ADMIN_CAPABILITIES`). Réservé aux admins, comme les contrôleurs
// d'origine (`#[IsGranted('ROLE_ADMIN')]`).

import { ARR_KINDS } from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../plugins/access';
import { adminContext } from './common';
import { registerConfigRoutes } from './config-routes';
import { registerProfileRoutes } from './profile-routes';
import { registerProviderRoutes } from './provider-routes';
import { registerSystemRoutes } from './system-routes';

export const arrAdminRoutes: FastifyPluginAsync = async (instance) => {
  instance.addHook('onRequest', requireRole('admin'));
  for (const kind of ARR_KINDS) {
    const ctx = adminContext(instance, kind);
    registerProfileRoutes(instance, ctx);
    registerProviderRoutes(instance, ctx);
    registerConfigRoutes(instance, ctx);
    registerSystemRoutes(instance, ctx);
  }
};
