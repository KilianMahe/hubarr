// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration des comptes (paramètres de Hubarr, section « Utilisateurs »),
// réservée aux admins :
//
//   GET  /api/admin/users              comptes et droits
//   POST /api/admin/users/create       nouveau compte (mot de passe provisoire)
//   POST /api/admin/users/:id/save     e-mail, nom, rôle, droits, mot de passe
//   POST /api/admin/users/:id/delete   suppression (sessions comprises)
//
// Garde-fous (409 `LAST_ADMIN`) : un admin ne peut ni se retirer le rôle ni
// supprimer son propre compte, et Hubarr garde toujours au moins un admin.
// Un mot de passe changé ici ferme les sessions ouvertes du compte ; des
// droits changés s'appliquent dès la requête suivante (relus à chaque
// requête avec la session).

import {
  arrOkSchema,
  managedUserSchema,
  userCreateRequestSchema,
  userListResponseSchema,
  userUpdateRequestSchema,
  type ManagedUser,
} from '@hubarr/shared';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { sessions, users } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { guardAdminModule } from '../../plugins/access';
import { hashPassword } from '../../security/password';
import {
  findUserById,
  normalizeEmail,
  readUserPermissions,
  saveUserPermissions,
  toAuthUser,
  type UserRow,
} from './users';

const idParams = z.object({ id: z.coerce.number().int().positive() });

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function emailTaken(): ApiError {
  return new ApiError(409, 'EMAIL_TAKEN', {
    details: [{ path: 'email', message: 'users.error.email_taken' }],
  });
}

function countAdmins(db: DbExecutor): number {
  return db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get()?.n ?? 0;
}

function toManagedUser(db: DbExecutor, row: UserRow): ManagedUser {
  const permissions = row.role === 'admin' ? {} : readUserPermissions(db, row.id);
  const { id, email, role, displayName, avatarUrl } = toAuthUser(row, permissions);
  return {
    id,
    email,
    role,
    displayName,
    avatarUrl,
    permissions,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt === null ? null : row.lastLoginAt.toISOString(),
  };
}

export const userRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardAdminModule(app);

  const find = (id: number): UserRow => {
    const row = findUserById(app.db, id);
    if (row === undefined) throw new ApiError(404, 'NOT_FOUND');
    return row;
  };

  app.get(
    '/api/admin/users',
    { schema: { response: { 200: userListResponseSchema } } },
    async () => ({
      users: app.db
        .select()
        .from(users)
        .orderBy(asc(users.id))
        .all()
        .map((row) => toManagedUser(app.db, row)),
    }),
  );

  app.post(
    '/api/admin/users/create',
    { schema: { body: userCreateRequestSchema, response: { 200: managedUserSchema } } },
    async (request) => {
      const { email, displayName, password, role, permissions } = request.body;
      const passwordHash = await hashPassword(password);
      try {
        return app.db.transaction((tx) => {
          const [row] = tx
            .insert(users)
            .values({
              email: normalizeEmail(email),
              passwordHash,
              role,
              displayName: displayName === '' ? null : displayName,
            })
            .returning()
            .all();
          if (row === undefined) throw new Error('compte non créé');
          if (role !== 'admin') saveUserPermissions(tx, row.id, permissions);
          return toManagedUser(tx, row);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw emailTaken();
        throw error;
      }
    },
  );

  app.post(
    '/api/admin/users/:id/save',
    {
      schema: {
        params: idParams,
        body: userUpdateRequestSchema,
        response: { 200: managedUserSchema },
      },
    },
    async (request) => {
      const current = find(request.params.id);
      const self = request.user?.id === current.id;
      const { email, displayName, password, role, permissions } = request.body;
      if (role !== undefined && role !== current.role && current.role === 'admin') {
        if (self || countAdmins(app.db) <= 1) throw new ApiError(409, 'LAST_ADMIN');
      }
      const passwordHash = password === undefined ? undefined : await hashPassword(password);
      try {
        return app.db.transaction((tx) => {
          const patch: Partial<typeof users.$inferInsert> = {};
          if (email !== undefined) patch.email = normalizeEmail(email);
          if (displayName !== undefined)
            patch.displayName = displayName === '' ? null : displayName;
          if (role !== undefined) patch.role = role;
          if (passwordHash !== undefined) patch.passwordHash = passwordHash;
          if (Object.keys(patch).length > 0)
            tx.update(users).set(patch).where(eq(users.id, current.id)).run();
          const nextRole = role ?? current.role;
          // Un admin a tous les droits : ses droits enregistrés sont effacés.
          if (nextRole === 'admin') saveUserPermissions(tx, current.id, {});
          else if (permissions !== undefined) saveUserPermissions(tx, current.id, permissions);
          // Mot de passe réinitialisé : les autres sessions du compte sont fermées.
          if (passwordHash !== undefined) {
            const keep = request.session?.id;
            tx.delete(sessions)
              .where(
                keep === undefined || !self
                  ? eq(sessions.userId, current.id)
                  : and(eq(sessions.userId, current.id), ne(sessions.id, keep)),
              )
              .run();
          }
          const row = tx.select().from(users).where(eq(users.id, current.id)).get();
          if (row === undefined) throw new ApiError(404, 'NOT_FOUND');
          return toManagedUser(tx, row);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw emailTaken();
        throw error;
      }
    },
  );

  app.post(
    '/api/admin/users/:id/delete',
    { schema: { params: idParams, response: { 200: arrOkSchema } } },
    async (request) => {
      const current = find(request.params.id);
      if (request.user?.id === current.id) throw new ApiError(409, 'LAST_ADMIN');
      if (current.role === 'admin' && countAdmins(app.db) <= 1)
        throw new ApiError(409, 'LAST_ADMIN');
      // Sessions et droits supprimés en cascade.
      app.db.delete(users).where(eq(users.id, current.id)).run();
      return { ok: true as const };
    },
  );
};
