// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/bootstrap` : état initial du shell. Public : il sert
// aussi avant la connexion et pendant l'assistant. Crée au besoin une session
// anonyme pour fournir un jeton CSRF.

import {
  DEFAULT_LOCALE,
  DEFAULT_USER_PREFERENCES,
  SERVICE_IDS,
  bootstrapResponseSchema,
  defaultDisplayValues,
  isLocale,
  type BootstrapServices,
  type Locale,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '../../http/zod';
import type { Db } from '../../db/client';
import { listInstances } from '../instances/instances';
import { isServiceConfigured, isServiceDisabled } from '../services/config';
import { readResolvedPreferences } from '../settings/preferences';
import { readSidebarVisibility } from '../settings/routes';
import { SETTING_KEYS, getSetting } from '../settings/settings';
import { readTheme } from '../theme/theme';
import type { AccessScope } from '../users/access-scope';
import { readUserPreferences } from '../users/users';

export interface BootstrapRoutesOptions {
  version: string;
}

const NO_SERVICES: BootstrapServices = {
  states: {},
  instances: { radarr: [], sonarr: [] },
  sidebar: {},
};

/**
 * État des services pour le shell. Avec `scope` (compte non admin) : un
 * service illisible est présenté comme non configuré et seules les instances
 * lisibles sont listées ; le tiroir et les gardes du routeur suivent.
 */
export function readBootstrapServices(db: Db, scope?: AccessScope): BootstrapServices {
  const visible = (type: 'radarr' | 'sonarr', slug: string) =>
    scope === undefined || scope.admin || scope.can(type, slug);
  const instances = (type: 'radarr' | 'sonarr') =>
    listInstances(db, type)
      .filter((row) => visible(type, row.slug))
      .map(({ slug, name, enabled, isDefault }) => ({
        slug,
        name,
        enabled,
        isDefault,
      }));
  return {
    states: Object.fromEntries(
      SERVICE_IDS.map((id) => [
        id,
        {
          configured: scope === undefined ? isServiceConfigured(db, id) : scope.configured(id),
          disabled: isServiceDisabled(db, id),
        },
      ]),
    ),
    instances: { radarr: instances('radarr'), sonarr: instances('sonarr') },
    sidebar: readSidebarVisibility(db),
  };
}

export const bootstrapRoutes: FastifyPluginAsync<BootstrapRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/bootstrap',
    { config: { access: 'public' }, schema: { response: { 200: bootstrapResponseSchema } } },
    async (request, reply) => {
      const session = app.sessions.ensure(request, reply);
      // Ordre de `LocaleSubscriber` (le `?_locale` ponctuel est géré par le client).
      const preferred = getSetting(app.db, SETTING_KEYS.displayLanguage);
      const locale: Locale =
        session.data.locale ?? (isLocale(preferred) ? preferred : DEFAULT_LOCALE);
      return {
        setupRequired: !app.setup.isCompleted(),
        user: request.user,
        csrfToken: session.data.csrfToken,
        locale,
        // Sans session : ni version ni préférences de l'installation, fuseau du
        // serveur compris (le client les relit après la connexion).
        version: request.user === null ? '' : options.version,
        theme: readTheme(app.db),
        services:
          request.user === null || !app.setup.isCompleted()
            ? NO_SERVICES
            : readBootstrapServices(app.db, request.access),
        preferences:
          request.user === null ? defaultDisplayValues() : readResolvedPreferences(app.db),
        userPreferences:
          request.user === null
            ? DEFAULT_USER_PREFERENCES
            : readUserPreferences(app.db, request.user.id),
      };
    },
  );
};
