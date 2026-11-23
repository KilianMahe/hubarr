// SPDX-License-Identifier: AGPL-3.0-or-later
// Profil du compte connecté (`ProfileController` d'origine, P0.8) :
//   GET  /api/profil                      profil, statistiques, aperçu de la watchlist
//   POST /api/profil                      nom affiché et changement de mot de passe
//   POST /api/profil/avatar               envoi d'un avatar (corps binaire brut)
//   POST /api/profil/avatar/delete        suppression de l'avatar
//   GET  /api/profil/avatar/file/:file    service authentifié d'un avatar
// La vue `/profil` arrive avec le shell (P0.12). L'e-mail n'est pas modifiable,
// comme dans l'original.

import {
  AVATAR_MAX_BYTES,
  LOGIN_THROTTLE,
  profileResponseSchema,
  profileUpdateRequestSchema,
  type ProfileResponse,
} from '@hubarr/shared';
import { count, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { users, watchlistItems } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { revokeUserSessions } from '../../plugins/sessions';
import { hashPassword, verifyPassword } from '../../security/password';
import { SlidingWindowLimiter } from '../auth/login-throttle';
import { findUserById, toAuthUser, type UserRow } from '../users/users';
import { AVATAR_FILENAME_PATTERN, AvatarStore, avatarMimeType, detectAvatarType } from './avatars';

export interface ProfileRoutesOptions {
  /** Dossier des avatars (`<HUBARR_DATA_DIR>/avatars`). */
  avatarsDir: string;
  /** Horloge injectable (limitation des essais du mot de passe actuel). */
  now?: () => number;
}

const RECENT_WATCHLIST_SIZE = 4;

export const profileRoutes: FastifyPluginAsync<ProfileRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const avatars = new AvatarStore(options.avatarsDir);
  // Une session volée ne doit pas permettre de deviner le mot de passe actuel
  // sans limite : mêmes 5 essais par 15 minutes que la connexion, par compte.
  const passwordChecks = new SlidingWindowLimiter(
    LOGIN_THROTTLE.maxAttempts,
    LOGIN_THROTTLE.windowMs,
    options.now,
  );

  /** Ligne du compte connecté (la route est protégée : la session est authentifiée). */
  function currentUser(request: FastifyRequest): UserRow {
    const row = request.user === null ? undefined : findUserById(app.db, request.user.id);
    if (row === undefined) throw new ApiError(401, 'UNAUTHENTICATED');
    return row;
  }

  function profileOf(user: UserRow): ProfileResponse {
    // La watchlist est globale, comme dans l'original.
    const total = app.db.select({ n: count() }).from(watchlistItems).get()?.n ?? 0;
    const recent = app.db
      .select({
        tmdbId: watchlistItems.tmdbId,
        mediaType: watchlistItems.mediaType,
        title: watchlistItems.title,
        posterPath: watchlistItems.posterPath,
        year: watchlistItems.year,
      })
      .from(watchlistItems)
      .orderBy(desc(watchlistItems.addedAt), desc(watchlistItems.id))
      .limit(RECENT_WATCHLIST_SIZE)
      .all();
    return {
      user: toAuthUser(user),
      displayNameRaw: user.displayName ?? '',
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      watchlist: { count: total, recent },
    };
  }

  function setAvatarFile(user: UserRow, avatarFile: string | null): UserRow {
    const [row] = app.db
      .update(users)
      .set({ avatarFile })
      .where(eq(users.id, user.id))
      .returning()
      .all();
    return row ?? user;
  }

  app.get(
    '/api/profil',
    { schema: { response: { 200: profileResponseSchema } } },
    async (request) => profileOf(currentUser(request)),
  );

  app.post(
    '/api/profil',
    { schema: { body: profileUpdateRequestSchema, response: { 200: profileResponseSchema } } },
    async (request, reply) => {
      const user = currentUser(request);
      const { displayName, currentPassword, newPassword } = request.body;
      const changes: Partial<Pick<UserRow, 'displayName' | 'passwordHash'>> = {
        displayName: displayName === '' ? null : displayName,
      };

      // Le schéma garantit que les trois champs sont cohérents dès que l'un est rempli.
      const changesPassword = newPassword !== '';
      if (changesPassword) {
        const key = String(user.id);
        const wait = passwordChecks.retryAfter(key);
        if (wait > 0) {
          const retryAfter = Math.ceil(wait / 1000);
          void reply.header('retry-after', String(retryAfter));
          throw new ApiError(429, 'LOGIN_THROTTLED', {
            details: [
              { path: 'currentPassword', code: 'custom', message: 'login.error.throttled' },
            ],
          });
        }
        passwordChecks.consume(key);
        if (!(await verifyPassword(user.passwordHash, currentPassword))) {
          // Tout ou rien : le nom affiché n'est pas enregistré non plus, comme dans l'original.
          throw new ApiError(400, 'VALIDATION', {
            details: [
              { path: 'currentPassword', code: 'custom', message: 'flash.password.current_wrong' },
            ],
          });
        }
        passwordChecks.reset(key);
        changes.passwordHash = await hashPassword(newPassword);
      }

      const updated = app.db.transaction((tx) => {
        const [row] = tx.update(users).set(changes).where(eq(users.id, user.id)).returning().all();
        // Les autres appareils sont déconnectés ; la session courante reste ouverte.
        if (changesPassword) revokeUserSessions(tx, user.id, request.session?.id);
        return row;
      });
      return profileOf(updated ?? user);
    },
  );

  // Corps binaire brut (le `Content-Type` envoyé est ignoré, le format est lu dans
  // le contenu) : un client `fetch` envoie directement le `File` choisi.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: AVATAR_MAX_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );
    scope
      .withTypeProvider<ZodTypeProvider>()
      .post(
        '/api/profil/avatar',
        { bodyLimit: AVATAR_MAX_BYTES, schema: { response: { 200: profileResponseSchema } } },
        async (request) => {
          const data = request.body;
          if (!Buffer.isBuffer(data) || data.length === 0)
            throw new ApiError(400, 'AVATAR_MISSING');
          const type = detectAvatarType(data);
          if (type === null) throw new ApiError(415, 'AVATAR_INVALID_TYPE');

          const user = currentUser(request);
          const filename = await avatars.save(user.id, data, type);
          const updated = setAvatarFile(user, filename);
          // L'ancien fichier n'est retiré qu'une fois le nouveau enregistré.
          if (user.avatarFile !== null) await avatars.remove(user.avatarFile);
          return profileOf(updated);
        },
      );
  });

  app.post(
    '/api/profil/avatar/delete',
    { schema: { response: { 200: profileResponseSchema } } },
    async (request) => {
      const user = currentUser(request);
      if (user.avatarFile === null) return profileOf(user);
      const updated = setAvatarFile(user, null);
      await avatars.remove(user.avatarFile);
      return profileOf(updated);
    },
  );

  app.get<{ Params: { filename: string } }>(
    '/api/profil/avatar/file/:filename',
    async (request, reply) => {
      const { filename } = request.params;
      // Seul un avatar effectivement attribué à un compte est servi.
      const owner =
        AVATAR_FILENAME_PATTERN.test(filename) &&
        app.db.select({ id: users.id }).from(users).where(eq(users.avatarFile, filename)).get() !==
          undefined;
      const data = owner ? await avatars.read(filename) : null;
      const type = avatarMimeType(filename);
      if (data === null || type === undefined) throw new ApiError(404, 'NOT_FOUND');
      return (
        reply
          .type(type)
          // Le nom change à chaque envoi : l'image peut rester en cache indéfiniment.
          .header('cache-control', 'private, max-age=31536000, immutable')
          .send(data)
      );
    },
  );
};
