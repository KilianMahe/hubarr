// SPDX-License-Identifier: AGPL-3.0-or-later
// Accès aux comptes et conversion vers le contrat public `AuthUser`.

import { parseUserPreferences, type AuthUser, type UserPreferences } from '@hubarr/shared';
import { count, eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client';
import { users } from '../../db/schema';

export type UserRow = typeof users.$inferSelect;

/** Les e-mails sont stockés et comparés en minuscules (schéma, P0.5). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .get();
}

/** Nombre de comptes (utilisable dans une transaction). */
export function countUsers(db: DbExecutor): number {
  return db.select({ n: count() }).from(users).get()?.n ?? 0;
}

/**
 * URL de service d'un avatar (route `GET /api/profil/avatar/file/:filename`),
 * relative : elle se résout contre la balise `<base>` du front (préfixe de proxy).
 */
export function avatarUrl(file: string): string {
  return `api/profil/avatar/file/${encodeURIComponent(file)}`;
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/** Préférences d'un compte ; valeurs par défaut pour un compte inconnu. */
export function readUserPreferences(db: Db, id: number): UserPreferences {
  const row = db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, id))
    .get();
  return parseUserPreferences(row?.preferences);
}

export function saveUserPreferences(db: Db, id: number, preferences: UserPreferences): void {
  db.update(users).set({ preferences }).where(eq(users.id, id)).run();
}

export function toAuthUser(user: UserRow): AuthUser {
  const displayName = user.displayName?.trim() ?? '';
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: displayName === '' ? user.email : displayName,
    avatarUrl: user.avatarFile === null ? null : avatarUrl(user.avatarFile),
  };
}
