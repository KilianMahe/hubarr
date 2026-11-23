// SPDX-License-Identifier: AGPL-3.0-or-later
// État affiché d'un service dans les paramètres, tiré de `GET /api/health/services`.

/** `checking` : pas encore de réponse ; `unknown` : non vérifié (non configuré côté santé). */
export type HealthState = 'checking' | 'up' | 'down' | 'unknown';

export function healthStateOf(value: boolean | null | undefined): HealthState {
  if (value === undefined) return 'checking';
  if (value === null) return 'unknown';
  return value ? 'up' : 'down';
}
