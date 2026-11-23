// SPDX-License-Identifier: AGPL-3.0-or-later
// Connexion et déconnexion (`SecurityController` + `form_login` d'origine, P0.6).
//   GET  /api/auth/csrf    jeton CSRF (crée une session anonyme au besoin)
//   POST /api/auth/login   e-mail + mot de passe → session régénérée
//   POST /api/auth/logout  supprime la session (route source `GET /logout`)

import { csrfTokenResponseSchema, loginRequestSchema, loginResponseSchema } from '@hubarr/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { users } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { getDummyHash, verifyPassword } from '../../security/password';
import { findUserByEmail, normalizeEmail, toAuthUser } from '../users/users';
import { LoginThrottle } from './login-throttle';

export interface AuthRoutesOptions {
  now?: () => number;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (instance, options) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const now = options.now ?? Date.now;
  const throttle = new LoginThrottle(now);

  app.get(
    '/api/auth/csrf',
    { config: { access: 'public' }, schema: { response: { 200: csrfTokenResponseSchema } } },
    async (request, reply) => ({ token: app.sessions.ensure(request, reply).data.csrfToken }),
  );

  app.post(
    '/api/auth/login',
    {
      config: { access: 'public' },
      schema: { body: loginRequestSchema, response: { 200: loginResponseSchema } },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const wait = throttle.attempt(request.ip, email);
      if (wait > 0) {
        const retryAfter = Math.ceil(wait / 1000);
        void reply.header('retry-after', String(retryAfter));
        throw new ApiError(429, 'LOGIN_THROTTLED', { details: { retryAfter } });
      }

      const user = findUserByEmail(app.db, email);
      const valid = await verifyPassword(
        user?.passwordHash ?? (await getDummyHash()),
        request.body.password,
      );
      if (user === undefined || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS');

      throttle.succeeded(request.ip, email);
      app.db
        .update(users)
        .set({ lastLoginAt: new Date(now()) })
        .where(eq(users.id, user.id))
        .run();
      const session = app.sessions.start(request, reply, {
        userId: user.id,
        persistent: request.body.remember,
      });
      return { user: toAuthUser(user), csrfToken: session.data.csrfToken };
    },
  );

  app.post('/api/auth/logout', { config: { access: 'public' } }, async (request, reply) => {
    app.sessions.destroy(request, reply);
    return reply.code(204).send();
  });
};
