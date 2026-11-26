// SPDX-License-Identifier: AGPL-3.0-or-later
// Accès aux comptes et conversion vers le contrat public `AuthUser`.

import {
  parsePermissionKey,
  parseUserPreferences,
  type AuthUser,
  type ServiceId,
  type UserPermissions,
  type UserPreferences,
} from '@hubarr/shared';
import { count, eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client';
import { serviceInstances, userPermissions, users } from '../../db/schema';
import { getInstanceBySlug } from '../instances/instances';

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

/** Droits d'un compte, clés `service` ou `service:slug` (instance encore existante). */
export function readUserPermissions(db: DbExecutor, userId: number): UserPermissions {
  const rows = db
    .select({
      service: userPermissions.service,
      level: userPermissions.level,
      slug: serviceInstances.slug,
      instanceId: userPermissions.instanceId,
    })
    .from(userPermissions)
    .leftJoin(serviceInstances, eq(userPermissions.instanceId, serviceInstances.id))
    .where(eq(userPermissions.userId, userId))
    .all();
  const permissions: UserPermissions = {};
  for (const row of rows) {
    if (row.instanceId !== null && row.slug === null) continue;
    const key = row.slug === null ? row.service : `${row.service}:${row.slug}`;
    if (parsePermissionKey(key) !== null) permissions[key] = row.level;
  }
  return permissions;
}

/**
 * Remplace les droits d'un compte. Les clés inconnues (service, instance
 * supprimée entre-temps) sont ignorées.
 */
export function saveUserPermissions(
  db: DbExecutor,
  userId: number,
  permissions: UserPermissions,
): void {
  db.delete(userPermissions).where(eq(userPermissions.userId, userId)).run();
  const rows: (typeof userPermissions.$inferInsert)[] = [];
  for (const [key, level] of Object.entries(permissions)) {
    const parsed = parsePermissionKey(key);
    if (parsed === null) continue;
    let instanceId: number | null = null;
    if (parsed.slug !== null) {
      const instance = getInstanceBySlug(db, parsed.service as 'radarr' | 'sonarr', parsed.slug);
      if (instance === null) continue;
      instanceId = instance.id;
    }
    rows.push({ userId, service: parsed.service satisfies ServiceId, instanceId, level });
  }
  if (rows.length > 0) db.insert(userPermissions).values(rows).run();
}

export function toAuthUser(user: UserRow, permissions: UserPermissions = {}): AuthUser {
  const displayName = user.displayName?.trim() ?? '';
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: displayName === '' ? user.email : displayName,
    avatarUrl: user.avatarFile === null ? null : avatarUrl(user.avatarFile),
    // Un admin a tous les droits : sa liste reste vide.
    permissions: user.role === 'admin' ? {} : permissions,
  };
}

/** Compte avec ses droits, tel que la session l'expose. */
export function loadAuthUser(db: Db, user: UserRow): AuthUser {
  return toAuthUser(user, user.role === 'admin' ? {} : readUserPermissions(db, user.id));
}
