// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/bootstrap` : état initial du shell. Public : il sert
// aussi avant la connexion et pendant l'assistant. Crée au besoin une session
// anonyme pour fournir un jeton CSRF.

import {
  DEFAULT_LOCALE,
  SERVICE_IDS,
  bootstrapResponseSchema,
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

export interface BootstrapRoutesOptions {
  version: string;
}

const NO_SERVICES: BootstrapServices = {
  states: {},
  instances: { radarr: [], sonarr: [] },
  sidebar: {},
};

/** État des services pour le shell. */
export function readBootstrapServices(db: Db): BootstrapServices {
  const instances = (type: 'radarr' | 'sonarr') =>
    listInstances(db, type).map(({ slug, name, enabled, isDefault }) => ({
      slug,
      name,
      enabled,
      isDefault,
    }));
  return {
    states: Object.fromEntries(
      SERVICE_IDS.map((id) => [
        id,
        { configured: isServiceConfigured(db, id), disabled: isServiceDisabled(db, id) },
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
        version: options.version,
        theme: readTheme(app.db),
        services:
          request.user === null || !app.setup.isCompleted()
            ? NO_SERVICES
            : readBootstrapServices(app.db),
        preferences: readResolvedPreferences(app.db),
      };
    },
  );
};
