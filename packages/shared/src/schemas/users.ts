// SPDX-License-Identifier: AGPL-3.0-or-later
// Comptes et droits d'accès par service.
//
// Un admin a tous les droits. Un utilisateur n'a que ceux qui lui sont
// accordés, service par service (`prowlarr`) et, pour Radarr/Sonarr, instance
// par instance (`radarr:4k`) : lecture seule, ou lecture et écriture.
// Côté serveur, une requête `GET` demande la lecture, toute autre l'écriture.

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants/auth';
import { USER_ROLES } from '../constants/domain';
import { DISPLAY_NAME_MAX_LENGTH } from '../constants/profile';
import { SERVICES, isServiceId, type ServiceId } from '../constants/services';

export const ACCESS_LEVELS = ['read', 'write'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Droits d'un compte : clé `service` ou `service:slug` (Radarr/Sonarr) → niveau. */
export const userPermissionsSchema = z.record(z.string().max(120), z.enum(ACCESS_LEVELS));
export type UserPermissions = z.infer<typeof userPermissionsSchema>;

/** Clé d'un droit : par instance pour les services multi-instances, par service sinon. */
export function permissionKey(service: ServiceId, slug?: string | null): string {
  return SERVICES[service].multiInstance ? `${service}:${slug ?? ''}` : service;
}

/** Décompose une clé de droit ; `null` si elle ne désigne aucun service connu. */
export function parsePermissionKey(
  key: string,
): { service: ServiceId; slug: string | null } | null {
  const [service, slug, extra] = key.split(':');
  if (!isServiceId(service) || extra !== undefined) return null;
  if (SERVICES[service].multiInstance) {
    return slug === undefined || slug === '' ? null : { service, slug };
  }
  return slug === undefined ? { service, slug: null } : null;
}

/** Ce qu'il faut d'un compte pour décider d'un accès. */
export interface AccessSubject {
  role: (typeof USER_ROLES)[number];
  permissions: UserPermissions;
}

function satisfies(granted: AccessLevel | undefined, level: AccessLevel): boolean {
  return granted === 'write' || (granted === 'read' && level === 'read');
}

/**
 * Le compte a-t-il ce niveau d'accès au service ? Pour Radarr/Sonarr sans
 * instance précisée : sur au moins une instance.
 */
export function hasAccess(
  subject: AccessSubject | null | undefined,
  service: ServiceId,
  slug: string | null | undefined,
  level: AccessLevel,
): boolean {
  if (subject === null || subject === undefined) return false;
  if (subject.role === 'admin') return true;
  if (SERVICES[service].multiInstance && (slug === null || slug === undefined)) {
    const prefix = `${service}:`;
    return Object.entries(subject.permissions).some(
      ([key, granted]) => key.startsWith(prefix) && satisfies(granted, level),
    );
  }
  return satisfies(subject.permissions[permissionKey(service, slug)], level);
}

// ── Administration des comptes (`/api/admin/users`) ─────────────────────────

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(180)
  .pipe(z.email({ error: 'users.error.email_invalid' }));
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: 'users.error.password_too_short' })
  .max(4096);
const displayNameSchema = z.string().trim().max(DISPLAY_NAME_MAX_LENGTH);

/** Compte tel que l'administration le liste. */
export const managedUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(USER_ROLES),
  avatarUrl: z.string().nullable(),
  permissions: userPermissionsSchema,
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export const userListResponseSchema = z.object({ users: z.array(managedUserSchema) });
export type UserListResponse = z.infer<typeof userListResponseSchema>;

export const userCreateRequestSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema.default(''),
  password: passwordSchema,
  role: z.enum(USER_ROLES).default('user'),
  permissions: userPermissionsSchema.default({}),
});
export type UserCreateRequest = z.input<typeof userCreateRequestSchema>;

export const userUpdateRequestSchema = z.object({
  email: emailSchema.optional(),
  displayName: displayNameSchema.optional(),
  /** Nouveau mot de passe provisoire ; absent : inchangé. */
  password: passwordSchema.optional(),
  role: z.enum(USER_ROLES).optional(),
  permissions: userPermissionsSchema.optional(),
});
export type UserUpdateRequest = z.input<typeof userUpdateRequestSchema>;
