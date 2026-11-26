// SPDX-License-Identifier: AGPL-3.0-or-later
// Format unique des erreurs de l'API : `{ code, message?, service?, details? }`.
// Le front traduit `code` ; `message` n'est qu'une aide au diagnostic.

import { z } from 'zod';

export const API_ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF',
  'INVALID_CREDENTIALS',
  'LOGIN_THROTTLED',
  'SETUP_REQUIRED',
  'SETUP_COMPLETED',
  'PAYLOAD_TOO_LARGE',
  'AVATAR_MISSING',
  'AVATAR_INVALID_TYPE',
  /** Adresse déjà prise par un autre compte. */
  'EMAIL_TAKEN',
  /** Opération qui laisserait Hubarr sans administrateur (ou retirerait ses droits au compte courant). */
  'LAST_ADMIN',
  'SERVICE_NOT_CONFIGURED',
  'SERVICE_UNREACHABLE',
  'UPSTREAM_ERROR',
  /** Recherche interactive trop longue (indexeurs lents) : 504 de l'original. */
  'SEARCH_TIMED_OUT',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string().optional(),
  service: z.string().optional(),
  details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
