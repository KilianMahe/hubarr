// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant d'installation (`SetupController` d'origine, P0.7) :
//   GET  /api/setup         étape suivante (route source `GET /setup`)
//   POST /api/setup/locale  langue de l'assistant, gardée en session
//   POST /api/setup/admin   création de l'unique compte admin, connexion automatique
// Les écrans `/setup/welcome` et `/setup/admin` sont des vues Vue (P0.12). L'assistant
// ne touche jamais à la configuration des services : il passe la main aux réglages.

import {
  isLocale,
  setupAdminRequestSchema,
  setupAdminResponseSchema,
  setupLocaleRequestSchema,
  setupStateResponseSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { users } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { hashPassword } from '../../security/password';
import { SETTING_KEYS, setSetting } from '../settings/settings';
import { countUsers, normalizeEmail, toAuthUser } from '../users/users';

export interface SetupRoutesOptions {
  now?: () => number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export const setupRoutes: FastifyPluginAsync<SetupRoutesOptions> = async (instance, options) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const now = options.now ?? Date.now;

  /** Une fois l'installation terminée, l'assistant est fermé pour de bon. */
  function assertSetupOpen() {
    if (app.setup.isCompleted()) throw new ApiError(409, 'SETUP_COMPLETED');
  }

  app.get(
    '/api/setup',
    { config: { access: 'public' }, schema: { response: { 200: setupStateResponseSchema } } },
    async () => {
      if (app.setup.isCompleted()) return { next: 'home' as const };
      if (!app.setup.hasUsers()) return { next: 'welcome' as const };
      // Un admin existe mais l'installation n'a jamais été close : il n'y a plus
      // rien à demander. Le visiteur n'est peut-être pas l'admin, donc sa langue
      // de session n'est pas promue en préférence.
      app.setup.markCompleted();
      app.setup.remember();
      return { next: 'services' as const };
    },
  );

  app.post(
    '/api/setup/locale',
    { config: { access: 'public' }, schema: { body: setupLocaleRequestSchema } },
    async (request, reply) => {
      assertSetupOpen();
      const session = app.sessions.ensure(request, reply);
      session.data.locale = request.body.locale;
      app.sessions.save(session);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/setup/admin',
    {
      config: { access: 'public' },
      schema: { body: setupAdminRequestSchema, response: { 200: setupAdminResponseSchema } },
    },
    async (request, reply) => {
      // Admin déjà créé : jamais de second formulaire (le client repart de `/setup`).
      // Pas de limitation de débit : le hachage n'a lieu que tant qu'aucun compte
      // n'existe, et la première création réussie ferme la route.
      if (app.setup.isCompleted() || app.setup.hasUsers()) {
        throw new ApiError(409, 'SETUP_COMPLETED');
      }

      const { email, displayName, password } = request.body;
      const passwordHash = await hashPassword(password);
      const locale = request.session?.data.locale;
      const timestamp = new Date(now());

      let created: typeof users.$inferSelect;
      try {
        // Transaction synchrone : la vérification « aucun compte » et l'insertion
        // ne peuvent pas être entrelacées avec une autre requête.
        created = app.db.transaction((tx) => {
          if (countUsers(tx) > 0) throw new ApiError(409, 'SETUP_COMPLETED');
          const [row] = tx
            .insert(users)
            .values({
              email: normalizeEmail(email),
              passwordHash,
              role: 'admin',
              displayName: displayName === undefined || displayName === '' ? null : displayName,
              createdAt: timestamp,
              lastLoginAt: timestamp,
            })
            .returning()
            .all();
          if (row === undefined) throw new Error('compte admin non créé');
          // La langue de l'assistant devient la préférence permanente.
          if (isLocale(locale)) setSetting(tx, SETTING_KEYS.displayLanguage, locale);
          app.setup.markCompleted(tx);
          return row;
        });
      } catch (error) {
        // Course perdue : une autre requête a créé l'admin entre-temps.
        if (isUniqueViolation(error)) throw new ApiError(409, 'SETUP_COMPLETED');
        throw error;
      }
      app.setup.remember();

      // Connexion automatique ; la session régénérée ne garde pas la langue de l'assistant.
      const session = app.sessions.start(request, reply, { userId: created.id, persistent: false });
      return {
        user: toAuthUser(created),
        csrfToken: session.data.csrfToken,
        next: 'services' as const,
      };
    },
  );
};
