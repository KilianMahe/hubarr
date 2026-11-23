// SPDX-License-Identifier: AGPL-3.0-or-later
// Ancienneté du compte telle que le profil l'affiche (`profile/index.html.twig`) :
// « Aujourd'hui », puis en jours, en mois (dès 30 jours) et en années (dès 365), arrondis comme l'original.

export interface Membership {
  key:
    | 'profile.stats.today'
    | 'profile.stats.days_short'
    | 'profile.stats.months_short'
    | 'profile.stats.years_short';
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function membershipOf(createdAt: string, now: number = Date.now()): Membership {
  const days = Math.max(0, Math.floor((now - Date.parse(createdAt)) / DAY_MS));
  if (days === 0) return { key: 'profile.stats.today', count: 0 };
  if (days < 30) return { key: 'profile.stats.days_short', count: days };
  if (days < 365) return { key: 'profile.stats.months_short', count: Math.round(days / 30) };
  return { key: 'profile.stats.years_short', count: Math.round(days / 365) };
}

/** Contrôle côté client avant l'envoi (le serveur revérifie, au contenu). */
export function avatarProblem(
  file: { size: number; type: string },
  maxBytes: number,
  types: readonly string[],
): 'flash.profile.avatar_too_big' | 'flash.profile.avatar_invalid_mime' | null {
  if (!types.includes(file.type)) return 'flash.profile.avatar_invalid_mime';
  if (file.size > maxBytes) return 'flash.profile.avatar_too_big';
  return null;
}
